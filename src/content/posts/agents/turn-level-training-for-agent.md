---
author: Bakuma-sea
pubDatetime: 2026-07-13T23:10:00+08:00
title: "Agent 训练中 Turn-Level 训练方式与 PPO 算法综述"
featured: false
tags:
  - "Agent"
  - "Turn-Level Training"
  - "PPO"
  - "RL"
description: "总结多轮 Agent 训练中的 Turn-Level SFT、Turn-Level PPO 及其相对 token-level 训练的关键差异。"
timezone: Asia/Shanghai
---
# Agent 训练中 Turn-Level 训练方式与 PPO 算法综述

## 一、背景概述

在 LLM Agent 的训练中，单轮（single-turn）训练范式（如单轮指令跟随、单轮工具调用）与多轮（multi-turn）交互场景存在本质差异。Agent 需要在长时程环境中与环境持续交互（调用工具、执行代码、浏览网页等），产生跨越多个回合（turn）的轨迹。Turn-Level 训练将信用分配（credit assignment）的粒度从 token 级别提升到 turn 级别，是解决多轮 Agent 训练稳定性和效率问题的关键思路。

---

## 二、Turn-Level SFT 训练方式

### 2.1 什么是 Turn-Level SFT

Turn-Level SFT（轮级监督微调）是指使用完整的**多轮交互轨迹**作为训练数据，对模型进行监督学习。与单轮 SFT 不同，Turn-Level SFT 的数据格式包含完整的 Agent 行为链条：

```
User Query → Agent Thought + Tool Call → Tool Response → Agent Thought + Response → ...
```

在工程实现上（如 veRL、NeMo AutoModel、LLaMA-Factory 等框架），Multi-turn SFT 的核心是将完整对话序列作为一次 forward/backward 的输入，通过**精确的 loss mask 控制**，确保模型仅对 "Assistant Response" 部分计算损失，而不会对 "User Prompt"、"Tool Response" 或历史回复产生惩罚。

### 2.2 数据构造方式

#### 2.2.1 轨迹拼接与 Masking

多轮对话数据通常按以下方式构造：

- 将所有历史上下文（包括 user query、assistant response、tool call、tool response）拼接成一条完整序列
- 对 Assistant 生成的部分（包括 reasoning/thought 和 tool call / final answer）设置 loss mask = 1
- 对 User 输入、Tool 返回、系统提示等部分设置 loss mask = 0

这种方式的优势在于：
- **计算效率**：一次 forward/backward 即可处理完整多轮对话，无需逐轮拆分
- **上下文感知**：模型能够看到完整的历史交互，学习状态跟踪能力
- **存储效率**：避免了将多轮数据拆分为独立样本带来的存储冗余

#### 2.2.2 Agent SFT 的特殊数据格式

Agent SFT 的数据通常包含以下角色：

| 角色 | 内容 | 是否参与 Loss |
|------|------|--------------|
| System | 系统提示、工具定义、规则说明 | 否 |
| User | 用户查询 | 否 |
| Assistant | 推理过程（Thought）+ 工具调用（Tool Call）| 是 |
| Tool | 工具执行结果 | 否 |
| Assistant | 最终回复或下一步推理 | 是 |

### 2.3 Turn-Level SFT 的增益

#### 2.3.1 奠定工具调用的行为基础

在 Agentic RL 场景中，Multi-turn SFT 的核心价值不只是"先训一个能说话的模型"，而是**先把 tool-use 的基本行为轨迹教稳**。只有模型已经学会在多轮对话里正确地调用工具、读取反馈、继续生成，后续 RL 才不会把大量采样预算浪费在最基础的格式错误上。

#### 2.3.2 提升长对话稳定性

实验表明，未经多轮微调的基座模型在 5 轮以上对话时，意图保持准确率可能下降约 37%。通过设计特定的对话状态跟踪（DST）微调策略可显著提升（部分实验提升至 89% 左右）。多轮 SFT 帮助模型建立对长上下文的状态维持能力。

#### 2.3.3 增强上下文理解与状态跟踪

相比单轮 SFT 仅学习 "Query → Response" 的映射，Turn-Level SFT 让模型学习：
- 如何根据工具返回结果调整下一步策略
- 如何在多轮中维护任务目标的一致性
- 如何处理环境反馈（如错误信息、空结果）并做出适应性反应

#### 2.3.4 为后续 RL 提供高质量策略先验

NVIDIA 的实证研究（A Practitioner's Guide to Multi-turn Agentic RL）指出，multi-turn imitation learning（即 Multi-turn SFT）与 multi-turn RL 之间存在显著的协同效应：
- 高质量的 Multi-turn SFT 先验可以显著提升后续 RL 训练的效率和最终性能上限
- SFT 先验帮助 RL 在合理的策略空间内探索，避免早期崩溃

---

## 三、Turn-Level PPO 训练算法

### 3.1 从 Token-Level MDP 到 Turn-Level MDP

#### 3.1.1 Token-Level MDP 的局限

传统的 LLM RL 方法（如 PPO、GRPO）通常基于**token-level MDP**：
- **State**：当前已生成的 token 序列
- **Action**：下一个要生成的 token
- **Reward**：通常在序列末尾给出（稀疏奖励）或每个 token 给予相同奖励（密集但不合理）

这种建模方式在单轮生成任务（如问答、摘要）中表现良好，但在多轮 Agent 场景中存在明显问题：
- **信用分配粒度过细**：在长序列中，将最终结果的奖励归因到每一个 token 上，导致梯度信号极其稀疏且不稳定
- **语义单元被割裂**：一个完整的 Agent 动作（如一次工具调用）被拆分为数十个 token，每个 token 独立计算优势值，破坏了动作的完整性
- **长程任务中优势估计退化**：随着交互轮数增加，token-level 优势估计会显著退化

#### 3.1.2 Turn-Level MDP 的定义

Turn-Level MDP 将粒度提升到 turn 级别：

| 要素 | Token-Level MDP | Turn-Level MDP |
|------|----------------|----------------|
| State | 已生成的 token 序列 | 当前 turn 之前的完整交互历史（包括所有历史 context） |
| Action | 下一个 token | 当前 turn 的完整输出（包括 thought + tool call / response） |
| Reward | 序列结束时的稀疏奖励 / token 级均匀奖励 | 当前 turn 结束后获得的 turn-level 奖励 |
| Episode | 单条文本生成 | 完整的多轮交互轨迹 |

**核心优势**：
- 信用分配的粒度与 Agent 的决策粒度一致
- 避免了 token 级信用分配在长程任务中的不稳定性
- Critic 模型只需估计每个 turn 的价值，而非每个 token 的价值

### 3.2 Turn-PPO 算法（EACL 2026 Findings）

#### 3.2.1 核心思想

Turn-PPO（arXiv:2512.17008, UT Austin & Amazon）重新引入 PPO 算法到多轮 Agent 训练中，并提出了基于 turn-level MDP 的 PPO 变体。

研究发现：
- **GRPO 在多轮场景中存在稳定性问题**：GRPO 依赖多次 rollout 估计优势，在长程多轮任务中不稳定
- **PPO 比 GRPO 更鲁棒**：PPO 通过可学习的 Critic 模型进行优势估计，在多轮场景中表现更稳定
- **Turn-Level 比 Token-Level 更有效**：token-level 优势估计随着任务 horizon 增加而退化，而 turn-level 估计保持稳定

#### 3.2.2 算法形式

**Turn-Level 优势估计**：

对于第 t 个 turn，其优势函数定义为：

```
A_turn(s_t, a_t) = R_turn(s_t, a_t) + γ * V(s_{t+1}) - V(s_t)
```

其中：
- `s_t`：第 t 个 turn 开始时的状态（包含完整历史上下文）
- `a_t`：第 t 个 turn 的完整输出（Agent 的响应）
- `R_turn(s_t, a_t)`：第 t 个 turn 结束后获得的 turn-level 奖励
- `V(s_t)`：Critic 模型对状态 s_t 的价值估计
- `γ`：折扣因子

**Turn-PPO 的 Clip 目标**：

```
L_Turn-PPO(θ) = E_t [ min( r_t(θ) * A_t, clip(r_t(θ), 1-ε, 1+ε) * A_t ) ]
```

其中 `r_t(θ) = π_θ(a_t | s_t) / π_θ_old(a_t | s_t)` 是 turn 级别的策略比率。

**与 Token-PPO 的关键区别**：
- **Token-PPO**：`r_t` 在每个 token 上计算，`A_t` 是 token-level 优势
- **Turn-PPO**：`r_t` 在整个 turn 的输出上计算（通过对 turn 内所有 token 的概率取平均或求和），`A_t` 是 turn-level 优势

#### 3.2.3 与 MT-PPO 的关系

在社区讨论中，MT-PPO（Multi-Turn PPO）通常有两种理解：
- **MT-PPO（Token-Level + 密集奖励）**：在 token-level MDP 基础上，在每个 turn 结束时放置奖励，但仍保持 token-level 的优势估计
- **Turn-PPO（真正的 Turn-Level MDP）**：将每个 turn 视为一个 action，重新定义 MDP

Turn-PPO 是真正的 turn-level MDP，其优势在于 credit assignment 的粒度与 Agent 的决策语义一致。

### 3.3 Multi-Turn GRPO / PPO with Turn-Level Reward（NeurIPS 2025）

#### 3.3.1 核心贡献

Reinforcing Multi-Turn Reasoning in LLM Agents via Turn-Level Reward Design（NeurIPS 2025, arXiv:2505.11821）提出了首个系统性的 turn-level reward 设计研究。

#### 3.3.2 Turn-Level Reward 设计

论文设计了两种 turn-level 奖励：

**1. Verifiable Turn-Level Reward（可验证奖励）**
- 基于明确的、可自动验证的规则
- 例如：工具调用格式是否正确、工具返回结果是否有效、当前步骤是否向目标推进
- 优点：无偏、稳定、无需额外模型
- 缺点：设计成本高，难以覆盖所有场景

**2. LLM-as-Judge Turn-Level Reward（模型评判奖励）**
- 使用更强的 LLM 作为评判者，对每个 turn 的质量打分
- 评判维度：相关性、正确性、效率、是否重复等
- 优点：灵活、可覆盖复杂场景
- 缺点：可能存在偏见和方差

#### 3.3.3 算法扩展

基于 turn-level rewards，论文将 GRPO 和 PPO 扩展为多轮变体：

**Multi-Turn GRPO**：
- 对同一起始状态采样多条多轮轨迹
- 使用组内相对奖励（group-relative reward）作为基线
- 在每个 turn 处应用 turn-level reward 进行信用分配

**Multi-Turn PPO**：
- 使用 Critic 模型估计每个 turn 的价值
- 结合 turn-level reward 计算 turn-level 优势
- 通过 PPO clip 机制稳定策略更新

### 3.4 A Practitioner's Guide 中的训练配方（NVIDIA）

A Practitioner's Guide to Multi-turn Agentic RL（arXiv:2510.01132）将多轮 Agent RL 的设计空间分解为**三大支柱**，并提供了系统性的实证分析：

#### 3.4.1 三大支柱

**环境（Environment）**：
- 状态表示方式（完整历史 vs 摘要）
- 动作空间定义（离散工具选择 vs 自由生成）
- 交互接口设计

**奖励（Reward）**：
- 轨迹级奖励（episode-end）vs Turn 级奖励（per-turn）
- 可验证奖励 vs 学习式奖励
- 奖励尺度与稠密程度

**策略（Policy）**：
- 模型先验（SFT 质量）对持续多轮 RL 训练的影响
- Multi-turn SFT 与 Multi-turn RL 的协同作用

#### 3.4.2 关键发现

- **Dense per-turn rewards + token-level credit assignment** 的组合在实践中被形式化并验证有效
- 高质量的 multi-turn SFT 先验是成功 multi-turn RL 的基础
- 环境、奖励、策略三大支柱需要协同设计，单一维度的优化往往不够

---

## 四、算法对比总结

| 维度 | Token-Level PPO/GRPO | Turn-Level PPO/GRPO |
|------|---------------------|---------------------|
| MDP 粒度 | Token | Turn |
| State | 已生成 token 序列 | 历史交互上下文 |
| Action | 下一个 token | 当前 turn 完整输出 |
| 优势估计 | Token-level（长程退化） | Turn-level（稳定） |
| Critic 输出 | 每个 token 一个价值 | 每个 turn 一个价值 |
| 信用分配 | 过于精细，不稳定 | 与决策粒度一致 |
| 适用场景 | 单轮生成 | 多轮 Agent 交互 |
| 训练稳定性 | 长程任务中较差 | 显著更稳定 |

---

## 五、关键论文列表

| 论文 | 会议/来源 | 核心贡献 |
|------|----------|---------|
| Turn-PPO: Turn-Level Advantage Estimation with PPO for Improved Multi-Turn LLM Agents | EACL 2026 Findings, arXiv:2512.17008 | 提出基于 Turn-Level MDP 的 PPO 变体，发现 PPO 比 GRPO 更鲁棒 |
| Reinforcing Multi-Turn Reasoning in LLM Agents via Turn-Level Reward Design | NeurIPS 2025, arXiv:2505.11821 | 首个系统性 Turn-Level Reward 设计研究，提出可验证奖励和 LLM-as-Judge 奖励 |
| A Practitioner's Guide to Multi-turn Agentic Reinforcement Learning | NVIDIA, arXiv:2510.01132 | 将多轮 Agent RL 分解为环境/奖励/策略三大支柱，提供系统性训练配方 |
| ArCHer: Training Language Model Agents via Hierarchical Multi-Turn RL | arXiv 2024 | 分层多轮 RL 框架，结合高层策略和低层执行 |
| Verlog: A Multi-turn RL Framework for LLM Agents | CMU, 2025 | 面向长程可变长度 episode 的多轮 RL 框架 |
| RAGEN: A General Framework for Multi-Turn RL for LLM Agents | arXiv 2025 | StarPO 框架，揭示单轮 RL 在多轮 Agent 场景中的局限性 |
| Multi-Turn Reinforcement Learning for Tool-Calling Agents with MT-GRPO | arXiv 2026.04 | MT-GRPO + GTPO 在真实客服任务上的应用 |
| ECPO: Expectation Confirmation Preference Optimization for Multi-Turn Conversational Agents | ACL 2025 | 基于心理学期望确认理论的多轮偏好优化方法 |

---

## 六、实践建议

### 6.1 训练流程建议

对于 Agent 训练，推荐的流程是：

1. **Multi-turn SFT**：使用高质量的多轮轨迹数据，先教会模型基本的工具调用格式和交互模式
2. **Turn-Level Reward 设计**：根据任务特性，设计可验证的 turn-level 奖励规则
3. **Turn-Level PPO 训练**：使用 Turn-PPO 或 Multi-Turn PPO 进行强化学习优化
4. **迭代优化**：收集 RL 产生的优质轨迹，反哺 SFT 数据，形成闭环

### 6.2 设计 Turn-Level Reward 的注意事项

- **尽早给出反馈**：不要等到 episode 结束才给奖励，在每个 turn 结束后就给出该 turn 的质量评价
- **可验证优先**：优先使用可自动验证的规则（如格式检查、结果正确性），减少模型评判的偏差
- **避免奖励 hacking**：设计奖励时要注意防止模型找到捷径（如重复调用工具获取奖励）
- **奖励尺度适中**：过大或过小的奖励尺度都会影响训练稳定性

---

*文档整理时间：2026年7月9日*
*基于公开论文和社区资料整理*

