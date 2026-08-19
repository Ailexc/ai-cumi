# AiCumi 成员管理模块 · 设计方案（v0.1）

> 2026-08-17 ｜ 状态：**P1 已完成并部署；P2 已完成并部署** ｜ 定位：**员工的档案中心与生命周期管理**（不是"用户管理"，是"HR 系统 × AI agent 面板"的结合，保持同事温度）

> ✅ **P1 档案中心（2026-08-17 已上线）**：`/api/members` 系列 7 个只读路由 + 前端 Tab 档案视图（概览/人设/技能/记忆/对话/工作目录）。后端见 `packages/server/src/member-profile.ts`（读 `local/workspace/<agentId>/`）；前端见 `packages/web/src/components/workspace/MemberManagement.tsx`。
> ✅ **P2 写操作（2026-08-17 已上线，本地实例可用）**：后端 `packages/server/src/member-admin.ts` 提供 `PUT persona`（写 AGENTS.md 自动备份 *.bak-*）、`PUT identity`（set-identity + 同步房间名）、`POST reindex`（memory index --force）、`POST model`（切 primary 模型 + 重启 gateway）、`DELETE`（离职：备份 workspace → agents delete → 清理 openclaw.json → 删房间）。前端概览页「管理操作」卡片（编辑资料/切换模型/离职）、人设页内联编辑、记忆页重建索引。**限制**：写操作依赖宿主 docker exec，仅本地 dev 进程模式可用（容器模式不支持，同添加员工）。
> ✅ **P3a 审计日志（2026-08-17 已上线）**：`member-admin.ts` 新增 `logAudit/getAudit`，所有写操作（编辑人设/资料/模型、重建索引、离职）+ 招新自动记录到 `local/audit-log.json`（最近 500 条）；`GET /api/audit`（全部，可过滤 agentId）+ `GET /api/members/:id/audit`（单成员）；前端概览页「最近操作」卡片按类型图标展示。
> ✅ **P3b 员工分组/部门（2026-08-17 已上线）**：`/api/members` 增加 `department` 字段（openclaw.json `agent.department` 可覆盖默认映射）；招新按角色自动分部门（researcher→研究/operator→运维/analyst→分析/pm→产品/support→支持/secretary→行政）；编辑资料支持改部门；前端左侧成员列表按部门分组（飞书通讯录式）。
> ⏳ **P3c 剩余（待排期）**：~~人设精修向导、技能市场~~。
> ✅ **P3c 人设精修向导（2026-08-17 已上线）**：`POST /api/members/:id/persona/refine`（增量写入「精修设定（向导 v1）」章节，不覆盖原人设，已有则替换，自动备份 + 审计 persona_refine）。前端人设 Tab「精修向导」：岗位职责/性格与语气(chip 单选)/工作风格(带说明卡片)/边界与禁忌 → 写入。
> ✅ **P3d 技能库（2026-08-17 已上线，注：引擎无 clawhub，原"技能市场"调整为技能库增强）**：`getSkills` 现返回每个技能的 `description`（SKILL.md frontmatter）+ `doc`（SKILL.md 全文 ≤5000 字符）；前端技能 Tab 卡片显示描述 + 可展开查看 SKILL.md 文档。

---

## 一、定位与目标

**产品视角**：AiCumi = 你的 AI 同事团队。成员管理就是**人事部**——每个同事有完整档案（是谁、干什么、怎么干、会什么、记得什么、聊过什么），主管能"看懂每一个人、管理每一个人的全生命周期"。

**一句话目标**：让用户像看"员工档案"一样看到每一位 AI 同事的全部，并能完成"招人 → 设定 → 工作 → 查看 → 调整 → 离职"的完整闭环。

**当前差距**：现在只有"列表 + 添加 + 详情(名字/状态/最后消息)"，看不到工作目录、人设设定、技能、记忆、对话历史——这些**数据其实都存在**（引擎里），只是没被捞出来展示。

## 二、对标参考（我参考了什么）

| 对标对象 | 学到什么 | 映射到 AiCumi |
|---|---|---|
| **飞书通讯录/管理员后台** | 成员档案的分区展示（基本资料/部门/权限/最近活跃）；管理的"一眼即懂" | 员工档案分区：概览/人设/技能/记忆/对话 |
| **HR 系统（员工入职→离职）** | 生命周期的概念：入职、在职、调整、离职 | 添加成员(入职) → 档案维护 → 停用/删除(离职) |
| **OpenClaw Control UI / 各 AI agent 面板** | agent 的状态、模型、日志、对话、技能的管理面 | 技术侧：状态/模型/记忆索引/技能清单 |
| **Notion / Linear（资料即内容）** | "档案=可读写的文档"，而非只读表单 | 人设/技能/记忆都是**可查看可编辑**的内容 |
| **飞书每日简报/可灵人设的"温度"** | 同事不该是冷冰冰的技术面板 | 档案里保留"TA 是做什么的、什么风格"的人味描述 |

## 三、技术现实（数据都在，只差捞出来）

每个 AI 员工的 workspace 就是完整档案（`local/workspace/<agentId>/`）：

```
<agentId>/
├── AGENTS.md        # 人设：身份/职责/工作模式/协作/风格（主档案）
├── IDENTITY.md      # 身份：名字/头像/emoji/主题
├── SOUL.md          # 性格/灵魂
├── TOOLS.md         # 工具与技能说明
├── MEMORY.md        # 长期记忆摘要
├── HEARTBEAT.md     # 常驻行为（如每日简报）
├── USER.md          # 用户信息
├── skills/          # 技能文件夹（add-staff/browser-search/media-gen…）
├── .openclaw/       # 运行时状态
└── *.bak-*          # 历史版本（可看迭代过程）
```

**可调用的管理能力**（OpenClaw CLI + 现有 API）：

| 能力 | 命令/接口 | 用途 |
|---|---|---|
| 添加员工 | `openclaw agents add` + 房间 | 入职（已实现） |
| 改身份 | `agents set-identity --name/--avatar/--emoji/--theme` | 换头像/名字/主题 |
| 技能清单 | `skills list/check/info` | 看员工会什么、缺什么依赖 |
| 记忆索引 | `memory status/index --force` | 看/重建记忆 |
| 删除员工 | `agents delete` | 离职（谨慎，需确认） |
| 对话历史 | gateway `chat.history`（AiCumi 已在用） | 看员工聊过什么 |
| 模型切换 | openclaw.json agents[].model | 换脑子 |
| 人设编辑 | 写 AGENTS.md（挂载共享，宿主可读写） | 改人设/职责/风格 |

## 四、模块能力设计（成员管理 = 员工档案中心）

### 4.1 列表视图（人事总览）
- 成员卡片/表格：头像、名字、**角色/岗位**、在线状态、最近活跃、最后消息摘要、技能数量
- **筛选**：按角色（研究员/运维/…）、按状态（在线/忙碌/离线）、按技能
- **搜索**、排序（活跃度/加入时间）
- 右上"添加成员"

### 4.2 员工档案（点进任一成员）—— 核心，分 5 个 Tab
| Tab | 内容 | 数据源 |
|---|---|---|
| **概览** | 头像/名字/标识/角色/状态/模型/加入时间；岗位职责；最近活跃；一句话人设摘要 | AGENTS/IDENTITY + agents list |
| **人设** | 完整查看 AGENTS.md（身份/工作模式/协作/风格）；可编辑（P2） | workspace/AGENTS.md |
| **技能** | 技能清单（来自 skills/ + TOOLS.md + `skills list`），每个技能的能力说明/是否就绪 | skills/ + CLI |
| **记忆** | MEMORY.md 摘要 + 记忆索引状态（已索引/文件数）；可重建索引（P2） | MEMORY.md + memory status |
| **对话历史** | 与 TA 的全部历史消息（分页/按时间）；点击某条可跳转聊天视图 | gateway chat.history |
| **工作目录** | 只读浏览 workspace 文件树（AGENTS.md 等，点开看内容） | 文件系统 |

### 4.3 员工操作（生命周期）
- **发起对话**：一键跳转聊天视图（保留"同事温度"的入口）
- **编辑人设/职责**：改 AGENTS.md（表单化，P2）
- **更换头像/名字/主题**：`set-identity`（P2）
- **切换模型**：改 openclaw.json（P2）
- **添加/移除技能**：引导 `clawhub` 搜索安装（P2）
- **重建记忆索引**：`memory index --force`（P2）
- **停用/删除**：`agents delete`（P2，二次确认 + 房间清理）

### 4.4 添加成员（入职，已实现，待增强）
- 已：中文名 + 英文标识 + 角色 + 岗位职责
- 待增强（P2）：头像选择、人设模板预览、入职欢迎语

## 五、页面结构（信息架构）

```
成员管理（功能栏入口）
├── 左栏：成员列表（搜索/筛选/排序）
└── 右栏（随选中切换）：
    ├── Tab1 概览  ── 基本信息 + 职责 + 状态 + 最近活动
    ├── Tab2 人设  ── AGENTS.md 全文（查看/编辑）
    ├── Tab3 技能  ── 技能清单 + 就绪状态
    ├── Tab4 记忆  ── MEMORY.md + 索引状态
    ├── Tab5 对话  ── 历史消息（分页）
    ├── Tab6 工作目录 ─ 文件树浏览
    └── 操作栏（顶部/底部）：发起对话 / 编辑 / 模型 / 技能 / 重建记忆 / 删除
```

## 六、技术实现（后端 API + 前端）

**后端新增路由**（`server/`，数据源 = 读 local/workspace + docker exec + gateway）：

```
GET  /api/members                    # 列表：room + agents + 档案摘要（角色/状态/技能数/最后活跃）
GET  /api/members/:id                # 档案：基本信息 + 职责 + 人设摘要
GET  /api/members/:id/persona        # 人设全文（AGENTS.md）
GET  /api/members/:id/skills         # 技能清单（skills list --json + 目录扫描）
GET  /api/members/:id/memory         # MEMORY.md + 索引状态
GET  /api/members/:id/files          # 工作目录文件树
GET  /api/members/:id/history        # 对话历史（gateway chat.history，分页）
PUT  /api/members/:id/persona        # 编辑人设（写 AGENTS.md）[P2]
PUT  /api/members/:id/identity       # 身份（set-identity）[P2]
POST /api/members/:id/reindex        # 重建记忆索引 [P2]
POST /api/members/:id/model          # 切换模型 [P2]
DELETE /api/members/:id              # 删除员工（含房间）[P2]
```

**前端**：`MemberManagement` 升级——左侧列表（+筛选），右侧改为 **Tab 档案页**；新增 `StaffProfile`(概览)、`PersonaView`、`SkillsView`、`MemoryView`、`HistoryView`、`FilesView` 子组件。沿用现有设计 token 与 AppRail 导航范式（非弹窗）。

**数据安全**：档案只读展示走 GET；写操作（P2）先做权限确认 + 自动备份（*.bak-*）。删除/编辑均为本地测试实例可用（同添加员工，容器模式暂不支持写）。

## 七、分期路线

| 阶段 | 内容 | 说明 |
|---|---|---|
| **P0（已做）** | 列表 + 添加 + 简单详情 | 雏形 |
| **P1（本方案主体）** | 档案中心：概览/人设/技能/记忆/对话/工作目录（**全只读查看**） | 让用户"看懂每个同事"，无需写操作，风险低 |
| **P2** | 编辑人设/身份/模型、技能管理、重建记忆、删除/停用 | 写操作 + 生命周期管理 |
| **P3** | 人设精修向导、技能市场、员工分组/部门、审计日志 | 完整管理面 |

**推荐先做 P1**：把"看到员工全部"做扎实（数据都在，纯读取，稳），写操作（P2）在 P1 稳定后逐项加。

## 八、风险与权衡

- **写操作风险**：改 AGENTS.md / 切模型 / 删除 直接影响引擎 → 全部自动备份 + 二次确认 + 操作日志（P2 严格做）
- **数据权限**：MEMORY.md/对话历史含隐私 → 当前单用户无碍，多租户时需隔离（P3）
- **性能**：对话历史/技能 list 走 CLI 每次调用较重 → 后端做缓存 + 懒加载（点开才拉）
- **温度 vs 技术**：档案展示要"人味"（职责、风格、一句话简介），避免纯技术字段堆砌——这是产品气质的关键

---

> **一句话**：成员管理 = 员工档案中心。把引擎里已有的"人设/技能/记忆/对话/工作目录"全部捞出来，用人事部的方式展示给用户（概览/人设/技能/记忆/对话），再逐步加上编辑、模型、删除等生命周期操作。先 P1（纯查看，稳），后 P2（写操作，严）。
