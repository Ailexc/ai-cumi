# AiCumi 能力补齐路线图

> 日期：2026-08-20
> 性质：统一行动方案（整合差距分析 + 架构分析 + 框架对比的结论）
> 读者：项目决策者（你）

---

## 一、当前状态总览

### 已有能力（✅ 可用）

| 模块 | 能力 | 质量 |
|------|------|------|
| 聊天 | 私聊 / 群聊 + @路由 / 流式回复 / 消息历史 / 未读角标 | 稳定 |
| 管理面 | 成员管理（增删改查/档案中心）/ 人设系统（模板+精修）/ 技能市场 / 渠道管理 / 审计日志 | 完整 |
| 部署 | Docker Compose / OrbStack / 容器化 | 可用 |

### 缺失能力（❌ 需要补）

按**对产品价值的影响**排序，共 8 项，分 3 个优先级梯队。

---

## 二、缺失能力清单与实施方案

### 🔴 P0：不补就不是"产品"（1-2 周）

#### ① 用户反馈系统（👍/👎）

**缺什么**：用户无法告诉系统"这个回答好不好"，无法衡量 AI 输出质量。

**怎么做**：
- 前端：每条 assistant 消息气泡右下角加 👍/👎 按钮（仅 hover 显示，参考 ChatGPT）
- 后端：`POST /api/feedback` 存入 `local/feedback.json`（messageId + rating + 可选 comment + timestamp）
- 管理面：成员档案页新增"质量统计"卡片（满意度 = 👍 / 总数）

**工作量**：1-2 天
**参考**：ChatGPT 的 👍/👎、Claude 的"复制 + 反馈"

**实施细节**：
```
后端新增：
  POST /api/feedback          — 记录反馈
  GET  /api/members/:id/feedback  — 查询反馈统计

前端改动：
  MessageBubble.tsx — hover 显示 👍/👎（点击后固定，不可撤销）
  MemberManagement  — 概览 Tab 新增"用户满意度"统计卡片
```

---

#### ② RAG 知识库（Phase 1：文件上传）

**缺什么**：Agent 只能基于训练数据和对话上下文回答，无法基于用户的私有文档回答。

**怎么做**：
- 技术栈：ChromaDB（向量数据库）+ text-embedding-3-small（嵌入模型，OpenAI 兼容 API）
- 前端：成员档案页新增"知识库"Tab，支持上传 PDF/Word/MD/TXT
- 后端：上传 → 解析（pdf-parse / mammoth）→ 分块（512 tokens，50 overlap）→ 嵌入 → 存入 ChromaDB
- 对话时：用户提问 → 检索 Top-5 相关片段 → 拼入 Agent 的 context → LLM 回答

**工作量**：1 周
**参考**：LlamaIndex 的 5 行 RAG、Dify 的知识库功能

**实施细节**：
```
新增依赖：
  chromadb（Python，单独微服务）或 chromadb-js
  pdf-parse / mammoth（文档解析）

新增服务：
  packages/rag-service/（Python Flask/FastAPI，端口 3200）
  - POST /ingest：接收文件 → 解析 → 分块 → 嵌入 → 存入 ChromaDB
  - POST /query：接收查询 → 检索 Top-K → 返回相关片段

前端改动：
  MemberManagement.tsx — 新增"知识库"Tab
  - 文件上传组件（拖拽 + 点击）
  - 已上传文件列表（文件名/大小/上传时间/删除）
  - 上传进度条

后端改动：
  member-profile.ts — 新增 getKnowledgeFiles / uploadKnowledge / deleteKnowledge
  index.ts — 新增 /api/members/:id/knowledge 系列路由
  ws-server.ts — chat.send 时先调 RAG 检索，把结果拼入 context
```

---

#### ③ 基础监控（结构化日志 + 健康面板）

**缺什么**：只有 console.log，无法追踪问题、无法看到系统状态。

**怎么做**：
- 后端：用 winston/pino 替换 console.log，输出结构化 JSON 日志
- 新增 `/api/metrics` 端点：返回连接数、消息数、Agent 响应时间、错误率
- 管理面：新增"系统状态"页（AppRail 新增"监控"入口），显示实时指标

**工作量**：3-5 天
**参考**：Flowise 的 Execution Traces、Relevance AI 的 Real-time Monitoring

**实施细节**：
```
新增依赖：
  pino（高性能日志库）

后端改动：
  - 新增 logger.ts（pino 实例，JSON 格式输出到 stdout + 文件）
  - 替换所有 console.log → logger.info / logger.error
  - 新增 /api/metrics（内存/连接数/消息吞吐/错误率）
  - 新增 /api/health 增强（gateway 延迟/内存使用/运行时长）

前端改动：
  AppRail.tsx — 新增"监控"入口（Planned → 启用）
  新增 MonitorView.tsx — 实时指标面板（自动刷新）
```

---

### 🟡 P1：补了就领先同行（2-4 周）

#### ④ RAG 知识库 Phase 2：本地目录 + 远程数据源

**缺什么**：只有文件上传不够，用户需要自动同步本地目录和远程数据源。

**怎么做**：
- Phase 2a：监听 `workspace/<agentId>/` 目录变化（chokidar），自动索引新增/修改文件
- Phase 2b：飞书文档集成（通过 lark-cli 读取文档内容 → 解析 → 索引）
- Phase 2c：Notion / Google Drive 集成（通过 API）

**工作量**：1-2 周（Phase 2a 3 天，2b/2c 各 1 周）
**参考**：LlamaIndex 的 160+ Data Connectors

---

#### ⑤ LLM-as-Judge（自动评估）

**缺什么**：只有用户反馈不够（数据量有限），需要自动化评估每次回复。

**怎么做**：
- 每次 Agent 回复后，异步调用便宜模型（如 GPT-4o-mini / DeepSeek）评估
- 评估维度：准确性 / 相关性 / 完整性 / 清晰度（1-5 分）
- 结果存入 `local/eval-results.json`
- 管理面：质量趋势图（按天/周）、退化告警

**工作量**：1 周
**参考**：Relevance AI 的 Eval 系统（96.4% pass rate）

**实施细节**：
```
后端新增：
  eval.ts — evaluateResponse(question, response, context) → {score, accuracy, relevance, completeness}
  /api/members/:id/eval/stats — 查询评估统计

前端改动：
  MemberManagement — 概览 Tab 新增"AI 质量评分"趋势图（折线图，按天）
```

---

#### ⑥ 可视化 Agent 编排（简化版）

**缺什么**：无法可视化定义多 Agent 协作流程，只能通过对话和配置文件。

**怎么做**：
- 管理面新增"工作流"Tab（AppRail 新增入口）
- 拖拽式画布：Agent 节点 + 连线（串行/并行/条件分支）
- 保存为 JSON 配置，通过 OpenClaw 的 sessions_spawn + cron 执行
- 预设模板：调研→分析→报告、接单→执行→汇报

**工作量**：2-3 周
**参考**：CrewAI Visual Agent Builder、Flowise 拖拽式编排、Dify 工作流

**实施细节**：
```
技术选型：
  reactflow（拖拽式节点图库，MIT 协议）

新增组件：
  WorkflowEditor.tsx — 拖拽画布 + 节点配置面板
  WorkflowRunner.tsx — 执行状态追踪

后端新增：
  workflows.ts — 工作流 CRUD + 执行引擎
  /api/workflows 系列路由

数据模型：
  interface Workflow {
    id: string;
    name: string;
    nodes: WorkflowNode[];  // Agent 节点
    edges: WorkflowEdge[];  // 连线（串行/并行/条件）
    triggers: Trigger[];    // 触发方式（手动/定时/消息）
  }
```

---

#### ⑦ 多模型路由 + 成本优化

**缺什么**：手动切换模型，无自动路由，无成本追踪。

**怎么做**：
- 每个 Agent 可配置"首选模型"和"兜底模型"
- 自动降级：首选模型超时/报错时自动切换兜底模型
- 成本追踪：记录每次对话的 token 消耗和费用
- 管理面：模型使用统计（按 Agent/按天）

**工作量**：1 周
**参考**：Relevance AI 的模型路由（自动选最便宜且达标的模型）

**实施细节**：
```
后端改动：
  gateway-ws.ts — 发送时记录 token 消耗（从 gateway 响应中提取）
  member-admin.ts — 支持配置 primary + fallback 模型
  新增 /api/members/:id/cost — 查询成本统计

前端改动：
  MemberManagement — 概览 Tab 新增"本月消耗"统计
  EditIdentityView — 支持配置首选/兜底模型
```

---

### 🟢 P2：有则更好（1-2 月）

#### ⑧ 安全与合规（认证/RBAC/数据加密）

**缺什么**：任何人都能访问，无认证、无权限控制、无数据加密。

**怎么做**：
- Phase 1：JWT 认证（登录/登出/Token 刷新）
- Phase 2：RBAC（管理员/成员/只读）
- Phase 3：数据加密（传输 HTTPS + 存储 AES-256）

**工作量**：2-3 周
**参考**：Relevance AI 的 SOC 2 / GDPR / SSO / SAML

**注意**：个人使用阶段不急，但**企业客户必须有**。建议在有企业客户需求时再启动。

---

## 三、实施优先级总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        实施路线图                                  │
│                                                                    │
│  第 1 周          第 2 周          第 3-4 周       第 5-8 周       │
│  ┌─────────┐    ┌─────────┐    ┌───────────┐   ┌───────────┐   │
│  │👍/👎    │    │ RAG     │    │ LLM-as-   │   │ 可视化    │   │
│  │用户反馈  │    │ Phase 1 │    │ Judge     │   │ 编排      │   │
│  │         │    │ 文件上传 │    │           │   │           │   │
│  └─────────┘    └─────────┘    └───────────┘   └───────────┘   │
│  ┌─────────┐    ┌─────────┐    ┌───────────┐   ┌───────────┐   │
│  │基础监控  │    │ 基础监控 │    │ 多模型    │   │ RAG       │   │
│  │日志+指标 │    │ 面板    │    │ 路由      │   │ Phase 2   │   │
│  └─────────┘    └─────────┘    └───────────┘   └───────────┘   │
│                                                                    │
│  ◄── P0（不补就不是产品）──►  ◄── P1（补了就领先）──►              │
│                                                                    │
│  第 9-12 周                                                       │
│  ┌───────────────────────────┐                                   │
│  │ 安全合规（认证/RBAC/加密）  │  ← P2（有企业客户需求时启动）      │
│  └───────────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 四、投入产出比评估

| 能力 | 工作量 | 产品价值 | 投入产出比 | 建议 |
|------|--------|----------|------------|------|
| 👍/👎 用户反馈 | 1-2 天 | 🔴 高（质量闭环的起点） | ⭐⭐⭐⭐⭐ | **立即做** |
| RAG Phase 1（文件上传） | 1 周 | 🔴 高（让 Agent 懂业务） | ⭐⭐⭐⭐⭐ | **立即做** |
| 基础监控 | 3-5 天 | 🔴 高（生产必备） | ⭐⭐⭐⭐ | **立即做** |
| LLM-as-Judge | 1 周 | 🟡 中高（自动化评估） | ⭐⭐⭐⭐ | 第 3 周做 |
| 多模型路由 | 1 周 | 🟡 中（降低成本） | ⭐⭐⭐ | 第 4 周做 |
| RAG Phase 2 | 1-2 周 | 🟡 中（自动同步） | ⭐⭐⭐ | 第 5-6 周做 |
| 可视化编排 | 2-3 周 | 🟡中（企业级差异化） | ⭐⭐⭐ | 第 7-8 周做 |
| 安全合规 | 2-3 周 | 🟢低（个人不需要） | ⭐⭐ | 有企业需求时做 |

---

## 五、关键决策点

### 决策 1：RAG 的嵌入模型选哪个？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **OpenAI text-embedding-3-small** | 效果好、API 简单 | 需要 API Key、有成本 | **首选**（国内可用） |
| **阿里云 DashScope text-embedding-v3** | 国内快、已有 Key | 效果略逊 OpenAI | 备选 |
| **本地 BGE-M3** | 无成本、无网络依赖 | 需要 GPU、部署复杂 | 不推荐（当前阶段） |

### 决策 2：向量数据库选哪个？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **ChromaDB（本地）** | 轻量、零部署、Python/JS SDK | 性能有限 | **首选**（个人/小团队） |
| **Qdrant（Docker）** | 高性能、Rust 实现 | 需要额外容器 | 生产环境升级用 |
| **Pinecone（云）** | 全托管、免运维 | 收费、数据外传 | 不推荐 |

### 决策 3：可视化编排用什么库？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **React Flow** | React 原生、拖拽节点、MIT 协议 | 需要自己实现节点逻辑 | **首选** |
| **X6（蚂蚁）** | 国产、功能丰富 | 文档英文少、社区小 | 备选 |
| **Rete.js** | 老牌、稳定 | 维护频率低 | 不推荐 |

---

## 六、与阶段三（产品化）的关系

阶段三的三个目标：**多租户 / 监控告警 / 打包分发**

| 阶段三目标 | 本路线图覆盖 | 状态 |
|------------|-------------|------|
| 多租户 | 未覆盖（独立大项） | 待规划 |
| 监控告警 | ③ 基础监控覆盖基础部分 | P0 |
| 打包分发 | 未覆盖（独立大项） | 待规划 |

**建议**：先完成本路线图的 P0+P1（8 项能力），再启动阶段三。

---

## 七、一句话总结

> **8 项缺失能力，3 个优先级梯队。P0（用户反馈 + RAG + 监控）1-2 周搞定，搞定后 AiCumi 从"能用"变成"好用"。P1（自动评估 + 模型路由 + 可视化编排）2-4 周搞定，搞定后从"好用"变成"领先"。P2（安全合规）等有企业客户需求时再做。**

---

## 附录：参考文档

- `docs/INDUSTRY-GAP-ANALYSIS.md` — 行业差距分析（10 项差距详细说明）
- `docs/ARCHITECTURE-ANALYSIS.md` — 架构分析（CrewAI 对比 / RAG 方案 / 评估方案）
- `docs/FRAMEWORK-COMPARISON.md` — 五大框架对比（LangGraph/CrewAI/AutoGen/LlamaIndex/MetaGPT）
- `docs/PRODUCT_PLAN.md` — 产品方案（阶段 0-3 路线图）
