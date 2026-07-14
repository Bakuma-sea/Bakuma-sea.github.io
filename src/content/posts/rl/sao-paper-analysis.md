---
author: Bakuma-sea
pubDatetime: 2026-07-13T23:20:00+08:00
title: "SAO 论文分析与解读：Single-Rollout Asynchronous Optimization"
featured: true
tags:
  - "SAO"
  - "RL"
  - "Agentic RL"
  - "Paper Reading"
description: "解读 SAO 在 Agentic RL 中的异步优化设计，包括 DIS、单轨迹采样、价值模型增强与 Skip-Observation GAE。"
timezone: Asia/Shanghai
---
# Single-Rollout Asynchronous Optimization for Agentic Reinforcement Learning

> **论文标题**: Single-Rollout Asynchronous Optimization for Agentic Reinforcement Learning
> **作者**: Zhenyu Hou, Yujiang Li, Jie Tang, Yuxiao Dong（清华大学）
> **论文链接**: https://arxiv.org/abs/2607.07508
> **arXiv编号**: arXiv:2607.07508

---

## 一、研究背景与动机

### 1.1 核心问题

在大语言模型（LLM）的后训练阶段，强化学习（RL）正成为提升模型智能的关键手段。然而，现有的RL训练流水线大多采用**同步批量交替**（synchronous and batch-interleaved）模式：策略模型先生成一批完整的轨迹（rollouts），待所有轨迹收集完毕后才开始优化。这种模式在处理长时程的Agentic任务（如多轮工具调用、代码生成与调试）时存在严重效率问题——由于不同轨迹的输出长度差异极大（长尾分布），短轨迹完成后必须等待长轨迹的**拖尾样本**（stragglers），导致大量GPU空闲时间，整体集群利用率低下。

### 1.2 异步RL的机遇与挑战

**异步强化学习**（Asynchronous RL）通过将数据生成与模型训练完全解耦、以流式方式消费到达的轨迹，能够显著提升资源利用率和 wall-clock 效率。然而，现有异步系统往往只关注吞吐优化，而忽视了训练稳定性和任务有效性，面临两大核心挑战：

**挑战一：策略滞后与严重的离策略（Off-policy）效应。** 在异步环境中，一条轨迹的生成可能跨越多个策略版本，导致行为策略与当前训练策略之间的差异远大于同步场景，传统的重要性采样（Importance Sampling）难以有效校正。

**挑战二：组间采样（Group-wise Sampling）与异步训练的天然不匹配。** 以GRPO为代表的主流方法要求对每个prompt采样一组（group）回复，并利用组内统计量（均值、标准差）估计优势函数。这种设计在异步环境中引入了由等待延迟驱动的离策略行为——整个组必须等待最慢的样本完成后才能进入训练，进一步加剧了策略滞后，且不适用于单轨迹反馈的在线学习场景。

### 1.3 论文定位

本文提出 **Single-rollout Asynchronous Optimization（SAO）**，目标是在保持异步效率的同时，解决训练不稳定性和离策略挑战，使异步RL能够稳定扩展到上千步训练，并在Agentic推理和编码任务上持续超越GRPO及其变体。

---

## 二、方法详解：SAO的核心组件

SAO并非单一技巧，而是一个围绕**单轨迹采样**重构的算法-系统协同设计框架，包含三个紧密耦合的模块：**直接双边重要性采样（DIS）**、**价值模型增强设计**、以及**Skip-Observation GAE**。

### 2.1 直接双边重要性采样（Direct Double-Sided Importance Sampling, DIS）

#### 2.1.1 动机与问题

传统PPO/GRPO在同步训练中通常维护三个模型：当前策略 $\pi_\theta$、旧策略 $\pi_{\theta_{\text{old}}}$（用于计算PPO裁剪中的概率比）、以及 rollout 策略 $\pi_{\text{rollout}}$。在异步场景下，由于rollout引擎可能在单条轨迹生成期间经历多次更新，精确追踪历史行为概率 $\pi_{\theta_{\text{old}}}$ 需要维护庞大的模型检查点序列 $\{\pi_{\theta^{(1)}}, \ldots, \pi_{\theta^{(N)}}\}$，这在工程上几乎不可行。

#### 2.1.2 SAO的简化策略

SAO采取了一种更激进但更实用的简化：直接**丢弃 $\pi_{\theta_{\text{old}}}$**，使用 rollout 时的行为策略 $\pi_{\text{rollout}}$ 作为行为代理，概率比仅计算当前策略与 rollout 策略之间的关系：

$$r_t(\theta) = \exp\left(\log \pi_\theta(a_t \mid s_t) - \log \pi_{\text{rollout}}(a_t \mid s_t)\right)$$

这一设计的关键优势在于：

- **工程可行性**：无需维护历史策略检查点，直接复用 rollout 阶段已记录的 log-probability，计算开销极低。
- **可控的偏差-效率权衡**：虽然接受了一部分由 $\pi_{\text{rollout}}$ 与 $\pi_\theta$ 之间差异带来的 off-policy 偏差，但换来了计算复杂度的数量级下降，并避免了因使用单一、可能严重过时的 "$\theta_{\text{old}}$" 所带来的巨大误差。

#### 2.1.3 严格的双边Token级裁剪与掩码

标准PPO的裁剪仅对"被选中"的off-policy token进行单侧限制（如 $A > 0$ 时 $r_t > 1+\epsilon$ 或 $A < 0$ 时 $r_t < 1-\epsilon$）。SAO引入了更严格的**校准函数**（Calibration Function）：

$$
f(x; \epsilon_\ell, \epsilon_h) = 
\begin{cases}
x, & \text{若 } 1 - \epsilon_\ell < x < 1 + \epsilon_h \\[6pt]
0, & \text{其他情况}
\end{cases}
$$

即：对于超出信任区间 $[1 - \epsilon_\ell, 1 + \epsilon_h]$ 的 token，其梯度被**完全掩码（mask）**，而非仅仅裁剪。这与 IcePop 等机制有相似之处，但 SAO 进一步去除了 $\pi_{\theta_{\text{old}}}$，使整体策略更简单。实证表明，这种更激进的裁剪能够有效正则化更新步长，在异步环境下实现更稳定的训练。

最终目标函数为：

$$\mathcal{L}(\theta) = \hat{\mathbb{E}} \left[ f\left(r_t(\theta), \epsilon_\ell, \epsilon_h\right) \cdot \hat{A}_t \cdot \log \pi_\theta(a_t \mid s_t) \right]$$

### 2.2 单轨迹采样（Single-Rollout Sampling）

#### 2.2.1 为什么必须放弃GRPO的组采样？

GRPO 的核心优势是通过组内相对奖励消除对价值网络的依赖，但其隐含的前提是整个组必须同步生成。这在异步环境中带来了两重问题：

1. **同步屏障**：组内必须等待最慢样本，抵消了异步训练的效率优势。
2. **环境限制**：在在线或复杂Agentic环境中，环境往往对每个prompt只提供单条轨迹反馈（如用户的单次评价），无法构造组。

#### 2.2.2 单轨迹的方差问题与解决方案

单轨迹采样本质上的方差很高（类似于REINFORCE），因为缺少组内平均作为基线。SAO的解决方案是回归到一个**足够强的价值模型（Critic）**来提供低方差的优势估计。为了使单轨迹 + Critic 的组合在异步环境中真正可行，SAO配套设计了一系列价值模型训练策略。

### 2.3 价值模型增强设计

#### 2.3.1 更快的价值更新（Faster Value Update than Policy）

在单轨迹设置中，策略与价值函数之间存在强耦合：如果价值模型 $V_\phi$ 不准确，优势估计 $\hat{A}_t$ 就会充满噪声，进而导致破坏性的策略更新。SAO通过解耦两者的优化频率来缓解这一问题：每对策略 $\pi_\theta$ 执行一次梯度更新，就对价值网络 $V_\phi$ 执行 $K > 1$ 次更新（实验中 $K = 2$）。这使得Critic能更快适应策略分布的变化，在优势计算前提供更准确的基线。

#### 2.3.2 冻结注意力层的价值训练（Frozen-Attention Training）

在实验中发现，价值模型的梯度范数显著大于策略模型，且不稳定性的主要来源是Full Attention层，而MoE（Mixture-of-Experts）层相对稳定。基于此观察，SAO在RL训练期间冻结价值模型的Attention参数，仅优化MoE投影层。假设在于：预训练得到的注意力权重已具备足够的语义关联能力，限制优化空间到MoE层可以有效正则化Critic，防止其过拟合或发散。

#### 2.3.3 Skip-Observation Token-level GAE

Agentic任务的轨迹结构通常表现为动作与环境反馈的交替：$T = [a_0, o_0, a_1, o_1, \ldots]$。标准GAE试图计算相邻token间的价值差，但动作结束 token $a_{i,\text{end}}$ 到观察开始 token $o_{i,\text{start}}$ 的过渡在模型视角是间断的——模型并不生成 $o_i$。跨越这个边界计算优势会引入环境噪声，因为价值模型 $V(o_{i,\text{start}})$ 试图预测一个外部状态的价值。

SAO推导了**Skip-Observation GAE**：

- **优势计算仅连接动作token**：

$$\hat{A}(a_{i,N}) = \delta + \gamma\lambda \, \hat{A}(a_{i+1,0})$$

- **TD残差跨越观察gap计算**：

$$\delta_t = r_i + \gamma V(a_{i+1,0}) - V(a_{i,N})$$

这一公式将优势估计严格约束在模型输出上，过滤掉环境反馈的随机性。

#### 2.3.4 价值预训练的规模化（Scaling Value Pretraining）

SAO发现价值估计存在严重的**冷启动**问题——一个随机初始化的Critic在RL初期提供的基线质量极差。通过显著扩大价值预训练语料的规模，可以为后续RL训练提供一个稳健的初始化点，从而确保Faster Value Update和Frozen-Attention等机制从训练早期就能发挥作用。

---

## 三、方法对比：SAO与现有主流RL方法

### 3.1 SAO vs. PPO（Proximal Policy Optimization）

| 对比维度 | PPO | SAO |
|---------|-----|-----|
| **架构** | Actor-Critic架构，需维护独立价值网络，内存翻倍 | 虽也用Critic，但通过Frozen-Attention和MoE-only优化降低内存与稳定性风险 |
| **异步适配** | 设计于同步环境，假设策略差异较小 | DIS专为高策略滞后异步环境设计，通过激进裁剪与掩码保证稳定性 |
| **GAE** | 标准token-level GAE | Skip-Observation GAE，跳过观察token，避免环境噪声传播 |
| **概率比计算** | 使用 $\pi_{\theta_{\text{old}}}$ | 丢弃 $\pi_{\theta_{\text{old}}}$，直接使用 $\pi_{\text{rollout}}$ 作为行为代理 |

### 3.2 SAO vs. GRPO（Group Relative Policy Optimization）

| 对比维度 | GRPO | SAO |
|---------|------|-----|
| **基线来源** | 完全摒弃价值网络，通过组内奖励均值/标准差估计优势 | 回归价值模型，通过Faster Update和结构化正则化使其在单轨迹下可靠 |
| **异步兼容性** | 组采样引入同步屏障，与异步训练天然冲突 | 单轨迹设计消除等待延迟，流式处理到达轨迹 |
| **在线学习适用性** | 需同一prompt的多个样本，无法处理单轨迹反馈场景 | 天生适配单轨迹反馈的在线场景 |
| **稳定性** | 异步实验中约160步发生性能崩溃 | 可稳定训练至1000步以上 |
| **组大小** | 组大小为 $G$（如4-16） | 组大小为 $1$（单轨迹） |

### 3.3 SAO vs. VAPO（Value-based Policy Optimization）

VAPO是另一项针对推理任务的价值模型改进工作，同样使用长度自适应GAE和基于价值的RL。然而，VAPO缺乏针对异步环境的特殊设计：

- VAPO没有DIS机制，在异步场景下无法有效处理off-policy漂移，实验显示其训练快速崩溃（约90步）。
- SAO的Frozen-Attention和Faster Value Update是专门为异步高方差环境设计的，VAPO未涉及这些策略。

### 3.4 SAO vs. AReaL / ROLLFlash（异步系统）

AReaL和ROLLFlash等系统侧重于从工程层面解耦生成与训练，实现全异步流水线。SAO与这些工作是**互补的**：

- AReaL主要解决系统层面的吞吐和效率问题，算法层面仍使用类PPO/GRPO的更新；SAO则从算法层面重新设计，针对单轨迹异步场景优化稳定性和有效性。
- SAO可以部署在AReaL等异步系统之上（事实上，SAO已被用于GLM-5.2的Agentic RL训练流水线），形成**系统+算法**的协同优化。

### 3.5 SAO vs. Running-Mean Baseline / SPO

单轨迹采样也可以通过滑动窗口历史奖励均值（Running-Mean）或SPO（Single-Stream Policy Optimization）实现。这些方法虽然避免了价值网络，但实验表明其性能远低于SAO：

- Running-Mean在在线学习环境中表现出明显的**适应滞后**（adaptation lag），因为历史窗口的惯性使其难以快速响应奖励分布的变化。
- SAO的**状态依赖型Critic**能够动态追踪奖励偏移，提供在线场景中所需的精确基线。

---

## 四、实验分析

### 4.1 实验设置

- **基座模型**：Qwen3-30B-A3B-Thinking-2507
- **初始化**：数学推理使用Tool-Integrated Reasoning（TIR）数据进行SFT初始化；代码任务直接使用原始模型。
- **训练配置**：batch size 128，SAO组大小为1（单轨迹），GRPO组大小为8（16个prompt $\times$ 8个rollout），最大长度128k tokens。策略学习率 $1 \times 10^{-6}$，价值模型学习率 $5 \times 10^{-6}$，$K = 2$。Token裁剪参数 $\epsilon_{\text{low}} = 0.3$，$\epsilon_{\text{high}} = 5.0$（代码任务 $\epsilon_{\text{low}} = 0.8$，$\epsilon_{\text{high}} = 3.0$）。
- **评估基准**：
  - **推理**：AIME2025、BeyondAIME、HMMT Nov 2025、IMOAnswerBench（均使用Python工具）
  - **代码**：SWE-Bench Verified（使用OpenHands框架，最多300轮交互）

### 4.2 主实验结果（Main Results）

#### 表1：数学推理基准测试结果（Accuracy %）

| Model | AIME2025 | BeyondAIME | HMMT Nov 2025 | IMOAnswerBench |
|:-----:|:--------:|:----------:|:-------------:|:--------------:|
| Claude-Sonnet-4.5 | 87.0 | 62.0 | 81.7 | 65.8 |
| GPT-5 High | 94.6 | 74.0 | 89.2 | 76.0 |
| GLM-4.7 | 95.7 | — | 93.5 | 82.0 |
| Qwen3-30B-A3B w/ python | 14.6 | 10.5 | 17.3 | 7.8 |
| SFT (w/ python) | 80.4 | 53.3 | 75.2 | 53.3 |
| GRPO (w/ python) | 84.2 | 54.8 | 76.0 | 55.8 |
| **SAO (ours)** | **97.3** | **74.8** | **88.3** | **74.0** |
| SAO (w/ DIS only) | 94.2 | 71.5 | 86.7 | 71.3 |
| GRPO (+DIS) | 93.5 | 70.8 | 84.0 | 70.0 |

#### 表2：SWE-Bench Verified（Accuracy %）

| Model | Accuracy |
|:-----:|:--------:|
| Qwen3-30B-A3B | 23.0 |
| +GRPO (w/ DIS) | 27.0 |
| **+SAO (ours)** | **29.8** |

#### 关键观察：

1. **SAO在所有基准上均一致优于GRPO和SFT基线**。在AIME2025上，SAO达到97.3%，相比GRPO的84.2%提升了13.1个百分点；在BeyondAIME上提升20个百分点。
2. **DIS本身对GRPO也有显著帮助**：GRPO(+DIS)相比vanilla GRPO有大幅提升，但仍不及SAO，说明**单轨迹采样的价值模型设计**同样关键。
3. **跨任务泛化**：在代码任务SWE-Bench Verified上，SAO相比GRPO(w/DIS)仍有2.8个百分点的优势。

### 4.3 训练动态分析（Training Dynamics）

论文展示了不同方法在训练过程中的性能曲线：

- **Vanilla GRPO**：在约160步时发生明显的**性能崩溃**（collapse），无法继续有效训练。
- **GRPO (w/ DIS)**：通过DIS策略稳定了训练，能够持续训练，但后期性能增长趋于平缓。
- **SAO**：在初期与GRPO(w/DIS)表现接近；但在约400步后出现**明显的性能分化**，持续上升至1000步，展现了更强的收敛性和稳定性。

这一分化现象说明：单轨迹采样配合更强的价值模型，在中长期训练中能够持续挖掘策略的优化空间，而组采样方法在中期后逐渐触及瓶颈或稳定性边界。

### 4.4 消融实验（Ablation Studies）

#### 表3：消融实验结果（Accuracy %）

| 配置 | AIME2025 | BeyondAIME |
|:----:|:--------:|:----------:|
| **SAO（完整）** | **97.3** | **74.8** |
| SAO w/o Faster value（$K = 1$） | 95.0 | 69.8 |
| SAO w/o Frozen attention（全参数） | 90.6 | 74.5 |
| Vanilla VAPO（w/o DIS） | 91.3 | 69.0 |
| Running mean baseline | 79.8 | 55.3 |

#### 消融分析：

- **Faster Value Update**（$K = 1 \rightarrow K = 2$）：在AIME2025上从95.0提升到97.3（+2.3），BeyondAIME上从69.8提升到74.8（+5.0）。这说明**价值模型跟不上策略变化是单轨迹RL不稳定的主要来源之一**。

- **Frozen Attention**（全参数 vs 冻结Attention）：在AIME2025上，全参数更新导致性能从97.3骤降至90.6（$-$6.7），虽然BeyondAIME基本不变。这说明**Attention层的无约束优化会引入严重的训练震荡**，尤其在部分任务上损害最终性能。论文图4(b)显示全参数训练的Critic梯度范数显著更大且不稳定。

- **DIS的必要性**：VAPO（无DIS）在约90步即崩溃，clip ratio接近零，无法有效约束off-policy更新。SAO的DIS虽然clip ratio更高（意味着更多token被裁剪/掩码），但正是这种**激进的保守主义**保证了训练不发散。

- **价值模型 vs Running-Mean**：Running-Mean基线在AIME2025仅79.8，远低于SAO的97.3，证明在复杂推理任务中，**参数化的状态依赖型Critic远优于简单的历史奖励均值**。

### 4.5 在线学习模拟实验（Online Learning Simulation）

为了验证SAO在动态非平稳环境中的适应性，论文设计了一个模拟在线写作任务：

- **任务设置**：环境偏好（奖励信号）按阶段切换，依次偏好三种风格（cute $\rightarrow$ chuunibyou $\rightarrow$ classical）。每个阶段环境对每个prompt只提供单条轨迹反馈，天然排斥组采样方法。
- **对比基线**：Running-Mean Advantage Estimation（滑动窗口128个最近奖励）。
- **结果**（论文图5）：
  - SAO在每次风格切换后都能快速重新对齐策略，压制先前主导风格，适应新目标。
  - Running-Mean基线由于历史窗口的惯性，在奖励分布变化后表现出明显的**适应滞后**，恢复速度和最终收敛水平均低于SAO。

这一实验有力证明了SAO的价值模型在追踪动态奖励偏移方面的优越性，以及单轨迹设计对在线交互场景的天然适配性。

### 4.6 附录补充实验

- **Token-level vs Step-level Value**：论文尝试了将GAE从token级提升到step级（以单轮对话为动作单位），包括Step-Average和Last-Token Prediction两种聚合方式。结果显示，两种step-level方法均显著弱于token-level（AIME2025：87.3 vs 89.8；BeyondAIME：62.8 vs 66.8）。这说明在复杂推理轨迹中，**token级细粒度监督对于准确捕捉逻辑转移至关重要**。

- **SPO对比**：直接的历史运行均值或SPO（单流策略优化）虽然也是单轨迹方案，但依赖训练数据难度的先验信息，最终表现不如SAO。

---

## 五、公开讨论与博客观点整理

从Moonlight、Paperium、AlphaXiv等学术社区平台的讨论来看，研究者对SAO的共识和关注点主要集中在以下几个方面：

### 5.1 工程实用性与算法简洁性的平衡

多数评论认为SAO的核心贡献在于**"用简化的工程实现换取了算法的稳定性"**。直接丢弃 $\pi_{\theta_{\text{old}}}$、使用 $\pi_{\text{rollout}}$ 作为行为代理，虽然理论上引入了off-policy偏差，但在实践中避免了维护历史模型检查点的工程噩梦，使异步RL在超大规模集群上的部署成为可能。

### 5.2 GRPO的"异步困境"被明确指出

社区普遍认可GRPO的组采样设计在同步场景中降低了价值网络开销，但在异步和在线环境中是**"结构性错配"**。SAO通过回归价值网络 + 单轨迹，实际上是用**"计算换灵活性"**，这种权衡在Agentic长轨迹场景中被认为是值得的。

### 5.3 对价值模型的重新重视

在GRPO和RLOO等无Critic方法流行后，SAO重新强调了价值模型在复杂任务中的必要性。但SAO并非简单地回归标准PPO-Critic，而是通过**Frozen-Attention**、**Faster Update**、**规模化预训练**等手段，对Critic训练进行了**"现代化改造"**。

### 5.4 Token级裁剪与掩码的激进性

有评论指出SAO的**"双边掩码"**策略比标准PPO的裁剪更激进，相当于在极端off-policy token上**完全切断梯度**。这在传统同步训练中可能过于保守，但在高滞后的异步环境中，这种保守主义恰恰是防止崩溃的关键。

### 5.5 实际部署验证

论文提到SAO已成功部署于**GLM-5.2（750B-A40B）**的Agentic RL训练流水线，这是对其工程可行性的最强背书。社区认为这是从**"论文方法"**到**"生产实践"**的重要跨越。

---

## 六、总结与局限性

### 6.1 核心贡献总结

SAO通过系统性的设计：

1. **单轨迹采样**消除同步屏障
2. **DIS + 双边掩码**控制off-policy漂移
3. **增强的价值模型训练**（Faster Update、Frozen Attention、规模化预训练）降低方差
4. **Skip-Observation GAE**适配Agentic轨迹结构

成功将异步RL从**"效率优化工具"**提升为**"稳定有效的训练范式"**，在长时程推理和编码任务上实现了对GRPO的持续超越。

### 6.2 局限性与未来方向

论文自身也指出了若干局限：

- **模型规模迁移性**：实验主要基于Qwen3-30B-A3B模型，结论向更小模型、非Agentic RLHF设置、或短轨迹密集奖励环境的迁移性尚需验证。
- **基础设施依赖**：SAO依赖可靠的token级行为概率记录，要求推理基础设施在异步生成过程中稳定保存log-probability，这对部分系统可能构成部署门槛。
- **在线学习安全**：在线学习实验仅使用了受控的模拟偏好偏移，真实用户场景的在线适配需要更强的安全审查、监控和隐私保护机制。

### 6.3 对领域的影响

SAO的提出标志着LLM RL领域从**"同步批量训练"**向**"异步流式训练"**的重要范式转变，特别是在Agentic长轨迹任务中。其价值模型训练方法（Frozen-Attention、Faster Update、规模化预训练）也为未来Critic设计提供了新的参考思路。对于追求高效、可扩展、且支持在线学习的Agentic RL系统开发者而言，SAO是一个值得深入研究和实践的框架。

---

> **备注**：本文档基于论文原文 arXiv:2607.07508 以及 Moonlight、Paperium、AlphaXiv、FuguMT等学术社区平台的公开讨论整理而成。如有引用需求，请查阅原始论文。

