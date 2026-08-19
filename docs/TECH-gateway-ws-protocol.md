# AiCumi · Gateway WebSocket 协议接入方案

> 2026-08-16 ｜ 结论：**已用官方 Gateway WS 协议替代 OpenAI 兼容 HTTP API**，实现消息落盘云端 + 历史多端同步。

---

## 一、为什么放弃 HTTP API

最初用 OpenAI 兼容 HTTP API（`/v1/chat/completions`）发消息：
- ✅ 能发消息、能流式、能落盘（`/data/openclaw/agents/<agentId>/sessions/*.jsonl`）
- ❌ 但 `sessions_history` / `sessions_list` 工具查不到这些 session（作用域受限）
- ❌ 无法可靠读取历史

**结论**：官方 WebChat 通道走的是 Gateway WS 协议（`chat.send` / `chat.history`），历史永远从 gateway 拉取。这才是正统方案。

## 二、Gateway WS 协议（v3）

### 连接
```
ws://<gateway-host>:18789   （本地经 SSH 隧道：ws://127.0.0.1:18789）
Headers: Origin: http://127.0.0.1:18789   （必须，否则 origin not allowed）
```

### 握手（connect 必须是第一帧）
```json
{
  "type": "req", "id": "req_1", "method": "connect",
  "params": {
    "minProtocol": 3, "maxProtocol": 3,
    "client": { "id": "openclaw-control-ui", "version": "0.1.0", "platform": "web", "mode": "webchat" },
    "role": "operator",
    "scopes": ["operator.admin", "operator.approvals", "operator.pairing"],
    "caps": [],
    "auth": { "token": "<gateway-token>" },
    "userAgent": "aicumi/0.1.0", "locale": "zh-CN"
  }
}
```

**关键点（踩坑记录）**：
- `client.id` 必须是枚举值之一：`webchat-ui` / `openclaw-control-ui` / `cli` / `webchat` 等
- `client.mode` 必须是枚举：`webchat` / `cli` / `ui` / `backend` / `node` / `probe` / `test`
- **scopes 必须是** `["operator.admin", "operator.approvals", "operator.pairing"]`（不含 read/write）
  - 服务端 `authorizeGatewayMethod`：scopes 含 `operator.admin` 直接放行所有方法
  - 若用 `operator.read`/`write` 反而报 `missing scope`（因为无 device 身份时 scopes 被清空）
- **无 device 身份**（非 secure context 的纯 token 连接）时，服务端 `clearUnboundScopes()` 会清空 scopes
  - 解法：`gateway.controlUi.dangerouslyDisableDeviceAuth: true`（+ 已有 `allowInsecureAuth: true`）
  - 该配置在远程 `openclaw.json`，已添加（备份：`openclaw.json.bak-aicumi-disable-device-auth`）

### 请求/响应帧
```
Client → Gateway: {"type":"req","id":"req_N","method":"...","params":{...}}
Gateway → Client: {"type":"res","id":"req_N","ok":true,"payload":{...}}
Gateway → Client: {"type":"event","event":"chat","payload":{...}}   # 事件推送
```

### 发消息 chat.send
```json
{
  "type": "req", "method": "chat.send",
  "params": {
    "sessionKey": "agent:keling:webchat:channel:<roomId>",
    "message": "用户消息文本",        // 注意：此版本要求 string（官方 UI 用对象但 CN 版要求 string）
    "deliver": false,
    "idempotencyKey": "<uuid>"
  }
}
```
返回：`{"runId":"...","status":"started"}`

### 回复事件流（转发给浏览器的关键）
| 事件 | payload | 用途 |
|---|---|---|
| `agent` | `{runId, stream:"lifecycle", data:{phase:"start"/"end"}}` | 开始/结束 |
| `agent` | `{runId, stream:"assistant", data:{text, delta}}` | 增量文本（delta） |
| `chat` | `{runId, sessionKey, state:"delta"/"final", message:{...}}` | 完整消息快照 |

> ⚠️ 事件帧的 `sessionKey` 在 **payload 里**（`payload.sessionKey`），不在帧顶层——取值别取错。

### 读历史 chat.history
```json
{ "type": "req", "method": "chat.history",
  "params": { "sessionKey": "agent:keling:webchat:channel:<roomId>", "limit": 100 } }
```
返回：`{sessionKey, sessionId, messages:[{role, content:[{type,text}], timestamp}]}`

## 三、Session Key 规范

- 主聊天：`main`
- **AiCumi 房间**：`agent:<agentId>:webchat:channel:<roomId>`（房间 ID 必须稳定！）
- 群聊：`agent:<agentId>:webchat:group:<id>`
- 用 HTTP `user` 字段会派生：`agent:<agentId>:openai-user:<userId>`

## 四、消息持久化 & 多端同步（已验证）

- 发消息（chat.send）→ **落盘云端** `/data/openclaw/agents/<agentId>/sessions/*.jsonl`
- 读历史（chat.history）→ **从云端拉取**，天然多端同步
- **房间元数据**（id/name/agentId）本地持久化 `server/data/rooms.json`（保证 roomId 稳定）
  - 消息内容**不存本地**，始终从云端拉取（云端是权威源）

## 五、服务端配置改动（远程 openclaw.json）

```json
"gateway": {
  "http": { "endpoints": { "chatCompletions": { "enabled": true } } },  // 已弃用，可留
  "controlUi": {
    "enabled": true,
    "dangerouslyAllowHostHeaderOriginFallback": true,
    "allowInsecureAuth": true,
    "dangerouslyDisableDeviceAuth": true   // ← 新增：允许无 device 身份连接
  }
}
```
备份：`/data/openclaw/openclaw.json.bak-aicumi-disable-device-auth`

## 六、相关代码

- `packages/server/src/gateway-ws.ts`：Gateway WS 协议客户端（连接/握手/chat.send/chat.history/事件订阅）
- `packages/server/src/ws-server.ts`：浏览器 WS 与 gateway 事件流的桥接
- `packages/server/src/rooms.ts`：房间持久化 + session key 生成
- 探索脚本：`scripts/probe-gateway-ws.mjs`
