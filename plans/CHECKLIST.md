# AG2 迁移开发 Checklist

> 更新时间：2026-08-21（P0-P4 全部完成，真实 MIMO 已接入，进入后续里程碑规划）
> 阶段：迁移主流程 ✅ 完成收尾；剩余为增强与接入类规划

---

## 🔴 当前真相

**实际状态：后端全链路跑通且已接入真实模型。三个 AI 员工（可灵/小研/小码）正在用 MiMo（`custom/mimo-v2.5`）进行真实对话，思考内容自动剥离，Docker 双容器在线运行。**

- 服务：`chat-server`（FastAPI :8000）+ `web`（Nginx 反代）运行中
- 默认模型：MiMo `custom/mimo-v2.5`（base_url `https://api.xiaomimimo.com/v1`）— 已配置为默认
- 测试：API **42/42** + WS **11/11** 全绿（真实 MIMO 模式下验证）
- 前端 ~30 个 `/api/*` 路径已全部有后端实现

> 目录结构：`server/` → `backend/`、`packages/web/` → `frontend/`（已重构）

---

## ✅ 已完成（P0-P4）

### P0 · 真实 AG2 对话（✅）
- [x] Agent ↔ 模型绑定：启动时从默认模型配置自动构建真实 client
- [x] `_real_respond` 真实 AG2 调用 + WS `chat.chunk` 增量流式（逐字推送）
- [x] REST `/api/chat/send` 复用真实 Agent
- [x] mock 兜底：无模型配置自动降级（验证通过）
- [x] 修复 ModelKeyEncryptor Fernet key 派生 bug
- [x] 主密钥持久化 `backend/data/.master_key`（重启后加密 key 可解密）
- [x] **思考内容剥离**：MiMo 内联 ` thinking... response` 标签 + AG2 reasoning 路径双格式支持（跨 chunk 状态机），普通模型零影响

### P1 · 群聊后端（✅）
- [x] GroupChatManager 接入 main.py（lifespan 初始化）
- [x] WS 协议：`group.create`→`room.created`、`group.add-member`→`room.list`
- [x] 修复 REST `/api/chat/send` 群聊分支（原调用不存在方法会崩）
- [x] @ 提及路由（有 @ 只响应被 @ 的 Agent）
- [x] 群主/值班响应（不 @ 时仅群主响应）
- [x] `/api/rooms` 合并 DM + 群聊房间

### P2 · 核心 API（✅）
- [x] 成员档案：列表(agentId)/详情 + identity/persona/refine/memory/reindex/skills/audit/history/files
- [x] 人设精修向导：模板 + 增量写入「精修设定」章节 + 自动备份
- [x] 记忆：从消息表重建索引（真实对话生成记忆）
- [x] 技能：`/api/skills/catalog` + 成员绑定/解绑/文档
- [x] 员工向导：`/api/roles` + `/api/persona-templates` + `/api/staff`(preview/create)
- [x] 渠道：`/api/channels` 全套（accounts/toggle/restart/templates）
- [x] 切换模型：per-agent 模型绑定 + 重启重放（持久化）
- [x] 离职：自动备份工作目录 + 清理档案/技能
- [x] 审计日志（所有写操作）
- [x] 所有响应带 `ok` 字段（前端契约）；`/api/models` 增加 `name` 字段

### P3 · 消息持久化（✅）
- [x] 私聊/群聊 用户 + Agent 回复落库（WS + REST）
- [x] `chat.history` 从 messages 表读取（重启不丢，多端一致）
- [x] 成员 history 端点 + 记忆 reindex 联动真实消息

### P4 · 测试与文档（✅）
- [x] `test_api.py` 重写为全量测试套件（42 项，覆盖 P0-P3 所有端点）
- [x] `test_ws.py` WS 协议集成测试（握手/DM 流式/群聊路由/加成员/历史）→ **11/11**
- [x] Docker 容器内真实 MIMO 模式下跑通全部测试（42+11 全绿）
- [x] README 重写（新结构 + 部署 + API 一览 + 思考剥离说明）
- [ ] 前端构建产物刷新 + 浏览器端到端冒烟（web 容器为当前前端代码构建）

---

## 📊 进度统计（2026-08-21）

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 真实对话 | ✅ 完成 | 模型绑定 + 流式 + mock 兜底 + 思考剥离 |
| P1 群聊 | ✅ 完成 | GroupChat + @ 路由 + 群主响应 |
| P2 核心 API | ✅ 完成 | 成员/技能/员工/渠道/模型绑定（35 端点） |
| P3 消息持久化 | ✅ 完成 | 落库 + 历史 + 记忆联动 |
| P4 测试文档 | ✅ 完成 | 42 API + 11 WS 全绿（真实 MIMO） |
| 真实模型接入 | ✅ 完成 | MiMo 已配为默认，三员工全真对话 |
| **整体** | **~95%** | 剩余：浏览器端到端冒烟 + 增强类规划 |

---

## 🔮 后续规划（增强 / 接入，超出本次 Checklist 范围）

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P1 | 渠道网关真实接入 | `/api/channels` 已就绪，接入外部 IM 网关（飞书等）为下一里程碑 |
| P1 | 推理模型「思考中…」指示 | MiMo 思考期数秒静默，加前端气泡指示（需重建 web 容器） |
| P2 | 技能真实工具调用 | 技能目录/绑定已就绪，绑定后让 Agent 通过 AG2 FunctionTool 真实调用 |
| P2 | 记忆检索增强 | 当前基于消息聚合；升级为向量检索 |
| P3 | 群聊房间落库 | 当前群聊房间在内存，重启后群列表清空；房间 CRUD 持久化 |
| P3 | 性能验证 | 响应时间 < 2s 压测（推理模型思考期天然偏长，需设定预期） |

---

## ⚠️ 已知限制

1. ~~**无真实 API Key**~~ ✅ 已解决（2026-08-21）：MiMo（`custom/mimo-v2.5`，base_url `https://api.xiaomimimo.com/v1`）已配置为默认模型，三个 AI 员工已进入真实对话模式，私聊/群聊/@ 路由流式验证通过。
2. **per-agent 模型绑定**：已持久化到 `member_profiles.model_id` 并在启动时重放（重启不丢）
3. **群聊房间未落库**：群聊房间在内存（GroupChatManager），重启后群列表清空（后续项）
4. **渠道为配置层**：外部 IM 网关真实连接未实现
5. **推理模型思考期静默**：MiMo 等推理模型思考阶段（数秒）用户看不到反馈，后续加「思考中…」指示（需前端重建）
6. **浏览器端到端冒烟待做**：后端 API/WS 全测过，浏览器 UI 冒烟待做
