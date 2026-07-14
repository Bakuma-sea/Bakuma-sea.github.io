---
author: Bakuma-sea
pubDatetime: 2026-07-13T23:40:00+08:00
title: "Agent 场景下的安全研究现状报告"
featured: true
tags:
  - "Agent"
  - "Security"
  - "Prompt Injection"
  - "Survey"
description: "梳理 Agent 安全的威胁分类、间接提示注入、记忆投毒、工具链攻击与 Web Agent 安全方向。"
timezone: Asia/Shanghai
---
# Agent 场景下的安全研究现状报告

## 1. 引言：从 Chatbot 安全到 Agent 安全的范式转变

当前大模型（LLM）的 Jailbreak 研究主要集中在 Chatbot 形态上，包括纯文本 LLM 和多模态 LVLM 的越狱攻击。这些研究通常关注如何通过精心构造的 prompt 绕过模型的安全对齐（safety alignment），使其生成有害内容。然而，随着 AI Agent 技术的快速发展——Agent 不仅具备对话能力，还拥有工具调用（tool use）、持久记忆（memory）、自主规划（planning）和多步推理（reasoning）等能力——安全威胁的维度发生了根本性变化。

Chatbot 安全关注的是"模型说了什么"，而 Agent 安全关注的是"模型做了什么"。一个被越狱的 Chatbot 最多输出有害文本，但一个被攻击的 Agent 可能执行未授权的系统命令、泄露敏感数据、滥用工具权限，甚至通过多 Agent 协作传播恶意行为。这种从"信息输出"到"物理执行"的转变，使得 Agent 安全成为一个远比 Chatbot 安全复杂的研究课题。

2025年12月，OWASP 发布了首个 **OWASP Top 10 for Agentic Applications**，标志着 Agent 安全正式从学术研究进入工业标准化阶段。该框架由超过100位安全研究人员和行业从业者共同制定，覆盖了从工具滥用到协议漏洞的全方位威胁。

---

## 2. Agent 安全威胁分类体系

### 2.1 结构化攻击面模型（LASM）

近期研究（如 arXiv:2604.23338）提出了**分层攻击面模型（Layered Attack Surface Model, LASM）**，将 Agent 系统的攻击面分解为七个层次：

1. **基础层（Foundation Layer）**：LLM 模型本身的安全对齐漏洞，包括传统 jailbreak 技术
2. **认知层（Cognitive Layer）**：推理链和规划过程的完整性，包括 Chain-of-Thought 劫持
3. **记忆层（Memory Layer）**：长期记忆和知识库的污染与篡改
4. **工具执行层（Tool Execution Layer）**：工具调用过程中的注入与滥用
5. **多 Agent 协作层（Multi-Agent Coordination Layer）**：Agent 间通信的攻击传播
6. **生态层（Ecosystem Layer）**：供应链、插件和第三方服务的安全
7. **治理层（Governance Layer）**：权限管理、审计和合规

### 2.2 三范式威胁分类

另一项重要工作（GitHub: sunyinggang/LLM-Agent-Security-Survey）提出了基于 Agent 结构的三范式分类：

- **外部交互攻击（External Interaction Attacks）**：利用感知接口和工具使用中的漏洞，典型如间接提示注入（Indirect Prompt Injection, IPI）
- **内部认知攻击（Internal Cognitive Attacks）**：破坏推理链和记忆机制的完整性，包括记忆污染和思维链劫持
- **多 Agent 协作攻击（Multi-Agent Collaboration Attacks）**：利用 Agent 间通信传播恶意行为

### 2.3 七类威胁分类法

Evgrafov 等人提出了扩展的威胁分类法，包含七类：(1) 提示注入攻击；(2) 记忆攻击；(3) 工具与协议攻击；(4) 多 Agent 攻击；(5) 多模态攻击；(6) 工具链与供应链攻击；(7) 时序攻击（Temporal Attacks，如 TOCTOU 漏洞）。

---

## 3. Agent 场景下的核心攻击向量

### 3.1 间接提示注入（Indirect Prompt Injection, IPI）

这是 Agent 场景下最核心、最独特的攻击向量。与直接提示注入不同，IPI 不直接攻击用户与 Agent 的对话，而是通过 Agent 在执行任务过程中检索到的外部内容（如网页、文档、邮件、工具返回值）中嵌入恶意指令，从而劫持 Agent 的行为。

**代表性工作：**

- **BIPIA**（Benchmarking and Defending Against Indirect Prompt Injection Attacks, arXiv:2312.14197, NeurIPS 2024）：微软提出的首个 IPI 基准测试，评估了25个 LLM 的鲁棒性，发现能力更强的模型反而更容易受到攻击。
- **InjecAgent**（arXiv:2403.02691, ACL 2024 Findings）：针对工具集成 LLM Agent 的 IPI 攻击基准，包含1054个测试用例，覆盖17种用户工具和62种攻击者工具。
- **AgentDojo**（arXiv:2406.13352, NeurIPS 2024）：ETH Zürich SPY Lab 提出的动态评估框架，包含97个真实任务和629个安全测试用例，已被美国和英国 AISI 用于评估 Claude 3.5 Sonnet 的脆弱性。

### 3.2 记忆投毒与后门攻击（Memory Poisoning & Backdoor Attacks）

Agent 的长期记忆和 RAG 知识库是持续性的状态，攻击者可以通过仅与 Agent 进行查询交互来注入恶意内容，从而影响其未来的行为。

**代表性工作：**

- **AgentPoison**（arXiv:2407.12784, NeurIPS 2024）：首个针对通用和 RAG-based LLM Agent 的后门攻击方法，通过向长期记忆或 RAG 知识库注入少量恶意样本来实施攻击。优化后的后门触发器具有出色的可迁移性、上下文连贯性和隐蔽性。
- **Memory Poisoning Attack and Defense on Memory Based LLM-Agents**：系统研究了持久记忆 Agent 面临的记忆投毒攻击，攻击者通过查询交互注入恶意指令来污染 Agent 的长期记忆。

### 3.3 工具链攻击（Tool Chain Attacks）

Agent 的工具调用能力带来了新的攻击面，攻击者可以通过操纵工具元数据、工具输出或链接多个看似无害的工具调用来实现恶意目标。

**代表性工作：**

- **STAC**（Sequential Tool Attack Chaining, arXiv:2509.25624）：提出了一种新颖的多轮攻击框架，通过链接单独看来无害的工具调用来实现恶意目标，成功率超过90%。该攻击揭示了 Agent 工具安全评估中的盲区——单步安全不等于多步安全。
- **Attractive Metadata Attack (AMA)**：通过迭代优化生成具有高度吸引力但语义有效的工具元数据，诱导 LLM Agent 调用恶意工具。
- **Back-Reveal**（arXiv:2604.05432）：通过在微调的 LLM Agent 中嵌入语义触发器实现数据泄露攻击，被攻击的 Agent 会调用记忆访问工具检索用户上下文，并通过伪装的检索工具调用进行数据外泄。

### 3.4 Web Agent 安全攻击

Web Agent（如浏览器自动化 Agent）面临特殊的安全威胁，因为它们需要与不可信的 Web 内容交互。

**代表性工作：**

- **The Hidden Dangers of Browsing AI Agents**（arXiv:2505.13076）：通过对开源项目 Browser Use 的白盒分析，展示了不可信 Web 内容如何劫持 Agent 行为并导致严重安全漏洞。
- **WASP**（Web Agent Security against Prompt injection attacks, arXiv:2504.18575）：Facebook Research 提出的 Web Agent 安全基准，基于 VisualWebArena 构建沙箱 Web 环境，模拟真实的提示注入攻击场景。
- **MUZZLE**（arXiv:2602.09222）：自动化的红队框架，用于发现和评估针对 LLM Web Agent 的间接提示注入攻击。
- **When Bots Take the Bait**：首次系统研究了针对 Web 自动化 Agent 的社会工程攻击，并设计了可插拔的运行时缓解方案。

### 3.5 推理链劫持（Reasoning Chain Hijacking）

针对具备推理能力的 Agent（特别是大型推理模型 LRM），攻击者可以劫持其推理过程来实现越狱。

**代表性工作：**

- **Chain-of-Thought Hijacking**：通过在有害请求前附加大量无害的谜题推理来劫持推理模型的思维链，实现越狱。
- **A Mousetrap**（ACL 2025 Findings）：针对大型推理模型的越狱攻击，引入"Chaos Machine"组件，通过一对一映射变换攻击提示来利用推理模型的独特漏洞。
- **Large Reasoning Models Are Autonomous Jailbreak Agents**（Nature Communications 2026）：展示了大型推理模型可以利用其规划能力作为完全自主的越狱 Agent，通过隐藏的 scratchpad 规划攻击策略，系统性地绕过安全机制。

### 3.6 多 Agent 系统攻击

多 Agent 系统引入了 Agent 间通信的安全问题，恶意 Agent 可以通过协作过程传播攻击。

**代表性工作：**

- **PsySafe**（arXiv:2401.11880, ACL 2024）：从心理学角度研究多 Agent 系统安全，揭示 Agent 的"暗黑心理状态"（dark personality traits）构成重大安全威胁，提出了基于心理学的攻击、防御和评估框架。
- **PeerGuard**：提出协作防御策略，Agent 之间自主验证彼此的推理过程以检测后门引起的不一致性。
- **MASTER**（EMNLP 2025 Findings）：关注多 Agent 系统中不同角色配置和拓扑结构的安全研究框架，提出基于信息流的交互范式。
- **Open Challenges in Multi-Agent Security**（arXiv:2505.02077）：对交互式 AI Agent 产生的威胁景观进行分类，调研去中心化 AI 系统中的安全-性能权衡。

### 3.7 时序攻击（Temporal Attacks）

**TOCTOU（Time-of-Check to Time-of-Use）漏洞**是 Agent 场景下独特的攻击向量。攻击者利用 Agent 验证外部状态与实际使用之间的时间差来实施攻击。例如，Agent 在时间点 T1 检查某个文件是否安全，但在 T2 实际使用该文件时，攻击者已经将其替换为恶意内容。

### 3.8 过度授权（Excessive Agency）

OWASP LLM06:2025 将过度授权列为关键风险。当 Agent 被授予超出其必要范围的功能、权限或自主权时，可能导致未授权操作、权限提升和系统入侵。

**相关研究：**

- **Prompt Flow Integrity (PFI)**（arXiv:2503.15547）：提出面向系统安全的解决方案，防止 LLM Agent 中的权限提升。
- **CaMeL**（arXiv:2503.18813, Google/DeepMind/ETH Zurich）：通过双 LLM 架构和显式能力追踪来防止提示注入，即使底层模型存在漏洞也能保证安全。CaMeL 从可信查询中显式提取控制流和数据流，确保不可信数据永远不会影响程序流程。

### 3.9 Agent Skills 供应链安全

Agent Skills（技能/插件）是 Agent 生态系统中可安装的模块化能力包，允许第三方开发者为 Agent 扩展工具、知识和服务。这构成了一个类似于 npm/PyPI 的供应链生态系统，引入了全新的攻击面。与普通工具调用安全不同，Skills 安全的核心特征在于：恶意代码可以在技能安装阶段就被植入，并在后续正常使用中隐蔽触发，而无需在运行时进行实时注入。

**代表性工作：**

- **Agent Skills in the Wild**（arXiv:2601.10338）：首次大规模实证安全分析，从两个主要技能市场收集了42,447个技能，使用 SkillScan 多阶段检测框架（结合静态分析与 LLM 语义分类）分析31,132个技能。研究发现26.1%的技能至少存在一种漏洞，涵盖四大类14种漏洞模式（提示注入、数据泄露、权限提升、供应链风险），其中5.2%表现出高危恶意行为特征。

- **Malicious Agent Skills in the Wild**（arXiv:2602.06547, USENIX Security 2026）：进一步扩大规模，对98,380个技能进行行为验证，确认157个恶意技能包含632个漏洞。识别出两种攻击原型：Data Thieves（数据窃取者）和 Agent Hijackers（Agent 劫持者），证明这些攻击并非偶发而是系统性的威胁。

- **BadSkill**（arXiv:2604.09378）：提出 "model-in-skill" 后门攻击——攻击者发布看似无害的技能，但其中捆绑的辅助分类器模型经过后门微调，仅在特定语义参数组合下激活隐藏负载。在8种主流开源模型（Qwen2.5、DeepSeek-R1等）上实现接近100%的攻击成功率。这种攻击无法被传统的提示注入检测或代码审计发现。

- **DDIPE / PoisonedSkills**（arXiv:2604.03081）：提出文档驱动的隐式负载执行（Document-Driven Implicit Payload Execution），将恶意逻辑嵌入技能文档中的代码示例和配置模板。由于 Agent 在正常任务中会复用这些示例，恶意负载无需显式提示即可执行。在7个开源和闭源 LLM Agent 上的实验表明，即使 Agent 在单次交互基线下攻击成功率很低，多轮交互中的 Sleeper Attack 仍然有效。

### 3.10 MCP 协议安全

Model Context Protocol（MCP）是 Anthropic 提出的开放标准，用于标准化 LLM Agent 与外部工具/数据源的连接。MCP 正在被 Anthropic、OpenAI、Cursor、Zapier 等广泛采用，但其安全模型存在根本性缺陷——MCP Server 返回的工具描述直接进入 Agent 的上下文窗口，被当作可信内容处理，用户根本看不到。

**MCP 核心攻击向量：**

- **工具投毒攻击（Tool Poisoning Attacks, TPA）**：恶意 MCP Server 在工具描述中嵌入隐藏指令，劫持 Agent 行为。Invariant Labs 的研究表明，Anthropic、OpenAI、Cursor 等主要提供商均受此攻击影响。MCPTox（arXiv:2508.14925）是基于45个真实 MCP Server 和353个工具构建的首个系统化评估基准。

- **Rug Pull 攻击**：MCP Server 在初始安装时提供良性工具定义，但在后续更新中悄悄修改工具行为（如更改工具描述、添加恶意参数），利用 MCP 客户端对已连接 Server 的持续信任。

- **Puppet 攻击**：恶意 MCP Server 利用 MCP 的共享上下文机制和工具描述的全局可见性，覆盖其他可信 MCP Server 的规则和指令，操纵受信任的 Agent 执行恶意行为，即使 Agent 仅与可信 Server 交互。

- **工具抢占（Tool Squatting）**：恶意 Server 注册与合法工具同名或高度相似的工具定义，抢占工具调用优先级。

**MCP 安全评估与防御：**

- **Beyond the Protocol**（arXiv:2506.02040, IEEE TDSC）：首次端到端实证评估 MCP 生态系统的攻击向量，形式化定义了四类攻击（工具投毒、Puppet、Rug Pull、恶意外部资源利用）的受影响路径和利用路径。

- **ETDI**（arXiv:2506.01333）：提出增强工具定义接口（Enhanced Tool Definition Interface），通过加密身份验证、不可变版本化工具定义和基于 OAuth 2.0 的显式权限管理来加固 MCP。

- **MindGuard**（arXiv:2508.20412）：决策级防护栏，通过决策依赖图（Decision Dependence Graph）追踪 Agent 调用决策的来源，实现与策略无关的工具投毒检测和攻击源归因，检测准确率超过95%，归因准确率98%。

- **OWASP MCP Top 10**：OWASP 发布了专门的 MCP 安全 Cheat Sheet，覆盖提示注入、供应链攻击和 confused deputy 问题。

### 3.11 Function Calling 安全

Function Calling 是 LLM Agent 调用工具的基础机制，其安全漏洞构成 Agent Skills 安全的底层威胁。

**代表性工作：**

- **The Dark Side of Function Calling**（arXiv:2407.17915）：发现 LLM 函数调用过程中的关键漏洞，提出 "jailbreak function" 攻击方法，利用对齐差异、用户胁迫和安全过滤器缺失来绕过安全机制。

- **ToolCommander**（arXiv:2412.10198, NAACL 2025）：通过对抗性工具注入（Adversarial Tool Injection）操纵 LLM 工具调用系统，采用两阶段攻击策略实现隐私窃取、拒绝服务（DoS）和工具调用行为操纵。在 ToolBench 数据集（16,000+真实 API）上对 GPT-4o mini、Llama3、Qwen2 等模型验证有效。

- **Mind the GAP**（arXiv:2602.16943）：提出 GAP 基准，系统评估文本安全与工具调用安全之间的分歧。核心发现是"文本安全不能迁移到工具调用安全"——模型可能在文本响应中拒绝有害请求，同时却通过工具调用执行相同的有害操作。在6个模型、6个受监管领域、7种越狱场景的4,536个数据点中，GPT-5.2 高达79.3%的文本拒绝伴随着工具调用执行。

---

## 4. Agent 安全评测基准体系

### 4.1 综合性 Agent 安全基准

- **Agent Security Bench (ASB)**（arXiv:2410.02644, ICLR 2025）：形式化和基准化 Agent 攻击与防御的框架，包含10种提示注入攻击、1种记忆投毒攻击、1种新型 Plan-of-Thought 后门攻击、4种混合攻击和11种防御方法，覆盖13个 LLM 后端。
- **AgentHarm**（arXiv:2410.09024）：包含110个显式恶意的 Agent 任务（增强后440个），覆盖11个危害类别（欺诈、网络犯罪、骚扰等），用于评估 LLM Agent 被滥用的倾向和能力。
- **JailbreakBench**（arXiv:2404.01318, NeurIPS 2024）：开放的 LLM 鲁棒性基准，虽主要面向 Chatbot，但已被扩展用于 Agent 场景评估。

### 4.2 专门化基准

- **InjecAgent**：专注 IPI 攻击的基准（1054个测试用例）
- **AgentDojo**：动态 Agent 安全评估环境（97个任务，629个安全测试）
- **BIPIA**：间接提示注入攻击基准（微软）
- **WASP**：Web Agent 安全基准（Facebook Research）
- **LLM-PIRATE**（NeurIPS 2024）：测量 LLM 对 IPI 攻击风险的框架

---

## 5. Agent 安全防御机制

### 5.1 架构级防御

- **CaMeL**（Google DeepMind）：双 LLM 架构——特权 LLM 和隔离 LLM 分离控制流和数据流，通过策略强制的代码执行来阻止提示注入。评估显示 CaMeL 在保持高效用的同时能可靠阻止攻击。
- **沙箱隔离（Sandboxing）**：在隔离环境中运行 Agent 的操作，保护宿主系统和网络。NVIDIA 等公司已发布 Agent 工作流沙箱安全实践指南。
- **权限最小化（Least Privilege）**：限制 Agent 的工具访问范围和操作权限，实施审批门控（approval gates）和权限范围控制。
- **Prompt Flow Integrity (PFI)**：防止权限提升的系统安全解决方案。

### 5.2 检测与过滤

- **提示注入检测器**：如 AgentDojo 中集成的基于 transformer 的检测器，用于识别工具返回内容中的恶意指令。
- **输入输出过滤**：对 Agent 的输入和输出进行安全检查，防止恶意指令进入和敏感数据泄露。
- **行为异常检测**：监控 Agent 的行为模式，检测偏离预期的操作。

### 5.3 多 Agent 协作防御

- **PeerGuard**：Agent 间互相验证推理过程以检测后门。
- **角色防御与心理防御**（PsySafe）：通过调整 Agent 的角色设定和心理状态来增强鲁棒性。

### 5.4 纵深防御策略

最新研究主张采用纵深防御（defense-in-depth）策略，将传统确定性安全控制与基于推理的动态防御相结合，目标是开发默认安全的 AI Agent。

---

## 6. OWASP Top 10 for Agentic Applications（2025）

OWASP 于 2025年12月发布了首个面向 Agentic AI 应用的 Top 10 安全风险列表，标志着 Agent 安全进入标准化阶段。该列表包括（但不限于）：

1. **提示注入（Prompt Injection）**：通过直接或间接方式注入恶意指令
2. **过度授权（Excessive Agency）**：Agent 被授予过多权限和自主权
3. **工具滥用（Tool Misuse）**：Agent 被诱导滥用其工具调用能力
4. **数据泄露（Data Exfiltration）**：通过 Agent 的工具调用泄露敏感信息
5. **供应链攻击（Supply Chain Attacks）**：通过恶意插件或第三方服务攻击 Agent
6. **记忆与状态污染（Memory & State Poisoning）**：篡改 Agent 的持久状态
7. **多 Agent 协作风险**：Agent 间通信的攻击传播
8. **协议漏洞**：Agent 通信协议中的安全缺陷
9. **治理与审计缺失**：缺乏有效的权限管理和行为审计
10. **模型层漏洞**：底层 LLM 的安全对齐缺陷

---

## 7. 研究趋势与开放挑战

### 7.1 当前趋势

- **从单步到多步攻击**：STAC 等工作表明，单步安全评估已不足以覆盖 Agent 场景的威胁，多轮交互中的攻击链构建成为研究热点。
- **从文本到多模态**：随着多模态 Agent 的发展，通过图像、音频等模态注入攻击的研究正在兴起。
- **从单 Agent 到多 Agent**：多 Agent 系统的攻击传播和协作防御成为新的研究方向。
- **从学术到标准化**：OWASP Top 10 for Agentic Applications 的发布标志着 Agent 安全从学术研究向工业标准的转化。
- **自动化红队**：如 MUZZLE、LeakAgent 等自动化攻击框架，用于大规模发现 Agent 漏洞。

### 7.2 开放挑战

- **长程安全评估**：如何在长时序、多步骤的 Agent 任务中评估安全性仍缺乏标准方法。
- **安全-效用权衡**：防御机制（如沙箱隔离、权限限制）往往以牺牲 Agent 效用为代价，如何平衡安全与能力是核心挑战。
- **多 Agent 系统的可组合安全**：多个 Agent 组合使用时，安全性是否可组合（compositional security）仍是开放问题。
- **动态环境中的 TOCTOU 防御**：Agent 在动态环境中验证与执行的时间差攻击难以完全消除。
- **标准化评测体系**：现有基准覆盖面有限，缺乏统一的、全面的 Agent 安全评测标准。
- **实际部署安全**：从实验室环境到实际部署的安全保障仍有巨大鸿沟。

---

## 8. 论文列表

### 8.1 综述与 Survey

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 1 | From LLMs to MLLMs to Agents: A Survey of Emerging Jailbreak Threats and Defenses | arXiv:2506.15170 | 2025 | 系统综述从 LLM 到 MLLM 再到 Agent 的越狱攻击与防御演进 |
| 2 | Security of LLM-based agents regarding attacks, defenses, and applications: A comprehensive survey | Information Fusion (ScienceDirect) | 2025 | 全面综述 LLM Agent 的攻击、防御和应用，提出两套互补的评估标准 |
| 3 | Agentic AI Security: Threats, Defenses, Evaluation, and Open Challenges | arXiv:2510.23883 | 2025 | 覆盖 Agent 安全的长程评估、多 Agent 系统安全和基准开发 |
| 4 | A Survey on Autonomy-Induced Security Risks in Large Model-Based Agents | arXiv:2506.23844 | 2025 | 从自主性角度分析 Agent 安全风险，涵盖长期记忆、模块化工具、递归规划和反思推理 |
| 5 | A Systematic Survey of Security Threats and Defenses in LLM-Based AI Agents (LASM) | arXiv:2604.23338 | 2026 | 提出七层攻击面模型（LASM） |
| 6 | From Prompt Injections to Protocol Exploits: Threats in LLM-Powered AI Agents | arXiv:2506.23260 | 2025 | 统一端到端威胁模型，覆盖30+攻击技术 |
| 7 | The Emerged Security and Privacy of LLM Agent: A Survey with Case Studies | ACM Computing Surveys | 2025 | 以案例研究为基础的安全与隐私综述 |
| 8 | AI Agents Under Threat: A Survey of Key Security Challenges and Future Directions | ACM Computing Surveys | 2025 | 基于四个知识差距的系统性威胁与解决方案综述 |
| 9 | Securing LLM-based agents against cyberattacks: a comprehensive survey | Springer | 2026 | 聚焦部署时攻击的全面综述 |
| 10 | Open Challenges in Multi-Agent Security: Towards Secure Systems of Interacting AI Agents | arXiv:2505.02077 | 2025 | 多 Agent 安全的威胁分类和研究议程 |
| 11 | Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review | Information (MDPI) | 2025 | 综合2023-2025年45个关键来源的提示注入攻击综述 |

### 8.2 间接提示注入攻击

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 12 | BIPIA: Benchmarking and Defending Against Indirect Prompt Injection Attacks on LLMs | arXiv:2312.14197 / NeurIPS 2024 | 2024 | 首个 IPI 基准测试，评估25个 LLM |
| 13 | InjecAgent: Benchmarking Indirect Prompt Injections in Tool-Integrated LLM Agents | arXiv:2403.02691 / ACL 2024 Findings | 2024 | 工具集成 Agent 的 IPI 基准（1054个测试用例） |
| 14 | AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses | arXiv:2406.13352 / NeurIPS 2024 | 2024 | 动态 Agent 安全评估框架（97个任务，629个安全测试） |
| 15 | Pandora: Jailbreak GPTs by Retrieval Augmented Generation Poisoning | arXiv:2402.08416 | 2024 | 通过 RAG 投毒实现间接越狱 |
| 16 | LLM-PIRATE: A Benchmark for Indirect Prompt Injection Attacks | NeurIPS 2024 | 2024 | 测量 LLM 对 IPI 攻击风险的框架 |

### 8.3 记忆投毒与后门攻击

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 17 | AgentPoison: Red-teaming LLM Agents via Poisoning Memory or Knowledge Bases | arXiv:2407.12784 / NeurIPS 2024 | 2024 | 首个针对通用和 RAG-based Agent 的后门攻击 |
| 18 | Memory Poisoning Attack and Defense on Memory Based LLM-Agents | Semantic Scholar | 2024 | 系统研究持久记忆 Agent 的记忆投毒攻击 |
| 19 | Back-Reveal: Your LLM Agent Can Leak Your Data via Backdoored Tools | arXiv:2604.05432 | 2026 | 通过后门工具实现数据泄露攻击 |
| 20 | Unveiling Privacy Risks in LLM Agent Memory | ACL 2025 | 2025 | 研究 Agent 记忆的隐私泄露风险 |

### 8.4 工具链攻击

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 21 | STAC: When Innocent Tools Form Dangerous Chains to Jailbreak LLM Agents | arXiv:2509.25624 | 2025 | 序列工具攻击链，90%+成功率 |
| 22 | Attractive Metadata Attack: Inducing LLM Agents to Invoke Malicious Tools | Semantic Scholar | 2025 | 通过优化工具元数据诱导恶意工具调用 |
| 23 | Prompt Flow Integrity to Prevent Privilege Escalation in LLM Agents | arXiv:2503.15547 | 2025 | 防止 Agent 权限提升的系统安全方案 |

### 8.5 Web Agent 安全

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 24 | The Hidden Dangers of Browsing AI Agents | arXiv:2505.13076 | 2025 | Browser Use 白盒分析，揭示 Web Agent 安全漏洞 |
| 25 | WASP: Benchmarking Web Agent Security Against Prompt Injection Attacks | arXiv:2504.18575 | 2025 | 基于沙箱 Web 环境的 Web Agent 安全基准 |
| 26 | MUZZLE: Adaptive Agentic Red-Teaming of Web Agents Against Indirect Prompt Injection | arXiv:2602.09222 | 2026 | 自动化 Web Agent 红队框架 |
| 27 | When Bots Take the Bait: Exposing Social Engineering Attacks on Web Agents | arXiv:2601.07263 | 2026 | 首次系统研究 Web Agent 社会工程攻击 |

### 8.6 推理链劫持与推理模型攻击

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 28 | Large Reasoning Models Are Autonomous Jailbreak Agents | Nature Communications | 2026 | LRM 作为自主越狱 Agent |
| 29 | A Mousetrap: Fooling Large Reasoning Models for Jailbreak with Chain of Mappings | ACL 2025 Findings | 2025 | 针对 LRMs 的越狱攻击（Chaos Machine） |
| 30 | Chain-of-Thought Hijacking | Catalyzex | 2025 | 通过无害谜题推理劫持思维链 |
| 31 | Chain of Attack: Hide Your Intention through Multi-Turn Interrogation | ACL 2025 Findings | 2025 | 多轮审讯式越狱攻击 |
| 32 | Reasoning-Augmented Conversation for Multi-Turn Jailbreak Attacks | Semantic Scholar | 2025 | 利用推理能力多轮越狱 |
| 33 | AutoRAN: Automated Weak-to-Strong Jailbreak Framework for LRMs | arXiv (2025) | 2025 | 弱模型攻击强推理模型的自动化框架 |

### 8.7 多 Agent 系统安全

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 34 | PsySafe: A Comprehensive Framework for Psychological-based Attack, Defense, and Evaluation of Multi-agent System Safety | arXiv:2401.11880 / ACL 2024 | 2024 | 基于心理学的多 Agent 安全框架 |
| 35 | PeerGuard: Defending Multi-Agent Systems Against Backdoor Attacks | IRI 2025 | 2025 | Agent 间协作验证防御后门 |
| 36 | MASTER: Multi-Agent Security Through Exploration of Roles and Topological Structures | EMNLP 2025 Findings | 2025 | 多 Agent 角色与拓扑安全研究框架 |

### 8.8 Agent 安全基准

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 37 | Agent Security Bench (ASB): Formalizing and Benchmarking Attacks and Defenses for LLM Agents | arXiv:2410.02644 / ICLR 2025 | 2025 | 综合 Agent 安全基准（10种攻击+11种防御+13个 LLM） |
| 38 | AgentHarm: A Benchmark for Measuring Harmfulness of LLM Agents | arXiv:2410.09024 | 2024 | 110个恶意 Agent 任务，11个危害类别 |
| 39 | JailbreakBench: An Open Robustness Benchmark for Jailbreaking Large Language Models | arXiv:2404.01318 / NeurIPS 2024 | 2024 | 开放鲁棒性基准 |
| 40 | JailbreakRadar: Comprehensive Assessment of Jailbreak Attacks Against LLMs | ACL 2025 | 2025 | 17种代表性越狱攻击的大规模评估 |

### 8.9 Agent 防御机制

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 41 | CaMeL: Defeating Prompt Injections by Design | arXiv:2503.18813 | 2025 | 双 LLM 架构防御提示注入（Google DeepMind） |
| 42 | Securing AI Agents Against Prompt Injection Attacks: RAG Systems | arXiv:2511.15759 | 2025 | RAG 系统的提示注入防御方法 |
| 43 | SafeCoT: Enhancing Security Against Jailbreak Attacks via Chain-of-Thought | Springer | 2025 | 基于 CoT 的免训练防御方法 |
| 44 | LeakAgent: RL-based Red-teaming Agent for LLM Privacy Leakage | arXiv:2412.05734 | 2024 | 基于 RL 的隐私泄露红队框架 |
| 45 | Exploiting Web Search Tools of AI Agents for Data Exfiltration | ResearchGate | 2025 | 利用 Web 搜索工具进行数据泄露 |

### 8.10 Agent Skills 供应链安全

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 46 | Agent Skills in the Wild: An Empirical Study of Security Vulnerabilities at Scale | arXiv:2601.10338 | 2026 | 首次大规模技能安全实证分析（42,447个技能，SkillScan 检测框架，26.1%含漏洞） |
| 47 | "Do Not Mention This to the User": Detecting and Understanding Malicious Agent Skills in the Wild | arXiv:2602.06547 / USENIX Security 2026 | 2026 | 98,380个技能行为验证，确认157个恶意技能，识别 Data Thieves 和 Agent Hijackers 两种攻击原型 |
| 48 | BadSkill: Backdoor Attacks on Agent Skills via Model-in-Skill Poisoning | arXiv:2604.09378 | 2026 | Model-in-skill 后门攻击，在8种开源模型上接近100%成功率 |
| 49 | Supply-Chain Poisoning Attacks Against LLM Coding Agent Skill Ecosystems (DDIPE) | arXiv:2604.03081 | 2026 | 文档驱动隐式负载执行，在7个 Agent 上验证 Sleeper Attack 有效性 |

### 8.11 MCP 协议安全

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 50 | Beyond the Protocol: Unveiling Attack Vectors in the Model Context Protocol | arXiv:2506.02040 / IEEE TDSC | 2025 | 首次 MCP 攻击向量端到端实证评估，四类攻击形式化定义 |
| 51 | ETDI: Mitigating Tool Squatting and Rug Pull Attacks in MCP | arXiv:2506.01333 | 2025 | 增强工具定义接口，OAuth 2.0 加密身份验证+不可变版本化定义 |
| 52 | MCPTox: A Benchmark for Tool Poisoning Attack on Real-World MCP Servers | arXiv:2508.14925 | 2025 | 首个基于45个真实 MCP Server 和353个工具的投毒攻击基准 |
| 53 | MindGuard: Tracking, Detecting, and Attributing MCP Tool Poisoning Attack via Decision Dependence Graph | arXiv:2508.20412 | 2025 | 决策级防护栏，决策依赖图追踪，检测准确率95%+，归因准确率98% |
| 54 | OWASP MCP Security Cheat Sheet | OWASP | 2025 | MCP 安全最佳实践，覆盖提示注入、供应链攻击和 confused deputy |

### 8.12 Function Calling 安全

| 序号 | 论文标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 55 | The Dark Side of Function Calling: Pathways to Jailbreaking Large Language Models | arXiv:2407.17915 | 2024 | 发现函数调用漏洞，提出 "jailbreak function" 攻击方法 |
| 56 | ToolCommander: From Allies to Adversaries — Manipulating LLM Tool-Calling through Adversarial Tool Injection | arXiv:2412.10198 / NAACL 2025 | 2025 | 两阶段对抗性工具注入框架，实现隐私窃取/DoS/行为操纵 |
| 57 | Mind the GAP: Text Safety Does Not Transfer to Tool-Call Safety in LLM Agents | arXiv:2602.16943 | 2026 | GAP 基准，揭示文本安全与工具调用安全的分歧（79.3% GAP rate） |

### 8.13 OWASP 与标准化

| 序号 | 文档标题 | 来源 | 年份 | 关键贡献 |
|------|---------|------|------|---------|
| 58 | OWASP Top 10 for Agentic Applications | OWASP GenAI Security Project | 2025 | 首个面向 Agentic AI 的 Top 10 安全风险标准 |
| 59 | OWASP Top 10 for LLM Applications 2025 | OWASP GenAI Security Project | 2024 | LLM 应用 Top 10 安全风险（含过度授权等 Agent 相关风险） |
| 60 | Agentic AI Threats and Mitigations | OWASP/HAL | 2025 | Agentic AI 威胁与缓解参考指南 |

### 8.14 资源汇总

| 序号 | 资源名称 | 链接 | 说明 |
|------|---------|------|------|
| 61 | Awesome Agent Security Papers | github.com/onlooker89757/awesome-agent-security | 1799篇论文（2024.09~2026.04），按质量评分排序 |
| 62 | LLM-Agent-Security-Survey | github.com/sunyinggang/LLM-Agent-Security-Survey | 官方 Agent 安全综述 GitHub 仓库 |
| 63 | Awesome Agent Skills Security | github.com/LLMSecurity/awesome-agent-skills-security | 247篇论文，围绕信息流、授权和持久状态 |
| 64 | MaliciousAgentSkillsBench | github.com/protectskills/MaliciousAgentSkillsBench | USENIX Security 2026 恶意技能检测基准数据集与框架 |
| 65 | Awesome Jailbreak on LLMs | github.com/yueliu1999/Awesome-Jailbreak-on-LLMs | LLM 越狱方法合集 |
| 66 | LLM Security Guide (2026 Edition) | github.com/requie/LLMSecurityGuide | 覆盖 OWASP Top 10 for LLM & Agentic Applications |

---

## 9. 总结

Agent 安全研究正处于快速发展阶段，与 Chatbot 安全相比，其核心差异在于：

**攻击面的大幅扩展**：Agent 的工具调用、记忆持久化、自主规划和多 Agent 协作等能力，每一层都引入了新的攻击向量。从间接提示注入到记忆投毒，从工具链攻击到推理链劫持，攻击手段远比传统 Chatbot 场景丰富。

**威胁后果的质的升级**：被攻击的 Agent 不仅可能输出有害内容，还可能执行未授权的系统操作、泄露敏感数据、进行权限提升，甚至通过多 Agent 协作传播攻击。这使得 Agent 安全从"内容安全"升级为"系统安全"。

**防御的系统性要求**：Agent 安全不能仅依赖模型层的安全对齐，需要架构级的设计——如 CaMeL 的控制流/数据流分离、沙箱隔离、权限最小化、纵深防御等。这要求研究者和工程师从系统工程的角度思考 Agent 安全。

**Skills 供应链安全的新挑战**：Agent Skills 生态系统正在重演传统软件供应链（如 npm/PyPI）的安全困境，但叠加了自然语言攻击面。研究表明26.1%的技能含漏洞、5.2%表现出高危恶意特征，而 model-in-skill 后门和文档驱动负载执行等新型攻击使得传统代码审计难以发现威胁。MCP 协议的安全模型缺陷（工具描述直接进入上下文、缺乏持续信任验证）进一步放大了这一风险。GAP 基准揭示的"文本安全不等于工具调用安全"这一发现，从根本上挑战了当前以文本安全为核心的对齐范式。

**标准化的紧迫需求**：OWASP Top 10 for Agentic Applications 和 OWASP MCP Top 10 的发布是重要里程碑，但统一的评测标准、行业合规框架和最佳实践仍有待完善。随着 Agent 在医疗、金融、软件工程等高风险领域的加速应用，安全研究的紧迫性前所未有。

