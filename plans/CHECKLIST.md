# AiCumi 开发 Checklist

> 更新时间：2026-08-22
> 项目定位：**个人学习作品**（后端 → Agent 开发转型）
> 目标：功能全面对标业界，面试有东西可讲
> 主要框架：AG2（微软 AutoGen 继任者，60K+ Stars）

---

## 🔴 当前真相

**实际状态：核心链路已跑通，Agent 能力栈全面完成，RAG 知识问答已上线。**

- 服务：`chat-server`（FastAPI :8000）+ `web`（Nginx 反代）容器化运行
- 模型：MiMo `custom/mimo-v2.5`（api.xiaomimimo.com）+ 千问 `qwen3.7-text-embedding`
- 后端：47 个 Python 文件，100+ API 端点
- 前端：37 个 TS/TSX 文件，10+ 功能页面
- Docker：两个镜像全新构建，全链路验证通过

---

## ✅ 已完成（全部模块）

### 基础架构（✅ 100%）
- [x] AG2 框架集成（Python FastAPI + AG2 AgentChat）
- [x] 模型管理（MiMo 默认 + per-agent 绑定 + 加密存储）
- [x] 消息持久化（SQLite + 多端同步）
- [x] Docker 容器化部署（双容器：chat-server + web）

### 对话能力（✅ 100%）
- [x] 私聊：1 用户 ↔ 1 Agent，WS 流式输出
- [x] 群聊：多 Agent 群聊 + @提及路由 + 群主值班响应
- [x] 思考指示器：推理模型思考过程可视化（`chat.thinking` 事件）

### 管理面（✅ 100%）
- [x] 成员管理：35+ 个 API 端点（CRUD + 档案 + 人设 + 技能 + 记忆）
- [x] 人设系统：精修向导 + 5 套模板 + 增量写入 + 自动备份
- [x] 模型管理：多模型配置 + 切换 + 测试连接 + 能力参数 + 计费限量
- [x] 渠道管理：配置层（飞书/Telegram/WhatsApp/Slack/Discord）
- [x] 审计日志：所有写操作追溯

### 测试与文档（✅ 100%）
- [x] API 测试：42 项全绿
- [x] WS 测试：11 项全绿
- [x] 浏览器冒烟：13 项通过
- [x] 竞品调研：`docs/COMPETITIVE-LANDSCAPE-2026.md`
- [x] 能力规划：`docs/CAPABILITY-PLAN-2026.md`

### 云空间 + RAG 知识问答（✅ 100%）
- [x] **云空间文件管理**：文件树 / 上传 / 删除 / 新建文件夹 / 搜索
- [x] **文档预览**：Markdown / 代码高亮 / PDF 图片 / 图片灯箱
- [x] **多格式文档解析**：PDF（pymupdf）/ Markdown / DOCX（python-docx）/ HTML（beautifulsoup4）
- [x] **3 种分块策略**：固定长度 / 递归切分 / Markdown 标题层级
- [x] **DashScope Embedding**：千问 qwen3.7-text-embedding 适配（URL 去重 + 自动分批 25 条/次）
- [x] **3 种检索模式**：向量 / 关键词 / 混合（RRF 融合 + score 归一化）
- [x] **ChromaDB 索引管理**：增删改查 + 全量重建
- [x] **RAG 实验室页面**：分块/检索/Embedding 可视化调参 + 检索测试
- [x] **Agent 对话集成**：knowledge_scope 参数 + Prompt 注入 + 引用溯源
- [x] **模型配置增强**：能力参数面板 + 计费限量面板 + 千问测试 404 修复
- [x] **数据库迁移**：model_configs 新增 13 个字段 + knowledge_documents + rag_settings 表

### P0 工具调用（✅ 100%）
- [x] ToolRegistry + 6 内置工具 + Agent 绑定 + 前端 UI

### P0 记忆增强（✅ 100%）
- [x] ChromaDB + VectorMemory + REST API

### P1 Human-in-the-loop（✅ 100%）
- [x] 审批系统 + API + 前端面板

### P1 文件/代码处理（✅ 100%）
- [x] 内置工具（file_read/write/code_execute）

### P1 可观测性（✅ 100%）
- [x] TracingSystem + API + 前端面板

### 统一配置中心（✅ 100%）
- [x] 5 种模型类型 + 按类型管理 + 前端 Tab + 能力参数 + 计费限量

### P2 工作流编排（✅ 100%）
- [x] WorkflowEngine + 顺序/条件/并行 + 前端面板

### P2 分布式 Agent（✅ 100%）
- [x] AG2 gRPC Worker Runtime + 双 Worker + 健康检查 + 故障恢复

---

## 📊 进度统计

| 模块 | 状态 | 说明 |
|------|------|------|
| 基础架构 | ✅ 100% | AG2 + FastAPI + SQLite + Docker |
| 对话能力 | ✅ 100% | 私聊 + 群聊 + 流式 + 思考指示 |
| 管理面 | ✅ 100% | 成员/人设/模型/渠道/审计 |
| 测试文档 | ✅ 100% | 42 API + 11 WS + 冒烟 |
| **核心功能** | **✅ 100%** | 可正常使用的多 Agent 聊天平台 |
| P0 工具调用 | ✅ 100% | ToolRegistry + 6 内置工具 + Agent 绑定 + 前端 UI |
| P0 记忆增强 | ✅ 100% | ChromaDB + VectorMemory + REST API |
| P1 Human-in-the-loop | ✅ 100% | 审批系统 + API + 前端面板 |
| P1 文件/代码处理 | ✅ 100% | 内置工具（file_read/write/code_execute） |
| P1 可观测性 | ✅ 100% | TracingSystem + API + 前端面板 |
| 统一配置中心 | ✅ 100% | 5种模型类型 + 按类型管理 + 前端 Tab + 能力参数 + 计费限量 |
| P2 工作流编排 | ✅ 100% | WorkflowEngine + 顺序/条件/并行 + 前端面板 |
| P2 分布式 Agent | ✅ 100% | AG2 gRPC Worker Runtime + 双 Worker + 健康检查 |
| **云空间** | **✅ 100%** | 文件管理 + 多格式预览（MD/PDF/代码/图片）|
| **RAG 知识问答** | **✅ 100%** | 解析/分块/Embedding/检索/索引/Agent 集成/RAG 实验室 |
| **整体进度** | **✅ 100%** | 全部规划模块已完成 |

---

## 🎯 下一阶段：全部规划模块已完成

> 所有 P0/P1/P2 模块均已实现，包括最新的云空间 + RAG 知识问答系统。

### 已完成的全部模块

| 优先级 | 模块 | 面试价值 |
|--------|------|----------|
| P0 | 工具调用 + 记忆增强 | ⭐⭐⭐⭐⭐ |
| P1 | Human-in-the-loop + 文件处理 + 可观测性 | ⭐⭐⭐⭐ |
| P2 | 工作流编排 + 分布式 Agent | ⭐⭐⭐ |
| P2 | **云空间 + RAG 知识问答** | ⭐⭐⭐⭐⭐ |
| P2 | 模型配置增强（能力参数 + 计费限量） | ⭐⭐⭐ |

### 可选的后续方向（非必须）

| 方向 | 说明 | 价值 |
|------|------|------|
| 外部 IM 接入 | 飞书/Telegram/WhatsApp 真实对接 | 产品完善 |
| 多租户 | 每用户独立数据隔离 | 架构深度 |
| Rerank 重排序 | Cohere/Jina Rerank API 集成 | RAG 深度 |
| 语义分块 | 基于 Embedding 的语义边界切分 | RAG 深度 |
| 对话历史搜索 | 全文搜索 + 语义搜索历史消息 | 产品体验 |

#### 1. 工具调用（FunctionTool）✅
> Agent 能调用搜索/代码/API，从"聊天机器人"升级为"能做事的 Agent"

- [x] **1.1 工具注册系统**
  - 实现 `ToolRegistry`：注册/查询/列出工具
  - AG2 `FunctionTool` 集成
  - 工具元数据（名称/描述/参数/返回值）

- [x] **1.2 内置工具**
  - `web_search`：网络搜索（可接入 Serper/Bing API）
  - `code_execute`：Python 代码执行（Docker 沙箱或 subprocess）
  - `file_read` / `file_write`：文件读写
  - `json_parse`：JSON 解析
  - `datetime_utils`：日期时间工具

- [x] **1.3 Agent 工具绑定**
  - Agent 创建时绑定工具列表
  - 可灵：`web_search` + `datetime_utils`
  - 小研：`web_search` + `json_parse` + `datetime_utils`
  - 小码：`code_execute` + `file_read` + `file_write` + `json_parse`

- [x] **1.4 前端集成**
  - 工具箱页面：`/api/tools` 列表 + 工具详情 + 测试按钮
  - Agent 工具绑定管理：`/api/agents/{id}/tools`
  - 导航栏新增「工具箱」入口

**面试话术**："我用 AG2 的 FunctionTool 实现了工具调用，Agent 可以搜索网络、执行代码、读写文件，从聊天机器人升级为能做事的 Agent。"

#### 2. 记忆增强（向量检索）✅
> 跨会话记忆，Agent 能"记住"用户偏好和历史对话

- [x] **2.1 向量数据库集成**
  - ChromaDB 集成（本地向量库，零依赖）
  - 实现 `VectorMemory` 类：存储/检索/删除
  - 自动 fallback 到内存存储

- [x] **2.2 Embedding 集成**
  - OpenAI Embedding API（text-embedding-3-small）
  - 自动 fallback 到关键词匹配

- [x] **2.3 记忆管理 API**
  - `POST /api/memory/{agent_id}/add`：添加记忆
  - `POST /api/memory/{agent_id}/search`：搜索记忆
  - `GET /api/memory/{agent_id}/list`：列出记忆
  - `DELETE /api/memory/{memory_id}`：删除记忆
  - `GET /api/memory/stats`：系统状态

- [x] **2.4 Agent 记忆集成**
  - Agent 启动时加载相关记忆到 system_message
  - 对话过程中动态检索相关记忆（save_exchange + search）

**面试话术**："我用 ChromaDB 实现了向量记忆，支持语义检索和跨会话持久化。Agent 能记住用户偏好和历史对话，提供更个性化的服务。"

---

### P1 · 面试加分能力（✅ 已完成）

**目标**：展示 Agent 系统的工程化水平

#### 3. Human-in-the-loop ✅
> Agent 在关键节点请求人类审核，体现人机协作理念

- [x] **3.1 审批系统**
  - `HumanApprovalManager`：请求/等待/解决审批
  - `ApprovalRequiredTool`：包装器，自动要求审批
  - 前端审批面板：待审批列表 + 审批历史

- [x] **3.2 API 端点**
  - `GET /api/approval/pending`：待审批列表
  - `GET /api/approval/history`：审批历史
  - `POST /api/approval/{id}/resolve`：批准/拒绝
  - `GET /api/approval/stats`：统计数据

**面试话术**："我实现了 Human-in-the-loop 机制，Agent 在执行敏感操作前会请求人类审核。这体现了人机协作的理念，也是生产级 Agent 的必备能力。"

#### 4. 文件/代码处理 ✅
> Agent 能处理文件和代码，提升实际任务处理能力

- [x] **4.1 内置工具**
  - `file_read`：文件读取（安全沙箱）
  - `file_write`：文件写入（安全沙箱）
  - `code_execute`：Python 代码执行（subprocess）
  - `json_parse`：JSON 解析
  - `datetime_utils`：日期时间工具

**面试话术**："我实现了文件处理和代码执行能力，Agent 可以上传文件、执行代码、分析数据，处理更复杂的实际任务。"

#### 5. 可观测性（Tracing）✅
> Agent 执行过程可视化，体现工程化能力

- [x] **5.1 追踪系统**
  - `TracingSystem`：追踪管理器
  - 事件类型：agent_start/end、tool_call/result、model_call/response、memory_query/add、error
  - 上下文管理器：`trace_tool_call`

- [x] **5.2 API 端点**
  - `GET /api/tracing/traces`：追踪列表
  - `GET /api/tracing/traces/{id}`：追踪详情
  - `GET /api/tracing/stats`：统计数据

- [x] **5.3 前端集成**
  - 追踪面板：追踪列表 + 事件详情 + 统计卡片
  - 导航栏新增「审批」和「追踪」入口

- [x] **5.3 性能监控**
  - 响应时间统计（avg/p50/p95/max）
  - 模型调用次数
  - 错误率统计

**面试话术**："我实现了 Agent 执行追踪系统，可以可视化 Agent 的调用链、工具使用、模型调用等过程，方便调试和优化。"

---

### P2 · 技术深度展示（选做，4-6 周）

**目标**：展示技术深度，可作为"后续规划"在面试中提及

#### 6. 工作流编排 ✅
> 复杂任务的多步骤协作，展示编排能力

- [x] **6.1 工作流引擎（DAG）**
  - `WorkflowEngine`：DAG 建模（节点 + 连线），取代旧链式 demo 引擎
  - 节点类型：agent_call、tool_call、condition、transform、human_review
  - 条件表达式：安全 AST 求值器（`data["x"] > 0.5`），模板渲染 `{{ input.field }}`

- [x] **6.2 真实执行（接线真实能力）**
  - `agent_call` → `agent_manager.send_message()`（真实 AG2 Agent）
  - `tool_call` → `tool_registry.execute()`（真实内置工具）
  - `human_review` → `HumanApprovalManager`（HITL 审批）
  - 保留 mock 开关便于学习/测试

- [x] **6.3 SQLite 持久化**
  - `workflow_defs` 表存定义、`workflow_runs` 表存运行历史
  - 服务重启不丢工作流与运行记录

- [x] **6.4 API 端点**
  - `GET/POST /api/workflows`、`PUT/DELETE /api/workflows/{id}`
  - `POST /api/workflows/{id}/duplicate`、`/execute`（支持 background）、`/cancel`
  - `GET /api/workflows/{id}/runs`（运行历史）、`GET /api/workflows/stats`
  - `GET /api/workflow-templates`、`POST /api/workflows/from-template`（模板库）

- [x] **6.5 可视化编辑器（React Flow）**
  - 左侧工具箱拖入节点 → 画布连线 → 右侧属性面板配置
  - 条件节点「是 / 否」双出线；运行态节点高亮（成功/失败/跳过/等待）
  - 运行历史面板 + 节点输入输出可查（学习导向）

**面试话术**："我用 DAG + React Flow 实现了可视化工作流编排平台：拖拽搭建多步骤流程，每一步真实调用 AG2 Agent 和内置工具，支持条件分支、并行、人工审批节点，定义与运行历史 SQLite 持久化。"

#### 7. 分布式 Agent ✅
> Agent 分布在不同机器，展示系统设计能力

- [x] **7.1 Worker Runtime**
  - AG2 gRPC Worker Runtime 集成
  - Agent 远程注册/调用
  - DistributedProxyAgent 委托执行

- [x] **7.2 负载均衡**
  - 多 Agent 实例管理
  - 请求分发策略（轮询 / 随机 / 最少连接）

- [x] **7.3 故障恢复**
  - Agent 健康检查
  - 自动重启/迁移

**面试话术**："我用 AG2 的 gRPC Worker Runtime 实现了分布式 Agent 架构，支持多 Worker 节点、负载均衡和自动故障恢复，展示了从单机到分布式的系统设计能力。"

---

## 📅 执行计划（已完成）

### 阶段 1：核心能力 ✅

| 周 | 任务 | 产出 |
|----|------|------|
| 第 1 周 | 工具调用 | FunctionTool + 搜索/代码工具 |
| 第 2 周 | 记忆增强 | ChromaDB + 向量检索 |
| 第 3 周 | 联调测试 | 工具+记忆端到端验证 |

### 阶段 2：工程化能力 ✅

| 周 | 任务 | 产出 |
|----|------|------|
| 第 4 周 | Human-in-the-loop | 中断/恢复机制 |
| 第 5 周 | 文件处理 | 文件上传/代码执行 |
| 第 6 周 | 可观测性 | 执行追踪 + 日志 |

### 阶段 3：技术深度 ✅

| 周 | 任务 | 产出 |
|----|------|------|
| 第 7-9 周 | 工作流编排 | 图编排 + 条件分支 |
| 第 10-12 周 | 分布式 Agent | gRPC + Worker Runtime |

### 阶段 4：知识问答 ✅

| 周 | 任务 | 产出 |
|----|------|------|
| 第 13-15 周 | 云空间 + RAG | 文件管理 + 知识问答全链路 |
| 第 16 周 | 模型配置增强 | 能力参数 + 计费限量 + 千问修复 |

---

## 💰 成本估算（已完成）

| 阶段 | 内容 | 工作量 | 面试价值 |
|------|------|--------|----------|
| **阶段 1** | 工具调用 + 记忆增强 | 3 周 | ⭐⭐⭐⭐⭐ |
| **阶段 2** | Human-in-the-loop + 文件处理 + 可观测性 | 3 周 | ⭐⭐⭐⭐ |
| **阶段 3** | 工作流编排 + 分布式 Agent | 6 周 | ⭐⭐⭐ |
| **阶段 4** | 云空间 + RAG 知识问答 + 模型增强 | 4 周 | ⭐⭐⭐⭐⭐ |
| **总计** | 全部能力 | **16 周** | |

---

## ⚠️ 已知限制

1. ~~**工具调用未实现**~~ ✅ 已完成
2. ~~**记忆系统基础**~~ ✅ 已完成（向量检索 + ChromaDB）
3. ~~**无 Human-in-the-loop**~~ ✅ 已完成
4. ~~**无文件/代码处理**~~ ✅ 已完成
5. ~~**无可观测性**~~ ✅ 已完成
6. ~~**无工作流编排**~~ ✅ 已完成
7. ~~**无分布式 Agent**~~ ✅ 已完成
8. ~~**无云空间 / RAG**~~ ✅ 已完成（云空间 + RAG 知识问答全链路）

**当前无阻塞性限制。所有规划模块均已完成。**

---

## 📚 参考资源

- [AG2 官方文档](https://microsoft.github.io/autogen/)
- [AG2 FunctionTool](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/tool-use.html)
- [ChromaDB 文档](https://docs.trychroma.com/)
- [竞品调研](docs/COMPETITIVE-LANDSCAPE-2026.md)
- [能力规划](docs/CAPABILITY-PLAN-2026.md)

---

## 📝 面试话术汇总

### 项目介绍
> "我独立开发了一个多 Agent 协作平台 AiCumi，使用 AG2 框架（微软 AutoGen 继任者）实现了对话驱动的 Agent 编排。平台支持私聊和群聊，每个 Agent 有独立的人设、记忆和工具调用能力。同时实现了本地云空间文件管理和可配置的 RAG 知识问答系统。"

### 技术亮点
| 点 | 话术 |
|----|------|
| **群聊路由** | "我实现了 @提及 + 群主值班响应的群聊路由，比原生框架更贴近 IM 体验" |
| **人设系统** | "我设计了人设精修系统，支持模板库 + 增量写入 + 自动备份" |
| **工具调用** | "我用 AG2 的 FunctionTool 实现了工具调用，包括搜索、代码执行等" |
| **记忆系统** | "我用 ChromaDB 实现了向量记忆，支持跨会话的长期记忆" |
| **思考指示器** | "我实现了推理模型的思考过程可视化，提升了用户体验" |
| **RAG 知识问答** | "我实现了可配置的 RAG 系统：多格式文档解析 → 分块（fixed/recursive/markdown）→ 千问 Embedding → ChromaDB 索引 → 向量/关键词/混合检索 → Agent 集成。所有参数可通过 RAG 实验室可视化调参。" |
| **混合检索** | "我实现了向量 + 关键词的 Hybrid 检索，使用 Reciprocal Rank Fusion 融合两种排序结果，兼顾语义理解和精确匹配。" |
| **云空间** | "我做了一个本地云空间，支持文件管理 + 多格式高质量预览（Markdown/PDF/代码/图片），为 RAG 提供数据源。" |
| **DashScope 适配** | "千问 DashScope 的 Embedding API 和 OpenAI 格式不同，我做了专门的适配层，支持自动分批（25 条/次）和 URL 智能拼接。" |
| **分布式 Agent** | "我用 AG2 的 gRPC Worker Runtime 实现了分布式架构，支持多 Worker 节点、负载均衡和自动故障恢复。" |
| **模型配置增强** | "我设计了统一模型配置中心，支持 5 种模型类型，每个模型可配置能力参数（维度/窗口/视觉等）和计费限量（RPM/TPM/TPD），千问 Embedding 测试专门适配。" |

### 差异化
> "与其他 Agent 项目不同，我不仅实现了底层编排，还做了完整的产品层——Web UI、成员管理、群聊路由、云空间、RAG 知识问答。这让我理解了 Agent 系统从框架到产品的完整链路。"

### RAG 面试专项话术
> "我独立实现了一个可配置的 RAG 知识问答系统。系统包含本地云空间文件管理、多种文档解析（PDF/Markdown/DOCX）、可切换的分块策略（fixed/recursive/markdown）、多种检索模式（向量/关键词/Hybrid），Embedding 使用千问 DashScope。通过 RAG 实验室页面可以实时调整参数并对比效果。"

### RAG 面试追问参考
| 问题 | 回答 |
|------|------|
| 为什么选 ChromaDB 不选 Milvus？ | "个人项目优先零依赖和快速迭代。ChromaDB 嵌入式部署，无需额外容器。" |
| 分块大小怎么选？ | "默认 512 字符 + 128 重叠。太小会丢失上下文，太大检索不准。我在 RAG 实验室里可以实时调参对比。" |
| Hybrid 检索的融合策略？ | "使用 Reciprocal Rank Fusion（RRF），score = Σ 1/(k + rank_i)，k=60。不需要分数归一化，简单有效。" |
| 如何降低幻觉？ | "RAG 本身就降低幻觉。另外我让 Agent 在回答中标注引用来源，方便用户验证。" |
