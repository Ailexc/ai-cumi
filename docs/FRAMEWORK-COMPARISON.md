# 多 Agent 框架对比分析

> 日期：2026-08-20
> 对比对象：LangGraph / CrewAI / AutoGen / LlamaIndex / MetaGPT
> 目的：理解各框架定位，明确 AiCumi 的架构选择

---

## 一、五大框架一句话定位

| 框架 | 一句话定位 | 核心隐喻 |
|------|-----------|----------|
| **LangGraph** | 有状态的 Agent 工作流引擎 | 流程图（Graph） |
| **CrewAI** | 企业级 Agent 团队编排平台 | 公司团队（Crew） |
| **AutoGen** | 微软出品的多 Agent 对话框架 | 会议室讨论（Conversation） |
| **LlamaIndex** | 数据驱动的 Agent 框架 | 图书馆管理员（Librarian） |
| **MetaGPT** | 模拟软件公司的多 Agent 系统 | 软件公司（Company） |

---

## 二、逐个深度分析

### 2.1 LangGraph（LangChain 出品）

**是什么**：LangChain 团队开发的有状态 Agent 工作流框架，用**图（Graph）**来编排 Agent 执行流程。

**核心概念**：
- **StateGraph**：有状态的执行图，节点是函数/Agent，边是条件跳转
- **Checkpointer**：自动保存执行状态，支持中断恢复
- **Human-in-the-loop**：原生支持人类审批节点
- **Streaming**：流式输出每个节点的执行过程

**优点**：
- ✅ **最灵活**：任意复杂的条件分支、循环、并行
- ✅ **状态管理强**：Checkpointer 支持 SQLite/Postgres，中断可恢复
- ✅ **LangChain 生态**：无缝使用 LangChain 的工具/LLM/检索器
- ✅ **生产就绪**：LangGraph Platform 提供云部署、监控
- ✅ **TypeScript 支持**：有 JS/TS 版本

**缺点**：
- ❌ **学习曲线陡**：需要理解图编程范式
- ❌ **样板代码多**：简单任务也需要定义 State/Graph/Nodes/Edges
- ❌ **强依赖 LangChain**：不用 LangChain 生态会很别扭
- ❌ **Agent 概念弱**：更像"函数编排"而非"Agent 协作"

**适合场景**：
- 复杂的多步骤工作流（审批、条件分支、重试）
- 需要精确控制执行流程的场景
- 已用 LangChain 生态的团队

---

### 2.2 CrewAI

**是什么**：面向企业的 Agent 团队编排平台，核心理念是"Agent = 团队成员，Crew = 团队"。

**核心概念**：
- **Agent**：role + goal + backstory + LLM + tools + memory
- **Task**：description + expected_output + agent 指派
- **Crew**：agents + tasks + process（sequential/hierarchical）
- **Knowledge Sources**：RAG 知识源
- **Checkpointing**：任务中断恢复

**优点**：
- ✅ **最易上手**：JSONC 配置即可定义 Agent 团队
- ✅ **企业级特性**：eval、tracing、checkpoint、memory、cache
- ✅ **可视化编排**：Enterprise 版有 Visual Agent Builder
- ✅ **模型灵活**：每个 Agent 可独立配置 LLM
- ✅ **Fortune 500 验证**：65% 的财富 500 强在用

**缺点**：
- ❌ **编排模式有限**：只有 sequential 和 hierarchical，不支持自定义图
- ❌ **Python only**：无 JS/TS 版本
- ❌ **Agent 交互简单**：Agent 之间只能委派（delegation），无法自由对话
- ❌ **企业版收费**：高级功能（Visual Builder、Tracing）需要付费

**适合场景**：
- 企业级 Agent 团队（销售、客服、运营）
- 需要快速搭建、不想写太多代码
- 业务流程相对固定（串行或层级委派）

---

### 2.3 AutoGen（微软）

**是什么**：微软开源的多 Agent 对话框架，核心理念是"Agent 之间通过对话协作"。

**核心概念**：
- **Agent**：可发送/接收消息的实体
- **Conversation**：Agent 之间的多轮对话
- **Team**：一组 Agent 的协作单元
- **Code Executor**：安全执行 Agent 生成的代码（Docker 沙箱）
- **AutoGen Studio**：无代码 UI 原型工具

**优点**：
- ✅ **对话驱动**：Agent 之间可以自由讨论、辩论、协商
- ✅ **代码执行强**：内置 Docker 沙箱安全执行代码
- ✅ **微软背书**：企业级可信度高
- ✅ **AutoGen Studio**：无代码原型工具，快速验证
- ✅ **分布式支持**：gRPC Worker Runtime，Agent 可分布在不同机器

**缺点**：
- ❌ **对话不可控**：Agent 自由对话可能导致发散、跑题
- ❌ **Token 消耗大**：多 Agent 对话 = 多倍 Token
- ❌ **调试困难**：对话流难以追踪和复现
- ❌ **v0.2 → v0.4 迁移痛苦**：API 大改，社区分裂

**适合场景**：
- 需要 Agent 之间自由讨论的场景（辩论、头脑风暴）
- 代码生成和执行任务
- 研究性质的多 Agent 协作实验

---

### 2.4 LlamaIndex

**是什么**：数据驱动的 LLM 应用框架，核心能力是**让 LLM 基于你的数据回答问题**。

**核心概念**：
- **Data Connectors**：从各种数据源（PDF/SQL/API/网页）加载数据
- **Index**：将数据结构化为 LLM 可消费的索引
- **Query Engine**：基于索引的问答引擎（RAG）
- **Agent**：LLM 驱动的知识工作者，可使用工具
- **Workflow**：事件驱动的多步骤流程
- **LlamaCloud**：托管的文档解析/索引/检索服务

**优点**：
- ✅ **RAG 最强**：业界最好的 RAG 框架，文档解析/索引/检索一站式
- ✅ **数据连接器丰富**：160+ 数据源（PDF/SQL/API/Google Drive/Notion...）
- ✅ **LlamaParse**：最好的文档解析器（支持复杂表格、嵌入图表）
- ✅ **TypeScript 支持**：有完整的 TS 版本
- ✅ **5 行代码起步**：入门极简

**缺点**：
- ❌ **Agent 能力弱**：Agent 只是"带工具的 LLM"，缺乏多 Agent 协作
- ❌ **Workflow 简单**：事件驱动但编排能力不如 LangGraph
- ❌ **不是多 Agent 框架**：核心是 RAG，Agent 是附属能力
- ❌ **企业版收费**：LlamaCloud/LlamaParse 需要付费

**适合场景**：
- 知识库问答（RAG）
- 文档理解和数据提取
- 需要连接多种数据源的场景

---

### 2.5 MetaGPT

**是什么**：模拟软件公司的多 Agent 系统，核心理念是"SOP(Team) = Code"。

**核心概念**：
- **Role**：软件公司中的角色（产品经理、架构师、工程师、QA）
- **SOP**：标准作业流程，角色之间按 SOP 协作
- **Message Pool**：角色之间的消息共享池
- **Action**：每个角色执行的具体动作
- **MGX (MetaGPT X)**：商业化产品（AI 开发团队）

**优点**：
- ✅ **软件开发专精**：一行需求 → 完整项目（PRD/架构/代码/测试）
- ✅ **SOP 驱动**：角色之间有明确的交接流程，不会发散
- ✅ **学术认可**：ICLR 2025 口头报告（top 1.8%）
- ✅ **Data Interpreter**：数据分析 Agent，可执行代码
- ✅ **MGX 商业化**：Product Hunt #1 Product of the Week

**缺点**：
- ❌ **场景单一**：主要是软件开发，其他场景支持弱
- ❌ **配置复杂**：角色/SOP 定义需要深入理解
- ❌ **Python only**：无 JS/TS 版本
- ❌ **不够通用**：不适合非软件开发场景
- ❌ **维护频率低**：最近一次 release 是 2 年前

**适合场景**：
- 一句话生成完整软件项目
- 软件开发流程自动化
- 数据分析和报告生成

---

## 三、核心维度对比

| 维度 | LangGraph | CrewAI | AutoGen | LlamaIndex | MetaGPT |
|------|-----------|--------|---------|------------|---------|
| **核心能力** | 工作流编排 | 团队编排 | 对话协作 | RAG/数据 | 软件开发 |
| **Agent 模型** | 图节点 | 团队成员 | 对话参与者 | 知识工作者 | 公司角色 |
| **编排方式** | 有状态图 | 串行/层级 | 自由对话 | 事件驱动 | SOP 流程 |
| **RAG 能力** | 中（借助 LangChain） | 中（knowledge_sources） | 弱 | **强（核心能力）** | 弱 |
| **代码执行** | 中 | 弱 | **强（Docker 沙箱）** | 弱 | 中 |
| **状态管理** | **强（Checkpointer）** | 中（checkpoint） | 弱 | 弱 | 弱 |
| **可视化** | LangGraph Studio | Visual Builder（企业版） | AutoGen Studio | 无 | 无 |
| **语言** | Python + JS/TS | Python only | Python only | Python + JS/TS | Python only |
| **上手难度** | 🔴 高 | 🟢 低 | 🟡 中 | 🟢 低 | 🟡 中 |
| **生产就绪** | ✅ 高 | ✅ 高 | 🟡 中 | ✅ 高 | 🟡 中 |
| **GitHub Stars** | 10K+ | 25K+ | 38K+ | 40K+ | 70K+ |
| **背后公司** | LangChain | CrewAI Inc | Microsoft | LlamaIndex | DeepWisdom |

---

## 四、选型决策树

```
你的核心需求是什么？
│
├─ "让 Agent 基于我的数据回答问题"
│   └─ → LlamaIndex（RAG 最强）
│
├─ "让多个 Agent 按固定流程协作"
│   ├─ 流程简单（串行/层级）→ CrewAI（最易上手）
│   └─ 流程复杂（条件/循环/并行）→ LangGraph（最灵活）
│
├─ "让 Agent 之间自由讨论/辩论"
│   └─ → AutoGen（对话驱动）
│
├─ "一句话生成软件项目"
│   └─ → MetaGPT（软件公司模拟）
│
└─ "我要做一个 AI 产品（有自己的 UI、用户、管理面）"
    └─ → 不用这些框架，自己搭壳层 + 用引擎（如 AiCumi 的选择）
```

---

## 五、与 AiCumi 架构的对比

### 5.1 AiCumi 的架构选择

```
┌─────────────────────────────────────────┐
│              AiCumi (壳层)                │
│  Web UI + Chat Server + 管理面            │
│  控制：用户体验、成员管理、技能、渠道       │
└──────────────────┬──────────────────────┘
                   │ Gateway WS 协议
                   │ (chat.send / chat.history)
┌──────────────────┴──────────────────────┐
│           OpenClaw (引擎层)               │
│  控制：Agent 运行时、记忆、工具、模型路由   │
└─────────────────────────────────────────┘
```

**与五大框架的根本区别**：

| | 五大框架 | AiCumi |
|---|---|---|
| **定位** | Agent 编排框架（给开发者用） | AI 产品（给终端用户用） |
| **用户** | 开发者/工程师 | 普通用户 |
| **交付物** | 代码/CLI/API | 可交互的 Web 应用 |
| **Agent 编排** | 框架控制（代码定义） | 引擎控制（OpenClaw 内部） |
| **UI** | 无（或简单的 Studio） | 完整的聊天 UI + 管理面 |
| **多租户** | 无（单次执行） | 有（每个用户一个实例） |

### 5.2 AiCumi 可以从各框架借鉴什么

| 框架 | 可借鉴的能力 | 如何融入 AiCumi |
|------|-------------|-----------------|
| **LangGraph** | 有状态工作流、Checkpointer | 在壳层实现"任务流水线"（用户定义多步骤任务） |
| **CrewAI** | Agent 团队编排、Eval | 在管理面实现"团队编排 UI" + Agent 评估 |
| **AutoGen** | 对话驱动协作、代码沙箱 | 在群聊中支持 Agent 自由讨论 + 安全代码执行 |
| **LlamaIndex** | RAG、数据连接器 | 接入 RAG 知识库（Phase 1：文件上传；Phase 2：数据源） |
| **MetaGPT** | SOP 驱动、角色定义 | 在人设系统中加入 SOP 模板（不只是性格，还有工作流程） |

### 5.3 为什么不直接用这些框架

| 原因 | 说明 |
|------|------|
| **技术栈不兼容** | 五大框架都是 Python，AiCumi 是 Node.js + React |
| **架构目标不同** | 框架是"开发者工具"，AiCumi 是"终端用户产品" |
| **引擎已定** | OpenClaw 已经是成熟的 Agent 运行时，不需要替换 |
| **控制权在引擎** | 我们控制 UI/UX，OpenClaw 控制 Agent 智能，这个分层是合理的 |
| **渐进增强** | 可以从框架中借鉴能力，在壳层实现，而非替换引擎 |

### 5.4 如果重新选择引擎

假设从零开始，不考虑 OpenClaw：

| 需求 | 推荐引擎 | 理由 |
|------|----------|------|
| RAG 驱动的知识助手 | LlamaIndex | RAG 最强 |
| 多 Agent 团队协作 | CrewAI | 最易上手，企业级 |
| 复杂工作流自动化 | LangGraph | 最灵活 |
| AI 软件开发团队 | MetaGPT | 软件开发专精 |
| 通用 AI 助理产品 | **OpenClaw**（当前选择） | 成熟的 Agent 运行时，插件生态丰富 |

---

## 六、结论

### AiCumi 的架构是合理的

我们选择"壳层 + 引擎"的分层架构，而不是直接用某个框架，原因是：

1. **我们做的是产品，不是工具** — 五大框架是给开发者的，我们是给终端用户的
2. **OpenClaw 已经是成熟的引擎** — 有 Agent 运行时、记忆、工具、通道、cron，不需要重造
3. **分层让我们专注** — 我们专注 UI/UX 和管理面，OpenClaw 专注 Agent 智能

### 需要补强的方向

从五大框架的对比中，AiCumi 需要补强的能力：

| 优先级 | 能力 | 参考框架 | 实现方式 |
|--------|------|----------|----------|
| **P0** | RAG 知识库 | LlamaIndex | 壳层接入 ChromaDB + 文档解析 |
| **P0** | Agent 评估 | CrewAI | 壳层实现用户反馈 + LLM-as-Judge |
| **P1** | 可视化编排 | LangGraph/CrewAI | 管理面实现拖拽式工作流 |
| **P2** | Agent 协作深度 | AutoGen/MetaGPT | 在群聊中支持 Agent 自由讨论 |

### 一句话结论

> **五大框架是"Agent 编排的瑞士军刀"，AiCumi 是"AI 团队的产品化壳"。我们不需要替换引擎，但需要从框架中借鉴能力（RAG、评估、编排），在壳层实现，让产品更强大。**
