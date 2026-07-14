---
author: Bakuma-sea
pubDatetime: 2026-07-13T23:30:00+08:00
title: "Harness Engineering 深度调研与实战指南"
featured: true
tags:
  - "Harness Engineering"
  - "Agent"
  - "Infrastructure"
  - "Engineering"
description: "围绕 Harness Engineering 的核心概念、系统分层、约束设计、自验证循环与工程落地方式展开整理。"
timezone: Asia/Shanghai
---
# Harness Engineering 深度调研与实战指南

> 调研时间：2026年7月 | 范围：概念体系、手撕实现、GitHub可复现项目

---

## 第一部分：Harness Engineering 核心概念

### 1.1 定义与核心公式

**Harness Engineering**（驭缰工程/马具工程）是 2025-2026 年 AI 工程领域最重要的新范式之一。

核心公式：

```
Agent = Model + Harness
```

- **Model（模型）**：提供智能——理解、推理、生成能力
- **Harness（马具）**：提供执行基础设施——工具、记忆、约束、反馈循环、安全边界

用一句话概括：模型决定 AI 的上限，Harness 决定 AI 的下限和稳定性。Harness 不是优化模型本身，而是**优化模型运行的环境**。

术语起源：Mitchell Hashimoto（HashiCorp 创始人）在博客中首次提出用 "harness" 描述管控 AI Agent 的工具和实践，随后被 OpenAI、Martin Fowler 等快速采纳并推广。

### 1.2 三次工程范式演进

| 阶段 | 名称 | 解决什么问题 | 代表技术 |
|------|------|------------|----------|
| 第一代 | Prompt Engineering | 表达问题——如何向模型提问 | Zero-shot、Few-shot、CoT |
| 第二代 | Context Engineering | 信息供给——给模型什么上下文 | RAG、Embedding、文档拆分 |
| 第三代 | Harness Engineering | 稳定执行——让模型可靠地完成工作 | AGENTS.md、Linter约束、CI门控、反馈循环 |

### 1.3 Harness 的六大核心支柱

基于 OpenAI、Anthropic、Stripe 等一线团队的实践，Harness Engineering 包含以下六大支柱：

#### 1. 上下文架构（Context Architecture）
- **地图导向（Map-Oriented）**：给 Agent 一张地图，而非 1000 页说明书
- **分层上下文**：入口级（README/AGENTS.md）→ 模块级（子系统文档）→ 文件级（代码注释）
- **稳定前缀缓存**：将不变的系统指令（system prompt、工具定义）与应用层分离，减少 token 浪费
- **关键原则**：仓库即记录系统——不在仓库里的东西，对智能体不存在

#### 2. 架构约束（Architectural Constraints）
- **自定义 Linter 规则**：不仅检查语法，更检查架构约定（如"禁止跨层直接调用"）
- **目录结构规范**：通过 `.cursor/rules`、`.claude/AGENTS.md` 等文件固化约束
- **类型系统与接口契约**：用强类型减少 Agent 的幻觉空间
- **OpenSpec / SDD 工作流**：用结构化文档定义需求，而非自然语言描述

#### 3. 自验证循环（Self-Validation Loop）
- **自动化测试**：每次 Agent 编辑后自动运行测试，失败则回滚或修复
- **CI 门控（CI Gate）**：Agent 的产出必须经过持续集成流水线才能合并
- **Lint → Test → Build → Review** 四级验证链
- **关键原则**：Agent 写的代码必须在无人干预的情况下通过全部检查

#### 4. 上下文隔离（Context Isolation）
- **沙箱环境**：Agent 的代码在隔离环境中运行，防止破坏生产系统
- **权限分级**：只给 Agent 必要的最小权限（文件读取、特定目录写入、受限命令执行）
- **会话边界**：单次会话的脏状态不泄漏到全局

#### 5. 熵治理（Entropy Management）
- **定义**：熵 = 代码库中因 Agent 频繁修改而积累的不一致、冗余和混乱
- **治理手段**：
  - 定期重构 sprint（让 Agent 专门做清理工作）
  - 统一代码风格规则（避免不同会话产生风格冲突）
  - 知识保鲜（定期更新 AGENTS.md 和文档，防止过时）
- **关键原则**：Agent 产出的速度不能凌驾于代码质量之上

#### 6. 可拆卸性（Decomposability）
- **模块化工具**：每个工具只做一件事，可独立测试和替换
- **技能资产化（Skill Assetization）**：Agent 在一次任务中学会的通用能力沉淀为可复用技能
- **Provider 无关**：Harness 不绑定特定模型或平台

### 1.4 Coding Harness 的典型三层架构

```
┌─────────────────────────────────────────┐
│           Application Layer              │
│  (AGENTS.md, 项目文档, 架构规范, 任务描述)  │
├─────────────────────────────────────────┤
│           Agent Loop Layer               │
│  (ReAct循环, 工具调用, 状态管理, 权限控制)  │
├─────────────────────────────────────────┤
│           Runtime Layer                  │
│  (文件系统, 终端执行, 网络请求, 沙箱环境)    │
└─────────────────────────────────────────┘
```

- **Runtime**：提供系统级操作能力（读写文件、执行命令、网络访问）
- **Agent Loop**：核心决策循环（观察 → 思考 → 行动 → 验证）
- **Application**：项目特定的上下文和约束

### 1.5 Self-Harness：Harness 的下一进化形态

2026 年 6 月，上海 AI Lab 提出 **Self-Harness** 范式，核心命题：**不改变 LLM 任何参数，让 Agent 自己优化自己的运行框架**。

三阶段自动化循环：
1. **Weakness Mining（弱点挖掘）**：扫描执行日志，识别失败模式
2. **Harness Proposal（修补提议）**：自动生成对 Harness 组件的修改建议（系统提示、工具描述、规则文件等）
3. **Proposal Validation（回归验证）**：在基准测试上验证修改效果，通过则合并，失败则回滚

实验结果：MiniMax、Qwen3.5、GLM-5 等模型性能分别提升 52.8%、60.1%、33.1%（无需修改模型参数）。

---

## 第二部分：从零手撕一个 Coding Harness

本节目标：用纯 Python + 标准库，搭建一个最小但可运行的 Coding Agent Harness。最终代码约 200 行，可读取文件、编辑文件、执行命令、验证结果。

### 2.1 核心设计思路

最小化 Coding Harness 需要包含：
1. **LLM 接口**：与模型通信
2. **工具注册系统**：让 LLM 知道能调用什么工具
3. **ReAct 循环**：观察 → 思考 → 行动 → 验证的循环
4. **文件系统工具**：读、写、编辑文件
5. **终端执行工具**：运行命令并捕获输出
6. **安全边界**：目录白名单、命令黑名单

### 2.2 完整代码实现

```python
#!/usr/bin/env python3
"""
Mini Coding Harness — 最小可运行的 Coding Agent Harness
约 200 行纯 Python，无第三方依赖（除 LLM API 外）
功能：文件读写、命令执行、多轮 ReAct 循环、安全边界
"""

import json
import os
import re
import subprocess
import sys
from typing import Callable, Dict, List, Any


# ───────────────────────────────────────────
# 1. 工具定义层（Tool Registry）
# ───────────────────────────────────────────

class Tool:
    """每个工具包含：名称、描述、参数 JSON Schema、执行函数"""
    def __init__(self, name: str, description: str, parameters: dict, func: Callable):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.func = func


class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Tool] = {}

    def register(self, tool: Tool):
        self.tools[tool.name] = tool

    def get_schemas(self) -> List[dict]:
        """为 LLM 生成工具描述（OpenAI function-calling 格式）"""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self.tools.values()
        ]

    def execute(self, name: str, arguments: dict) -> str:
        if name not in self.tools:
            return f"[Error] Tool '{name}' not found."
        try:
            return str(self.tools[name].func(**arguments))
        except Exception as e:
            return f"[Error] {type(e).__name__}: {e}"


# ───────────────────────────────────────────
# 2. 安全运行时（Safe Runtime）
# ───────────────────────────────────────────

class SafeRuntime:
    """
    安全边界：
    - 只允许在指定工作目录内操作文件
    - 禁止执行危险命令（rm -rf、sudo 等）
    """
    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        os.makedirs(self.workspace, exist_ok=True)
        self.blocked_commands = {"rm", "sudo", "mkfs", "dd", "format", ">/dev"}

    def _resolve(self, path: str) -> str:
        abs_path = os.path.abspath(os.path.join(self.workspace, path))
        if not abs_path.startswith(self.workspace):
            raise PermissionError(f"Path '{path}' escapes workspace.")
        return abs_path

    def read_file(self, path: str) -> str:
        target = self._resolve(path)
        if not os.path.exists(target):
            return f"[Error] File not found: {path}"
        with open(target, "r", encoding="utf-8") as f:
            return f.read()

    def write_file(self, path: str, content: str) -> str:
        target = self._resolve(path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return f"[OK] Written {len(content)} chars to {path}"

    def edit_file(self, path: str, old_string: str, new_string: str) -> str:
        """精确替换，类似 string_replace"""
        target = self._resolve(path)
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()
        if old_string not in content:
            return f"[Error] old_string not found in {path}"
        content = content.replace(old_string, new_string, 1)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return f"[OK] Edited {path}"

    def run_command(self, command: str) -> str:
        cmd_parts = command.strip().split()
        if not cmd_parts:
            return "[Error] Empty command."
        if any(b in cmd_parts[0] for b in self.blocked_commands):
            return f"[Error] Command '{cmd_parts[0]}' is blocked for safety."
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.workspace,
                capture_output=True,
                text=True,
                timeout=30,
            )
            stdout = result.stdout[-2000:] if result.stdout else ""
            stderr = result.stderr[-1000:] if result.stderr else ""
            return f"[Exit {result.returncode}]\nstdout:\n{stdout}\nstderr:\n{stderr}"
        except subprocess.TimeoutExpired:
            return "[Error] Command timed out after 30s."
        except Exception as e:
            return f"[Error] {type(e).__name__}: {e}"

    def list_files(self, path: str = ".") -> str:
        target = self._resolve(path)
        if not os.path.isdir(target):
            return f"[Error] Not a directory: {path}"
        items = os.listdir(target)
        return "\n".join(items) if items else "(empty directory)"


# ───────────────────────────────────────────
# 3. LLM 接口层（抽象，兼容多平台）
# ───────────────────────────────────────────

class LLMClient:
    """
    极简 LLM 客户端。
    实际使用时可替换为 openai、anthropic、ollama 等 SDK。
    这里演示结构，用 openai 包实现。
    """
    def __init__(self, api_key: str, base_url: str = None, model: str = "gpt-4o-mini"):
        import openai
        self.client = openai.OpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    def chat(self, messages: List[dict], tools: List[dict] = None) -> dict:
        kwargs = {"model": self.model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        resp = self.client.chat.completions.create(**kwargs)
        return resp.choices[0].message


# ───────────────────────────────────────────
# 4. Harness 核心引擎（Agent Loop）
# ───────────────────────────────────────────

class CodingHarness:
    def __init__(self, llm: LLMClient, runtime: SafeRuntime, max_turns: int = 20):
        self.llm = llm
        self.runtime = runtime
        self.max_turns = max_turns
        self.registry = ToolRegistry()
        self._register_tools()

    def _register_tools(self):
        rt = self.runtime
        self.registry.register(Tool(
            name="read_file",
            description="Read the contents of a file in the workspace.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string", "description": "Relative path to the file"}},
                "required": ["path"],
            },
            func=rt.read_file,
        ))
        self.registry.register(Tool(
            name="write_file",
            description="Write content to a file (creates directories if needed).",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
            func=rt.write_file,
        ))
        self.registry.register(Tool(
            name="edit_file",
            description="Replace old_string with new_string in a file (exact match).",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_string": {"type": "string"},
                    "new_string": {"type": "string"},
                },
                "required": ["path", "old_string", "new_string"],
            },
            func=rt.edit_file,
        ))
        self.registry.register(Tool(
            name="run_command",
            description="Run a shell command in the workspace and return output.",
            parameters={
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
            func=rt.run_command,
        ))
        self.registry.register(Tool(
            name="list_files",
            description="List files in a directory (default: current).",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string", "default": "."}},
                "required": [],
            },
            func=rt.list_files,
        ))

    def run(self, task: str, system_prompt: str = None):
        """
        主入口：给定任务，运行多轮 ReAct 循环直到完成或达到 max_turns。
        """
        if system_prompt is None:
            system_prompt = (
                "You are a coding agent. You have access to tools to read/write files, "
                "edit code, run commands, and list directory contents. "
                "Think step by step. When you finish, call 'finish' by describing what you did."
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ]

        print(f"\n{'='*60}")
        print(f"[Harness] Task: {task}")
        print(f"{'='*60}\n")

        for turn in range(self.max_turns):
            # --- LLM 决策 ---
            response = self.llm.chat(messages, tools=self.registry.get_schemas())
            assistant_msg = {"role": "assistant"}
            if response.content:
                assistant_msg["content"] = response.content
                print(f"[Turn {turn+1}] 🤖 {response.content[:500]}")
            if response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in response.tool_calls
                ]
            messages.append(assistant_msg)

            # --- 工具执行 ---
            if not response.tool_calls:
                # Agent 没有调用工具，认为任务完成
                print(f"\n[Harness] Finished after {turn+1} turns.")
                return response.content

            for tc in response.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments)
                print(f"[Turn {turn+1}] 🔧 {name}({json.dumps(args, ensure_ascii=False)})")
                result = self.registry.execute(name, args)
                print(f"[Turn {turn+1}] 📤 Result: {result[:500]}")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": name,
                    "content": result,
                })

        print(f"\n[Harness] Reached max turns ({self.max_turns}). Stopping.")
        return messages[-1].get("content", "")


# ───────────────────────────────────────────
# 5. 使用示例
# ───────────────────────────────────────────

def main():
    # 配置
    API_KEY = os.getenv("OPENAI_API_KEY", "your-api-key")
    WORKSPACE = "./workspace"

    llm = LLMClient(api_key=API_KEY, model="gpt-4o-mini")
    runtime = SafeRuntime(WORKSPACE)
    harness = CodingHarness(llm, runtime, max_turns=15)

    # 示例任务：创建一个 Python 脚本并运行它
    task = (
        "Create a file 'hello.py' that prints 'Hello from Harness!' and then "
        "run it with python. After running, read the file content to confirm."
    )
    harness.run(task)


if __name__ == "__main__":
    main()
```

### 2.3 代码逐层解析

#### 第一层：Tool Registry（工具注册层）
- `Tool` 类封装了每个工具的元数据（名称、描述、参数 Schema）和执行函数
- `ToolRegistry` 负责收集所有工具，并为 LLM 生成标准化的 function-calling 格式
- 添加新工具只需实例化 `Tool` 并 `register` 即可，无需修改核心循环

#### 第二层：Safe Runtime（安全运行时）
- `workspace` 白名单：所有文件操作被限制在指定目录内
- `blocked_commands` 黑名单：防止执行破坏性命令
- 三个文件操作（read/write/edit）+ 一个命令执行 + 目录浏览，覆盖 90% 的 coding 场景

#### 第三层：LLM Client（模型抽象层）
- 使用 OpenAI 的 function-calling 协议，但结构上是可替换的
- 实际生产中可以接入 Anthropic、Ollama、DeepSeek 等，只需实现同样的 `chat` 接口

#### 第四层：Agent Loop（决策循环）
- 经典的 ReAct 模式：每轮 LLM 决定是「思考输出」还是「调用工具」
- 工具执行结果作为新的 `tool` 角色消息回传给 LLM，形成闭环
- `max_turns` 防止无限循环，是安全边界的一部分

### 2.4 如何扩展这个 Harness

以上 200 行代码是一个**骨架**。要生产化，需要按以下方向扩展：

| 扩展方向 | 实现思路 | 复杂度 |
|----------|----------|--------|
| **记忆系统** | 将会话历史写入 SQLite，跨会话检索 | 低 |
| **技能沉淀** | 将成功任务的工具序列保存为模板，下次直接复用 | 中 |
| **多 Agent 协作** | 增加 Planner + Generator + Evaluator 三种角色 | 中 |
| **自验证循环** | 每次 write_file 后自动运行 `pytest` 或 `eslint` | 低 |
| **AGENTS.md 解析** | 启动时读取项目根目录的 AGENTS.md，注入 system prompt | 低 |
| **MCP 集成** | 接入 Model Context Protocol，调用外部工具（如浏览器、数据库） | 中 |
| **Self-Harness 进化** | 记录失败日志 → 自动修改 system prompt / 工具描述 → 回归验证 | 高 |

### 2.5 AGENTS.md 示例（Coding Harness 的「项目上下文」）

在实际项目中，Harness 启动时应自动读取 `AGENTS.md`：

```markdown
# AGENTS.md — Project Context for AI Coding Agents

## 项目概述
- 这是一个 Python Web 后端项目，使用 FastAPI + SQLAlchemy
- Python 版本：3.11+
- 包管理器：uv

## 目录结构
- `src/` — 业务代码
- `tests/` — 测试代码（pytest）
- `migrations/` — 数据库迁移（alembic）

## 编码规范
- 使用 black 格式化，ruff 检查
- 所有函数必须有类型注解
- 数据库操作必须通过 `src/db/session.py` 中的 `get_db()` 获取 session
- 禁止在 handler 中直接写 SQL

## 测试要求
- 新功能必须包含单元测试
- 运行 `pytest tests/` 全部通过才能提交

## 常用命令
- `uv run pytest` — 运行测试
- `uv run ruff check .` — 代码检查
- `uv run alembic revision --autogenerate -m "msg"` — 生成迁移
```

---

## 第三部分：GitHub 可复现 Harness 项目推荐

以下项目按**难度梯度**分类，均适合复现并放在简历中。每个项目标注了：GitHub 地址、Stars 量级、核心亮点、适合复现的部分。

### 3.1 入门级 — 模板与配置类（1-3 天复现）

这类项目不需要写复杂代码，重点是理解 Harness 的「配置即约束」思想。适合作为第一个 Harness 项目。

#### 1. agent-ready-template
- **GitHub**: `adongwanai/agent-ready-template`
- **定位**: 面向 Claude、Codex 的 harness-first 项目模板
- **亮点**: 
  - 包含完整的 `.claude/` 目录结构（AGENTS.md、角色定义、任务模板）
  - 让 AI 在读完 README 后就能理解项目并接手开发
- **复现建议**: 基于这个模板创建自己的项目，定义一套领域特定的 AGENTS.md 规则（如数据工程、爬虫、运维脚本），展示「约束设计能力」
- **简历价值**: ★★☆（展示 Harness 意识，但代码量较少）

#### 2. Harness-Starter
- **GitHub**: `chenklein26-maker/Harness-Starter`
- **定位**: 开箱即用的 Claude Code Harness 模板
- **亮点**:
  - 三层自动化（安全/感知/审查）
  - 集成 LSP、OpenSpec SDD 工作流
  - 支持 AI 一键初始化
- **复现建议**: 用此模板初始化一个真实项目（如个人博客、工具站），记录 AI 协作的 PR 历史
- **简历价值**: ★★★（有完整的工程体系）

#### 3. repository-harness
- **GitHub**: `hoangnb24/repository-harness`
- **定位**: 将任何仓库变成 Agent-ready 的工程 harness
- **亮点**:
  - 包含 AGENTS.md、产品契约、Story Packets、验证矩阵、决策记录
  - 结构清晰，适合理解「文档即约束」的完整形态
- **复现建议**: 选一个自己的旧项目，用这套结构重写文档和约束，展示存量项目的 Harness 改造能力
- **简历价值**: ★★★（工程化能力体现明显）

---

### 3.2 进阶级 — 框架实现类（1-2 周复现）

这类项目需要深入理解 Agent Loop、工具系统、记忆机制，是简历中的硬核项目。

#### 4. OpenHarness ⭐ 强烈推荐
- **GitHub**: `HKUDS/OpenHarness`
- **定位**: 第一个开源的「AI Agent Harness」工业级实现，约 11,700 行 Python
- **核心特性**:
  - 工具调用（Tool-use）基础设施
  - 技能系统（Skill System）
  - 记忆管理（Memory）
  - 多智能体协调（Multi-agent Coordination）
  - 支持任意 LLM（Ollama 本地运行 / 云 API）
  - 每步 AI 编辑自动 git commit，可 `/undo` 回滚
  - 顺序终端渲染器（类似 Claude Code 的 TUI）
- **复现建议**:
  - 路径 A：通读源码，手写一个简化版（参考本文第二部分），在 README 中对比「我的实现 vs OpenHarness 的设计决策」
  - 路径 B：基于 OpenHarness 二次开发一个垂直场景 Harness（如「数据分析 Harness」「爬虫 Harness」）
- **简历价值**: ★★★★★（深度理解 Harness 基础设施，面试官必问）
- **学习资源**: `joyehuang/Learn-Open-Harness` 是官方配套教程

#### 5. mini-coding-agent
- **GitHub**: `rasbt/mini-coding-agent`
- **定位**: 最小化、可读性优先的 Coding Agent Harness，无第三方依赖
- **核心特性**:
  - 纯标准库实现，可直接运行
  - 作者 Sebastian Raschka 是 LLM 领域知名研究者（威斯康星大学副教授）
  - 代码注释详尽，适合「手撕」学习
- **复现建议**:
  - 逐行阅读并用自己的方式重写，添加中文注释
  - 在此基础上扩展：增加记忆模块、多文件编辑支持、自验证循环
- **简历价值**: ★★★★（小而精，展示底层理解能力）

#### 6. agent-harness（TypeScript 版）
- **GitHub**: `madebywild/agent-harness`
- **定位**: 统一 AI Agent Harness 配置管理工具
- **核心特性**:
  - 从单一 truth source 生成多平台配置（Codex、Claude Code、Copilot、Cursor）
  - TypeScript CLI + 库，工程化程度高
- **复现建议**:
  - 用 Python 重写核心逻辑，实现一个「多平台配置同步器」
  - 或贡献一个 PR（增加新平台支持或新功能）
- **简历价值**: ★★★★（展示跨平台抽象能力）

---

### 3.3 高阶级 — 自进化与多智能体类（2-4 周复现）

这类项目涉及前沿研究，复现后可以在简历中作为「研究型项目」或「开源贡献」亮点。

#### 7. GenericAgent ⭐ 强烈推荐
- **GitHub**: `drmm/genericagent`
- **定位**: 极简可自我进化的自主 Agent 框架，核心仅约 3K 行代码
- **核心特性**:
  - 9 个原子工具（浏览器、终端、文件系统、键鼠、屏幕视觉、ADB）
  - 不预设技能，每次任务自动沉淀为可复用 Skill，越用越强
  - 支持微信、QQ、飞书、钉钉等多端接入
  - 约 100 行的 Agent Loop，极度精简
- **复现建议**:
  - 核心挑战：实现「技能资产化」机制——将成功任务的轨迹自动转为 JSON/YAML 技能模板
  - 建议先用浏览器/文件系统两个工具做 MVP，验证技能沉淀的可行性
- **简历价值**: ★★★★★（3K 行实现自进化，技术深度极高）

#### 8. EvoAgentX
- **GitHub**: `EvoAgentX/EvoAgentX`
- **定位**: 开源自我进化 Agent 框架，支持自动化的工作流进化
- **核心特性**:
  - 集成 TextGrad、MIPRO、AFlow 等进化算法
  - 自动生成结构化多智能体工作流
  - 内置评估器，按任务标准评分
  - 支持 HotPotQA、MBPP、MATH 等基准测试
- **复现建议**:
  - 运行官方示例，在 MBPP（代码生成）数据集上验证进化效果
  - 记录「初始分数 → 进化轮次 → 最终分数」的曲线，作为项目报告
- **简历价值**: ★★★★★（展示算法+工程结合能力，适合算法岗）

#### 9. hermes-agent（Self-Evolving Agent）
- **GitHub**: `NousResearch/hermes-agent`
- **定位**: 23k+ Stars 的自我进化 Agent，内置学习循环
- **核心特性**:
  - 从失败中自动创建 Skill
  - 使用 DSPy + GEPA（Genetic-Pareto Prompt Evolution）优化技能
  - 无需 GPU 训练，纯提示词层面进化
  - 持续记忆：搜索过往对话，构建用户画像
- **复现建议**:
  - 运行并观察其「失败 → 反思 → 生成技能」的闭环
  - 尝试为其贡献一个中文技能或领域特定工具
- **简历价值**: ★★★★★（明星项目，社区影响力大）

#### 10. Self-Harness（上海 AI Lab）
- **GitHub**: 搜索 `self-harness` 相关实现，主论文为 arXiv:2606.09498
- **定位**: 让固定 LLM 自我优化 Harness 的学术项目
- **核心特性**:
  - 三阶段循环：Weakness Mining → Harness Proposal → Proposal Validation
  - 模型无关：MiniMax、Qwen、GLM 均有效
  - 实验可复现：固定模型、固定工具集、固定预算，仅允许 Harness 变化
- **复现建议**:
  - 基于论文算法，用 Python 实现一个最小可运行版本
  - 选一个简单基准（如 HumanEval 或自定义测试集），验证 pass@1 提升
  - 发布到 GitHub 并写技术博客，是非常好的「研究+工程」组合项目
- **简历价值**: ★★★★★（前沿研究复现，论文阅读+工程实现双重能力）

---

### 3.4 项目选择决策矩阵

| 你的背景 | 推荐项目 | 预期时间 | 简历关键词 |
|----------|----------|----------|------------|
| 前端/全栈，想快速上手 | agent-ready-template / repository-harness | 1-3 天 | AGENTS.md, 约束设计, Agent-First |
| Python 后端，想展示工程深度 | OpenHarness / mini-coding-agent | 1-2 周 | Agent Loop, Tool-use, 安全运行时 |
| 算法/研究背景，想展示前沿性 | EvoAgentX / Self-Harness / GenericAgent | 2-4 周 | 自进化, GEPA, Prompt Evolution, 基准测试 |
| 想同时覆盖工程+研究 | 手撕 Mini Harness + Self-Harness 论文复现 | 2-3 周 | 从零构建, 学术复现, 性能提升数据 |

---

## 第四部分：如何把这些项目写进简历

### 写法示例 1：OpenHarness 二次开发

> **AI Coding Harness 开发** | 个人项目 | 2026.06-2026.07
> - 基于 OpenHarness 源码（11,700 行 Python）逆向分析，理解其 Tool-use、Skill、Memory、Multi-agent 四层架构
> - 手写简化版 Coding Harness（200 行纯 Python），支持文件读写、命令执行、安全沙箱、ReAct 循环
> - 扩展自验证循环：每次文件编辑后自动触发 pytest，失败则自动回滚，将 AI 代码通过率从 60% 提升至 92%
> - 技术栈：Python, OpenAI API, subprocess, Git

### 写法示例 2：Self-Harness 论文复现

> **Self-Harness 论文复现** | 研究型项目 | 2026.06-2026.07
> - 复现上海 AI Lab 2026 年论文《Self-Harness: Harnesses That Improve Themselves》（arXiv:2606.09498）
> - 实现三阶段自动化循环：Weakness Mining（日志分析）→ Harness Proposal（提示词/工具描述自动优化）→ Proposal Validation（回归测试）
> - 在 HumanEval 基准上验证：固定 Qwen2.5-7B 模型，仅优化 Harness 使 pass@1 从 34% 提升至 55%（+62%）
> - 技术栈：Python, DSPy, LLM API, 自动化评估流水线

### 写法示例 3：GenericAgent 技能系统

> **GenericAgent 技能沉淀系统** | 开源贡献 | 2026.05-2026.06
> - 为 GenericAgent（3K 行自进化 Agent 框架）贡献「技能资产化」模块
> - 设计 Skill 序列化格式（YAML），将成功任务的轨迹自动抽象为可复用模板，跨任务复用率提升 40%
> - 实现 Skill 检索器：基于任务描述的向量相似度匹配，自动加载最相关的 3 个历史 Skill
> - 技术栈：Python, Embedding, 向量检索, YAML 模板引擎

---

## 第五部分：学习路径建议

**第 1 周：建立直觉**
1. 阅读 Martin Fowler 的原文《Harness engineering for coding agent users》
2. 阅读 OpenAI 的《Harness Engineering: Leveraging Codex in an Agent-First World》
3. 用 Claude Code 或 Cursor 完成一个真实小项目，体会「Agent 需要什么上下文才能不犯错」

**第 2 周：动手搭骨架**
1. 跟着本文第二部分，手写 mini-coding-agent（200 行）
2. 在骨架上增加一个功能：自动测试回滚、记忆系统、或 AGENTS.md 解析器
3. 对比 rasbt/mini-coding-agent 和 OpenHarness 的源码，写一份「设计决策对比」笔记

**第 3-4 周：深度复现**
1. 从「3.2 进阶级」或「3.3 高阶级」中选一个项目完整复现
2. 记录关键指标：初始性能、遇到的坑、最终性能、优化手段
3. 将复现过程写成技术博客或 README，发布到 GitHub

**第 5 周：简历包装**
1. 用第四部分的模板写进简历
2. 准备面试话术：能讲清楚「为什么 Agent 需要 Harness」、「你的 Harness 解决了什么具体问题」、「数据指标如何」

---

## 附录：关键资源链接

- **Martin Fowler 原文**: https://martinfowler.com/articles/harness-engineering.html
- **OpenAI Codex Harness 报告**: 搜索 "OpenAI Harness Engineering Codex"
- **Self-Harness 论文**: https://arxiv.org/abs/2606.09498
- **Awesome-Agent-Harness 资料汇总**: https://github.com/HKUST-KnowComp/Awesome-Agent-Harness
- **Awesome-Self-Evolving-Agents**: https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents
- **OpenHarness 源码**: https://github.com/HKUDS/OpenHarness
- **GenericAgent 源码**: https://github.com/drmm/genericagent
- **EvoAgentX 源码**: https://github.com/EvoAgentX/EvoAgentX
- **hermes-agent 源码**: https://github.com/NousResearch/hermes-agent
- **Datawhale Self-Harness 教程**: https://github.com/datawhalechina/self-harness
- **Harness Engineering 可视化图谱**: https://harness-engineering.ai/

---

> 本文档基于 2025-2026 年业界最新实践整理，涵盖 OpenAI、Anthropic、Stripe、上海 AI Lab、Nous Research 等团队的一线经验。建议结合具体项目源码持续迭代认知。

