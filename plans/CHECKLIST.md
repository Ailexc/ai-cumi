# AG2 迁移开发 Checklist

> 更新时间：2026-08-20
> 阶段：迁移启动前（尚未进入实际开发）

---

## 🔴 当前真相

**实际状态：代码框架已搭建，但服务跑不起来，依赖未安装，核心逻辑未实现。**

之前对话中产生的大量 `*-STATUS.md`、`*-REPORT.md`、`*-COMPLETE.md` 文件是 AI 循环生成的废文件，不代表真实进度。

---

## 📁 现有资产盘点

### ✅ 已存在的（可复用）

| 资产 | 路径 | 状态 | 说明 |
|------|------|------|------|
| Python 虚拟环境 | `learning/ag2-env/` | ✅ 可用 | ag2/fastapi/uvicorn 已安装 |
| FastAPI 骨架 | `server/app/main.py` | 🟡 半成品 | 有端点定义，但导入路径可能有问题 |
| AgentManager 骨架 | `server/app/agents/agent_manager.py` | 🟡 半成品 | 用了 `from ag2 import Agent`，需验证 AG2 0.7.5 的实际 API |
| WebSocket 骨架 | `server/app/chat/websocket_manager.py` | 🟡 半成品 | 基础连接管理，缺消息处理逻辑 |
| 配置文件 | `server/app/config.py` | 🟡 半成品 | 需验证能否正常加载 |
| 依赖清单 | `server/requirements.txt` | ✅ 可用 | 但未安装到项目 venv |
| 启动脚本 | `server/run.py`, `server/start.sh` | 🟡 半成品 | 依赖未装，跑不起来 |
| 测试脚本 | `server/test_api.py` | 🟡 半成品 | 服务跑不起来，无法测试 |
| 前端代码 | `packages/web/` | ✅ 完整 | React 前端，当前对接 OpenClaw |
| 迁移计划 | `plans/` | ✅ 完整 | 架构设计 + 实施计划 |
| AG2 学习笔记 | `learning/AG2-LEARNING-NOTES.md` | ✅ 可用 | 学习记录 |

### ❌ 不存在的（需要新建）

| 缺失项 | 说明 |
|--------|------|
| `server/app/api/` 路由文件 | **目录为空**，无任何 API 路由实现 |
| 数据库模型 | 无 SQLAlchemy 模型定义 |
| GroupChat 编排 | 无 AG2 GroupChat 实现 |
| 私聊 Agent 对话 | AgentManager 的 send_message 未实现 AG2 真实调用 |
| 群聊 @ 路由 | 无 @ 提及解析和路由逻辑 |
| 记忆系统 | 无记忆存储/检索实现 |
| 技能系统 | 无工具注册/绑定实现 |
| 成员管理 API | 无 CRUD 端点 |
| 房间管理 API | 无房间创建/列表端点 |
| 审计日志 | 无操作日志记录 |
| 前端适配 | 前端仍对接 OpenClaw，未适配新后端 |

---

## 📋 Checklist

### 阶段一：环境与骨架修复（1天）

- [ ] 用 `learning/ag2-env` 作为项目虚拟环境（或把包装到 `.venv`）
- [ ] 验证 AG2 0.7.5 的实际 import 路径（`from autogen_agentchat.agents import AssistantAgent`？）
- [ ] 修复 `agent_manager.py` 的 AG2 import 和初始化
- [ ] 修复 `config.py` 的环境变量加载
- [ ] 修复 `run.py` 的启动逻辑
- [ ] 能 `python run.py` 启动并访问 `http://localhost:8000/health`
- [ ] 清理 server/ 下的 8 个废报告文件

### 阶段二：AG2 私聊打通（2-3天）

- [ ] 实现 AG2 AssistantAgent 的真实创建（用 `autogen_agentchat`）
- [ ] 实现单 Agent 对话（用户发消息 → AG2 Agent 回复 → 流式返回）
- [ ] 实现 `/api/chat/send` 端点（HTTP POST）
- [ ] 实现 WebSocket 流式推送（`/ws/{room_id}`）
- [ ] 3 个默认 Agent（可灵/小研/小码）能正常对话
- [ ] 验证流式响应正常工作

### 阶段三：核心 API（2-3天）

- [ ] 实现 `/api/members` 成员管理（GET 列表、GET 详情、POST 创建、PUT 更新、DELETE 删除）
- [ ] 实现 `/api/rooms` 房间管理（GET 列表、POST 创建、DELETE 删除）
- [ ] 实现 `/api/audit` 审计日志（GET 列表、按 agent 过滤）
- [ ] 实现 `/api/skills` 技能列表（GET 列表、POST 绑定、DELETE 解绑）
- [ ] 数据持久化（SQLite + SQLAlchemy 或 JSON 文件）
- [ ] 用 `test_api.py` 验证所有端点

### 阶段四：AG2 群聊编排（3-4天）

- [ ] 实现 AG2 GroupChat 创建（多 Agent 加入同一群）
- [ ] 实现 @ 路由逻辑（解析 `@小码` → 路由到对应 Agent）
- [ ] 实现群聊消息广播（多个 Agent 的回复推送给前端）
- [ ] 实现群主/值班响应（不 @ 时默认响应者）
- [ ] 群聊房间管理（创建群、添加成员、删除群）

### 阶段五：前端适配（2-3天）

- [ ] 分析现有前端 API 调用（`packages/web/` 中对接 OpenClaw 的部分）
- [ ] 修改 API 调用指向新后端（localhost:8000）
- [ ] 修改 WebSocket 连接逻辑
- [ ] 验证私聊、群聊、成员管理页面正常工作
- [ ] 验证流式消息显示正常

### 阶段六：功能完善（1-2天）

- [ ] 实现人设系统（模板库、精修向导）
- [ ] 实现记忆系统（存储、检索、搜索）
- [ ] 实现未读角标
- [ ] 实现技能绑定/解绑

### 阶段七：测试与文档（1-2天）

- [ ] 全量 API 测试
- [ ] 性能测试（响应时间 < 2s）
- [ ] 编写/更新 README
- [ ] Docker 化（Dockerfile + docker-compose）

---

## 📊 进度统计

| 阶段 | 状态 | 预计工时 |
|------|------|----------|
| 阶段一：环境修复 | 🔴 未开始 | 1天 |
| 阶段二：私聊打通 | 🔴 未开始 | 2-3天 |
| 阶段三：核心 API | 🔴 未开始 | 2-3天 |
| 阶段四：群聊编排 | 🔴 未开始 | 3-4天 |
| 阶段五：前端适配 | 🔴 未开始 | 2-3天 |
| 阶段六：功能完善 | 🔴 未开始 | 1-2天 |
| 阶段七：测试文档 | 🔴 未开始 | 1-2天 |
| **总计** | **0%** | **12-18天** |

---

## ⚠️ 已知问题

1. **AG2 版本**：当前安装的是 ag2 1.0.2 + autogen-agentchat 0.7.5，import 路径需验证
2. **两个 venv**：`.venv`（根目录，空的）和 `learning/ag2-env`（有包），需要统一
3. **agent_manager.py 的 import**：`from ag2 import Agent` 可能不对，需要查 AG2 0.7.5 的实际 API
4. **前端**：当前对接的是 OpenClaw 的 WebSocket 协议，需要适配新后端的协议
5. **废文件**：server/ 下有 8 个循环生成的报告文件需要清理