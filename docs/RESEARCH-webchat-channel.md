# AiCumi 阶段0 调研：自定义 Web Chat 通道可行性

> 日期：2026-08-16 ｜ 结论：**完全可行，工作量明确可控**（比 feishu 通道简单得多）

---

## 一、结论一句话

OpenClaw 的通道是**插件化、契约化**的（`ChannelPlugin`），feishu 就是完整参考实现；自定义 Web Chat 通道只需实现 4-6 个适配器，把**你自己的聊天服务器**和 gateway 桥起来即可，**不需要对接任何外部 IM API**——所以比 feishu 简单一个数量级。

## 二、通道插件契约（已确认源码）

插件通过 manifest 声明通道：`openclaw.plugin.json` 里 `"channels": ["webchat"]`。

核心接口 `ChannelPlugin`（`/app/src/channels/plugins/types.plugin.ts`）：

```ts
type ChannelPlugin = {
  id: string;
  meta: ChannelMeta;                    // 名称/描述
  capabilities: ChannelCapabilities;    // chatTypes: dm/group/thread 等
  config: ChannelConfigAdapter;         // 账号配置 schema（如 WS 地址/端口/token）
  // —— 以下按需实现 ——
  setup?    // 首次配置向导
  security? // DM 安全策略
  groups?   // 群聊（群策略/成员）
  mentions? // @提及路由
  messaging? // 收发消息（入站/出站）
  outbound? // 主动推送（agent 回复 → 推给客户端）
  status?   // 健康探针
  gateway?  // gateway 对接
  auth?     // 鉴权
  agentTools? // 通道自带 agent 工具
  ...
};
```

加载机制：`/app/src/channels/dock.ts` + `registry.ts` 负责把通道 dock 进 gateway。

## 三、feishu 参考实现（工作量参照）

- `/app/extensions/feishu/src/channel.ts`：核心 **359 行**（meta/capabilities/groups/config/messaging/outbound/status）
- 其余大量代码是**飞书专用**的：send.ts/media.ts/probe.ts/mention.ts/docx.ts/drive.ts…（AiCumi 不需要这些）
- 插件入口 `index.ts`：注册 channel + 一堆飞书工具

> 对 AiCumi 的意义：Web Chat 通道的**核心 ≈ feishu 的 channel.ts 那 359 行**，且更简单（没有外部 API）。

## 四、Web Chat 通道设计（两种连接方式）

### 方案 A：聊天服务器主动连 gateway（推荐）
```
[Web UI] ⇄WS⇄ [AiCumi 聊天服务器] ⇄WS/HTTP⇄ [Web Chat channel 插件(在 gateway 内)]
```
- 聊天服务器作为"IM 提供方"，像飞书长连接一样连进 gateway
- 消息流：Web UI → 聊天服务器 → 通道插件 → agent → 回复 → 通道 → 聊天服务器 → Web UI
- 优点：接入方是自研的，完全可控；多 agent 同群、@路由都在聊天服务器/插件层做

### 方案 B：gateway 暴露入站 HTTP 端点
- 插件用 plugin 的 http-registry 暴露 `POST /webchat/inbound`，聊天服务器把消息 push 进来
- 优点：实现更简单；缺点：回调式，不如长连接实时

> 推荐 **A**（长连接），实时性好，且和飞书通道机制一致。

## 五、工作量评估

| 模块 | 工作量 | 说明 |
|---|---|---|
| Web Chat channel 插件 | 🟡 中 | 300-600 行，实现 config/messaging/outbound/groups/mentions/status |
| 聊天服务器（壳） | 🟡 中 | Node WS，房间/会话映射、@路由、消息持久化 |
| 聊天 UI | 🟢 低 | 复用开源聊天组件 |
| 群聊 + 多 agent | 🟡 中 | 房间→session 映射、@ 分发（平移飞书逻辑） |

**关键点**：唯一"新"的技术点是 Web Chat 通道插件，已验证契约存在且 feishu 可作模板。

## 六、下一步（进入实现）

1. 搭建 AiCumi 骨架：`plugins/webchat-channel/`（通道插件）+ `server/`（聊天服务器）+ `web/`（聊天 UI）
2. 最小打通：Web Chat 通道插件 + 1 个 agent + 私聊
3. 验证后加群聊 + @ 路由 + 多 agent

## 参考

- 通道类型定义：`/app/src/channels/plugins/types.plugin.ts`、`types.core.ts`、`types.adapters.ts`
- feishu 参考实现：`/app/extensions/feishu/src/channel.ts`
- 加载：`/app/src/channels/dock.ts`、`registry.ts`
