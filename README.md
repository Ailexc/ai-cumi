# AiCumi · AI 伙伴

> **个人云端 24/7 的私人 AI 助理团队 —— 有你自己的聊天窗口，管理面点一点就能配置。**
>
> 立项日期：2026-08-16 ｜ 状态：**全部规划模块已完成（P0-P4 + 能力栈 + 云空间/RAG）**

## 名字含义

- **Cumi**：自造词，取"**积**累（accumulate）+ **陪**伴（companion）"之意 —— 帮你积累知识、陪伴你长期办公的 AI 伙伴。
- **AiCumi**：AI + Cumi，一个属于你、24/7 在线、有温度的私人 AI 助理团队。

## 一句话定位

一个**属于你个人的、云端的、全天候在线的 AI 助理团队**：用你自己的 token，通过**自有聊天窗口**（私聊/群聊）指挥一群有性格、有技能、能真正干活的 AI 员工，管理面做到"点一点"完成员工编排与渠道配置。外部 IM（飞书/Telegram…）作为可选的接入能力。

## 技术栈

- **引擎**：AG2（autogen-agentchat 0.7.5 + ag2 1.0.2）
- **后端**：Python 3.12 + FastAPI + WebSocket + SQLAlchemy/SQLite（Docker 容器运行）
- **前端**：React 19 + Vite + Tailwind CSS v4（Docker Nginx 托管）
- **部署**：Docker Compose（`chat-server` + `web` 双容器）
- **向量/检索**：ChromaDB + DashScope 千问 Embedding（qwen3.7-text-embedding）

## 目录结构

```
AiCumi/
├── backend/                            # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py                     # 入口：lifespan 初始化 + REST + WS
│   │   ├── agents/                     # AG2 Agent 管理 + 群聊编排
│   │   ├── chat/                       # WS 连接管理 + 流式协议
│   │   ├── tools/                      # ToolRegistry + 内置工具
│   │   ├── memory/                     # ChromaDB 向量记忆
│   │   ├── approval/                   # Human-in-the-loop 审批
│   │   ├── tracing/                    # 执行追踪
│   │   ├── workflow/                   # DAG 工作流引擎
│   │   ├── distributed/                # AG2 gRPC Worker Runtime
│   │   ├── cloud_space/                # 云空间文件管理 + 预览
│   │   ├── knowledge/                  # RAG 解析/分块/索引/检索
│   │   ├── settings/                   # RAG 实验室配置 API
│   │   ├── services/                   # 模型管理 / 消息存储 / 静态数据
│   │   └── api/                        # 成员 / 技能 / 员工向导 / 渠道 路由
│   ├── data/                           # SQLite + 工作目录（gitignore）
│   ├── requirements.txt
│   ├── test_api.py                     # 全量 API 测试
│   ├── test_ws.py                      # WS 协议测试
│   ├── Dockerfile
│   └── start.sh
├── frontend/                           # React 前端
│   ├── src/components/workspace/       # 工作台（消息/成员/模型/渠道/工具/审批/追踪/工作流/分布式）
│   │   ├── cloud-space/                # 云空间页面 + 多格式预览
│   │   ├── rag-lab/                    # RAG 实验室页面
│   │   └── workflow/                   # React Flow 可视化编排器
│   ├── src/hooks/useChatSocket.ts      # WS 协议（流式 + 未读角标）
│   ├── Dockerfile / nginx.conf
│   └── vite.config.ts
├── plans/                              # 迁移计划 + CHECKLIST
├── docs/                               # 调研 / 能力规划 / 技术文档
└── docker-compose.yml
```

## 快速开始（Docker）

> 开发与部署一律走 Docker + OrbStack，不在宿主机启动本地进程。

```bash
# 构建并启动
docker compose up -d --build

# 查看状态 / 日志
docker compose ps
docker compose logs -f chat-server
```

| 服务 | 访问 |
|------|------|
| 前端 UI | http://web.aicumi.orb.local |
| 后端 API / Swagger | http://chat-server.aicumi.orb.local/docs |

## 已实现功能

### 对话（P0）
- ✅ 私聊（1 用户 ↔ 1 Agent）与群聊（多 Agent 编排，@ 路由 + 群主值班响应）
- ✅ **真实 AG2 对话**：模型管理配置 API Key → 启动自动绑定默认模型（当前默认：MIMO `custom/mimo-v2.5`）
- ✅ **增量流式**：WS `chat.chunk` 逐字推送（真实 token 流）
- ✅ **思考内容剥离**：自动剔除 MiMo/R1 等推理模型的内心独白，只显示最终回答（含思考指示器）
- ✅ 消息持久化 + 历史加载（`chat.history` 从 DB 读，重启不丢）
- ✅ 真实模式：未配置模型时后端明确报错提示（不 mock 兜底，学习项目不降级）

### 成员管理（P2）
- ✅ 成员列表 / 档案概览（岗位职责 / 技能 / 人设 / 记忆状态）
- ✅ 人设编辑 + 精修向导（模板快速开始，增量写入 + 自动备份）
- ✅ 记忆系统（从对话历史自动存取 + 重建索引）
- ✅ 技能市场：目录浏览 + 绑定/解绑
- ✅ 员工向导：角色 → 人设预览 → 入职
- ✅ 切换模型（per-agent 模型绑定，重启不丢）
- ✅ 离职（自动备份工作目录）
- ✅ 审计日志（人设/资料/模型/记忆等写操作）

### Agent 能力栈（P0-P2）
- ✅ **工具调用**：ToolRegistry + 6 内置工具（web_search/code_execute/file_read/file_write/json_parse/datetime_utils）+ Agent 绑定 + 工具箱 UI
- ✅ **记忆增强**：ChromaDB + VectorMemory + REST API，跨会话语义检索
- ✅ **Human-in-the-loop**：审批系统 + API + 前端审批面板
- ✅ **可观测性**：TracingSystem（agent_start/end、tool_call、model_call、memory、error）+ 追踪面板 + 性能统计
- ✅ **工作流编排**：DAG 建模 + React Flow 可视化编辑器 + 真实执行（AG2 Agent/内置工具/审批节点）+ SQLite 持久化 + 模板库
- ✅ **分布式 Agent**：AG2 gRPC Worker Runtime + 双 Worker + 健康检查 + 故障恢复

### 云空间 + RAG 知识问答（P2）
- ✅ 云空间文件管理：文件树 / 上传 / 删除 / 新建文件夹 / 搜索
- ✅ 文档预览：Markdown / 代码高亮 / PDF 图片 / 图片灯箱
- ✅ 多格式文档解析：PDF（pymupdf）/ Markdown / DOCX / HTML
- ✅ 3 种分块策略：固定长度 / 递归切分 / Markdown 标题层级
- ✅ DashScope Embedding：千问 qwen3.7-text-embedding（URL 去重 + 自动分批 25 条/次）
- ✅ 3 种检索模式：向量 / 关键词 / 混合（RRF 融合）
- ✅ ChromaDB 索引管理：增删改查 + 全量重建
- ✅ RAG 实验室页面：分块/检索/Embedding 可视化调参 + 检索测试
- ✅ Agent 对话集成：knowledge_scope 参数 + Prompt 注入 + 引用溯源

### 统一配置中心（P2）
- ✅ 5 种模型类型（llm/embedding/vision/search/code）+ 按类型管理 + 前端 Tab
- ✅ 能力参数面板（维度/窗口/视觉/函数调用/流式）+ 计费限量面板（RPM/TPM/TPD/价格）
- ✅ 测试连接（LLM/Embedding 双路径，千问 DashScope 专门适配）

### 渠道管理（P2）
- ✅ 渠道配置（飞书/Telegram/WhatsApp/Slack/Discord 模板）
- ✅ 账号管理 / 启停切换 / 重启（接入外部 IM 的网关为后续里程碑）

### 系统
- ✅ Docker 化部署（双容器）
- ✅ SQLite 数据持久化（宿主挂载）
- ✅ 全量 API 测试（42 项）+ WS 测试（11 项）

## 开发规范

- **运行环境**：容器内 Python 3.12；宿主机根 `.venv` 是文档用（mkdocs），与后端无关。
- **代码热更新**：`backend/app` 已挂载进容器，改代码后 `docker compose restart chat-server` 生效（无 `--reload`）。
- **数据库**：`backend/data/aicumi.db` 宿主挂载持久化；主密钥存 `backend/data/.master_key`。
- **真实模式**：在「模型管理」页添加模型并标记为默认 → 重启后端即进入真实对话；不配置则自动 mock。

## API 一览

| 分组 | 端点 |
|------|------|
| 系统 | `GET /health` |
| Agent | `GET/POST /api/agents`、`GET/DELETE /api/agents/{id}` |
| 聊天 | `POST /api/chat/send`、`WS /ws`（含 knowledge_scope RAG 注入） |
| 房间 | `GET/POST /api/rooms` |
| 成员 | `GET /api/members`、`GET/DELETE /api/members/{id}`、persona/refine/identity/model/memory/reindex/skills/audit/history/files |
| 技能 | `GET /api/skills/catalog`、`GET /api/skills` |
| 员工向导 | `GET /api/roles`、`GET /api/persona-templates`、`POST /api/staff(preview)` |
| 渠道 | `GET /api/channels`、`templates/toggle/accounts/restart` |
| 模型 | `GET/POST /api/models`、`GET/PUT/DELETE /api/models/{id}`、`POST /api/models/{id}/test`、`GET /api/models/by-type` |
| 工具 | `GET /api/tools`、`GET /api/tools/{name}`、`enable/disable/execute`、`GET/POST/DELETE /api/agents/{id}/tools` |
| 记忆 | `GET /api/memory/stats`、`POST /api/memory/{agent_id}/add|search|clear`、`GET /api/memory/{agent_id}/list`、`DELETE /api/memory/{id}` |
| 审批 | `GET /api/approval/pending|history|stats`、`POST /api/approval/{id}/resolve` |
| 追踪 | `GET /api/tracing/stats|traces`、`GET /api/tracing/traces/{id}` |
| 工作流 | `GET/POST /api/workflows`、`PUT/DELETE /api/workflows/{id}`、`duplicate/execute/cancel/runs/stats`、`GET /api/workflow-templates`、`POST /api/workflows/from-template` |
| 分布式 | `GET /api/distributed/status|agents`、`POST /api/distributed/send|rebuild`、`workers/{id}/down|up` |
| 云空间 | `GET /api/files`、`GET /api/files/tree`、`POST /api/files/folder|upload|upload-batch`、`{path}/content|preview|download`、`DELETE /api/files/{path}` |
| 知识库 | `GET /api/knowledge/stats|documents`、`DELETE /api/knowledge/documents/{id}`、`POST /api/knowledge/index/{path}|reindex-all|query` |
| 设置 | `GET/PUT /api/settings/rag` |

## 里程碑状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 真实 AG2 对话（模型绑定 + 流式） | ✅ 完成 |
| P1 | 群聊后端（GroupChat + @ 路由） | ✅ 完成 |
| P2 | 核心 API（成员/技能/员工/渠道/模型绑定） | ✅ 完成 |
| P3 | 消息持久化 | ✅ 完成 |
| P4 | 测试 + 文档 | ✅ 完成 |
| 能力栈 | 工具调用 / 记忆 / HITL / 追踪 / 工作流 / 分布式 / 统一配置中心 | ✅ 完成 |
| 知识问答 | 云空间 + RAG 全链路 + RAG 实验室 | ✅ 完成 |
| 后续（可选） | 外部 IM 真实接入 / 多租户 / Rerank / 语义分块 / 对话历史搜索 | ⏳ 规划 |

详见 `plans/CHECKLIST.md`。
