# AiCumi · AI 伙伴

> **个人云端 24/7 的私人 AI 助理团队 —— 有你自己的聊天窗口，管理面点一点就能配置。**
>
> 立项日期：2026-08-16 ｜ 状态：AG2 迁移进行中（P0-P3 已完成）

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

## 目录结构

```
AiCumi/
├── backend/                            # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py                     # 入口：lifespan 初始化 + REST + WS
│   │   ├── config.py                   # pydantic-settings 配置
│   │   ├── database.py                 # SQLite + 主密钥持久化
│   │   ├── models/__init__.py          # SQLAlchemy 模型（模型/消息/成员/审计/技能/渠道）
│   │   ├── agents/agent_manager.py     # AG2 Agent 管理 + 群聊编排
│   │   ├── chat/websocket_manager.py   # WS 连接管理 + 流式协议
│   │   ├── services/                   # 模型管理 / 消息存储 / 静态数据
│   │   └── api/                        # 成员 / 技能 / 员工向导 / 渠道 路由
│   ├── data/                           # SQLite + 工作目录（gitignore）
│   ├── requirements.txt
│   ├── test_api.py                     # 全量 API 测试（42 项）
│   ├── Dockerfile
│   └── start.sh
├── frontend/                           # React 前端
│   ├── src/components/workspace/       # 工作台（消息/成员/模型/技能/渠道/群聊）
│   ├── src/hooks/useChatSocket.ts      # WS 协议（流式 + 未读角标）
│   ├── Dockerfile / nginx.conf
│   └── vite.config.ts
├── plans/                              # 迁移计划 + CHECKLIST
├── docs/                               # 设计 / 调研 / 交接文档
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

### 消息（P0）
- ✅ 私聊（1 用户 ↔ 1 Agent）与群聊（多 Agent 编排）
- ✅ **真实 AG2 对话**：模型管理配置 API Key → 启动自动绑定默认模型（当前默认：MIMO `custom/mimo-v2.5`）
- ✅ **增量流式**：WS `chat.chunk` 逐字推送（真实 token 流）
- ✅ **思考内容剥离**：自动剔除 MiMo/R1 等推理模型的内心独白，只显示最终回答
- ✅ 群聊 @ 路由：@ 谁谁响应；不 @ 时群主（值班）响应
- ✅ 消息持久化 + 历史加载（`chat.history` 从 DB 读，重启不丢）
- ✅ mock 兜底：未配置模型时自动降级为模拟回复

### 成员管理（P2）
- ✅ 成员列表 / 档案概览（岗位职责 / 技能 / 人设 / 记忆状态）
- ✅ 人设编辑 + 精修向导（模板快速开始，增量写入 + 自动备份）
- ✅ 记忆系统（从对话历史重建索引）
- ✅ 技能市场：目录浏览 + 绑定/解绑
- ✅ 员工向导：角色 → 人设预览 → 入职
- ✅ 切换模型（per-agent 模型绑定，重启不丢）
- ✅ 离职（自动备份工作目录）
- ✅ 审计日志（人设/资料/模型/记忆等写操作）

### 模型管理（P0/P2）
- ✅ 多模型配置 CRUD（API Key Fernet 加密存储）
- ✅ 测试连接（实时延迟）
- ✅ 默认模型自动检测 + 成员级模型覆盖

### 渠道管理（P2）
- ✅ 渠道配置（飞书/Telegram/WhatsApp/Slack/Discord 模板）
- ✅ 账号管理 / 启停切换 / 重启（接入外部 IM 的网关为后续里程碑）

### 系统
- ✅ Docker 化部署（双容器）
- ✅ SQLite 数据持久化（宿主挂载）
- ✅ 全量 API 测试（42 项）

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
| 聊天 | `POST /api/chat/send`、`WS /ws` |
| 房间 | `GET/POST /api/rooms` |
| 成员 | `GET /api/members`、`GET/DELETE /api/members/{id}`、persona/refine/identity/model/memory/reindex/skills/audit/history/files |
| 技能 | `GET /api/skills/catalog`、`GET /api/skills` |
| 员工向导 | `GET /api/roles`、`GET /api/persona-templates`、`POST /api/staff(preview)` |
| 渠道 | `GET /api/channels`、`templates/toggle/accounts/restart` |
| 模型 | `GET/POST /api/models`、`GET/PUT/DELETE /api/models/{id}`、`POST /api/models/{id}/test` |

## 里程碑状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 真实 AG2 对话（模型绑定 + 流式） | ✅ 完成 |
| P1 | 群聊后端（GroupChat + @ 路由） | ✅ 完成 |
| P2 | 核心 API（成员/技能/员工/渠道/模型绑定） | ✅ 完成 |
| P3 | 消息持久化 | ✅ 完成 |
| P4 | 测试 + 文档 | 🔄 进行中 |
| 后续 | 渠道网关真实接入 / 记忆增强 / 技能真实工具调用 | ⏳ 规划 |

详见 `plans/CHECKLIST.md`。
