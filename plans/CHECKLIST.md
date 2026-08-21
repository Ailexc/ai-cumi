# AG2 迁移开发 Checklist

> 更新时间：2026-08-21（已按实际代码与线上运行状态核对）
> 阶段：迁移进行中（后端骨架已跑通，真实 AG2 对话/群聊/核心 API 待补齐）

---

## 🔴 当前真相

**实际状态：服务已在线跑起来，私聊通路（mock 模式）可用，但真实 AG2 对话、群聊编排、成员档案/技能/渠道等核心 API 尚未实现，前端大量调用会 404。**

- Docker 双容器已运行：`chat-server`（FastAPI :8000）+ `web`（Nginx 反代）
- 实测 `/health` 正常，3 个默认 Agent（可灵/小研/小码）在线
- 后端仅实现约 15 个路由，**前端实际依赖约 30 个 API 路径** → 缺口约一半

> 注：`server/` → `backend/`、`packages/web/` → `frontend/` 已重构（commit `8d059b2`），
> 本文档所有路径均已更新为新结构。

---

## 📁 现有资产盘点（2026-08-21 实盘）

### ✅ 已存在且可用/基本可用

| 资产 | 路径 | 状态 | 说明 |
|------|------|------|------|
| Docker 部署 | `docker-compose.yml` + `backend/Dockerfile` + `frontend/Dockerfile` | ✅ 可用 | chat-server(8000) + web 双容器运行中 |
| FastAPI 主应用 | `backend/app/main.py` | ✅ 可运行 | 15 个路由，含 CORS/lifespan/初始化 |
| AgentManager 骨架 | `backend/app/agents/agent_manager.py` | 🟡 半成品 | AG2 import 已修（autogen_agentchat），但走 mock 模式，`_real_respond` 是 TODO |
| GroupChatManager | `backend/app/agents/agent_manager.py` | 🟡 已写未接线 | 类已实现但 main.py 从未使用 |
| WebSocket 管理 | `backend/app/chat/websocket_manager.py` | ✅ 可用 | 连接管理 + 流式协议（chat.chunk/done） |
| 模型管理（完整） | `backend/app/services/model_service.py` | ✅ 完整 | Fernet 加密 + CRUD + 测试连接，超预期 |
| SQLAlchemy 模型 | `backend/app/models/__init__.py` | 🟡 已建表 | 4 张表（model_configs/messages/members/rooms），仅 model_configs 被使用 |
| 数据库 | `backend/data/aicumi.db` | ✅ 存在 | SQLite，表结构已建 |
| 配置 | `backend/app/config.py` | ✅ 可加载 | pydantic-settings + .env |
| 依赖清单 | `backend/requirements.txt` | ✅ 可用 | 已装入 Docker 镜像 |
| 前端代码 | `frontend/` | ✅ 完整 | React 19 + Tailwind v4，含模型/成员/技能/渠道/群聊全套 UI |
| 前端 WS 对接 | `frontend/src/hooks/useChatSocket.ts` | 🟡 已对接 | 连 `/ws` 同源协议，含未读角标/流式渲染；但后端缺 group.* 处理 |
| 迁移计划 | `plans/` | ✅ 完整 | 架构 + 计划 + 本 checklist |
| 测试脚本 | `backend/test_api.py` | 🟡 未在项目环境跑过 | 宿主机 venv 无依赖，只能容器内跑 |

### ❌ 缺失/需新建

| 缺失项 | 现状 |
|--------|------|
| **真实 AG2 对话** | `_real_respond` 为 TODO，模型管理与 Agent 未绑定（`/api/models` 为空） |
| **群聊后端** | WS 不处理 `group.create`/`group.add-member`；REST 群聊调用不存在的 `send_group_message` 会报错 |
| **成员档案 API** | 前端调用 `/api/members/{id}` 的 identity/persona/refine/memory/reindex/skills/audit/files/history/model —— **全部缺失** |
| **技能 API** | 仅有 `GET /api/skills` stub；前端需要的 `/api/skills/catalog`、绑定/执行端点缺失 |
| **渠道 API** | `/api/channels*` 全套（账号管理/toggle/restart/templates）缺失 |
| **人设模板/角色** | `/api/persona-templates`、`/api/roles` 缺失 |
| **员工向导** | `/api/staff`、`/api/staff/preview` 缺失 |
| **消息持久化** | `chat.history` 返回空，messages 表未写 |
| **房间/成员 CRUD** | `/api/rooms`、`/api/members` 为硬编码/stub，无持久化 |
| **记忆系统** | 无实现（前端 memory/reindex 已就绪） |
| **宿主机 venv** | 根 `.venv` 是 Python 3.9.6 + mkdocs（文档用），后端依赖只在 Docker 镜像里 |

---

## 📋 Checklist（按当前真实优先级重排）

### 阶段一：环境与骨架（✅ 基本完成）

- [x] Docker 双容器可启动，`/health` 正常，3 个默认 Agent 在线
- [x] AG2 import 路径验证通过（`autogen_agentchat.agents.AssistantAgent`）
- [x] `agent_manager.py` / `config.py` / `main.py` 可正常加载运行
- [x] 目录重构完成（backend/ + frontend/ 分离）
- [x] SQLite 表结构建好（model_configs/messages/members/rooms）
- [ ] 根 `.venv` 安装后端依赖（或明确只走 Docker，更新 README 说明）
- [ ] README 更新为新结构（当前仍描述旧 packages/ + OpenClaw 方案）

### 阶段二：真实 AG2 对话打通（🔴 当前最高优先级）

- [ ] Agent ↔ 模型绑定：AgentManager 从模型管理选择默认模型（解密 key 建真实 OpenAIChatCompletionClient）
- [ ] 实现 `_real_respond`（真实 AssistantAgent 流式调用）
- [ ] WS `chat.send` 支持真实流式（chat.chunk 多段推送，而非一次性整段）
- [ ] REST `/api/chat/send` 复用真实 Agent
- [ ] 保留 mock 兜底（无 key 时可配置降级）

### 阶段三：核心 API 补齐（🔴 前端已就绪、后端缺口大）

- [ ] 成员档案：`/api/members/{id}` 详情 + identity/persona/refine/model
- [ ] 记忆：`/api/members/{id}/memory` 读写 + `reindex`
- [ ] 技能：`/api/skills/catalog` + `/api/members/{id}/skills` 绑定/解绑/执行
- [ ] 审计：`/api/members/{id}/audit` 操作日志
- [ ] 历史/文件：`/api/members/{id}/history` + `/files`
- [ ] 人设模板/角色：`/api/persona-templates`、`/api/roles`
- [ ] 渠道：`/api/channels*`（账号/toggle/restart/templates）
- [ ] 员工向导：`/api/staff` + `/preview`
- [ ] 房间 CRUD 持久化（SQLite），替代硬编码 stub

### 阶段四：群聊后端 + AG2 GroupChat 编排

- [ ] GroupChatManager 接入 main.py（lifespan 初始化 + 注入 AgentManager）
- [ ] WS 协议补 `group.create` / `group.add-member` / `group.remove` / `group.list`
- [ ] 修复 REST `/api/chat/send` 群聊分支（改用 GroupChatManager）
- [ ] @ 提及路由（`mentions` → 定向 Agent）
- [ ] 群主/默认响应（不 @ 时由 owner agent 响应）
- [ ] 真实 AG2 GroupChat 多 Agent 编排（可选进阶）

### 阶段五：消息持久化

- [ ] 写入 messages 表（user/assistant 消息落库）
- [ ] `chat.history` 从 DB 读取（按 room_id）
- [ ] 多端同步一致性验证

### 阶段六：功能完善

- [ ] 未读角标后端化（当前前端本地实现）
- [ ] 人设精修向导（依赖阶段三的 persona/refine 后端）
- [ ] 技能系统打通（绑定后 Agent 真实调用工具）

### 阶段七：测试与文档

- [ ] `test_api.py` 在 Docker 容器内跑通全量
- [ ] 补前端缺口端点的集成测试
- [ ] 性能验证（响应时间 < 2s）
- [ ] 重写 README（新结构 + 部署说明）
- [ ] 清理过时文档（如描述旧结构的 HANDOFF/RESEARCH）

---

## 📊 进度统计（2026-08-21 实测）

| 阶段 | 状态 | 进度 | 预计工时 |
|------|------|------|----------|
| 阶段一：环境骨架 | 🟢 基本完成 | ~95% | 已投入 |
| 阶段二：真实 AG2 对话 | 🟡 通路通/mock | ~60% | 1-2天 |
| 阶段三：核心 API | 🟡 模型管理完整，其余缺 | ~45% | 3-5天 |
| 阶段四：群聊编排 | 🔴 未接线 | ~5% | 2-3天 |
| 阶段五：消息持久化 | 🔴 未开始 | ~10% | 1天 |
| 阶段六：功能完善 | 🔴 未开始 | ~10% | 1-2天 |
| 阶段七：测试文档 | 🟡 Docker 化完成 | ~30% | 1-2天 |
| **整体** | | **~45%** | **剩余约 9-16 天** |

---

## ⚠️ 已知问题

1. **前后端 API 缺口**：前端依赖约 30 个 `/api/*` 路径，后端仅实现 15 个 → 成员档案/技能/渠道/员工向导等页面会 404
2. **mock 模式**：默认 `mock_mode=true`，`/api/models` 为空，Agent 回复是模拟文案；真实 AG2 未接
3. **群聊协议不匹配**：前端发 `group.create`/`group.add-member`，后端 WS 回 `Unknown message type`
4. **REST 群聊会崩**：`/api/chat/send` group 分支调用 `agent_manager.send_group_message`（不存在的方法）
5. **历史不落库**：`chat.history` 返回空数组
6. **宿主机 venv**：根 `.venv` 是 Python 3.9.6 + mkdocs，与后端无关；后端依赖只在 Docker 镜像
7. **README 过时**：仍描述旧 `packages/` + OpenClaw 方案
