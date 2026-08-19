# 阶段二 · 项目群聊设计方案（v1）

> 日期：2026-08-19 ｜ 决策已拍板：**只回群主 + 必须 @ 才响应 + 两级列表**
> 路线：**协议客户端 + AiCumi 壳层路由**（不写 ChannelPlugin，延续现有 gateway-ws 客户端路线）
> 前置：阶段一收尾（员工向导预览/迭代 + 小研档案映射 + 容器写操作）完成后实施

---

## 一、方案结论

群聊继续走 **Gateway WS 协议客户端** 路线，群聊的**群房间、@路由、广播、历史合并**全部在 AiCumi 壳层（`rooms.ts` / `ws-server.ts` / 前端 Composer）实现，**不写 OpenClaw ChannelPlugin**。

理由：
- 引擎 webchat 协议已预留群聊位 `agent:<agentId>:webchat:group:<id>`，直接可用
- "1 群 ↔ 多员工" 在引擎侧的真实形态 = 每个成员各有一个同 id 的 group session（引擎无"群"实体）
- 群聊的核心工作（路由/广播/历史）本来就是壳的职责，与现有客户端路线自洽
- 写插件是为"外部 IM 复用同一管理面"准备的，阶段二不需要

## 二、群聊的本质（协议层真相）

OpenClaw 中**没有"群"实体**，每个 agent 只有一个独立 session。群聊 = AiCumi 决定把消息发给哪个/哪些 agent 的 group session：

```
群 room "项目A" (id=proj-a)   类型: group   成员: [keling(群主), xiaoma, xiaai]
  ├── agent:keling:webchat:group:proj-a    ← 群主的群会话
  ├── agent:xiaoma:webchat:group:proj-a    ← 小码的群会话
  └── agent:xiaai:webchat:group:proj-a     ← 小艾的群会话
```

用户发"@小码 明天汇报" → AiCumi 只把消息发给 `agent:xiaoma:webchat:group:proj-a`。

"多 agent 协作"（可灵被 @ 后 sessions_spawn 派活给小码）由**引擎 + agent 人设**负责，AiCumi 不做编排（不重造引擎）。

## 三、产品行为（三问拍板）

| 问题 | 决策 |
|---|---|
| 不 @ 时谁响应？ | **只回群主**（群创建者 / 显式指定的默认值班 agent），避免全员轰炸 |
| @ 触发机制？ | **必须 @ 才触发对应成员**（未 @ 的成员不响应，参照飞书 `requireMention: true`） |
| 群聊入口？ | **两级列表**：我的团队（私聊）/ 群聊（group），参考飞书消息页 |

补充：
- 支持多 @（`@小码 @小艾` → 各发各的）
- `@所有人` → **阶段二不做**（广播会吵，阶段三再议）
- 群主若被 @，走 @ 触发；不 @ 时群主以"值班"身份响应

## 四、数据模型

### 房间（`rooms.ts` 扩展）

```ts
interface Room {
  id: string;              // group: 稳定 roomId（如 proj-a）
  name: string;            // 群名
  type: 'dm' | 'group';    // 新增：私聊/群聊
  // dm 用：
  agentId?: string;        // 单 agent
  // group 用：
  ownerAgentId?: string;          // 群主（不 @ 时的默认响应者）
  memberAgentIds?: string[];      // 群成员（含群主）
  createdAt: number;
}
```

- 私聊房间：`type:'dm'`，保持向后兼容（现有字段不动）
- 群聊房间：`type:'group'`，持久化到 `rooms.json`（与现有机制一致）
- session key 生成：`getSessionKey(roomId, agentId)` → dm 用 `channel:`，group 用 `group:`

### 消息（前端展示，`ChatMessage` 扩展）

```ts
interface ChatMessage {
  id: string;
  roomId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentId?: string;   // group: 该消息来自哪个成员（user 消息可为 null）
  streaming?: boolean;
}
```

- group 消息气泡需要区分"谁说的"→ 前端按 `agentId` 显示头像/名字
- 用户消息：`agentId` 记录 @ 目标（可选，用于回显）

## 五、@ 路由协议

### 前端 → 后端（`chat.send` 扩展）

```ts
// 前端发送（Composer 解析 @ 后）：
{
  type: 'chat.send',
  roomId: 'proj-a',
  content: '@小码 明天汇报一下进度',
  mentions: ['xiaoma'],       // 解析出的成员 agentId 列表（可为空）
}
```

- `mentions` 由**前端 Composer 解析**（@名字 → agentId），后端只做**校验**（成员校验 + 兜底）
- 前端解析更顺滑（即时高亮/删除 @），后端校验防伪造

### 后端路由逻辑（`ws-server.ts`）

```
chat.send(roomId, content, mentions):
  room = getRoom(roomId)
  if room.type == 'dm':
    发给 room.agentId（现状不变）
  else: // group
    targets = []
    if mentions 非空:
      for mid in mentions:
        if mid in room.memberAgentIds: targets.push(mid)   // 只发被 @ 且是成员的
    else:
      targets = [room.ownerAgentId]                        // 不 @ → 只回群主
    if targets 为空: 报错/忽略（@ 了非成员）
    for each target:
      sessionKey = getSessionKey(roomId, target, 'group')
      gatewayChatSend(sessionKey, content, uuid())
      # 每个 target 独立订阅 runId → 事件流合并推给前端
```

### 事件流合并（前端渲染一条流）

- 每个 target 的回包是一个独立 runId → 独立订阅
- 后端把多个 runId 的 chunk/done 事件**按到达顺序**转发给前端
- 前端：assistant 消息按 `agentId` 分气泡；done 后标记完成

## 六、历史合并（重点坑）

群聊一个 room = N 条 session 历史，前端要显示**一条按时间排序的流**：

```
chat.history(roomId):
  if room.type == 'dm': 现状（单 session）
  else: // group
    for each member in room.memberAgentIds:
      sessionKey = getSessionKey(roomId, member, 'group')
      msgs[i] = gatewayGetHistory(sessionKey, limit)
    合并：按 timestamp 排序；按 (role+content+timestamp) 去重
    （用户消息会出现在多个 session → 去重；assistant 消息天然按 agentId 区分）
```

- **去重键**：`role + content + timestamp`（±容差），避免用户消息重复显示
- 排序：timestamp 升序
- 前端：用户消息居中/右侧，assistant 消息按 agentId 分组显示头像

## 七、前端改动

### Sidebar：两级列表

```
我的团队（私聊 dm）        ← 现有
  可灵 / 小研 / 小文 / …
群聊（group）              ← 新增
  #项目A / #运营群 / …
```

- 分组标题 + 群聊可创建/邀请成员（管理面做，或 MVP 先在群里直接"添加成员"）

### Composer：@ 支持

- 输入 `@` 弹出成员选择（群成员过滤）
- 选中后插入 `@名字 `，记录 mentions
- 高亮已 @ 的名字（可选，MVP 可不做高亮）

### 消息气泡

- group 房间：assistant 消息显示成员头像+名字（`agentId` → `getAgentMeta`）
- 用户消息显示自己的头像

## 八、实施步骤（阶段二）

| 步骤 | 内容 | 涉及 |
|---|---|---|
| 1 | rooms.ts：Room 加 type/owner/members + 群聊 CRUD + group sessionKey | `rooms.ts` |
| 2 | ws-server.ts：chat.send 路由（mentions/群主兜底）+ 多 runId 事件合并 | `ws-server.ts` |
| 3 | chat.history：group 多 session 合并去重 | `ws-server.ts` |
| 4 | types.ts：Room/ChatMessage/ClientMessage 类型扩展 | `types.ts` |
| 5 | 前端 Sidebar 两级列表 + 群聊入口 | `Sidebar.tsx` / `Workspace.tsx` |
| 6 | 前端 Composer @ 解析 | `Composer.tsx` |
| 7 | 前端消息气泡按 agentId 显示 | `MessageList.tsx` / `MessageBubble.tsx` |
| 8 | 群聊创建/邀请（管理面 or MVP 简化） | 管理面 |
| 9 | 端到端验证（本地 + Docker） | — |

## 九、风险与边界

- **历史合并去重**是最容易出 bug 的部分（时间戳一致性问题）→ 用 `(role+content+timestamp)` 容差去重，先本地多 agent 联调
- **多 @ 并发**：多个 target 同时流式 → 后端需按 runId 分管道，前端按 agentId 分气泡，验证串扰（复用私聊 runId 过滤经验）
- **群成员变更**：MVP 阶段群成员固定；变更（加入/移出）放管理面，需同步 group session（换新 session key 即天然隔离，但会丢历史——先接受）
- **引擎能力边界**：群主"值班响应"依赖群主人设指令（"群里没 @ 时你来回应"），需在可灵等人设里补一句群聊行为说明

## 十、参考

- 协议位：`docs/TECH-gateway-ws-protocol.md` §三 Session Key 规范（`webchat:group:<id>`）
- 路由原则：`docs/PRODUCT_PLAN.md` 群聊路由"平移飞书逻辑（@agent → 对应会话）"
- 通道调研：`docs/RESEARCH-webchat-channel.md` §四（groups/mentions 适配器）
