# AiCumi 交接文档 · UI 基底迁移（2026-08-16）

> 写给下一个接手者：**别再手译设计稿 HTML，直接把 HTML 拿过来用**。
> 本文档记录：当前架构、已验证可用的后端资产、设计稿资产、以及这次"React 手译版翻车"的根因与正确迁移路径。

---

## 〇、接手更新（2026-08-16 晚）—— 结论已被推翻，走 React 组件化基底 ✅

> 上一版"React 必翻车、要走 HTML+数据桥"的结论**基于误诊**。当晚定位到真根因并已重构完成，用户拍板采用 **React 组件化基底**（更适合后续能力接入）。

### 真根因（一条 CSS 修复，之前诊断错了）
- 现象：`mx-auto` 计算值 margin=0，消息区贴左。
- 真因：`packages/web/src/index.css` 里**未分层的 `* { margin: 0; padding: 0; box-sizing: border-box; }`** 覆盖了 `@layer` 内 Tailwind 的**所有** margin/padding 工具类（未分层 CSS 优先级 > 分层 CSS）。`.mx-auto { margin-inline: auto }` 规则**其实生成了**，只是被重置盖掉。
- 修复：删掉该 reset（Tailwind v4 preflight 已内置在 `@layer base`），并把 token 映射改为 `@theme inline`。已验证：1440px 下 `margin: 187px/187px` 对称居中 ✅。

### 现状（已落地并验证）
- **组件结构**：`src/components/workspace/` → `Workspace`(壳) / `Sidebar` / `ChatHeader` / `MessageList` / `MessageBubble` / `Composer` / `AgentAvatar` / `agentMeta.ts`；旧暗色死代码已删（`src/components/{Chat,MessageInput,MessageList,Sidebar}.tsx`）。
- **现代化交互**：流式打字点 + 闪烁光标、消息入场动画、自动滚动（贴底才滚）、Enter 发送 / Shift+Enter 换行、输入框 focus 高亮、移动端会话抽屉（<768px，选中自动收起）、空状态页、prefers-reduced-motion。
- **后端两处 bug 修复**（`packages/server/src/ws-server.ts`，tsx watch 已热载）：
  1. 事件订阅按 `runId` 精确过滤（原只按 sessionKey → 快速连发互相污染消息内容）；
  2. 收到 final 即取消订阅 + 120s 兜底（原固定 5s → 慢回复丢失 `chat.done`，前端光标永久卡住）。均已端到端验证。

### 现在该做什么
- 保留 `design-reference/` 作为权威视觉源；React 组件忠实移植其结构/类名，改动样式以它为准。
- 后续能力（群聊/多员工/管理面）直接在现有组件树上扩展。

---

## 一、历史结论（已被上文〇修正，仅存档）

**设计稿是原生 HTML + CDN Tailwind，浏览器打开就是好的（用户已认可）。**
上一轮我把它"翻译"成 React（`Workspace.tsx`）后布局歪了：消息区贴左、右侧大片留白。
当时实测：

```
消息容器 className = "mx-auto w-full max-w-[780px] px-6 py-8"
computed: margin-left: 0px; margin-right: 0px   ← mx-auto 没生效！
宽度 780px 顶在 section 左边缘（x=280），右侧留白 ~249px
```

- 当时误判为"Tailwind CDN 正常、本地构建没生成规则"；**实际是 index.css 未分层 reset 覆盖（见〇）**。
- 项目里是 **Tailwind v4 本地构建**（`@import "tailwindcss"`），同一类名在这批构建里没生成 margin 规则 → 布局全歪（消息区、composer 都贴左）。
- 这不是"没认真抄"，是两套 Tailwind 运行方式差异 + 手译必然走样。**手译 = 必然失真，不该再走这条路。**

**正确做法（用户原话）：直接把设计稿前端拿过来。**

---

## 二、项目背景与目标（简版）

- **产品**：AiCumi = 个人云端 24/7 私人 AI 助理团队。用户通过自有聊天窗口（私聊/群聊）指挥"员工"（可灵=前台秘书 / 小研=调研专员 / 小文=内容运营），引擎是 OpenClaw。
- **当前阶段**：Phase 1 MVP = 私聊 + 1 个 agent + 消息云端持久化 + 历史加载。UI 基底 = 设计 Agent 输出的 3 页 HTML（已获用户认可）。
- 立项决策详见 `docs/HANDOFF-2026-08-16.md`，设计 token 调研见 `docs/DESIGN-RESEARCH-2026.md`。

---

## 三、已验证可用的后端资产（别浪费，直接复用）

**架构**：pnpm monorepo，`packages/server`（Node + Express + ws）↔ `packages/web`（React 19 + Vite 6 + Tailwind v4）。

### 后端 ↔ OpenClaw Gateway（云端会话持久化，端到端已验证）
- `packages/server/src/gateway-ws.ts` — 官方 Gateway WS 协议客户端：
  - handshake：`client:{id,mode:'webchat'}` + `scopes:['operator.admin','operator.approvals','operator.pairing']` + `auth:{token}` + `Origin: http://127.0.0.1:18789`
  - `chat.send(sessionKey, text, idempotencyKey)` / `chat.history(sessionKey, limit)` / `onGatewayEvent(...)` 事件订阅，带自动重连
- `packages/server/src/ws-server.ts` — 浏览器 ↔ Gateway 桥：
  - 浏览器消息：`chat.send` / `chat.history` / `room.list` / `room.create` / `agent.list` / `ping`
  - 服务端推送：`room.list`(连接即发) / `agent.list` / `chat.chunk`(流式增量) / `chat.done` / `chat.history` / `room.created` / `chat.error`
  - **事件 sessionKey 在 `payload.sessionKey` 里，不在 frame 顶层**（已踩坑修复）
- `packages/server/src/rooms.ts` — 房间持久化 `packages/server/data/rooms.json`；session key 格式 `agent:<agentId>:webchat:channel:<roomId>`
- **实测通过**：私聊 → 可灵回复 ✅、云端历史加载 ✅、刷新后持久化 ✅、流式增量 ✅

### 环境
- chat-server: `localhost:3100`（tsx 运行）；SSH 隧道 `localhost:18789` → 阿里云 OpenClaw gateway（`nohup ssh -fN -L 18789:127.0.0.1:18789 ali`）
- vite dev: `localhost:5173`，proxy 已配 `/ws` → `ws://localhost:3100`
- ⚠️ **改 `vite.config.ts` 后必须重启 vite dev**，否则代理不生效（本次踩过）

---

## 四、设计稿资产（权威源，用户认可的唯一视觉标准）

```
packages/web/design-reference/
├── colors_and_type.css          # 完整设计 token（= index.css 里 :root 的来源）
├── assets/avatar-{keling,xiaoyan,xiaowen}.jpg
└── pages/
    ├── chat-main.html           # 主界面：会话列表 280px + 聊天窗
    ├── empty-state.html         # 空状态页
    └── mobile-fold.html         # 移动端折叠
```

关键结构（chat-main.html）：
```html
<main class="aicumi-shell">            <!-- flex, 100vw x 100vh -->
  <aside class="aicumi-roster">…</aside>        <!-- 280px 会话列表 -->
  <section class="aicumi-chat-canvas">…</section> <!-- flex:1 聊天窗 -->
</main>
```
- 消息容器：`mx-auto max-w-[780px] px-6 py-8`（**居中**，两侧对称留白是设计意图）
- token：`--aicumi-*`（背景 `#f7f7f8`、文字 `#1a1b1e`、主色 `#5e6ad2`、发丝边框 `rgba(26,27,30,.08)`、阴影 ≤10% 黑）
- 头像已复制到 `packages/web/public/avatars/` 与 `design-reference/assets/`

---

## 五、本次失败的 React 实现（建议弃用/仅作参考）

`packages/web/src/components/workspace/Workspace.tsx` + `App.tsx` 路由 `/` → Workspace。

**问题清单（按严重度）**：
1. **`mx-auto` 失效 → 消息区/composer 贴左、右侧留白**（Tailwind v4 本地构建未生成该规则，实测 margin=0）
2. 三页设计稿只译了 chat-main 一页，empty-state / mobile-fold 未做
3. 手译过程中细节必然走样（hover 态、滚动条、间距、边框阴影），永远追不平
4. 消息内容接的是真实后端（这部分数据流逻辑可参考），但视觉是硬伤

---

## 六、正确迁移方案（推荐 A，直接拿 HTML）

### 方案 A（推荐）：HTML 直接作为产品页面，JS 只做"数据桥"

不 React 化，把设计稿当**静态壳 + 数据桥**：

1. **停用 React 渲染主界面**：`App.tsx` 的 `/` 改为加载下面这个页面；或把 chat-main.html 作为 Vite 多页入口。
2. **托管 HTML**：把 `design-reference/pages/*.html` 拷为 `packages/web/` 下的页面（如 `packages/web/chat/chat-main.html`），改内部资源路径（头像 `../assets/` → `/avatars/`），去掉 CDN script（`@tailwindcss/browser`、`lucide`）——把 `colors_and_type.css` 的 token 内联保留，Tailwind 类改用**本地构建**（vite 已配 Tailwind v4，html 文件里的 class 也能被处理）或保留 CDN（内网/部署时注意）。
   - 关键：本地 Tailwind 构建要能生成 html 里用到的类（Vite 会扫描 html 文件，天然支持）。
3. **数据桥（一个 JS 文件即可）**：在 HTML 里 `<script type="module" src="/chat/bridge.js">`，桥里实现：
   - 连 `ws://<host>/ws`（同 vite 代理）
   - 收 `room.list` → 渲染会话列表；`chat.history` → 渲染消息
   - 发送：`chat.send`；收 `chat.chunk`/`chat.done` 流式追加
   - 参考现有 `packages/web/src/hooks/useChatSocket.ts` 的消息协议（那段数据逻辑是对的，只换渲染方式）
4. **验证**：浏览器直接开 `http://localhost:5173/chat/chat-main.html`，视觉应与 `file://` 打开 design-reference 完全一致。

### 方案 B（次选）：修 React 版
- 给所有 `mx-auto` 元素补 `style={{ marginInline: 'auto' }}`，或排查 Tailwind v4 为何未生成 margin 工具类（检查 `@import "tailwindcss"` 与类名拼写）
- 逐行对照 3 页 HTML 翻译，工作量≈重写，且仍难 100% 一致

### 方案 C：后端不动，前端用 iframe 内嵌 HTML 壳
- 最省事但不利于后续扩展（群聊/多员工/管理面都要新 UI），不推荐长期。

---

## 七、数据流备忘（桥接时照抄）

```
浏览器                           server(3100)                gateway(18789)
  ├─ 连接 ws →             ├─ 连接即发 room.list/agent.list
  ├─ {type:'chat.history',roomId} →  gatewayGetHistory(sessionKey)
  ├─ {type:'chat.send',roomId,content} → gatewayChatSend(sessionKey,…)
  │                                            │ 事件流: agent(stream:assistant, data.delta)
  │                                            │        chat(state:final, message)
  ├─ 收 chat.chunk(content增量) / chat.done(fullContent) ←─ 转发
```
- 房间标题显示 agent 名（前端映射 keling/xiaoyan/xiaowen → 头像/角色），当前 `AGENT_META` 常量在 `Workspace.tsx` 里可抄。

---

## 八、运行方式与排障

```bash
# 1. SSH 隧道（必须，gateway 在远端）
nohup ssh -fN -L 18789:127.0.0.1:18789 ali

# 2. chat-server
pnpm --filter @aicumi/server dev        # localhost:3100

# 3. web
pnpm --filter @aicumi/web dev           # localhost:5173
```
- 健康检查：`curl http://localhost:3100/api/health` 应返回 `{"ok":true,"gateway":"connected",…}`
- WS 不通：先 `node` 用 `ws` 包直连 `ws://localhost:3100/ws` 排除 server；再连 `ws://localhost:5173/ws` 排除 vite 代理；**改过 vite.config 就重启 vite**。
- 上线：Docker/OrbStack 配置在 `packages/web/Dockerfile`、根目录 compose（历史已配）。

---

## 九、待办（2026-08-16 晚更新：P0/P1/P2 大部分已完成）

- [x] ~~**P0**：按方案 A 把 `chat-main.html` 接入 vite~~ → **改为 React 组件化基底（见〇），已完成**
- [x] ~~**P0**：本地 Tailwind 构建处理 mx-auto 等~~ → 真根因 = 未分层 reset，已删，`@theme inline` 映射，居中已验证
- [x] ~~**P1**：删掉 `Workspace.tsx` 的 mock 占位~~ → 真实数据已接（rooms/agents/云端历史/流式），`AGENT_META` 移至 `agentMeta.ts`
- [x] ~~**P1**：`empty-state.html`、`mobile-fold.html` 接入~~ → 空状态 + 移动端抽屉已实现
- [x] ~~**P2**：修复 mx-auto / 删旧暗色组件~~ → mx-auto 已修；旧 `src/components/{Chat,MessageInput,MessageList,Sidebar}.tsx` 已删
- [x] ~~后端两处 bug~~ → ws-server.ts 按 runId 过滤 + final 即退订（慢回复光标卡死已修）
- [x] ~~**P2：新会话创建**~~ → **产品定位修正：不存在"新建对话"**。AiCumi = AI 同事团队，侧栏是"我的团队"，1 员工 = 1 固定房间（room.id = agentId），点成员即持续对话。后端已预置可灵/小研/小文（旧 uuid 房间自动清理）
- [ ] **P2 待办**：项目群聊（1 群 ↔ 多员工，@ 路由）——协议已留 `webchat:group:<id>` 扩展位
- [ ] **P2**：未读数（角标）
- [ ] **P2**：员工元数据（AGENT_META）改由后端下发（现为前端常量）
- [ ] **P3**：`design-reference/` 页面逐步收敛为组件（当前仅作视觉权威源，勿删）

---

## 十、一句话总结

**React 组件化基底已落地：视觉忠实移植设计稿（根因是一条 CSS reset，已修）、真实后端数据打通、流式/移动端/空态等交互齐全；产品定位已修正为「同事式交互」——侧栏是"我的团队"，点成员即持续对话，无"新建对话"机器范式；后续能力直接在组件树上扩展，后端网关持久化/流式/房间链路保持可用。**
