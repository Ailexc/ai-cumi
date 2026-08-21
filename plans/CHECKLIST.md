# AiCumi 开发 Checklist

> 更新时间：2026-08-21
> 项目定位：**个人学习作品**（后端 → Agent 开发转型）
> 目标：功能全面对标业界，面试有东西可讲
> 主要框架：AG2（微软 AutoGen 继任者，60K+ Stars）

---

## 🔴 当前真相

**实际状态：核心链路已跑通，正在从"能用"向"全面"演进。**

- 服务：`chat-server`（FastAPI :8000）+ `web`（Nginx 反代）运行中
- 模型：MiMo `custom/mimo-v2.5`（api.xiaomimimo.com）
- 测试：API 42/42 + WS 11/11 全绿
- 前端：30+ API 路径，三段式飞书风格布局

---

## ✅ 已完成（核心功能）

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
- [x] 成员管理：35 个 API 端点（CRUD + 档案 + 人设 + 技能 + 记忆）
- [x] 人设系统：精修向导 + 5 套模板 + 增量写入 + 自动备份
- [x] 模型管理：多模型配置 + 切换 + 测试连接
- [x] 渠道管理：配置层（飞书/Telegram/WhatsApp/Slack/Discord）
- [x] 审计日志：所有写操作追溯

### 测试与文档（✅ 100%）
- [x] API 测试：42 项全绿
- [x] WS 测试：11 项全绿
- [x] 浏览器冒烟：13 项通过
- [x] 竞品调研：`docs/COMPETITIVE-LANDSCAPE-2026.md`
- [x] 能力规划：`docs/CAPABILITY-PLAN-2026.md`

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
| 统一配置中心 | ✅ 100% | 5种模型类型 + 按类型管理 + 前端 Tab |
| P2 工作流编排 | ✅ 100% | WorkflowEngine + 顺序/条件/并行 + 前端面板 |
| **整体进度** | **~99%** | 剩余：P2 分布式 Agent（选做） |

---

## 🎯 下一阶段：Agent 能力增强

> 基于项目定位（个人学习作品，后端 → Agent 开发转型），下一步重点是实现业界主流的 Agent 能力，提升面试竞争力。

### P0 · 面试必讲能力（✅ 已完成）

**目标**：掌握 Agent 开发的核心能力，面试必问

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

- [ ] **2.4 Agent 记忆集成**（下一步）
  - Agent 启动时加载相关记忆到 system_message
  - 对话过程中动态检索相关记忆

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

- [ ] **5.3 性能监控**
  - 响应时间统计
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

#### 7. 分布式 Agent 🔴
> Agent 分布在不同机器，展示系统设计能力

- [ ] **7.1 Worker Runtime**
  - AG2 gRPC Worker Runtime 集成
  - Agent 远程注册/调用

- [ ] **7.2 负载均衡**
  - 多 Agent 实例管理
  - 请求分发策略

- [ ] **7.3 故障恢复**
  - Agent 健康检查
  - 自动重启/迁移

**面试话术**："我研究了 AG2 的分布式架构，实现了跨机器的 Agent 协作，支持负载均衡和故障恢复。"

---

## 📅 建议执行计划

### 阶段 1：核心能力（第 1-3 周）

| 周 | 任务 | 产出 |
|----|------|------|
| 第 1 周 | 工具调用 | FunctionTool + 搜索/代码工具 |
| 第 2 周 | 记忆增强 | ChromaDB + 向量检索 |
| 第 3 周 | 联调测试 | 工具+记忆端到端验证 |

**面试收益**：
- "我实现了 Agent 的工具调用能力，包括搜索、代码执行、API 调用"
- "我用 ChromaDB 实现了向量记忆，支持跨会话的长期记忆"

### 阶段 2：工程化能力（第 4-6 周）

| 周 | 任务 | 产出 |
|----|------|------|
| 第 4 周 | Human-in-the-loop | 中断/恢复机制 |
| 第 5 周 | 文件处理 | 文件上传/代码执行 |
| 第 6 周 | 可观测性 | 执行追踪 + 日志 |

**面试收益**：
- "我实现了 Human-in-the-loop，Agent 在关键节点会请求人类审核"
- "我实现了文件处理和代码执行，Agent 能处理实际任务"
- "我实现了执行追踪系统，可以可视化 Agent 的调用链"

### 阶段 3：技术深度（第 7-12 周，选做）

| 周 | 任务 | 产出 |
|----|------|------|
| 第 7-9 周 | 工作流编排 | 图编排 + 条件分支 |
| 第 10-12 周 | 分布式 Agent | gRPC + Worker Runtime |

**面试收益**：
- "我研究了 AG2 的工作流编排，实现了复杂任务的多步骤协作"
- "我研究了 AG2 的分布式架构，实现了跨机器的 Agent 协作"

---

## 💰 成本估算

| 阶段 | 内容 | 工作量 | 面试价值 |
|------|------|--------|----------|
| **阶段 1** | 工具调用 + 记忆增强 | 2-3 周 | ⭐⭐⭐⭐⭐ |
| **阶段 2** | Human-in-the-loop + 文件处理 + 可观测性 | 3 周 | ⭐⭐⭐⭐ |
| **阶段 3** | 工作流编排 + 分布式 | 4-6 周 | ⭐⭐⭐ |
| **总计** | 全部能力 | **9-12 周** | |

---

## ⚠️ 已知限制

1. **工具调用未实现**：当前 Agent 只能聊天，不能执行实际任务（P0 待做）
2. **记忆系统基础**：当前基于消息聚合，无向量检索（P0 待做）
3. **无 Human-in-the-loop**：无审核机制（P1 待做）
4. **无文件/代码处理**：无法处理文件和代码（P1 待做）
5. **无可观测性**：只有基础审计日志（P1 待做）
6. **无工作流编排**：只有简单群聊路由（P2 待做）

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
> "我独立开发了一个多 Agent 协作平台 AiCumi，使用 AG2 框架（微软 AutoGen 继任者）实现了对话驱动的 Agent 编排。平台支持私聊和群聊，每个 Agent 有独立的人设、记忆和工具调用能力。"

### 技术亮点
| 点 | 话术 |
|----|------|
| **群聊路由** | "我实现了 @提及 + 群主值班响应的群聊路由，比原生框架更贴近 IM 体验" |
| **人设系统** | "我设计了人设精修系统，支持模板库 + 增量写入 + 自动备份" |
| **工具调用** | "我用 AG2 的 FunctionTool 实现了工具调用，包括搜索、代码执行等" |
| **记忆系统** | "我用 ChromaDB 实现了向量记忆，支持跨会话的长期记忆" |
| **思考指示器** | "我实现了推理模型的思考过程可视化，提升了用户体验" |

### 差异化
> "与其他 Agent 项目不同，我不仅实现了底层编排，还做了完整的产品层——Web UI、成员管理、群聊路由。这让我理解了 Agent 系统从框架到产品的完整链路。"
