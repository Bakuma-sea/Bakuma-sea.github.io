---
author: Bakuma-sea
pubDatetime: 2026-07-16T15:44:24+08:00
title: "融合 ORM 构建可训练 PRM：训练与落地方案"
featured: true
tags:
  - "PRM"
  - "ORM"
  - "Reward Model"
  - "GRPO"
  - "RL"
description: "围绕现有 ORM 构建神经 Process Reward Model，并设计 PRM 与 ORM 融合到 Fully Async GRPO 的落地方案。"
timezone: Asia/Shanghai
---

# 融合现有 ORM 构建可训练 Process Reward Model 的方案

> 版本：v3（在 v2 基础上重写：现有系统中的 `process_reward`/`ProcessReward` 过程奖励模块存在 bug、暂不可用，本方案不再依赖它；将现有奖励系统统一视为一套成熟 **ORM（结果奖励）**，目标是**从零构建一个神经 PRM，并在训练与使用中深度融合这套 ORM**。）
> 面向读者：奖励系统 / RL 训练同学
> 一句话结论：把现有 ORM 作为「可信的结果级监督源 + outcome verifier」，用它自动生成 PRM 的过程级训练标签，训练出一个可微、低延迟、多头的神经 PRM，最终在 Fully Async GRPO 中让 **PRM（稠密过程分）+ ORM（结果分）** 联合塑形。

---

## 一、现状重新校准

读完 `ORM_reward_system_summary.html` 与 `agentic_reward_modeling_研究总结.md` 后，对现状做如下界定：

**现有系统是一套成熟的 ORM（结果奖励系统）**，两层结构：

- **底层 · 原子奖励**（45+ 模块，约 2.8 万行）：每个模块评一个细粒度维度，分三类实现——纯规则（确定性、低成本）、LLM-as-judge（语义判定）、混合（规则门控 + LLM）。全部继承 `BaseEvaluator`，走统一 `reward_context` 信息池、统一 `Sampler` 采样、统一返回 `RewardValue`。其中绝大多数模块（相关性、幻觉、供给质量、回复质量、安全、多轮、CTR 等）都是围绕**最终回复 / 整条轨迹结果**做评估，属于典型的结果导向奖励。
- **上层 · 组合奖励**（`registered/`）：按权重把原子奖励融合成完整流水线，带门控 / 短路 / 动态加权，针对不同模型（Qwen 系 / DeepSeek 系）和不同训练阶段。

> **重要前提（本次修订）**：系统里原有的 `process_reward` 原子模块与 `ProcessReward` 组合类（action/grounding/tool_function 三维、逐轮扣分）**当前存在 bug、不可用**。本方案**不复用、不依赖**这两个模块，相关过程监督能力将由新构建的神经 PRM 从零承担。凡涉及"过程/step 级奖励"的部分，一律以新 PRM 为准。

现有系统已经沉淀的成熟设计原则（做 PRM 融合时应继承）：

1. **格式硬门控**：格式不过直接 0 / -1 短路，不浪费昂贵 LLM 打分；
2. **工具侧 vs 回复侧双校验**：相关性、时效性在"工具返回"和"最终回复"各查一次；
3. **动态加权**：相关性达标（>0.7）才引入 CTR / 幻觉等次级信号；
4. **底线项硬约束**：关键条件未满足则整体 0 分，防"部分满足拼凑为整体满足"的 reward hacking；
5. **区分"不适用（null）"与"失败（0）"**：减少误判。

### 为什么现在需要一个 PRM，且要融合 ORM

ORM 只在结果处给一个（或几个）粗粒度信号，长链 agent 轨迹上存在两个固有问题：

- **信用分配稀疏**：一条多跳轨迹只有结果好/坏，无法定位"是哪一步走错了"，GRPO 的 advantage 难以精细分配到具体 step；
- **无过程可微信号**：无法在生成过程中及时干预 / 早停无效推理（这正是 step-level rethink/instruct 文档想解决的收益点）。

PRM 恰好补齐"每一步的稠密过程分"。而 ORM 是我们**已经跑通、可信度经过 golden 集校准**的资产，因此正确做法不是抛开 ORM 从零标过程，而是：**用 ORM 当 PRM 的监督信号来源与 outcome verifier**，让 PRM 从 ORM 的结果信号里"反推"出过程价值，二者在 RL 中互补。

---

## 二、PRM 常见训练方式调研（结论摘要）

按 PRM 领域公认的「数据 → 建模 → 使用」三段式（主要参考《A Survey of Process Reward Models》arXiv:2510.08049 及下列代表作），并标注与"融合 ORM"这一目标的契合度。

### 2.1 如何产生 step 级标签（数据）

| 范式 | 代表工作 | 做法 | 与"融合 ORM"契合度 |
|---|---|---|---|
| 人工标注 | PRM800K | 人工逐步标 correct/neutral/incorrect | 低（贵、难扩）；仅用于校准集 |
| **Monte Carlo 自动标注** | Math-Shepherd、OmegaPRM | 从某步出发 rollout N 次，用**最终结果对错**反推该步"通向正确的潜力"（硬估计=有一条对即 1；软估计=k/N） | **极高**：这里的"最终结果对错"正好由**现有 ORM** 判定——ORM 就是天然的 outcome verifier |
| 隐式（免 step 标签） | Free Process Rewards / PRIME | 只用**结果级标签**训 ORM，把 reward 参数化为 `r = β·log(π_φ/π_ref)`，step reward 由相邻位置 log-ratio 之差免费推出 | **极高**：结果级标签即 ORM 分，几乎零额外标注即可得到 step reward，是最轻量的 ORM→PRM 融合路径 |
| 规则 / 执行反馈 | CodePRM、FOVER | 用编译器 / 形式化工具 / 执行结果打标 | 高：ORM 中的**纯规则原子模块**（格式、schema、n-gram）可直接给 step 产 0/1 硬标签 |
| LLM-as-judge 自动标注 | VersaPRM | 用强模型对每步判断 | 中高：可用更强的离线 judge 对疑难 step 补标，作为 MC/隐式标签的补充与校验 |
| 半自动 | MedS³、Athena | 少量人标种子 + 自动扩展 | 高：对应"种子 query → golden 集 → PE 迭代 → 准入"流程 |

### 2.2 如何建模（架构）

- **判别式 PRM**：base LM 加分类/回归头，每 step 输出 [0,1] 分，BCE/MSE。主流、推理快、易反传（Math-Shepherd、Qwen2.5-Math-PRM）。**首选**。
- **生成式 PRM**：先生成 critique/CoT 再吐正确性 token（GenPRM、ThinkPRM）。可解释、所需标注少，但推理贵，适合离线复核。
- **隐式 PRM**：通过 log-ratio 参数化免费得到 step reward（PRIME），可直接由现有 ORM 的结果标签得到。
- **多头 / 分错误类型 PRM**：PathFinder-PRM 把不同错误类型解耦成多头分别判定再汇总。**与现有 ORM 的维度网格（相关性 / 幻觉 / 工具调用 / 反思 / 多轮 / 安全）自然对应，可让 PRM 的 head 与 ORM 维度对齐，便于融合。**

### 2.3 如何使用（用途）

- **Test-time scaling**：Best-of-N 重排、step-level beam/MCTS 引导解码。
- **PRM-guided RL**：step reward 作为稠密奖赏注入 PPO/GRPO，解决 outcome-only 的稀疏信用分配。**这正是 PRM 与 ORM 融合的主战场：过程用 PRM，结果用 ORM。**
- **Agent 专用——AgentPRM（arXiv:2502.10325，最贴合我们）**：轻量 actor-critic，用 Monte Carlo rollout 计算 (state, action) 的 reward target 作 critic；reward target 的"最终成败"由 outcome 信号（即我们的 ORM）提供；对 RLHF pipeline 改动极小；论文重点强调防 reward hacking。

---

## 三、方案：从零构建神经 PRM，并与现有 ORM 融合

三句话核心思路：
1. **用现有 ORM 作为 outcome verifier**，通过 Monte Carlo rollout / 隐式参数化，从结果信号自动反推出**过程级 step 标签**（几乎零额外人工）；
2. **训练一个判别式多头神经 PRM**，其 head 尽量与 ORM 维度对齐，输出每个 step 的稠密过程分；
3. **在 Fully Async GRPO 中让 PRM（过程分）+ ORM（结果分）联合塑形**，过程分做细粒度信用分配，结果分做全局对齐与防 hacking 兜底。

### 3.1 Step 的定义（沿用 step-level rethink/instruct）

一条 message list 上设三类打点：

- **instruct 点**：每个 `assistant(tool_call)` 之后——评动作决策（工具选择 + 提槽 + 改写）；
- **rethink 点**：每个 `tool response` 之后——评当前轨迹合理性与反思质量；
- **final 点**：最终 `assistant` 回复——这里**直接用现有 ORM 打分**，作为结果信号。

一条轨迹得到过程分序列 `r_1…r_{n-1}`（由 PRM 给）+ 结果分 `R_final`（由 ORM 给）。

### 3.2 数据：用 ORM 反推过程标签（ORM→PRM 融合的核心）

不再从零人工标过程，而是让**现有 ORM 充当自动监督源**，三条互补路径：

**路径 A —— Monte Carlo 软标签（主）**
从某个中间 step 出发，用当前 policy 做 N 条后续 rollout，每条 rollout 的最终轨迹由**现有 ORM 组合奖励**判定好/坏，取通过比例 k/N（软估计）或"至少一条好即 1"（硬估计）作为该 step 的过程标签。
> 关键红利：GRPO 本身就是"一个 prompt 采 8 条 response"，这 8 条可直接复用作 MC 估计的样本，**边际成本极低**；ORM 已经是校准过的可信 verifier，无需额外训练判别器。

**路径 B —— 隐式 PRM 标签（轻量对照/去噪）**
只用轨迹级 ORM 分作结果标签，按 PRIME 把 reward 参数化为 `r = β·log(π_φ/π_ref)`，免费得到每个 token/step 的隐式过程分。用于与路径 A 交叉验证、清洗噪声（SCAN 式自去噪）。这是"用 ORM 结果标签免费换过程分"的最省路径。

**路径 C —— 规则硬标签（gate）**
ORM 里的纯规则模块（格式、schema、虚假工具、n-gram）对每个 step 直接产 0/1 硬标签，作为不可绕过的门控维度，也作为多头 PRM 的确定性监督 head。

三条路径产出的训练样本形如：`(轨迹上下文, step 位置, MC 软分, 规则硬标签, 可选维度标签)`。golden 集用于校准 ORM verifier 与评测 PRM。

### 3.3 建模：判别式多头 PRM（head 与 ORM 维度对齐）

**阶段 A —— 判别式多头 PRM（先落地）**

- Backbone：与 policy 同源的中小模型（3B/7B，便于与 sglang rollout 引擎共存、低延迟）。
- 输出：每个 step 位输出
  - 一个**主过程分**（由 MC 软标签监督，代表"这一步通向好结果的潜力"，天然与 ORM 对齐）；
  - 若干**维度 head**（相关性 / 幻觉 / 工具契约 / 反思 / 多轮 / 安全），其中规则维度用硬标签监督、语义维度用离线 judge/ORM 分档标签监督——**让 PRM 的 head 与 ORM 维度一一对应，方便后续融合聚合**。
- 损失：主过程分与软标签用 MSE；规则 head 用 BCE；维度分档用 CE。
- 训练数据：3.2 的自动标注集。

**阶段 B —— 生成式 PRM（可选，离线复核）**
蒸馏出 GenPRM/ThinkPRM 式模型（先 critique 再判正确性 token），用于离线数据质检、疑难 case 复核、给标注同学可读理由。在线 RL 仍以判别式为主（快）。

### 3.4 PRM 与 ORM 的融合聚合（RL 中如何一起用）

在 GRPO 里，把奖励拆成**过程项（PRM）+ 结果项（ORM）**，并继承现有 ORM 的门控 / 动态加权 / 底线原则：

```
# 每个中间 step 的过程奖励（PRM）
gate_step = 0 if 规则硬约束失败(格式/schema/虚假工具) else 1
r_step    = gate_step · PRM_process(step)          # PRM 主过程分（已由 ORM 反推监督）

# 轨迹结果奖励（直接用现有 ORM，继承其动态加权与底线项）
R_final   = ORM(trajectory)                         # 相关性>0.7 才引入 CTR 等，硬门控失败→0/-1

# 融合：过程分做稠密塑形，结果分做全局对齐
A_step    = GRPO_advantage( α · r_step + β · shaped(R_final) )
#   典型做法：把 R_final 作为轨迹级 baseline / 终端奖励，PRM r_step 作为中间稠密 shaping
#   α、β 用 golden 集调参；R_final 始终保留一票否决（防 hacking）
```

融合的三条约束：
- **结果分优先**：过程分高但 ORM 结果差的轨迹必须被惩罚（防"每步合规但整体没解决"）；
- **规则 gate 不可学习**：安全/格式/虚假工具作为硬约束，PRM 分再高也不能翻盘；
- **null 严格区分**：某维度"不适用"时不计 0，不参与加权。

### 3.5 对接 Fully Async GRPO（结合三 Actor 架构）

**接入点一：Trainer 端 `_compute_reward`（先做）**
- 用神经 PRM 一次批量前向为整条轨迹所有 step 打过程分，final 点调用现有 ORM 打结果分，二者按 3.4 融合后进 `_compute_advantage`。
- PRM 前向替代了原本"逐步多次 LLM judge 采样"，Trainer 消费流水线延迟大幅下降，与 Rollouter 高吞吐匹配。

**接入点二：Rollouter 端在线打分 / 早停（后做）**
- 在 `_process_single_sample_streaming` 用 PRM 做 step-level 早停：过程分极低时提前终止无效 rollout，节省生成算力（呼应"减少无效推理"的原始收益）；与现有 group 容错逻辑（8 条中无效 ≥4 丢弃整组）协同。

**与 staleness / MIS 的兼容（必须处理）**
- PRM 与 ORM 分数都会随 policy 分布漂移失准。建议：
  - 打分与轨迹 `trajectory_param_versions` 一同记录，Trainer 端按 staleness 做轻度折扣/校准；
  - **PRIME 式在线共演化**：每 K 个参数同步周期，用最新轨迹 + ORM 重刷 MC 标签、增量微调 PRM。这与 Fully Async"每 `trigger_parameter_sync_step` 步同步一次"的节奏天然契合，可把 PRM 更新挂在参数同步点上。

### 3.6 防 Reward Hacking

- **ORM 结果分一票否决**：过程分不能覆盖结果分的底线判定；
- **规则 gate 不可绕过**：继承现有格式/安全硬门控；
- **PRM 定期用 golden 集回归 + OOD 监控**，人机一致率跌破阈值触发重标/重训；
- **过程分与结果分双约束**，避免 PRM 被局部信号刷分。

---

## 四、分阶段落地路线

| 阶段 | 内容 | 周期 | 验收 |
|---|---|---|---|
| **M0 ORM 作 verifier 封装** | 把现有 ORM 组合奖励封装成稳定的 outcome verifier 接口；规则模块封装成 step 级 gate 标注器 | 1–2 周 | ORM 能对任意轨迹稳定给结果分；规则能对 step 产硬标签 |
| **M1 过程标签自动构建** | 复用 GRPO 8 条 rollout + ORM 做 MC 软标签（路径 A）；隐式 PRM 反推（路径 B）交叉去噪 | 2 周 | 得到「轨迹, step, MC 软分, 规则硬标签」训练集 |
| **M2 判别式多头 PRM v1** | 训练阶段 A 模型（head 与 ORM 维度对齐） | 2–3 周 | golden 集上 step-F1 / MC 一致性达标 |
| **M3 Trainer 端 PRM+ORM 融合** | `_compute_reward` 里过程用 PRM、结果用 ORM，融合进 GRPO advantage | 1–2 周 | 消费吞吐提升、训练稳定、融合权重经 golden 调优 |
| **M4 稠密奖赏 RL + Rollouter 早停** | 过程 PRM + 结果 ORM 联合；Rollouter step 早停节省算力 | 3–4 周 | 每条数据平均算力下降、policy 在 golden/线上胜率提升 |
| **M5 在线共演化 + 生成式 PRM** | PRM 挂参数同步点用 ORM 重刷标签增量更新；蒸馏生成式 PRM 做离线复核 | 持续 | PRM 随分布漂移保持稳定；reward-hacking 检出率可控 |

**关键指标**：step 级 MC 一致性 / F1、Best-of-N 选优率、Trainer 消费吞吐、每条数据平均生成算力、RL 后 policy 胜率、reward-hacking 检出率。

---

## 五、总结

现有系统是一套**成熟且经 golden 校准的 ORM**（原有 `process_reward`/`ProcessReward` 过程模块有 bug、本方案不使用）。我们要做的是**从零构建一个神经 PRM，并与这套 ORM 深度融合**：

- **数据**：用 ORM 当 outcome verifier，通过 Monte Carlo rollout（复用 GRPO 的 8 条 response）和隐式参数化，从结果信号自动反推过程标签，几乎零额外人工；
- **建模**：判别式多头 PRM，head 与 ORM 维度对齐，输出每步稠密过程分；
- **使用**：在 Fully Async GRPO 中，过程用 PRM 做细粒度信用分配、结果用 ORM 做全局对齐与一票否决，先落 Trainer 端融合、再做 Rollouter 早停、最后挂参数同步点做在线共演化；
- **防护**：ORM 结果分一票否决 + 规则 gate 不可绕过 + golden 回归监控。

一句话：**ORM 提供"什么是好结果"，PRM 学习"哪一步在通向好结果"，两者在 RL 中过程分与结果分互补，既解决了 ORM 的稀疏信用分配问题，又用 ORM 的可信结果信号免费监督了 PRM。**
