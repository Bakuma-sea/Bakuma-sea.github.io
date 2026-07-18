---
author: Bakuma-sea
pubDatetime: 2026-07-17T15:23:01+08:00
title: "手撕 GAE 算法：从 TD 残差到广义优势估计"
featured: false
tags:
  - "GAE"
  - "PPO"
  - "RL"
  - "Advantage Estimation"
description: "用直观推导理解 TD 残差、折扣因子与广义优势估计，并连接到 PPO 的训练实现。"
timezone: Asia/Shanghai
---

# 手撕GAE算法 —— 从TD残差到广义优势估计

> 本文参考知乎博客《GAE（Generalized Advantage Estimation）理解及推导》的写作风格，力求用最通俗的方式讲清楚GAE的来龙去脉。原始论文为Schulman et al. 2016。

---

## 第一部分：总述

### 1.1 GAE是什么

GAE全称**Generalized Advantage Estimation**，翻译过来叫**广义优势估计**。它是PPO算法中用来估计"某个动作到底好不好"的一个模块。

在策略梯度方法中，我们需要一个量来告诉策略：在状态 $s_t$ 下选择动作 $a_t$ 比平均水平好多少？这个量就是**优势（Advantage）**：

$$
A(s_t, a_t) = Q(s_t, a_t) - V(s_t)
$$

但问题是：真实的 $Q$ 和 $V$ 都是未知的。我们只能根据采样的数据去**估计**这个优势。GAE就是一种估计方法，它的核心思想可以概括为一句话：

> **把多步TD残差用指数衰减的方式加权平均起来，在偏差和方差之间取得平衡。**

### 1.2 为什么需要GAE

估计优势的方法有很多，但各有各的问题：

- **蒙特卡洛（MC）**：用实际累积回报减去价值估计。无偏，但方差很大（因为未来随机因素太多）。
- **单步TD残差**：用一步的奖励和价值变化来估计。方差小，但有偏（因为 $V$ 函数本身估计不准）。

GAE的出现就是为了解决这个矛盾：能不能既利用多步的实际观测来减少偏差，又不要让方差爆炸？

答案就是：**加权平均不同步数的估计，远处的步数权重衰减得快一些。**

---

## 第二部分：分述 —— 从残差到GAE的完整推导

### 2.1 引入TD残差

我们从策略梯度的基本公式开始。对于Policy Gradient来说，策略参数的梯度为：

$$
\nabla_\theta R_\theta = \mathbb{E}_{(a_t, s_t) \sim \pi_\theta} \left[ A_\theta(a_t, s_t) \cdot \nabla_\theta \log P_\theta(a_t | s_t) \right]
$$

其中 $A_\theta(a_t, s_t)$ 表示在当前状态 $s_t$ 下采取动作 $a_t$ 所能带来的未来回报期望（相对期望，所以要减掉baseline）。

回顾一下 $A(t)$ 的计算公式：

$$
A(t) = Q(a_t, s_t) - baseline
$$

我们把 $Q(a_t, s_t)$ 写成TD残差的形式。用状态价值函数 $V(s_t)$ 来代替baseline，并用 $\delta_t$ 来表示TD残差：

$$
\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t) \tag{1}
$$

**这个公式是什么意思？**

- $r_t$：当前时刻实际拿到的奖励（观测值）
- $V(s_t)$：当前状态的价值估计
- $V(s_{t+1})$：下一状态的价值估计
- $\gamma$：折扣因子

$Q(a_t, s_t)$ 是在当前状态 $s_t$ 下采取动作 $a_t$ 时，未来总回报的期望。$V(s_t)$ 和 $V(s_{t+1})$ 是基于模型对未来回报的估计。$r_t$ 是当前时间戳下获得的奖励观测值。

**残差的形式相当于利用当前时间戳的观测值去逼近了真实回报一小步。** 所以 $\delta_t$ 表示采取当前动作 $a_t$ 的好坏程度。

### 2.2 一个生活化的例子

为什么要把优势写成残差的形式？我们通过一个例子来说明。（假设先不考虑baseline的问题）

> **小明坐地铁回家**
>
> 小明现在要坐地铁从公司回家，途径2站。
>
> 他刚出公司的时候是8:00，此时他估算了一下回家需要的时间，大概需要30分钟到家。（实际25分钟，偏差了5分钟）
>
> 到了第一个途径站的时候小明看了下表，过去了10分钟，比预期的快了一些，所以他又估计了一下，大概还需要18分钟到家。（实际15分钟，偏差了3分钟）
>
> 到了第二个途径站的时候，小明又看了下表，此时距离出发已经过去了15分钟，他又估计了一下，他觉得按照以往的经验，大概还需要10分钟到家。（实际10分钟，偏差了0分钟）
>
> 10分钟后，他到家了，此时是8:25，距离他从单位出发，过去了25分钟。

通过上面的例子可以发现：**随着距离终点越来越近，小明的估测值是越来越准的。**

回到前面的公式，我们写成残差的形式，理论上可以使得 $\delta_t$ 基于当前的局势（$a_t$、$s_t$、$r_t$），对未来收益的预估更加准确，因为它向最终的结果更近了一步，获得了一个观测值，相当于缩小了估计的范围。

### 2.3 多步优势估计

既然单步残差能让我们"向真实结果逼近一小步"，那为什么不往前走多步，多积累几个step的观测值再做估计呢？

我们用 $A_k(t)$ 来表示在 $t$ 时刻往前看 $k$ 个step的情况下，对当前形势的评估。

先定义单步的TD残差：

$$
\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)
$$

然后定义k步优势估计：

$$
\begin{aligned}
A_1(t) &= \delta_t \\
A_2(t) &= \delta_t + \gamma \delta_{t+1} \\
A_3(t) &= \delta_t + \gamma \delta_{t+1} + \gamma^2 \delta_{t+2} \\
A_k(t) &= \sum_{k=0}^{k-1} \gamma^k \delta_{t+k} \tag{2}
\end{aligned}
$$

**k步优势估计的直观含义：**

- $A_1(t)$：只看当前这一步，用当前的观测值修正当前的估计
- $A_2(t)$：看当前和下一步，用两步的观测值来修正
- $A_k(t)$：看当前到第k步，用k步的观测值来修正

**k步估计的偏差与方差：**

- **k越大**：观测值越多，估计值越少，偏差越小，方差越大
- **k越小**：观测值越少，估计值越多，偏差越大，方差越小

这是因为 $V$ 是估计值，相当于给预估值加了一个先验概率分布，所以每次估计的结果不会有特别大的差别；但观测值就会有很多不确定因素，可能受很多意外情况影响，累积的step越多，方差可能就越大。

### 2.4 从k步估计到GAE

观察上面的等式 (2)，我们发现当 $k \to \infty$ 且 $\gamma \to 0$ 时，$V(s_{t+k})$ 几乎就可以忽略不计了（在RLHF的代码实现中，索性直接把 $V(s_{t+k})$ 设为了0）。这导致一个后果就是整个 $A_k(t)$ 几乎都是观测值，没有估计值，这也就说明整体的偏差bias几乎为0。

但凡事都有两面性，偏差减小，方差就会增大。为了tradeoff偏差和方差，可以对不同步数的 $A_k(t)$ 做加权求和（指数加权求和）。

我们先对 $A_k(t)$ 做一个变形，把等式 (1) 带入等式 (2)：

$$
\begin{aligned}
A_k(t) &= r_t + \gamma r_{t+1} + \gamma^2 r_{t+2} + \cdots + \gamma^{k-1} r_{t+k-1} + \gamma^k V(s_{t+k}) - V(s_t) \tag{3}
\end{aligned}
$$

**推导过程：** 把 $\delta_{t+k} = r_{t+k} + \gamma V(s_{t+k+1}) - V(s_{t+k})$ 展开后累加，中间的 $V$ 项会telescoping（望远镜相消），最后就得到上面的形式。

现在我们来定义GAE。对于某一时刻 $t$，我们在估计其未来可能获得的回报时，可以综合考虑不同步数的估计值，于是对不同的 $A_k(t)$ 作加权求和：

$$
\begin{aligned}
A^{GAE_1}_t &= A^1_t + \lambda A^2_t + \lambda^2 A^3_t + \cdots \\
&= \delta_t + \lambda(\delta_t + \gamma \delta_{t+1}) + \lambda^2(\delta_t + \gamma \delta_{t+1} + \gamma^2 \delta_{t+2}) + \cdots \\
&= \delta_t(1 + \lambda + \lambda^2 + \cdots) + \gamma\delta_{t+1}(\lambda + \lambda^2 + \cdots) + \gamma^2\delta_{t+2}(\lambda^2 + \cdots) + \cdots
\end{aligned}
$$

其中 $\lambda \in [0, 1)$。假设一共考虑 $k$ 个step的 $A_k(t)$，并用等比数列求和公式计算可得（严格意义上来讲，$\lambda$ 是可以为1的，这里为了公式化简，先假设区间左闭右开）：

$$
\begin{aligned}
A^{GAE_1}_t = \delta_t\left(\frac{1 - \lambda^k}{1 - \lambda}\right) + \gamma \delta_{t+1}\left(\frac{\lambda(1 - \lambda^{k-1})}{1 - \lambda}\right) + \gamma^2 \delta_{t+2}\left(\frac{\lambda^2(1 - \lambda^{k-2})}{1 - \lambda}\right) + \cdots
\end{aligned}
$$

当 $k \to \infty$ 时，$\lambda^k$、$\lambda^{k-1}$、$\lambda^{k-2}$ 等均趋近于0，所以有：

$$
\begin{aligned}
A^{GAE_1}_t = \delta_t\left(\frac{1}{1 - \lambda}\right) + \gamma \delta_{t+1}\left(\frac{\lambda}{1 - \lambda}\right) + \gamma^2 \delta_{t+2}\left(\frac{\lambda^2}{1 - \lambda}\right) + \cdots
\end{aligned}
$$

因为 $(1 - \lambda)$ 是一个常数，所以我们在等式两边同乘 $(1 - \lambda)$，可得：

$$
\begin{aligned}
(1 - \lambda)A^{GAE_1}_t &= \delta_t + \gamma \delta_{t+1}\lambda + \gamma^2 \delta_{t+2}\lambda^2 + \cdots \\
&= \delta_t + \gamma \lambda \delta_{t+1} + \gamma^2 \lambda^2 \delta_{t+2} + \cdots
\end{aligned}
$$

我们用 $A^{GAE}_t$ 来表示 $(1 - \lambda)A^{GAE_1}_t$，可得GAE的最终公式：

$$
\begin{aligned}
A^{GAE}_t &= \delta_t + \gamma \lambda \delta_{t+1} + \gamma^2 \lambda^2 \delta_{t+2} + \cdots \\
&= \sum_{k=0}^{\infty} (\gamma \lambda)^k \delta_{t+k} \tag{4}
\end{aligned}
$$

这就是**综合考虑了k-step的Advantage Estimation**，我们把它称为**Generalized Advantage Estimation**，简称GAE。

### 2.5 λ的作用：调节偏差与方差

回过头去看等式 (2) 和等式 (4)：

$$
A_k(t) = \sum_{k=0}^{\infty} \gamma^k \delta_{t+k} \tag{2}
$$

$$
A^{GAE}_t = \sum_{k=0}^{\infty} (\gamma \lambda)^k \delta_{t+k} \tag{4}
$$

可以直观地发现，$A^{GAE}_t$ 其实就是在 $A_k(t)$ 的基础上增加了一个超参数 $\lambda$。我们可以调节 $\lambda$ 的大小，得出关键结论：

**当 $\lambda = 1$ 时：**

$$
A^{GAE}_t = \sum_{k=0}^{\infty} \gamma^k \delta_{t+k} = r_t + \gamma r_{t+1} + \gamma^2 r_{t+2} + \cdots + \gamma^{k-1} r_{t+k-1} + \gamma^k V(s_{t+k}) - V(s_t)
$$

此时 $A^{GAE}_t$ 等于 $A_k(t)$，包含了k-step的观测值，所以**偏差最小，方差最大**。

**当 $\lambda = 0$ 时：**

$$
A^{GAE}_t = \delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)
$$

此时GAE的估计只包含了1个step的观测值，而基于 $s_{t+1}$ 的估计值占了大头，所以**偏差最大，方差最小**。

**结论：$\lambda$ 就是用来调节偏差和方差的一个超参数：**

- $\lambda$ 越大，观测值越多，偏差越小，方差越大
- $\lambda$ 越小，估计值越多，偏差越大，方差越小

### 2.6 为什么需要λ，而不是直接调节γ？

观察等式 (4)，我们也许会提出一个疑问：从公式的形式来讲，$\gamma$ 和 $\lambda$ 是高度绑定的，既然 $\lambda$ 可以tradeoff偏差和方差，那我们为什么不直接调节 $\gamma$ 的大小，反而需要再引出一个新的参数 $\lambda$ 呢？

这个问题可以从两个角度来理解：

**第一，从公式上看：** 虽然公式 (4) 中 $\gamma$ 和 $\lambda$ 看起来是绑定在一起的，但通过观察公式 (1) $\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)$ 可以发现，$\gamma$ 的值会影响到 $\delta$ 的值。我们在调节偏差和方差的时候，不希望影响到 $\delta$ 的值，所以必须要引入一个新的参数 $\lambda$。

**第二，从直观意义上看：** $\gamma$ 的最基本定义是**时间折损因子**。它指的是我们希望策略在做决策的时候能更多地考虑当前的reward，越靠近当前时间戳的reward应该越大。所以未来的reward都会加上一个时间折损因子，通过调节 $\gamma$ 的大小可以控制策略在做决策的时候是更加"有远见"还是更加注重当前的收益。而 $\lambda$ 的作用是调节偏差和方差的平衡。所以 $\gamma$ 和 $\lambda$ 的作用和含义是不同的。

### 2.7 GAE的递推形式（代码实现的关键）

GAE的求和形式适合理解原理，但代码实现更高效的是**反向递推形式**：

从最后一个时间步开始倒推：

$$
\hat{A}_T = \delta_T
$$

$$
\hat{A}_t = \delta_t + \gamma \lambda \hat{A}_{t+1} \cdot (1 - d_t^{done}) \tag{5}
$$

**证明：**

展开递推式：

$$
\hat{A}_t = \delta_t + \gamma\lambda \delta_{t+1} + (\gamma\lambda)^2 \delta_{t+2} + \cdots = \sum_{k=0}^{\infty} (\gamma\lambda)^k \delta_{t+k}
$$

这正是GAE的定义式。

**考虑回合终止的情况**，当时间步 $t$ 是回合的最后一步时，$s_{t+1}$ 不存在，因此：

$$
\delta_t = r_t - V(s_t) \quad \text{（因为 } V(s_{t+1}) = 0 \text{）}
$$

同时递推式中 $\hat{A}_{t+1}$ 也应该被截断：

$$
\hat{A}_t = \delta_t + \gamma \lambda \hat{A}_{t+1} \cdot (1 - d_t^{done})
$$

其中 $d_t^{done}$ 是回合结束标志。

**注意两个不同的done标志：**

- **$d_t^{done}$（或 truncated）**：广义结束标志，包括人为截断（如时间步达到上限）。此时 $A_{t+1}$ 不应该再反向传播，但 $V(s_{t+1})$ 仍然有意义（环境没有真正结束，只是人为截断）。
- **$d_t^{dw}$（dead and win）**：回合真正结束（成功或失败）。此时 $V(s_{t+1}) = 0$（因为环境重置），且 $A_{t+1} = 0$。

因此，完整的递推公式为：

$$
\delta_t = r_t + \gamma V(s_{t+1}) \cdot (1 - d_t^{dw}) - V(s_t) \tag{6}
$$

$$
\hat{A}_t = \delta_t + \gamma \lambda \hat{A}_{t+1} \cdot (1 - d_t^{done}) \tag{7}
$$

---

## 第三部分：代码实现

### 3.1 基础实现（展开式，面向理解）

```python
import torch
import numpy as np


def compute_gae_basic(rewards, values, dones, gamma=0.99, lamda=0.95):
    """
    GAE 基础实现：直接按照数学公式展开求和。

    参数：
        rewards: 即时奖励序列 [T]
        values:  状态价值序列 [T+1]，最后一个元素是 next_state 的价值
        dones:   回合结束标志 [T]，1 表示该步结束
        gamma:   折扣因子
        lamda:   GAE 参数

    返回：
        advantages: 优势估计 [T]
        returns:    目标价值 [T]（用于训练 Critic）
    """
    T = len(rewards)
    advantages = torch.zeros(T)

    # 计算每个时间步的 GAE
    for t in range(T):
        gae = 0.0
        for l in range(T - t):
            # δ_{t+l} = r_{t+l} + γ * V(s_{t+l+1}) * (1 - done) - V(s_{t+l})
            next_value = values[t + l + 1] if t + l + 1 <= T else 0.0
            done_mask = 1.0 - (dones[t + l] if t + l < T else 0.0)
            delta = rewards[t + l] + gamma * next_value * done_mask - values[t + l]

            # 累加 (γλ)^l * δ_{t+l}
            gae += (gamma * lamda) ** l * delta

            # 如果到回合结束，停止累加
            if t + l < T and dones[t + l] > 0.5:
                break

        advantages[t] = gae

    # 目标价值 = 优势 + 当前价值估计
    returns = advantages + values[:T]

    return advantages, returns
```

### 3.2 高效实现（反向递推，生产环境推荐）

```python
import torch
import numpy as np


def compute_gae(rewards, values, dones, dw, gamma=0.99, lamda=0.95):
    """
    GAE 高效实现：反向递推，时间复杂度 O(T) 而非 O(T²)。

    参数：
        rewards: 即时奖励序列 [T]
        values:  状态价值序列 [T+1]，最后一个元素是 next_state 的价值
        dones:   广义结束标志 [T]（包括截断，用于截断 A_{t+1} 的反向传播）
        dw:      真正结束标志 [T]（成功/失败，用于将 V(s_{t+1}) 置零）
        gamma:   折扣因子
        lamda:   GAE 参数

    返回：
        advantages: 优势估计 [T]
        returns:    目标价值 [T]
    """
    T = len(rewards)
    advantages = torch.zeros(T)
    gae = 0.0

    # 从最后一个时间步反向递推
    for t in reversed(range(T)):
        # δ_t = r_t + γ * V(s_{t+1}) * (1 - dw_t) - V(s_t)
        delta = rewards[t] + gamma * values[t + 1] * (1.0 - dw[t]) - values[t]

        # A_t = δ_t + γ * λ * A_{t+1} * (1 - done_t)
        # 如果 done_t = 1，则 A_{t+1} 不反向传播
        gae = delta + gamma * lamda * gae * (1.0 - dones[t])
        advantages[t] = gae

    # 目标价值 = 优势 + 当前价值估计
    returns = advantages + values[:T]

    return advantages, returns
```

### 3.3 封装好的 GAE 类（便于手撕理解）

```python
import torch
import numpy as np


class GAE:
    """
    广义优势估计（Generalized Advantage Estimation）模块。

    这是一个独立可复用的 GAE 计算模块，封装了 GAE 的两种等价实现：
    1. 展开式：A_t = sum_{l=0}^{∞} (γλ)^l * δ_{t+l}
    2. 递推式：A_t = δ_t + γλ * A_{t+1} * (1 - done_t)

    参数：
        gamma: 折扣因子，控制未来奖励的重要性，通常取 0.99
        lamda: GAE 参数，控制偏差-方差权衡，通常取 0.95
                 λ=0 → 1-step TD（偏差大，方差小）
                 λ=1 → MC 估计（无偏，方差大）
    """

    def __init__(self, gamma=0.99, lamda=0.95):
        self.gamma = gamma
        self.lamda = lamda

    def compute_td_error(self, reward, value, next_value, is_dead_or_win):
        """
        计算单步 TD Error。

        δ_t = r_t + γ * V(s_{t+1}) * (1 - dw_t) - V(s_t)

        参数：
            reward:          即时奖励 r_t
            value:           当前状态价值 V(s_t)
            next_value:      下一状态价值 V(s_{t+1})
            is_dead_or_win:  是否真正结束（dw），1 表示环境真正结束

        返回：
            delta:  TD Error
        """
        return reward + self.gamma * next_value * (1.0 - is_dead_or_win) - value

    def compute_advantage_recursive(self, rewards, values, dones, dw):
        """
        使用反向递推计算 GAE 优势估计。

        递推公式：
            A_T = δ_T
            A_t = δ_t + γ * λ * A_{t+1} * (1 - done_t)

        参数：
            rewards: [T] 奖励序列
            values:  [T+1] 价值序列（含最后一个 next_state）
            dones:   [T] 广义结束标志（截断 done）
            dw:      [T] 真正结束标志（dead/win）

        返回：
            advantages: [T] 优势估计
            returns:    [T] 目标价值（用于训练 Critic）
        """
        T = len(rewards)
        advantages = torch.zeros(T)
        gae = 0.0

        for t in reversed(range(T)):
            delta = self.compute_td_error(
                rewards[t], values[t], values[t + 1], dw[t]
            )
            gae = delta + self.gamma * self.lamda * gae * (1.0 - dones[t])
            advantages[t] = gae

        returns = advantages + values[:T]
        return advantages, returns

    def compute_advantage_expanded(self, rewards, values, dones):
        """
        使用展开式计算 GAE 优势估计（用于理解/验证）。

        展开公式：
            A_t = sum_{l=0}^{∞} (γλ)^l * δ_{t+l}

        参数：
            rewards: [T] 奖励序列
            values:  [T+1] 价值序列
            dones:   [T] 结束标志

        返回：
            advantages: [T] 优势估计
        """
        T = len(rewards)
        advantages = torch.zeros(T)

        for t in range(T):
            gae = 0.0
            for l in range(T - t):
                idx = t + l
                next_value = values[idx + 1] if idx + 1 <= T else 0.0
                done_mask = 1.0 - (dones[idx] if idx < T else 0.0)
                delta = rewards[idx] + self.gamma * next_value * done_mask - values[idx]
                gae += (self.gamma * self.lamda) ** l * delta

                if dones[idx] > 0.5:
                    break

            advantages[t] = gae

        return advantages

    def normalize(self, advantages, eps=1e-8):
        """
        对优势进行归一化，降低方差，训练更稳定。

        这是 PPO 中的常用技巧：
            A_t = (A_t - mean(A)) / (std(A) + eps)
        """
        return (advantages - advantages.mean()) / (advantages.std() + eps)

    def __call__(self, rewards, values, dones, dw=None, normalize=True):
        """
        便捷调用接口：计算 GAE 优势估计和目标价值。

        参数：
            rewards:   [T] 奖励序列
            values:    [T+1] 价值序列
            dones:     [T] 广义结束标志
            dw:        [T] 真正结束标志（默认与 dones 相同）
            normalize: 是否对优势进行归一化

        返回：
            advantages: [T] 优势估计
            returns:    [T] 目标价值
        """
        if dw is None:
            dw = dones

        advantages, returns = self.compute_advantage_recursive(rewards, values, dones, dw)

        if normalize:
            advantages = self.normalize(advantages)

        return advantages, returns
```

### 3.4 向量化批量实现（支持多个并行环境）

```python
import torch
import numpy as np


class BatchedGAE:
    """
    支持并行环境的批量化 GAE 实现。

    当使用多个环境并行采集数据时（如 8 个环境各跑 32 步），
    输入数据形状为 [num_envs, num_steps]。
    """

    def __init__(self, gamma=0.99, lamda=0.95):
        self.gamma = gamma
        self.lamda = lamda

    def __call__(self, rewards, values, dones, dw=None):
        """
        参数：
            rewards: [num_envs, num_steps] 奖励
            values:  [num_envs, num_steps + 1] 价值（含 next_value）
            dones:   [num_envs, num_steps] 结束标志
            dw:      [num_envs, num_steps] 真正结束标志

        返回：
            advantages: [num_envs * num_steps] 展平后的优势
            returns:    [num_envs * num_steps] 展平后的目标价值
        """
        if dw is None:
            dw = dones

        num_envs, num_steps = rewards.shape
        advantages = torch.zeros_like(rewards)
        gae = torch.zeros(num_envs)

        for t in reversed(range(num_steps)):
            delta = rewards[:, t] + self.gamma * values[:, t + 1] * (1.0 - dw[:, t]) - values[:, t]
            gae = delta + self.gamma * self.lamda * gae * (1.0 - dones[:, t])
            advantages[:, t] = gae

        returns = advantages + values[:, :-1]

        # 展平为 [num_envs * num_steps]
        advantages = advantages.reshape(-1)
        returns = returns.reshape(-1)

        # 归一化
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        return advantages, returns
```

### 3.5 测试与验证

```python
def test_gae_correctness():
    """测试 GAE 实现的正确性：用递推式和展开式对比。"""
    gae = GAE(gamma=0.99, lamda=0.95)

    # 构造一个简单轨迹：5 步，最后一步结束
    rewards = torch.tensor([1.0, 2.0, 3.0, 4.0, 5.0])
    values = torch.tensor([0.5, 1.0, 1.5, 2.0, 2.5, 0.0])  # 最后一个是 next_value = 0
    dones = torch.tensor([0.0, 0.0, 0.0, 0.0, 1.0])
    dw = torch.tensor([0.0, 0.0, 0.0, 0.0, 1.0])

    # 两种方法计算
    adv_recursive, returns_recursive = gae.compute_advantage_recursive(rewards, values, dones, dw)
    adv_expanded = gae.compute_advantage_expanded(rewards, values, dones)

    print("=" * 60)
    print("GAE 正确性测试")
    print("=" * 60)
    print(f"递推式优势:  {adv_recursive}")
    print(f"展开式优势:  {adv_expanded}")
    print(f"目标价值:    {returns_recursive}")

    # 验证两种方法结果一致
    assert torch.allclose(adv_recursive, adv_expanded, atol=1e-5), \
        "递推式和展开式结果不一致！"

    # 手动验证最后一步
    # δ_4 = r_4 + γ * V(s_5) * (1 - dw_4) - V(s_4) = 5.0 + 0 - 2.5 = 2.5
    # A_4 = δ_4 = 2.5
    assert abs(adv_recursive[4].item() - 2.5) < 1e-5

    # 手动验证倒数第二步
    # δ_3 = r_3 + γ * V(s_4) * (1 - dw_3) - V(s_3) = 4.0 + 0.99*2.5 - 2.0 = 4.475
    # A_3 = δ_3 + γ*λ * A_4 * (1 - done_3) = 4.475 + 0.99*0.95*2.5 = 6.826
    expected_delta_3 = 4.0 + 0.99 * 2.5 - 2.0
    expected_A_3 = expected_delta_3 + 0.99 * 0.95 * 2.5
    assert abs(adv_recursive[3].item() - expected_A_3) < 1e-5

    print("✓ 所有测试通过！")
    return True


def test_gae_lambda_extremes():
    """测试 λ 的极端值：λ=0 和 λ=1。"""
    rewards = torch.tensor([1.0, 2.0, 3.0])
    values = torch.tensor([0.5, 1.0, 1.5, 0.0])
    dones = torch.tensor([0.0, 0.0, 1.0])
    dw = torch.tensor([0.0, 0.0, 1.0])

    # λ = 0：退化为 1-step TD Error
    gae_0 = GAE(gamma=0.99, lamda=0.0)
    adv_0, _ = gae_0.compute_advantage_recursive(rewards, values, dones, dw)
    expected_td = rewards + 0.99 * values[1:] * (1 - dw) - values[:3]
    print(f"\nλ=0 时 GAE: {adv_0}")
    print(f"1-step TD:   {expected_td}")
    assert torch.allclose(adv_0, expected_td, atol=1e-5)

    # λ = 1：等价于 MC 回报减去 V
    gae_1 = GAE(gamma=0.99, lamda=1.0)
    adv_1, returns_1 = gae_1.compute_advantage_recursive(rewards, values, dones, dw)
    # MC 回报：G_0 = 1.0 + 0.99*2.0 + 0.99^2*3.0 = 5.9203
    # G_1 = 2.0 + 0.99*3.0 = 4.97
    # G_2 = 3.0
    expected_G = torch.tensor([
        1.0 + 0.99 * 2.0 + 0.99 ** 2 * 3.0,
        2.0 + 0.99 * 3.0,
        3.0
    ])
    expected_mc = expected_G - values[:3]
    print(f"λ=1 时 GAE: {adv_1}")
    print(f"MC 优势:     {expected_mc}")
    assert torch.allclose(adv_1, expected_mc, atol=1e-5)

    print("✓ 极端值测试通过！")
    return True


def test_gae_truncated():
    """测试截断情况（done vs dw 的区别）。"""
    # 场景：5 步轨迹，第 3 步被截断（truncated），但环境没有真正结束
    rewards = torch.tensor([1.0, 2.0, 3.0, 4.0, 5.0])
    values = torch.tensor([0.5, 1.0, 1.5, 2.0, 2.5, 3.0])  # next_value 有意义
    dones = torch.tensor([0.0, 0.0, 1.0, 0.0, 0.0])  # 第 3 步 truncated
    dw = torch.zeros(5)  # 没有真正结束

    gae = GAE(gamma=0.99, lamda=0.95)
    adv, returns = gae.compute_advantage_recursive(rewards, values, dones, dw)

    print(f"\n截断场景测试：")
    print(f"优势: {adv}")
    print(f"目标价值: {returns}")

    # 验证：第 3 步的 A_2 不应该传播到第 2 步的 A_1
    # δ_2 = 3.0 + 0.99*2.0 - 1.5 = 3.48
    # A_2 = δ_2 （因为 done_2=1，A_3 不传播）
    assert abs(adv[2].item() - 3.48) < 1e-5

    print("✓ 截断测试通过！")
    return True


if __name__ == "__main__":
    test_gae_correctness()
    test_gae_lambda_extremes()
    test_gae_truncated()
```

### 3.6 与 PPO 集成的完整示例

```python
import torch
import torch.nn as nn
from torch.distributions import Categorical


class ActorCritic(nn.Module):
    """示例 Actor-Critic 网络。"""
    def __init__(self, state_dim, action_dim, hidden_dim=64):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(state_dim, hidden_dim), nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim), nn.Tanh()
        )
        self.actor = nn.Linear(hidden_dim, action_dim)
        self.critic = nn.Linear(hidden_dim, 1)

    def forward(self, state):
        features = self.shared(state)
        return self.actor(features), self.critic(features)

    def get_value(self, state):
        _, value = self.forward(state)
        return value.squeeze()

    def get_action_and_value(self, state, action=None):
        logits, value = self.forward(state)
        dist = Categorical(logits=logits)
        if action is None:
            action = dist.sample()
        return action, dist.log_prob(action), dist.entropy(), value.squeeze()


class PPOWithGAE:
    """
    PPO 完整实现，重点展示 GAE 的集成方式。
    """

    def __init__(self, state_dim, action_dim, gamma=0.99, lamda=0.95,
                 epsilon=0.2, lr=3e-4, K_epochs=4, c1=0.5, c2=0.01):
        self.gamma = gamma
        self.lamda = lamda
        self.epsilon = epsilon
        self.K_epochs = K_epochs
        self.c1 = c1
        self.c2 = c2

        self.model = ActorCritic(state_dim, action_dim)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.gae_module = GAE(gamma=gamma, lamda=lamda)

        # 经验缓冲区
        self.reset_buffer()

    def reset_buffer(self):
        self.states = []
        self.actions = []
        self.log_probs = []
        self.rewards = []
        self.dones = []
        self.dw = []
        self.values = []

    def select_action(self, state):
        state_tensor = torch.FloatTensor(state)
        action, log_prob, _, value = self.model.get_action_and_value(state_tensor)

        self.states.append(state_tensor)
        self.actions.append(action)
        self.log_probs.append(log_prob)
        self.values.append(value)

        return action.item()

    def store_transition(self, reward, done, dw):
        self.rewards.append(reward)
        self.dones.append(float(done))
        self.dw.append(float(dw))

    def update(self):
        """使用 GAE 计算优势并更新策略。"""
        # 1. 获取最后一个 next_value
        with torch.no_grad():
            last_state = self.states[-1]
            last_value = self.model.get_value(last_state)
            self.values.append(last_value)

        # 2. 转换为张量
        rewards = torch.FloatTensor(self.rewards)
        values = torch.stack(self.values)
        dones = torch.FloatTensor(self.dones)
        dw = torch.FloatTensor(self.dw)

        # 3. ████ 核心：使用 GAE 计算优势和目标价值 ████
        advantages, returns = self.gae_module(
            rewards, values, dones, dw, normalize=True
        )

        # 4. 准备训练数据
        states = torch.stack(self.states)
        actions = torch.stack(self.actions)
        old_log_probs = torch.stack(self.log_probs)

        # 5. 多轮策略更新
        for _ in range(self.K_epochs):
            _, new_log_probs, entropy, new_values = self.model.get_action_and_value(
                states, actions
            )

            ratios = torch.exp(new_log_probs - old_log_probs)
            surr1 = ratios * advantages
            surr2 = torch.clamp(ratios, 1 - self.epsilon, 1 + self.epsilon) * advantages
            policy_loss = -torch.min(surr1, surr2).mean()

            value_loss = self.c1 * nn.functional.mse_loss(new_values, returns)
            entropy_loss = -self.c2 * entropy.mean()

            loss = policy_loss + value_loss + entropy_loss

            self.optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(self.model.parameters(), 0.5)
            self.optimizer.step()

        self.reset_buffer()
        return policy_loss.item(), value_loss.item()
```

---

## 第四部分：总结

### 4.1 核心公式速查表

| 概念 | 公式 | 说明 |
|------|------|------|
| TD残差 | $\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)$ | 单步回报与价值估计的差 |
| k步优势 | $A_k(t) = \sum_{l=0}^{k-1} \gamma^l \delta_{t+l}$ | 多步TD残差的累加 |
| GAE | $A^{GAE}_t = \sum_{k=0}^{\infty} (\gamma\lambda)^k \delta_{t+k}$ | 多步残差的指数加权平均 |
| GAE递推 | $\hat{A}_t = \delta_t + \gamma\lambda \hat{A}_{t+1} \cdot (1 - done_t)$ | 代码实现形式 |
| 目标价值 | $V_t^{target} = \hat{A}_t + V(s_t)$ | Critic网络的学习目标 |

### 4.2 推导脉络图

```
单步TD残差（高偏差，低方差）
    ↓
多步优势估计 A_k(t)（k步残差累加）
    ↓
不同k的A_k(t)做指数加权平均
    ↓
GAE(γ, λ) = Σ(γλ)^k · δ_{t+k}（偏差-方差平衡）
```

### 4.3 λ的作用总结

- **$\lambda = 0$**：退化为1-step TD，偏差大，方差小
- **$\lambda = 1$**：退化为MC估计，偏差小（无偏），方差大
- **$\lambda = 0.95$**（典型值）：平衡偏差和方差，实际效果最好

### 4.4 γ和λ的区别

| 参数 | 作用 | 含义 |
|------|------|------|
| $\gamma$ | 时间折损因子 | 控制策略"远见"程度，越接近1越重视未来 |
| $\lambda$ | 偏差-方差调节器 | 控制多步估计的权重衰减速度 |

$\gamma$ 影响 $\delta$ 的值本身，所以不能用它来调节偏差-方差平衡，必须引入独立的 $\lambda$。

---

## 参考资料

- Schulman et al., 2016. [High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438)
- Schulman et al., 2017. [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347)
- 知乎博客：[GAE（Generalized Advantage Estimation）理解及推导](https://zhuanlan.zhihu.com/p/675309680)
