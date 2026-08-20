# AiCumi 架构分析与改进方案

> 日期：2026-08-20
> 背景：对比 CrewAI 架构，分析 AiCumi 当前架构的定位、差距与改进方向

---

## 一、架构对比：CrewAI vs AiCumi

### 1.1 CrewAI 架构（开源 Python 框架）

```
┌─────────────────────────────────────────────────────┐
│                    CrewAI Framework                   │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │              │
│  │ role     │  │ role     │  │ role     │              │
│  │ goal     │  │ goal     │  │ goal     │              │
│  │ backstory│  │ backstory│  │ backstory│              │
│  │ tools[]  │  │ tools[]  │  │ tools[]  │              │
│  │ memory   │  │ memory   │  │ memory   │              │
│  │ llm      │  │ llm      │  │ llm      │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                   │
│       └──────────────┼──────────────┘                   │
│                      ▼                                  │
│              ┌───────────────┐                          │
│              │     Crew       │                          │
│              │  process:      │                          │
│              │  - sequential  │                          │
│              │  - hierarchical│                          │
│              │  tasks[]       │                          │
│              │  memory        │                          │
│              │  cache         │                          │
│              │  checkpoint    │                          │
│              └───────┬───────┘                          │
│                      ▼                                  │
│              ┌───────────────┐                          │
│              │   Execution    │                          │
│              │  kickoff()     │                          │
│              │  streaming     │                          │
│              │  eval/tracing  │                          │
│              └───────────────┘                          │
└─────────────────────────────────────────────────────┘
```

**CrewAI 核心能力：**

| 能力 | 说明 |
|------|------|
| **Agent 定义** | role/goal/backstory + LLM + tools + memory + delegation |
| **Task 定义** | description + expected_output + agent 指派 + context 依赖 |
| **Crew 编排** | sequential（串行）/ hierarchical（经理委派） |
| **记忆系统** | short-term / long-term / entity memory |
| **知识源** | knowledge_sources（RAG 集成） |
| **检查点** | checkpoint（任务中断可恢复） |
| **评估** | eval/tracing（OpenTelemetry） |
| **模型路由** | 每个 Agent 可独立配置 LLM |

### 1.2 AiCumi 当前架构

```
┌─────────────────────────────────────────────────────┐
│                    AiCumi (壳层)                       │
│                                                       │
│  ┌─────────────────┐    ┌─────────────────┐          │
│  │   Web UI (React) │    │  Chat Server    │          │
│  │   - 聊天界面     │◄──►│  (Node.js)      │          │
│  │   - 成员管理     │    │  - WS 桥接      │          │
│  │   - 技能市场     │    │  - 房间路由     │          │
│  │   - 渠道管理     │    │  - @ 路由       │          │
│  └─────────────────┘    └───────┬─────────┘          │
│                                 │                     │
│                          Gateway WS 协议               │
│                          (chat.send/chat.history)      │
│                                 │                     │
└─────────────────────────────────┼─────────────────────┘
                                  │
┌─────────────────────────────────┼─────────────────────┐
│                    OpenClaw (引擎)                      │
│                                 │                     │
│  ┌──────────────────────────────▼──────────────────┐  │
│  │              Gateway (WS Server)                 │  │
│  │  - 会话管理                                      │  │
│  │  - 消息路由                                      │  │
│  │  - 事件流                                        │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼──────────────────────────┐  │
│  │              Agent Runtime                       │  │
│  │  - AGENTS.md (人设)                              │  │
│  │  - sessions_spawn (委派)                         │  │
│  │  - 记忆 (MEMORY.md)                              │  │
│  │  - 工具 (skills/)                                │  │
│  │  - cron (定时任务)                               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**AiCumi 核心能力：**

| 能力 | 说明 | 控制方 |
|------|------|--------|
| **聊天 UI** | 私聊/群聊/消息历史 | AiCumi |
| **成员管理** | 增删改查/档案/技能 | AiCumi |
| **人设系统** | 模板库/精修向导 | AiCumi |
| **渠道管理** | 飞书/Telegram 等配置 | AiCumi |
| **Agent 运行时** | LLM 调用/工具执行/记忆 | **OpenClaw** |
| **Agent 编排** | sessions_spawn 委派 | **OpenClaw** |
| **会话管理** | session 生命周期 | **OpenClaw** |
| **模型路由** | 模型选择/切换 | **OpenClaw** |

### 1.3 核心差异

| 维度 | CrewAI | AiCumi + OpenClaw |
|------|--------|-------------------|
| **架构定位** | Agent 编排框架 | UI 壳 + 黑盒引擎 |
| **Agent 定义** | Python 代码/JSON 配置（role/goal/backstory/llm/tools） | AGENTS.md 纯文本（人设） |
| **编排控制** | 完全可控（sequential/hierarchical/自定义） | **不可控**（OpenClaw 内部逻辑） |
| **任务定义** | 显式 Task 对象（description/expected_output/agent） | 隐式（用户消息 → Agent 响应） |
| **模型路由** | 每个 Agent 独立 LLM + function_calling_llm | OpenClaw 统一管理 |
| **记忆** | short-term/long-term/entity（结构化） | MEMORY.md 文件（非结构化） |
| **知识源** | knowledge_sources（RAG） | 无 |
| **评估** | eval + tracing + checkpoint | 无 |
| **部署形态** | Python 包 / CLI / Cloud | Docker Compose / 容器 |

### 1.4 一句话结论

> **AiCumi 不是"没有架构"，而是"架构分层"**——我们是 UI 壳层，OpenClaw 是引擎层。我们的控制权在"用户体验"和"管理面"，不在"Agent 编排"。CrewAI 是"编排框架"，我们是"产品壳"。

**问题在于**：我们对引擎层（OpenClaw）的控制力太弱——Agent 怎么思考、怎么协作、用什么模型，全部由 OpenClaw 内部决定，我们只能通过配置文件间接影响。

---

## 二、RAG 知识库接入方案

### 2.1 RAG 是什么

RAG（Retrieval-Augmented Generation）= **检索增强生成**
- 用户提问 → 从知识库检索相关文档片段 → 拼入 prompt → LLM 基于文档回答
- 解决 LLM "幻觉"问题，让 AI 基于真实数据回答

### 2.2 接入方案对比

| 方案 | 优点 | 缺点 | 适合场景 |
|------|------|------|----------|
| **A. 用户上传文件** | 简单直接 | 需要用户主动上传 | 个人用户临时查询 |
| **B. 指定本地目录** | 自动同步 | 需要知道文件位置 | 本地知识库 |
| **C. 远程存储（Google Drive/Notion/飞书）** | 自动同步、多人协作 | 需要 OAuth 授权 | 团队协作 |
| **D. 数据库/搜索引擎** | 结构化查询 | 需要数据导入 | 企业级 |

### 2.3 推荐方案：分层接入

```
┌─────────────────────────────────────────────────┐
│                  RAG 知识库                       │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐│
│  │ 文件上传     │  │ 本地目录     │  │ 远程存储   ││
│  │ PDF/Word/MD  │  │ workspace/  │  │ 飞书文档   ││
│  │              │  │ skills/     │  │ Notion    ││
│  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘│
│         │                │                │       │
│         └────────────────┼────────────────┘       │
│                          ▼                         │
│                 ┌───────────────┐                  │
│                 │  文档解析器    │                  │
│                 │  PDF/Word/MD  │                  │
│                 └───────┬───────┘                  │
│                         ▼                          │
│                 ┌───────────────┐                  │
│                 │  文本分块      │                  │
│                 │  (Chunking)   │                  │
│                 └───────┬───────┘                  │
│                         ▼                          │
│                 ┌───────────────┐                  │
│                 │  向量嵌入      │                  │
│                 │  (Embedding)  │                  │
│                 └───────┬───────┘                  │
│                         ▼                          │
│                 ┌───────────────┐                  │
│                 │  向量数据库    │                  │
│                 │  ChromaDB     │                  │
│                 └───────┬───────┘                  │
│                         ▼                          │
│                 ┌───────────────┐                  │
│                 │  检索 + LLM   │                  │
│                 │  回答         │                  │
│                 └───────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### 2.4 技术选型

| 组件 | 推荐方案 | 理由 |
|------|----------|------|
| **向量数据库** | ChromaDB（本地）/ Qdrant（生产） | 轻量、易部署、Python/Node 双 SDK |
| **嵌入模型** | OpenAI text-embedding-3-small / 本地 BGE-M3 | 国内可用、成本低 |
| **文档解析** | LangChain document loaders | 支持 PDF/Word/MD/HTML |
| **分块策略** | RecursiveCharacterTextSplitter（512 tokens，50 overlap） | 平衡精度和成本 |

### 2.5 实现路径

**Phase 1：文件上传（最快落地）**
- 前端：文件上传组件（PDF/Word/MD）
- 后端：解析 → 分块 → 嵌入 → 存入 ChromaDB
- Agent 对话时：检索相关片段 → 拼入 context

**Phase 2：本地目录同步**
- 监听 `workspace/<agentId>/` 目录变化
- 自动索引新增/修改的文件
- 支持 skills/ 目录下的文档

**Phase 3：远程存储集成**
- 飞书文档：通过 OpenClaw 的 feishu-doc skill 读取
- Notion：通过 Notion API
- Google Drive：通过 Google API

---

## 三、Agent 评估与质量保障

### 3.1 评估框架

```
┌─────────────────────────────────────────────────┐
│              Agent 评估体系                       │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐│
│  │ 自动评估     │  │ 用户反馈    │  │ 基准测试   ││
│  │ LLM-as-Judge│  │ 👍/👎      │  │ 测试用例   ││
│  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘│
│         │                │                │       │
│         └────────────────┼────────────────┘       │
│                          ▼                         │
│                 ┌───────────────┐                  │
│                 │  评估指标      │                  │
│                 │  - 准确率      │                  │
│                 │  - 相关性      │                  │
│                 │  - 完整性      │                  │
│                 │  - 成本        │                  │
│                 │  - 延迟       │                  │
│                 └───────┬───────┘                  │
│                         ▼                          │
│                 ┌───────────────┐                  │
│                 │  质量报告      │                  │
│                 │  - 趋势图      │                  │
│                 │  - 退化告警    │                  │
│                 │  - 模型对比    │                  │
│                 └───────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 实现方案

#### 方案 A：LLM-as-Judge（自动评估）

```typescript
// 每次 Agent 回复后，用另一个 LLM 评估质量
interface EvalResult {
  score: number;        // 1-5 分
  accuracy: boolean;    // 是否准确
  relevance: boolean;   // 是否相关
  completeness: boolean;// 是否完整
  feedback: string;     // 改进建议
}

async function evaluateResponse(
  question: string,
  response: string,
  context?: string
): Promise<EvalResult> {
  const evalPrompt = `
    请评估以下 AI 回复的质量（1-5 分）：
    
    用户问题：${question}
    AI 回复：${response}
    参考上下文：${context || '无'}
    
    评估维度：
    1. 准确性（事实是否正确）
    2. 相关性（是否回答了问题）
    3. 完整性（是否遗漏关键信息）
    4. 清晰度（表达是否清楚）
    
    请返回 JSON 格式评估结果。
  `;
  
  // 调用评估 LLM（可用便宜模型如 GPT-4o-mini）
  const result = await callLLM(evalPrompt);
  return JSON.parse(result);
}
```

**优点**：全自动、可大规模运行
**缺点**：评估 LLM 本身可能有偏差

#### 方案 B：用户反馈（人工评估）

```typescript
// 前端：每条消息后加 👍/👎 按钮
// 后端：记录反馈，用于计算满意度

interface UserFeedback {
  messageId: string;
  rating: 'good' | 'bad';
  comment?: string;
  timestamp: number;
}

// 指标
const satisfactionRate = goodCount / (goodCount + badCount);
```

**优点**：最真实的用户感知
**缺点**：需要用户主动反馈，数据量有限

#### 方案 C：基准测试（Test Suite）

```typescript
// 预定义测试用例，定期运行
interface TestCase {
  id: string;
  agentId: string;
  input: string;
  expectedOutput: string;
  tags: string[];  // ['accuracy', 'format', 'tone']
}

// 运行测试
async function runBenchmark(agentId: string, testCases: TestCase[]) {
  const results = [];
  for (const tc of testCases) {
    const response = await callAgent(agentId, tc.input);
    const eval = await evaluateResponse(tc.input, response, tc.expectedOutput);
    results.push({ testCase: tc, response, eval });
  }
  return aggregateResults(results);
}
```

**优点**：可重复、可对比、可追踪退化
**缺点**：需要维护测试用例

### 3.3 推荐实施路径

**Phase 1：用户反馈（1-2 天）**
- 前端消息气泡加 👍/👎
- 后端记录反馈到数据库
- 管理面显示满意度统计

**Phase 2：LLM-as-Judge（1 周）**
- 每次回复后异步评估
- 评估结果存入数据库
- 管理面显示质量趋势图

**Phase 3：基准测试（2 周）**
- 为每个 Agent 定义测试用例
- 定期自动运行（cron）
- 质量退化告警

---

## 四、总结与建议

### 4.1 架构定位

AiCumi 的架构是**合理的**——我们是"产品壳"，OpenClaw 是"引擎"。这个分层让我们可以：
- 快速迭代 UI/UX
- 不碰引擎内部，升级只做适配
- 专注用户体验（人设、技能、渠道）

**但需要增强的是**：对引擎层的"可观测性"和"可控性"——评估、知识库、模型路由。

### 4.2 优先级建议

| 优先级 | 改进项 | 工作量 | 理由 |
|--------|--------|--------|------|
| **P0** | 用户反馈（👍/👎） | 1-2 天 | 最快获得质量信号 |
| **P0** | RAG Phase 1（文件上传） | 1 周 | 让 Agent 真正"懂"业务 |
| **P1** | LLM-as-Judge | 1 周 | 自动化质量评估 |
| **P1** | RAG Phase 2（本地目录） | 1 周 | 自动同步知识 |
| **P2** | 基准测试 | 2 周 | 质量退化检测 |
| **P2** | RAG Phase 3（远程存储） | 2 周 | 团队协作知识 |

### 4.3 不建议做的事

- ❌ **不要替换 OpenClaw 为 CrewAI** — CrewAI 是 Python 框架，与我们的 Node.js 技术栈不兼容；且 OpenClaw 的 Agent 运行时已经很成熟
- ❌ **不要自研 Agent 编排引擎** — 这是 OpenClaw 的核心能力，我们不该重造
- ❌ **不要过度工程化评估系统** — 先用最简单的方案（用户反馈），再逐步增强
