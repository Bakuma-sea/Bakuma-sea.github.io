---
author: Bakuma-sea
pubDatetime: 2026-07-15T15:57:41+08:00
title: "Fully Async RL 实现机制详解"
featured: true
tags:
  - "Fully Async"
  - "Agentic RL"
  - "RL"
  - "Ray"
  - "LLM"
description: "从 Rollouter、MessageQueue 到 Trainer，梳理 Fully Async RL 的流水线架构、Staleness 控制与 MIS 机制。"
timezone: Asia/Shanghai
---

# Fully Async 实现机制详解

我已读完四个文件，下面从架构 → 数据流 → 关键算法三层讲解。

## 一、整体架构：三个独立 Ray Actor

```
┌─────────────────────────────────────────────────────────────────┐
│                    FullyAsyncTaskRunner                          │
│                  (协调者，main.py 中定义)                         │
│                                                                  │
│  ┌──────────────┐  put_sample   ┌──────────────┐  get_sample    │
│  │              │ ────────────► │              │ ────────────►  │
│  │  Rollouter   │               │ MessageQueue │                │
│  │  (生产者)     │ ◄───────────  │  (缓冲区)     │ ◄───────────   │
│  │              │ reset_stale   │              │  put_sample     │
│  └──────────────┘   ness        └──────────────┘                │
│         ▲                              ▲                        │
│         │ update_weights               │                        │
│         │                              │                        │
│         │        ┌──────────────┐      │                        │
│         └────────┤   Trainer    ├──────┘                        │
│                  │  (消费者)     │                               │
│                  └──────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

三者都是 `@ray.remote` 装饰的独立 Actor，物理隔离、时序解耦。main.py 的 `_run_training_loop` 用 `ray.wait` 同时启动两者，谁先完成都行（`fully_async_main.py:163-183`）。

## 二、为什么能"fully" async？关键解耦点

传统 PPO 的单步循环是串行的：

```
generate → reward → log_prob → advantage → update_actor → (下一步)
   ↑________________________________________________________|
```

fully_async 把这个循环拆成两条独立流水线：

| 流水线 | 角色 | 频率 |
|---|---|---|
| 生成流水线 | Rollouter 持续产出 sample 塞进 MQ | 按样本粒度 |
| 训练流水线 | Trainer 从 MQ 取 sample 做 PPO 更新 | 按 mini_batch 粒度 |

两条流水线唯一的同步点是参数同步（每 `trigger_parameter_sync_step` 步一次）。除此之外，rollouter 不等 trainer，trainer 不等 rollouter。

## 三、Rollouter 端：流式生成

Rollouter 内部是多协程并发的（`fully_async_rollouter.py:42` 用 `max_concurrency=100`）：

```
┌──────────────────────────────────────────────────────────┐
│                    Rollouter Actor                        │
│                                                           │
│  _feed_samples()      _processor_worker()                 │
│  ┌────────────┐       ┌────────────────────────┐          │
│  │ dataloader │ ───►  │ pending_queue (128)    │          │
│  │  (1 prompt │       │   ↓ 取一个 sample       │          │
│  │   /次)     │       │   ↓                     │          │
│  └────────────┘       │ active_tasks (并发≤N)   │          │
│                       │   ↓ 单样本生成          │          │
│                       │   ↓ group filter        │          │
│                       │   ↓                     │          │
│                       │ put_sample → MQ         │          │
│                       └────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

三个关键设计：

**(1) 单 prompt 粒度生成（gen_batch_size=1）**

`fully_async_rollouter.py:68` 强制 `gen_batch_size==1`。这是流式的基础：不等凑 batch，拿到 prompt 就生成。一个 prompt 产出 `n_resp_per_prompt=8` 条 response，构成一个 GRPO group。

**(2) 协程级并发控制（max_concurrent_samples）**

`fully_async_rollouter.py:210-211`：

```python
self.max_concurrent_samples = len(server_handles) * 16
self.max_concurrent_samples = min(self.max_concurrent_samples, self.max_required_samples)
```

active_tasks 是一个 set，里面是 asyncio Task。L479-L486 用 `asyncio.wait(FIRST_COMPLETED)` 控制并发不超过上限——某个生成完成立即放新的进来，GPU 不闲着。

**(3) Group 级容错过滤（_process_single_sample_streaming）**

`fully_async_rollouter.py:515-546`：

若 8 条 response 中无效 ≥4 → 丢弃整个 group；若无效 <4 → 随机复制有效样本补齐到 8。这是算法上的关键：保证 GRPO group 结构完整，避免 advantage 归一化被无效样本污染。

## 四、MessageQueue：有界缓冲 + 等待通知

`message_queue.py:27-37`：

```python
self.queue = deque(maxlen=self.max_queue_size)
self._lock = asyncio.Lock()
self._consumer_condition = asyncio.Condition(self._lock)
```

核心语义：

| 操作 | 行为 |
|---|---|
| put_sample | 队列满时丢弃最老的（popleft），返回 False 告知生产者 |
| get_sample | 队列空时阻塞等待，被 notify_all 唤醒 |
| None 哨兵 | Rollouter 结束时塞 None，Trainer 收到即停止 |

**为什么是单 Ray Actor 而不是直接共享内存？**

因为 Rollouter 和 Trainer 在不同节点、不同 GPU 池（`NNODES_ROLLOUT=2` vs `NNODES_TRAIN=2`），需要跨节点通信。Ray Actor 提供天然的序列化 + 远程调用，MessageQueueClient 用 `asyncio.wrap_future` 把 Ray future 包成 asyncio future（`message_queue.py:188-189`），让两端都能用 await。

**队列大小由谁决定？**

`fully_async_rollouter.py:198-212`：

```
max_required_samples = required_samples × (staleness_threshold + 1) × trigger_parameter_sync_step
max_queue_size = max_required_samples
```

代入脚本参数：16 × (0.5 + 1) × 4 = 96。这个公式是 staleness 上界的工程化——后面讲。

## 五、Staleness 控制：算法核心

### 5.1 staleness 的定义

在 Trainer 视角，一个 sample 是"stale"的当且仅当它用比当前 trainer 更旧的参数生成。`fully_async_trainer.py:778`：

```python
stale_traj_count = sum(1 for v in trajectory_param_versions if self.current_param_version - v >= 1)
```

### 5.2 Rollouter 端的"在途样本"计数

`fully_async_rollouter.py:462`：

```python
self.staleness_samples += 1  # 每从 pending_queue 取一个 sample
```

L549-L555：put 成功 → 不变；put 失败（队列满丢弃）→ `dropped_stale_samples += 1`。

L246 在 `reset_staleness` 里：

```python
self.staleness_samples = len(self.active_tasks) + await self.message_queue_client.get_queue_size()
```

直觉：参数刚同步完，rollouter 认为当前所有"在途"样本（正在生成的 + 在 MQ 里的）都已经是"旧版本"了，于是重置计数为这些在途样本数。

### 5.3 暂停机制（背压）

`fully_async_rollouter.py:682-704`：

```python
async def _should_pause_generation(self):
    if queue_size >= self.max_queue_size:        # MQ 满
        return True
    if self.staleness_samples >= self.max_required_samples:  # staleness 超限
        return True
    return False
```

触发后 L438-L458：

设 `paused=True`，等所有 active_tasks 完成（不丢弃已开始的生成），`await self.condition.wait()` 阻塞，等 trainer 同步参数后唤醒。

### 5.4 唤醒机制

`fully_async_trainer.py:518-L535`：Trainer 在参数同步后调用 `rollouter.reset_staleness.remote()`，后者 L243-L244：

```python
self.paused = False
self.condition.notify_all()
```

这就是整个 async 系统的"心跳"：trainer 更新完 → 通知 rollouter "新参数来了，继续生成"。

### 5.5 上界公式的含义

```
max_required_samples = required_samples × (staleness_threshold + 1) × trigger_parameter_sync_step
代入：16 × 1.5 × 4 = 96
```

含义：两个参数同步点之间，rollouter 最多额外存 96 个在途样本。这是 `staleness_threshold=0.5` 的工程化体现——允许"半步"的旧样本冗余。若在途样本快达到这个数，rollouter 主动暂停，避免继续产出的样本被丢弃。

## 六、Trainer 端：Local SGD + MIS

### 6.1 训练主循环

`fully_async_trainer.py:430-L470` 的 `fit_step`：

```
_get_samples_from_queue  → 从 MQ 收 required_samples 个样本
_compute_reward          → 算 reward
_compute_log_prob        → 算 current policy 的 log_prob
_compute_ref_log_prob    → 算 ref policy 的 log_prob（用于 KL）
_compute_advantage       → GRPO advantage
_update_actor            → PPO 更新
_fit_update_local_step   → local_trigger_step++
_fit_update_weights      → 若到同步点，同步参数到 rollouter
```

### 6.2 Local SGD 计数

`fully_async_trainer.py:504-L516`：

```python
if self.local_trigger_step < self.trigger_parameter_sync_step:
    self.local_trigger_step += 1      # 本地继续更新
else:
    self.current_param_version += 1   # 版本号 +1
    self.local_trigger_step = 1       # 重置
```

这意味着 Trainer 在 `trigger_parameter_sync_step=4` 步内做 4 次 PPO 更新，rollouter 用的参数最多比 trainer 旧 4 个版本。

### 6.3 MIS（Model Importance Sampling）—— 算法关键

这是整个 fully_async 的算法精髓。PPO 需要 `old_log_prob`（采样时的 policy 的 log_prob），但异步下：

Trainer 在 v1 参数下采样 → 用 v1 算了 old_log_prob；然后做了 4 次本地更新 → 现在是 v5 参数；下一个 batch 可能是 v1 采的（在途样本）也可能是 v5 采的（新样本）。

`fully_async_trainer.py:482-L502` 的解法：

```python
if self.local_trigger_step == 1:
    # 当前就是 v1，存一份到 CPU
    self.actor_rollout_wg.save_model_to_cpu(1)
    old_log_prob = super()._compute_old_log_prob(batch)
else:
    # 当前是 v2/v3/v4，需要用 v1 算 old_log_prob
    self.actor_rollout_wg.save_model_to_cpu(self.local_trigger_step)  # 先存当前
    self.actor_rollout_wg.restore_model_from_cpu(1)                  # 恢复 v1
    old_log_prob = super()._compute_old_log_prob(batch)              # 用 v1 算
    self.actor_rollout_wg.restore_model_from_cpu(self.local_trigger_step)  # 恢复当前
    self.actor_rollout_wg.clear_cpu_model(self.local_trigger_step)   # 清理
```

算法意义：PPO 的 importance ratio $r = \pi_{\theta_{new}} / \pi_{\theta_{old}}$。在 async 下，$\theta_{old}$ 不是"采样时的参数"，而是"参数同步那一刻的参数 v1"。MIS 通过保存 v1 副本，保证 4 次本地更新都用同一个 v1 算 ratio，避免 ratio 失真导致 clip 频繁触发。

### 6.4 参数同步

`fully_async_trainer.py:518-L528`：

```python
async def _fit_update_weights(self):
    if self.local_trigger_step != 1:
        return  # 只在版本切换的第一步同步
    await self.checkpoint_manager.update_weights(global_steps=self.current_param_version)
```

checkpoint_manager 把 trainer 的 Megatron 权重转成 rollout 引擎（sglang）格式并加载。这是单向的：trainer → rollouter。

## 七、完整时序图

```
时间 →
Trainer:  [取16样本][reward][logp][adv][update]→v1 [取16][...][update]→v2 [取16][...][update]→v3 [取16][...][update]→v4
                                                                                                        ↓
                                                                                                update_weights
                                                                                                        ↓
Rollouter: [生成×N]───────────────────────────────────────────────────────────────► [paused, 等staleness]
                                                                                                        ↓
                                                                                                  reset_staleness
                                                                                                        ↓
                                                                                                  [继续生成]
```

关键观察：

Trainer 每 4 步同步一次，期间 Rollouter 自由生成。Rollouter 生成的样本都标记着 `trajectory_param_versions`（哪个版本参数采的）。当在途样本达到 `max_required_samples=96`，Rollouter 暂停，避免产出过度 stale 的样本。参数同步后，staleness 计数重置，循环重新开始。

## 八、与 Semi-Async 的本质区别

| 特性 | Semi-Async（传统） | Fully Async（本项目） |
|---|---|---|
| 同步粒度 | 每个 training step | 每 trigger_parameter_sync_step 步 |
| Rollout 是否阻塞 | 训练时 rollout 等待 | 训练时 rollout 继续 |
| 在途样本数 | 1 个 batch | 最多 max_required_samples 个 |
| old_log_prob | 当前参数算 | 用同步时刻的 v1 算（MIS） |
| 参数版本 | 每步同步 | 每 K 步同步，Trainer 做本地 SGD |
| GPU 利用率 | 低（有等待） | 高（流水线重叠） |

核心算法创新：把 PPO 的 on-policy 约束放松到"K 步内的 off-policy"，通过 MIS 保证 importance ratio 正确，通过 staleness 控制保证 off-policy 偏差有界。这是 Local SGD 思想在 RL 上的应用。

## 九、几点工程细节值得学

- **Ray Actor + asyncio 混用**：`fully_async_rollouter.py:42` 用 `max_concurrency=100` 让一个 Ray Actor 内部跑多个协程，避免每个协程都开一个 Actor 的开销。
- **Condition 内部共享 Lock**：`fully_async_rollouter.py:183-L191` 的注释解释了为什么要让 Condition 创建 Lock，避免 Ray 环境下 event loop 不一致。
- **None 哨兵传递结束信号**：比额外控制通道简单。
- **dataloader_lock**：L172 单独给 dataloader 加锁，因为 dataloader 状态可能被 save_checkpoint 和生成协程并发访问。

需要我深入讲某一部分吗？比如 MIS 的数学推导，或者 `_should_pause_generation` 的背压策略分析。
