# 工作流编排 · 现状诊断与优化方案

> 状态：**待审查**
> 日期：2026-08-21
> 背景：当前工作流"做了等于没做"——只能创建示例、执行是模拟的、重启即丢。本文给出可落地的优化方案。

---

## 一、现状诊断（三个断层）

我把代码从头到尾过了一遍，工作流目前**只能算"演示骨架"，不是可用功能**。三个断层：

### 断层 1：无法自由编排（UI 缺口）
- 前端 `WorkflowPanel.tsx` **只有两个按钮**：「刷新」和「创建示例工作流」
- `POST /api/workflows/demo/create` **硬编码**了一个「调研 → 分析 → 报告」三步流程，用户改不了任何一步
- 后端虽有 `POST /api/workflows` 能收 raw JSON steps，但依赖手写 `next_step_id`/`then_step_id`/`parallel_step_ids`/`depends_on` 等复杂字段，**没有 UI 支撑**，等于没有

### 断层 2：执行是模拟的（引擎缺口）
- `WorkflowEngine.register_handler()` **从未被调用**（全库搜索确认）
- 所有步骤都走 `_default_handler`，它是 **mock**：
  - `agent_call` → 返回 `{"response": "Agent processed: ..."}`（假话）
  - `tool_call` → 返回 `{"result": "Tool xxx executed with: ..."}`（假话）
- 系统里**真实的** Agent（AG2，可灵/小研/小码）和**真实的**工具（web_search/code_execute/file_read…）完全没接进来

### 断层 3：不持久化（数据缺口）
- 工作流存在 `WorkflowEngine` 的内存 dict（`_workflows`/`_completed_workflows`）里
- **服务重启，所有工作流消失**

> 一句话总结：**有引擎、有 API、有面板，但没有"编"、没有"真执行"、没有"持久化"，所以是做了等于没做。**

---

## 二、优化目标

把工作流从"演示骨架"升级为**可用的可视化编排平台**：

1. **能自由编排**：用户可在画布上搭建任意多步骤流程（Agent/工具/条件/并行/审批）
2. **能真实执行**：每一步真正调用 AG2 Agent 或内置工具，跑出真实结果
3. **能持久化**：定义与运行历史存 SQLite，重启不丢
4. **学习导向**：执行过程在 UI 上可视化（节点高亮、输入输出可查），面试有东西可讲

---

## 三、后端优化方案

### 3.1 引擎真实化（P0 · 关键）

在 `main.py` lifespan 里，把工作流引擎的 step handler **真正接上**系统已有的能力：

| StepType | 现状（mock） | 优化后（真实） | 复用能力 |
|----------|-------------|---------------|---------|
| `agent_call` | 返回假话 | `agent_manager.send_message(config.agent_id, input)` | ✅ 已有真实 AG2 调用 |
| `tool_call` | 返回假话 | `tool_registry.execute(config.tool_name, **params)` | ✅ 已有真实工具 |
| `condition` | `bool(data.get(cond))` 太弱 | 安全表达式求值器 `data["score"] > 0.5` | 新增 |
| `human_review` | 标记 waiting 不落地 | 接 `HumanApprovalManager`（发审批→等 resolve） | ✅ 已有审批系统 |
| `transform` | 透传 | 模板变量替换 `{{ input.x }}` / `{{ step.output.y }}` | 新增 |

关键设计：
- **保留 mock 开关**：`config.mock = true` 时走模拟（方便无模型时快速测试，也符合学习导向的"透明"原则）
- **执行方式**：`agent_call` 用 `send_message` 同步取完整回复（简化、稳定）；流式输出到画布作为后续增强项

### 3.2 数据模型改 DAG + 持久化（P0）

**现状问题**：`WorkflowStep` 用 `next_step_id` + `parallel_step_ids` + `then/else_step_id` + `depends_on` 四套字段描述连接关系，双轨混乱、难扩展。

**方案**：改为清晰的 **节点 + 连线（DAG）** 模型：
- 节点（Node）：`id / type / name / config`
- 连线（Edge）：`from / to / condition(可选)` —— 用一条 `edge.condition` 表达"从 A 到 B 的条件分支"，替代 `then/else_step_id`
- 配置里仍保留 `branch: "success|failure|always"` 支持失败分支

**持久化**（复用现有 `database.py` 的 db_session）：
- 表 `workflows`：`id / name / description / definition_json / status / created_at / updated_at`
- 表 `workflow_runs`：`run_id / workflow_id / status / input / output / started_at / completed_at / duration_ms / steps_json`
- 定义持久化 → 可复用模板；运行持久化 → 历史可查（学习导向）

### 3.3 API 补全（P0）

| 端点 | 现状 | 优化 |
|------|------|------|
| `POST /api/workflows` | ✅ | 保留，接新 DAG 格式 |
| `PUT /api/workflows/{id}` | ❌ 缺 | 更新定义（编辑保存） |
| `DELETE /api/workflows/{id}` | ❌ 缺 | 删除 |
| `POST /api/workflows/{id}/duplicate` | ❌ 缺 | 复制 |
| `GET /api/workflows/{id}/runs` | ❌ 缺 | 运行历史 |
| `POST /api/workflows/demo/create` | 硬编码 | 改为**模板库**：`GET /api/workflow-templates` + `POST /api/workflows/from-template` |
| `GET /api/agents`（复用） | ✅ | 编辑器下拉选 Agent |
| `GET /api/tools`（复用） | ✅ | 编辑器下拉选工具 |

---

## 四、前端优化方案

### 4.1 可视化编排器（P1 · 核心，二选一，请拍板）

**方案 A：画布式编辑器（React Flow，推荐）**
- 引入 `@xyflow/react`（React Flow v12），业界标准做法（n8n / Dify / Flowise 都是这种）
- 左侧工具箱（Agent / 工具 / 条件 / 并行 / 审批 / 转换节点，拖入画布）
- 画布上连线建立依赖，选中节点 → 右侧属性面板配置
- **面试含金量高**："我用 React Flow 实现了可视化 DAG 工作流编排器"
- 工作量：中大（2-4 天）；风险：新依赖、React 19 兼容性需验证

**方案 B：表单式编辑器（轻量）**
- 左侧步骤列表（增删/排序/设前驱/设分支），右侧步骤配置面板
- 不引新依赖，快速闭环（1-2 天）
- 缺点：编排视图不直观，面试讲点弱

> **我的建议**：核心目标是"能自由编排 + 面试可讲"，选 **方案 A**；若想先快速看到完整闭环，先做 B、再升级 A。本方案默认按 A 展开。

### 4.2 编辑器布局（贴合三段式飞书风格 + 渐进式披露）

```
┌──────────────────────────────────────────────────────┐
│ 顶部：工作流名 + 描述 + [模板] [保存] [运行] [测试]     │
├───────────┬──────────────────────────┬────────────────┤
│ 左：工具箱  │     画布（React Flow）     │ 右：节点属性面板 │
│ Agent 节点 │  ┌────┐    ┌────┐        │ 类型/Agent/工具  │
│ 工具节点   │  │搜索 │───▶│分析 │        │ 参数/条件表达式   │
│ 条件节点   │  └────┘    └────┘        │ 输入输出变量名    │
│ 审批节点   │    ...      └────┐       │ （学习导向：展示  │
│ ...       │                  ▼        │  API payload）  │
└───────────┴──────────────────────────┴────────────────┘
```

### 4.3 运行可视化（学习导向 · 渐进式披露）

- 执行时**画布节点实时高亮**：running=蓝、completed=绿、failed=红、waiting=黄
- 点击节点 → 面板显示该步的**输入 / 输出 / 耗时 / 错误**（复用现有 `StepCard` 的信息层）
- 「查看详情」：展开该步的 API 请求/响应（复用现有面板模式）

### 4.4 模板库（保留学习入口）

- 现有 demo 三步流程改为**模板**（「调研 → 分析 → 报告」），用户点「新建工作流」可**从模板开始（可编辑）**或**空白开始**
- 预置 2-3 个模板：调研报告、代码评审、审批流

---

## 五、增强项（P1/P2 选做）

1. **条件表达式**：安全求值器（白名单运算符，无 `__` 访问），支持 `data["score"] > 0.5`
2. **变量传递**：步骤间数据引用 `{{ step.xxx.output.field }}`
3. **审批节点落地**：与现有 HITL 审批面板打通（工作流卡在审批节点，审批面板批准后继续跑）
4. **流式执行**：agent_call 流式吐字到画布（增强体验，工作量+）
5. **测试/试运行按钮**：一键跑通校验定义是否正确

---

## 六、工作量与交付批次

| 批次 | 内容 | 工作量 | 交付价值 |
|------|------|--------|---------|
| **批 A（P0）** | 引擎真实化 + DAG 改造 + SQLite 持久化 + API 补全 | 1.5-2 天 | 后端真正"能做工作流" |
| **批 B（P1）** | 可视化编辑器（React Flow）+ 运行可视化 | 2-4 天 | 前端真正"能编排" |
| **批 C（P1/P2）** | 条件表达式 / 变量传递 / 审批节点 / 模板库完善 | 1-2 天 | 编排能力完整 |

> 建议交付顺序：**A → B → C**，每批可独立验证（A 之后可用 curl/API 验证真实执行）。

---

## 七、面试叙事升级

**Before**："我实现了工作流编排引擎，支持顺序/条件/并行执行。"
**After**："我把工作流升级为**可视化编排平台**：基于 DAG 建模 + React Flow 拖拽编辑器，用户可自由搭建多步骤流程，每一步真实调用 AG2 Agent 和内置工具，支持条件分支、并行执行、人工审批节点，运行过程实时可视化，定义与历史 SQLite 持久化。"

---

## 八、请拍板的决策点

1. **编辑器形态**：React Flow 画布式（推荐）还是表单式？
2. **执行粒度**：agent_call 同步取完整回复（推荐，先跑通）还是直接上流式？
3. **条件表达式语法**：`data["x"] > 0.5`（推荐）还是其他？
4. **交付节奏**：A→B→C 分三批，还是先合并 A+B 一次交付？
