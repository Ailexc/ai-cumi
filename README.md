# AiCumi · AI 伙伴

> **个人云端 24/7 的私人 AI 助理团队 —— 有你自己的聊天窗口，管理面点一点就能配置。**
>
> 立项日期：2026-08-16 ｜ 状态：正式立项，从零产品化

## 名字含义
- **Cumi**：自造词，取"**积**累（accumulate）+ **陪**伴（companion）"之意 —— 帮你积累知识、陪伴你长期办公的 AI 伙伴。
- **AiCumi**：AI + Cumi，一个属于你、24/7 在线、有温度的私人 AI 助理团队。
- 自造词，不撞名，域名空间充足。

## 一句话定位

一个**属于你个人的、云端的、全天候在线的 AI 助理团队**：用你自己的 token，通过**自有聊天窗口**（私聊/群聊）指挥一群有性格、有技能、能真正干活的 AI 员工，管理面做到"点一点"完成员工编排与渠道配置。外部 IM（飞书/Telegram…）作为可选的接入能力。

## 为什么做它（痛点）

- 市面 AI 产品要么是**对话式**（能聊不能干）、要么是 **IDE 型**（对普通人太重）、要么是**手机助手**（不介入办公）、要么是**桌面版**（要电脑常开）。
- **空白**：云端的、能干活、聊天式、专属私人的办公助理。
- OpenClaw 很强但**配置太复杂**（开发者看着都头疼），没有面向普通用户的**可视化配置界面**；依赖飞书当宿主 = "给别人做嫁衣"。

## 核心决策

1. **OpenClaw 做引擎**（通道/会话/记忆/工具/浏览器，重活全给它），**不重造引擎**。
2. **自有聊天通道 = 一等公民**：做一个 Web Chat 通道（OpenClaw 自定义 channel 插件），用户留在我们的产品里；外部 IM（飞书/Telegram/WhatsApp…）变可选。
3. **管理面 = 产品灵魂**：员工向导、技能编排、渠道配置、稳定性监控，全部可视化、点一点完成。
4. **多租户**：OpenClaw 本质单租户/实例 → 每租户一个轻量容器实例，壳负责实例生命周期。
5. 渠道硬约束：OpenClaw 内置飞书 + 国际 IM（Telegram/WhatsApp/Slack/Discord/Signal/LINE/Zalo/Teams…），**无微信/QQ**（个人微信无官方 API）。

## 目录结构

```
AiCumi/
├── README.md                          # 本文件：项目总览
├── docs/
│   ├── PRODUCT_PLAN.md                # 产品方案（架构 + 功能 + 路线图）
│   ├── HANDOFF-2026-08-16.md          # 会话交接（立项完整上下文）
│   ├── RESEARCH-webchat-channel.md    # Web Chat 通道调研
│   └── TECH-gateway-ws-protocol.md    # Gateway WS 协议接入方案（踩坑记录）
├── packages/
│   ├── server/                        # 聊天服务器（Node.js + Express + WS）
│   │   ├── src/
│   │   │   ├── index.ts               # 入口：HTTP API + WS 服务器 + gateway 初始化
│   │   │   ├── config.ts              # 配置（读 .env）
│   │   │   ├── gateway-ws.ts          # OpenClaw Gateway WS 协议客户端（核心）
│   │   │   ├── rooms.ts               # 房间管理 + 持久化（data/rooms.json）
│   │   │   ├── types.ts               # 类型定义
│   │   │   └── ws-server.ts           # 浏览器 WS + gateway 事件流桥接
│   │   ├── data/                      # 房间持久化（gitignore）
│   │   └── Dockerfile
│   └── web/                           # 聊天 Web UI（React + Vite + Tailwind）
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Chat.tsx           # 聊天主组件
│       │   │   ├── Sidebar.tsx        # 侧边栏（房间列表）
│       │   │   ├── MessageList.tsx    # 消息列表
│       │   │   └── MessageInput.tsx   # 消息输入框
│       │   └── hooks/
│       │       └── useChatSocket.ts   # WebSocket Hook
│       ├── nginx.conf                 # 生产环境 Nginx 配置
│       └── Dockerfile
├── scripts/
│   └── deploy.sh                      # 部署脚本
├── docker-compose.yml                 # 生产部署
├── pnpm-workspace.yaml                # Monorepo 配置
└── .env                               # 环境变量
```

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动聊天服务器（端口 3100）
pnpm dev:server

# 启动 Web UI（端口 5173，自动代理 API/WS）
pnpm dev:web
```

访问 http://localhost:5173 即可开始聊天。

### 生产部署

```bash
# 同步到服务器并部署
./scripts/deploy.sh

# 或手动
docker compose up -d --build
```

## 技术栈

- **引擎**：OpenClaw CN（阿里云 ECS 已有生产实例）
- **聊天后端**：Node.js + Express + WebSocket
- **聊天 UI**：React + Vite + Tailwind CSS v4
- **通信协议**：**Gateway WebSocket 协议**（官方 WebChat 通道：`connect` / `chat.send` / `chat.history` / 事件流）——见 `docs/TECH-gateway-ws-protocol.md`
- **消息持久化**：云端（OpenClaw session 落盘）+ 房间元数据本地持久化（`server/data/rooms.json`）
- **部署**：Docker Compose（聊天服务器 host 网络 + Web UI Nginx 反代）
- **Monorepo**：pnpm workspaces

## 已实现功能（阶段一 MVP）

- ✅ 自有聊天窗口（私聊 1 用户 ↔ 1 agent）
- ✅ 流式回复（Gateway `agent`/`chat` 事件增量转发）
- ✅ **历史消息加载**（`chat.history` 从云端拉取，刷新/重开不丢）
- ✅ **消息持久化 + 多端同步**（消息落盘云端，云端是权威源）
- ✅ **会话连续性**（同房间同 session key，AI 记住上下文/记忆）
- ✅ 房间持久化（重启后房间 ID 不变，历史可对上）
- ✅ 多房间 / 多 agent 切换

## 相关资源

- 现有生产环境：阿里云 ECS `112.124.69.224`（SSH `ali`），`openclaw-gateway` 容器
- 现有员工：可灵（前台秘书）、小研（调研）、小文（内容运营）
- 上一代/原型：`multi-agent-orchestrator` 仓库（配置/工具/人设副本）
- 技术方案：`docs/TECH-gateway-ws-protocol.md`（Gateway WS 协议 + 配置改动）
