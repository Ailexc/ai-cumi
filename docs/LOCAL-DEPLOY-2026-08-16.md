# AiCumi 本地 OpenClaw 测试实例（2026-08-16）

> 目的：把云上 OpenClaw（生产）复制一份到本地，方便快速迭代测试，**云端生产不受任何影响**。

---

## 一、架构

```
AiCumi Web (5173) ⇄ chat-server (3100) ⇄ 本地 Gateway (127.0.0.1:18788)  ← 测试
                                     （云端 Gateway 18789 走 SSH 隧道，回退用）
```

- 本地实例 = 云上 `openclaw-cn:latest` 源码 + 配置 + 数据的**独立副本**，跑在项目目录 `<项目>/local/`
- 端口 **18788**（云端用 18789，被 SSH 隧道占用，勿冲突）
- **隔离点**：本地 `openclaw.json` 已 `feishu.enabled=false`、`browser.enabled=false`（不连飞书、不跑浏览器）

## 二、目录结构

```
<项目>/local/
├── openclaw-cn/            # OpenClaw CN 源码（v2026.2.23-cn，含 Dockerfile、config/patches）
├── workspace/              # agents 人设（AGENTS.md/TOOLS.md）与自定义工具（tools/）
└── openclaw/               # gateway 数据：openclaw.json + agents/ + memory/
    └── openclaw.json.bak-local   # 未隔离前的原始配置备份
```

> 数据来自云端快照（排除 cron/feishu/delivery-queue/devices——**不复制定时任务**，避免本地重复发早安/简报）。
> `.gitignore` 已忽略 `local/openclaw/`、`local/openclaw-cn/`、`local/workspace/`（含密钥/第三方源码）。
> **统一编排**：OpenClaw 已作为 service 并入根目录 `docker-compose.yml`（`profile: local`），一个 compose 管理全部。

## 三、日常使用（统一 compose，根目录执行）

```bash
cd <项目>
# 本地全栈（OpenClaw + chat-server + web）：
docker compose --profile local up -d
# 仅 AiCumi 应用（默认，OpenClaw 不启动，保持生产语义）：
docker compose up -d
# 停止 / 日志 / 重建：
docker compose --profile local down
docker logs -f openclaw-gateway-local
docker compose --profile local up -d --build   # 改配置/源码后重建
```

AiCumi 侧（`<项目>/.env`）已指向 `127.0.0.1:18788`，本地进程跑 chat-server 时重启即生效：
```bash
pnpm --filter @aicumi/server dev   # 或已跑着的话 kill 后重启
```

## 四、回退云端（需要时）

```bash
# 1. .env 改回
# OPENCLAW_GATEWAY_HTTP_URL=http://127.0.0.1:18789
# OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
# 2. 确保 SSH 隧道在（nohup ssh -fN -L 18789:127.0.0.1:18789 ali）
# 3. 重启 chat-server
```

## 五、注意事项

- **云端生产完全不动**：本地实例数据是拷贝的，测试产生的会话/记忆只在本地，不会污染云端
- 本地 gateway 数据目录 `<项目>/local/openclaw/` 可随时删掉重来（从云端重新打包）
- 本地未装 chromium（浏览器工具不可用，纯聊天/记忆/工具链路不受影响）
- 构建镜像：`cd <项目>/local/openclaw-cn && docker build -t openclaw-cn:local .`（arm64，约 5-10 分钟）
- 同步云端最新数据：`ssh ali 'cd /data && sudo tar czf /tmp/aicumi-local.tar.gz openclaw-cn workspace openclaw/openclaw.json openclaw/agents openclaw/memory'` → scp 到 `<项目>/local/` → 解包（排除 cron 等）

## 六、已验证（2026-08-16）

- ✅ 本地 gateway 18788 启动、握手、chat.history、chat.send（deepseek-v4-flash 模型）
- ✅ AiCumi Web → chat-server → 本地 gateway → 小研流式回复（"本地部署验证通过 ✅"）
- ✅ 云端 `openclaw-gateway` 全程 Up、18789 正常（零影响）
