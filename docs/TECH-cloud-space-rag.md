# AiCumi 云空间 + 可配置 RAG 知识问答 · 技术方案

> 版本：v1.0
> 日期：2026-08-22
> 状态：方案评审中
> 模块：云空间（Cloud Space）+ RAG 实验室 + 模型配置增强

---

## 〇、一句话概述

在现有 Agent 平台上新增**本地云空间文件管理**（只读 + 高质量渲染）和**可配置 RAG 知识问答**（分块 / 检索 / Embedding 全部可调），使 Agent 能基于用户本地文档进行专业问答。同步修复千问 DashScope Embedding 测试 404，增强模型配置页字段。

---

## 一、需求背景与目标

### 1.1 背景

AiCumi 当前已完成核心 Agent 能力（对话、工具调用、向量记忆、HITL、Tracing、工作流编排）。前端导航栏底部有 `planned: true` 的占位入口（知识问答、云文档、任务、设置），其中：

- **云文档**：不做独立编辑器，改为本地云空间（文件管理 + 预览渲染）
- **知识问答**：以 RAG 为核心，所有策略可配置，学习导向
- **设置**：承载 RAG 实验室配置页

### 1.2 目标

| 模块 | 目标 | 面试价值 |
|------|------|----------|
| **云空间** | 本地文件目录管理，上传 / 删除 / 浏览 / 高质量渲染（只读） | 为 RAG 提供数据源 |
| **RAG 知识问答** | 基于云空间文档的检索增强生成，分块 / 检索 / Embedding 全部可配置 | ⭐⭐⭐⭐⭐ 面试核心 |
| **RAG 实验室** | RAG 配置可视化调整 + 重新索引 + 效果对比 | 展示深度理解 |
| **模型配置增强** | 修复千问测试 404，扩展能力参数 / 计费限量字段 | 产品完善度 |

### 1.3 设计原则

1. **学习导向**：RAG 所有策略可调，便于面试时讲解调优思路
2. **不重复造轮子**：云空间只读不上编辑器，PDF 用成熟库渲染
3. **渐进式实现**：先跑通本地文件 + RAG，后续可扩展数据源
4. **复用现有基础设施**：ChromaDB、VectorMemory、模型管理、FastAPI

---

## 二、总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                      前端 Workspace                          │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │  云空间      │  │  文档预览                              │  │
│  │  - 文件树    │  │  - Markdown（react-markdown）          │  │
│  │  - 上传      │  │  - PDF（pymupdf 页面图片）             │  │
│  │  - 删除      │  │  - 代码（syntax-highlighter）          │  │
│  │  - 目录浏览  │  │  - 图片（自适应 + 灯箱）               │  │
│  └──────────────┘  └──────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │  RAG 实验室  │  │  模型配置增强                          │  │
│  │  - 分块策略  │  │  - 能力参数                            │  │
│  │  - 检索策略  │  │  - 计费限量                            │  │
│  │  - Embedding │  │  - 千问测试修复                        │  │
│  └──────────────┘  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI 后端                             │
│  /api/files/*          云空间文件 CRUD                       │
│  /api/knowledge/*      知识库管理 / 索引                     │
│  /api/settings/rag     RAG 配置                             │
│  /api/chat/send        对话接口（knowledge_scope 参数）       │
│  /api/models/*         模型配置（增强字段）                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     RAG Pipeline                             │
│                                                             │
│  文件解析 → 文本清洗 → 分块策略 → 千问 Embedding →            │
│  ChromaDB → 检索策略 → 可选重排序 → Prompt 注入 → Agent 回答  │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、云空间（Cloud Space）

### 3.1 存储路径

```
backend/data/cloud-space/
├── docs/
│   ├── rag-notes.md
│   └── attention-is-all-you-need.pdf
├── papers/
│   └── ...
└── code/
    └── examples.py
```

> Docker 部署时需挂载该目录到宿主机或 volume，避免容器重启丢失。

### 3.2 功能范围

| 功能 | 是否实现 | 说明 |
|------|----------|------|
| 目录浏览 | ✅ | 树形结构，支持嵌套目录 |
| 文件上传 | ✅ | 单文件 / 批量上传 |
| 文件删除 | ✅ | 物理删除 + ChromaDB 同步清理索引 |
| 文件夹创建 | ✅ | 支持 |
| 文件预览 | ✅ | Markdown / PDF / 代码 / 图片，高质量渲染 |
| 文件编辑 | ❌ | 不做，只读 |

### 3.3 支持的文件格式

| 格式 | 解析方式 | 前端渲染组件 | 预览效果 |
|------|----------|-------------|----------|
| `.md` | 直接读取 | `react-markdown` + `remark-gfm` + `rehype-highlight` | 最佳，表格 / 代码 / 链接全支持 |
| `.txt` | 直接读取 | `<pre>` 文本渲染 | 保持换行 |
| `.pdf` | `pymupdf` 渲染为页面图片 | `<img>` 列表 + 页码导航 | 保留原始排版（推荐方案） |
| `.docx` | `markitdown` 转 Markdown | `react-markdown` | 转换后渲染 |
| `.py/.js/.ts/.json/.yaml/.html` | 直接读取 | `react-syntax-highlighter` | 语法高亮 + 行号 |
| `.png/.jpg/.jpeg/.webp/.gif` | 直接访问 | `<img>` 自适应 | 灯箱点击放大 |

### 3.4 文件上传流程

```text
前端选择文件
    │
    ▼
POST /api/files/upload
    │
    ▼
后端保存到 cloud-space/{relative_path}/{filename}
    │
    ├─ 如果是 Markdown / PDF / DOCX / TXT 等可索引格式
    │   → 自动触发 RAG 索引（或提示用户手动索引）
    │
    ▼
返回文件信息（size, mime_type, created_at）
```

### 3.5 删除联动

删除文件时：
1. 物理删除 `cloud-space/` 中的文件。
2. 查询 `knowledge_documents` 表获取 `document_id`。
3. 从 ChromaDB 对应 collection 中删除该文档的所有 chunks。
4. 删除 `knowledge_documents` 记录。

### 3.6 预览渲染技术选型

| 组件 | 库 | 说明 |
|------|-----|------|
| Markdown | `react-markdown` + `remark-gfm` | GFM 表格 + 任务列表 |
| 代码高亮 | `rehype-highlight` 或 `react-syntax-highlighter` | 代码块语法高亮 |
| PDF | `pymupdf` 后端渲染为图片 | 保留原始排版 |
| 图片灯箱 | `yet-another-react-lightbox` 或原生 `<dialog>` | 点击放大 |

---

## 四、RAG Pipeline（核心模块）

### 4.1 Pipeline 全流程

```text
用户上传文档
    │
    ▼
┌─────────────────┐
│  1. 文件解析     │  根据扩展名分发解析器
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  2. 文本清洗     │  去空行 / 去页眉页脚 / 统一编码 / 去除无关字符
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  3. 文本分块     │  策略可选：fixed / recursive / markdown / semantic
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  4. Embedding    │  千问 qwen3.7-text-embedding / OpenAI / 本地模型
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  5. ChromaDB     │  存储向量 + 元数据（来源文档 / chunk 索引 / 原文）
└─────────────────┘
    │
    ▼
用户提问
    │
    ▼
┌─────────────────┐
│  6. 检索策略     │  vector / keyword / hybrid（BM25 + 向量融合）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  7. 重排序(可选)  │  按相似度 + 关键词密度重排
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  8. Prompt 注入  │  上下文片段 + 引用来源文档标题 / 路径
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  9. Agent 回答   │  带引用标注的专业回答
└─────────────────┘
```

### 4.2 文件解析器

```python
class DocumentParser:
    """文档解析器 — 统一入口"""

    def parse(self, file_path: str, mime_type: str) -> ParsedDocument:
        ...

    def _parse_markdown(self, path: str) -> str: ...
    def _parse_text(self, path: str) -> str: ...
    def _parse_pdf(self, path: str) -> str: ...
    def _parse_docx(self, path: str) -> str: ...
    def _parse_html(self, path: str) -> str: ...
    def _parse_image(self, path: str) -> str:  # 提取 EXIF / OCR(可选)

@dataclass
class ParsedDocument:
    content: str           # 解析后的纯文本 / Markdown
    metadata: dict         # 标题 / 作者 / 页数 等
    page_contents: list    # PDF 按页拆分的文本（可选）
```

解析库选型：

| 格式 | 库 | 说明 |
|------|-----|------|
| PDF | `pymupdf` (fitz) | 渲染为图片 + 文本提取 |
| DOCX | `markitdown`（微软开源） | 多格式统一转 Markdown |
| HTML | `beautifulsoup4` | 清洗标签 |
| Markdown | `markdown` / 原生读取 | 保留结构 |

### 4.3 分块策略

#### 4.3.1 策略对比

| 策略 | 原理 | 适用场景 | 推荐 |
|------|------|----------|------|
| **fixed** | 固定 token/字符数 + overlap | 通用，最简单 | ✅ 基准线 |
| **recursive** | 递归按分隔符切分（段落 → 句子 → 字符） | 推荐默认 | ✅ 默认 |
| **markdown** | 按 Markdown 标题层级（H1→H2→H3）切分 | 结构清晰的文档 | ✅ Markdown 场景 |
| **semantic** | 按语义边界切分（嵌入相似度跳变点） | 长文本，需要语义完整 | 后续扩展 |

#### 4.3.2 分块参数

| 参数 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| `chunk_strategy` | fixed / recursive / markdown / semantic | `recursive` | 分块策略 |
| `chunk_size` | 256 / 512 / 1024 / 2048 | `512` | 每个 chunk 的目标大小（字符数） |
| `chunk_overlap` | 0 / 64 / 128 / 256 | `128` | 相邻 chunk 重叠大小 |
| `separator` | 段落 / 句子 / 换行 / 自定义字符串 | `段落`（`\n\n`） | 递归切分的分隔符 |

#### 4.3.3 实现伪代码

```python
class TextChunker:
    def __init__(self, strategy: str, chunk_size: int, overlap: int, separator: str):
        self.strategy = strategy
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.separator = separator

    def chunk(self, text: str) -> list[TextChunk]:
        if self.strategy == "fixed":
            return self._fixed_chunk(text)
        elif self.strategy == "recursive":
            return self._recursive_chunk(text, self.separator)
        elif self.strategy == "markdown":
            return self._markdown_chunk(text)
        elif self.strategy == "semantic":
            return self._semantic_chunk(text)
        ...

    def _recursive_chunk(self, text: str, separator: str) -> list[TextChunk]:
        """LangChain 风格递归切分：先按大分隔符切，超长再按小分隔符切"""
        separators = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]
        ...

    def _markdown_chunk(self, text: str) -> list[TextChunk]:
        """按 Markdown 标题层级切分：## 为一级，### 为二级..."""
        ...
```

### 4.4 Embedding：千问 DashScope

#### 4.4.1 DashScope Embedding API

**端点**：

```text
POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding
```

**请求头**：

```http
Authorization: Bearer {DASHSCOPE_API_KEY}
Content-Type: application/json
```

**请求体**：

```json
{
  "model": "qwen3.7-text-embedding",
  "input": {
    "texts": ["文本1", "文本2", "文本3"]
  }
}
```

**响应体**：

```json
{
  "output": {
    "embeddings": [
      {"text_index": 0, "embedding": [0.1, 0.2, ...]},
      {"text_index": 1, "embedding": [0.3, 0.4, ...]},
      {"text_index": 2, "embedding": [0.5, 0.6, ...]}
    ]
  },
  "usage": {
    "total_tokens": 150
  },
  "request_id": "xxx"
}
```

**限制**：
- 单次最多 25 条文本
- 每条文本最多 8192 tokens
- 并发限制：取决于 API Key 配额

#### 4.4.2 Embedding Provider 抽象

```python
from abc import ABC, abstractmethod

class EmbeddingProvider(ABC):
    """Embedding 供应商抽象"""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """批量文本转向量"""
        pass

    @abstractmethod
    def dimensions(self) -> int:
        """向量维度"""
        pass


class DashScopeEmbeddingProvider(EmbeddingProvider):
    """千问 DashScope Embedding"""

    def __init__(self, api_key: str, model: str = "qwen3.7-text-embedding"):
        self.api_key = api_key
        self.model = model
        self.api_url = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """DashScope 最多 25 条/次，需要分批"""
        batch_size = 25
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await self._call_api(batch)
            # 按 text_index 排序
            sorted_embs = sorted(response["output"]["embeddings"], key=lambda x: x["text_index"])
            all_embeddings.extend([e["embedding"] for e in sorted_embs])
        return all_embeddings

    async def _call_api(self, texts: list[str]) -> dict:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.api_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "input": {"texts": texts}},
                timeout=30.0,
            )
            resp.raise_for_status()
            return resp.json()

    def dimensions(self) -> int:
        return 1024  # qwen3.7-text-embedding 维度
```

#### 4.4.3 Fallback 策略

```text
优先级：
1. 千问 DashScope（主配置）
2. OpenAI Embedding（如果配置了 key）
3. 本地 nomic-embed-text（如果安装了 Ollama）
4. 关键词匹配兜底（ChromaDB 无向量时）
```

### 4.5 检索策略

#### 4.5.1 策略对比

| 策略 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **vector** | 余弦相似度 / L2 距离 | 语义理解强 | 可能漏掉精确关键词 |
| **keyword** | BM25 / TF-IDF | 精确匹配强 | 无语义理解 |
| **hybrid** | 向量 + 关键词融合排序（RRF / 加权） | 两者兼顾 | 实现复杂度高 |

#### 4.5.2 检索参数

| 参数 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| `retrieval_mode` | vector / keyword / hybrid | `vector` | 检索模式 |
| `top_k` | 3 / 5 / 10 / 20 | `5` | 返回最相关的 chunk 数量 |
| `score_threshold` | 0.0 ~ 1.0 | `0.5` | 相似度阈值，低于此分数不返回 |
| `rerank_enabled` | true / false | `false` | 是否启用重排序 |
| `rerank_top_n` | 3 / 5 / 10 | `5` | 重排序后保留的 chunk 数量 |

#### 4.5.3 Hybrid 检索实现

```python
class HybridRetriever:
    """向量 + 关键词混合检索"""

    def __init__(self, vector_weight: float = 0.6, keyword_weight: float = 0.4):
        self.vector_weight = vector_weight
        self.keyword_weight = keyword_weight

    async def retrieve(self, query: str, top_k: int = 5) -> list[RetrievalResult]:
        # 1. 向量检索
        vector_results = await self._vector_search(query, top_k=top_k * 2)

        # 2. 关键词检索（BM25）
        keyword_results = await self._keyword_search(query, top_k=top_k * 2)

        # 3. 融合排序（Reciprocal Rank Fusion）
        fused = self._rrf_fusion(vector_results, keyword_results)

        # 4. 返回 top_k
        return fused[:top_k]

    def _rrf_fusion(self, *result_lists) -> list[RetrievalResult]:
        """Reciprocal Rank Fusion: score = Σ 1/(k + rank_i)"""
        k = 60  # RRF 常数
        scores = {}
        for results in result_lists:
            for rank, result in enumerate(results):
                key = result.chunk_id
                scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        # 按融合分数排序
        ...
```

### 4.6 重排序（Rerank）

```text
原始检索结果（top-k）
    │
    ▼
┌─────────────────┐
│  Rerank 模型    │  可选：Cohere Rerank / Jina Rerank / 本地 Cross-Encoder
└─────────────────┘
    │
    ▼
重排序后的结果（top-n）
```

可选实现：
- **Cohere Rerank API**：效果好，需要额外 API Key
- **本地 Cross-Encoder**：`sentence-transformers` 的 `cross-encoder/ms-marco-MiniLM-L-6-v2`
- **简单方案**：按向量相似度 + 关键词命中数加权重排

### 4.7 ChromaDB 存储设计

#### 4.7.1 Collection 结构

```text
Collection: knowledge_chunks
├── id: chunk_{uuid}
├── document: "chunk 文本内容"
├── embedding: [float vector]
├── metadata:
│   ├── document_id: "doc_{uuid}"
│   ├── file_path: "docs/rag-notes.md"
│   ├── file_name: "rag-notes.md"
│   ├── chunk_index: 3
│   ├── chunk_strategy: "recursive"
│   ├── chunk_size: 512
│   ├── start_char: 2048
│   └── end_char: 2560
```

#### 4.7.2 元数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `document_id` | str | 关联 `knowledge_documents` 表 |
| `file_path` | str | 文件相对路径 |
| `file_name` | str | 文件名 |
| `chunk_index` | int | 在文档中的 chunk 序号 |
| `chunk_strategy` | str | 使用的分块策略 |
| `chunk_size` | int | 分块大小 |
| `start_char` | int | 原文起始字符位置 |
| `end_char` | int | 原文结束字符位置 |

---

## 五、Agent 对话集成

### 5.1 聊天接口扩展

`POST /api/chat/send` 新增可选字段：

```json
{
  "agent_id": "xiao-yan",
  "room_id": "room_xxx",
  "content": "解释一下 RAG 的检索策略",
  "knowledge_scope": {
    "mode": "auto",
    "directory_ids": []
  }
}
```

#### 5.1.1 knowledge_scope 参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `"auto"` \| `"selected"` | 检索模式 |
| `directory_ids` | `string[]` | `mode=selected` 时指定目录路径列表 |

- `mode: auto`：从用户所有可访问的云空间目录中检索
- `mode: selected`：只从指定目录检索（精准问答）

#### 5.1.2 Agent 注入逻辑

```python
async def build_rag_context(agent_id: str, query: str, knowledge_scope: dict) -> str:
    """构建 RAG 上下文"""

    # 1. 获取 RAG 配置
    rag_config = get_rag_settings()

    # 2. 构建检索范围过滤器
    if knowledge_scope.get("mode") == "selected":
        filter_paths = knowledge_scope.get("directory_ids", [])
        where_filter = {"file_path": {"$in": filter_paths}}
    else:
        where_filter = None

    # 3. 执行检索
    retriever = get_retriever(rag_config)
    results = await retriever.retrieve(
        query=query,
        top_k=rag_config.top_k,
        where_filter=where_filter,
    )

    # 4. 构建 Prompt 上下文
    context_parts = []
    for i, result in enumerate(results):
        context_parts.append(
            f"[文档片段 {i+1}] 来源: {result.file_name} ({result.file_path})\n"
            f"{result.content}"
        )

    return "\n\n---\n\n".join(context_parts)
```

### 5.2 Agent System Prompt 增强

在 Agent 的 system_message 中追加：

```text
你有一个知识库可供查询。当用户的问题与知识库内容相关时，请基于知识库中的信息回答。

知识库检索结果将通过 [知识库上下文] 标记提供。
请在回答中引用具体来源，格式：[来源: 文件名]
如果知识库中没有相关信息，请如实说明。
```

### 5.3 引用溯源

Agent 回答中自动标注引用来源：

```text
根据知识库中的资料，RAG 的检索策略主要分为以下几种... [来源: rag-notes.md]
其中 Hybrid 检索结合了向量检索和关键词检索的优势... [来源: rag-comparison.md]
```

前端显示为可点击的链接，点击后在云空间中定位到对应文件。

---

## 六、RAG 实验室（设置页）

### 6.1 页面结构

```text
RAG 实验室
├── 💾 Embedding 配置
│   ├── 默认 Embedding 模型（下拉选择，过滤 embedding 类型）
│   ├── 批处理大小（32 / 64 / 128）
│   └── 向量维度（只读，由模型决定）
├── ✂️ 分块策略
│   ├── 策略选择 [固定长度 | 递归切分 | Markdown 标题]
│   ├── Chunk 大小（slider: 256 ~ 2048）
│   ├── 重叠大小（slider: 0 ~ 256）
│   └── 分隔符（下拉或自定义输入）
├── 🔍 检索策略
│   ├── 检索模式 [向量 | 关键词 | 混合]
│   ├── Top-K（slider: 3 ~ 20）
│   ├── 相似度阈值（slider: 0.0 ~ 1.0）
│   ├── 启用重排序（开关）
│   └── Rerank Top-N（slider: 3 ~ 10）
├── 📊 知识库状态
│   ├── 已索引文档数
│   ├── 总 chunk 数
│   ├── 索引大小
│   └── 最后索引时间
└── ⚡ 操作
    ├── 保存配置
    └── 重新索引全部文档
```

### 6.2 操作说明

| 操作 | 说明 |
|------|------|
| **保存配置** | 保存当前 RAG 配置，下次索引和检索自动使用 |
| **重新索引全部** | 清空 ChromaDB 中所有 chunks，按当前分块策略重新解析所有文档并重建索引 |

### 6.3 预期学习效果

| 调整项 | 预期效果 | 学习价值 |
|--------|----------|----------|
| chunk_size 从 512 → 256 | 检索更精细，但上下文可能断裂 | 理解 chunk 粒度的权衡 |
| chunk_size 从 512 → 2048 | 上下文更完整，但检索可能不准 | 理解检索精度 vs 召回 |
| strategy 从 recursive → markdown | 结构化文档效果更好 | 理解文档结构对 RAG 的影响 |
| retrieval_mode 从 vector → hybrid | 精确关键词匹配改善 | 理解语义 vs 关键词的互补 |
| 启用 rerank | 检索质量提升 | 理解重排序的价值 |

---

## 七、模型配置增强

### 7.1 问题：千问 Embedding 测试 404

**根因**：当前测试连接可能默认走 OpenAI 兼容端点 `POST /v1/embeddings`，而千问 DashScope Embedding 的端点是：

```text
POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding
```

请求体格式也不同：
- OpenAI：`{"model": "...", "input": "text"}` 或 `{"input": ["text"]}`
- DashScope：`{"model": "...", "input": {"texts": ["text"]}}`

**修复方案**：

```python
async def test_model_connection(model_config: ModelConfig) -> TestResult:
    if model_config.provider == "dashscope":
        if model_config.type == "embedding":
            return await _test_dashscope_embedding(model_config)
        else:
            return await _test_dashscope_chat(model_config)
    elif model_config.provider == "openai":
        return await _test_openai(model_config)
    else:
        return await _test_custom(model_config)


async def _test_dashscope_embedding(config: ModelConfig) -> TestResult:
    """千问 DashScope Embedding 测试"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.base_url}/services/embeddings/text-embedding/text-embedding",
            headers={"Authorization": f"Bearer {config.api_key}"},
            json={
                "model": config.model_name,
                "input": {"texts": ["测试文本，用于验证连接是否正常"]},
            },
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            dim = len(data["output"]["embeddings"][0]["embedding"])
            return TestResult(success=True, message=f"连接成功，向量维度: {dim}")
        else:
            return TestResult(success=False, message=f"HTTP {resp.status_code}: {resp.text}")
```

### 7.2 新增字段

在现有模型编辑表单中增加以下字段（分组展示）：

#### 能力参数

| 字段名 | Key | 类型 | 说明 |
|--------|-----|------|------|
| 向量维度 | `embedding_dimensions` | number | Embedding 模型专属 |
| 最大输入长度 | `max_input_tokens` | number | 最大输入 token 数 |
| 最大输出长度 | `max_output_tokens` | number | 最大输出 token 数 |
| 上下文窗口 | `context_window` | number | 模型上下文窗口 |
| 支持视觉 | `supports_vision` | boolean | 是否支持图片输入 |
| 支持工具调用 | `supports_function_calling` | boolean | 是否支持 function call |
| 支持流式输出 | `supports_streaming` | boolean | 是否支持 streaming |

#### 计费限量

| 字段名 | Key | 类型 | 说明 |
|--------|-----|------|------|
| 输入单价 | `price_per_1k_input_tokens` | number | 每 1K 输入 token 价格（元） |
| 输出单价 | `price_per_1k_output_tokens` | number | 每 1K 输出 token 价格（元） |
| RPM | `rate_limit_rpm` | number | 每分钟请求数限制 |
| TPM | `rate_limit_tpm` | number | 每分钟 token 数限制 |
| TPD | `rate_limit_tpd` | number | 每天 token 数限制 |
| 批处理大小 | `batch_size` | number | Embedding 批处理大小 |

### 7.3 前端展示

在现有表单下方用分组折叠面板展示：

```text
编辑模型 — Embedding
├── [基本信息] 模型类型 / 提供商 / 模型名称 / API Key / Base URL / 备注
│
├── [▶ API 配置]  ← 折叠面板
│   ├── Base URL
│   ├── API Key
│   └── Embedding Endpoint
│
├── [▶ 能力参数]  ← 折叠面板
│   ├── 向量维度
│   ├── 最大输入/输出长度
│   ├── 上下文窗口
│   └── 支持 Vision / Function Calling / Streaming
│
├── [▶ 计费限量]  ← 折叠面板
│   ├── 输入/输出单价
│   ├── RPM / TPM / TPD
│   └── 批处理大小
│
└── [设为此类型的默认模型]  ← 已有
```

---

## 八、数据库设计

### 8.1 新增表：knowledge_documents

```sql
CREATE TABLE knowledge_documents (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,        -- 相对云空间根目录的路径
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    chunk_count INTEGER DEFAULT 0,          -- 已索引的 chunk 数量
    status TEXT DEFAULT 'pending',           -- pending / indexing / indexed / failed / outdated
    error_message TEXT,
    last_indexed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 新增表：rag_settings

```sql
CREATE TABLE rag_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    -- 分块策略
    chunk_strategy TEXT DEFAULT 'recursive',
    chunk_size INTEGER DEFAULT 512,
    chunk_overlap INTEGER DEFAULT 128,
    separator TEXT DEFAULT '\n\n',
    -- 检索策略
    retrieval_mode TEXT DEFAULT 'vector',
    top_k INTEGER DEFAULT 5,
    score_threshold REAL DEFAULT 0.5,
    rerank_enabled BOOLEAN DEFAULT FALSE,
    rerank_top_n INTEGER DEFAULT 5,
    -- Embedding
    embedding_model_id TEXT,                 -- 关联 models 表
    -- 元数据
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 8.3 models 表新增字段

```sql
ALTER TABLE models ADD COLUMN embedding_dimensions INTEGER;
ALTER TABLE models ADD COLUMN max_input_tokens INTEGER;
ALTER TABLE models ADD COLUMN max_output_tokens INTEGER;
ALTER TABLE models ADD COLUMN context_window INTEGER;
ALTER TABLE models ADD COLUMN supports_vision BOOLEAN DEFAULT FALSE;
ALTER TABLE models ADD COLUMN supports_function_calling BOOLEAN DEFAULT FALSE;
ALTER TABLE models ADD COLUMN supports_streaming BOOLEAN DEFAULT TRUE;
ALTER TABLE models ADD COLUMN price_per_1k_input_tokens REAL;
ALTER TABLE models ADD COLUMN price_per_1k_output_tokens REAL;
ALTER TABLE models ADD COLUMN rate_limit_rpm INTEGER;
ALTER TABLE models ADD COLUMN rate_limit_tpm INTEGER;
ALTER TABLE models ADD COLUMN rate_limit_tpd INTEGER;
ALTER TABLE models ADD COLUMN batch_size INTEGER DEFAULT 32;
```

---

## 九、API 设计

### 9.1 云空间 API

| 方法 | 端点 | 说明 | 请求体 |
|------|------|------|--------|
| `GET` | `/api/files` | 列出目录内容 | `?path=docs/papers` |
| `POST` | `/api/files/folder` | 创建文件夹 | `{"path": "new-folder"}` |
| `POST` | `/api/files/upload` | 上传文件 | `multipart/form-data` |
| `DELETE` | `/api/files/{path:path}` | 删除文件或空文件夹 | - |
| `GET` | `/api/files/{path:path}/content` | 读取文件原始内容 | - |
| `GET` | `/api/files/{path:path}/preview` | 获取预览（PDF 返回图片列表，MD 返回原文） | - |
| `GET` | `/api/files/{path:path}/download` | 下载文件 | - |
| `GET` | `/api/files/tree` | 获取完整文件树 | `?path=` |

#### 示例：列出目录

```http
GET /api/files/tree?path=docs
```

```json
{
  "tree": {
    "name": "cloud-space",
    "type": "directory",
    "children": [
      {
        "name": "docs",
        "type": "directory",
        "children": [
          {"name": "rag-notes.md", "type": "file", "size": 15234, "mime_type": "text/markdown"},
          {"name": "attention.pdf", "type": "file", "size": 524288, "mime_type": "application/pdf"}
        ]
      }
    ]
  }
}
```

### 9.2 知识库 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/knowledge/stats` | 知识库统计（文档数、chunk 数、索引状态） |
| `POST` | `/api/knowledge/index/{path:path}` | 索引指定文件或目录 |
| `POST` | `/api/knowledge/reindex-all` | 重新索引全部文档 |
| `DELETE` | `/api/knowledge/documents/{id}` | 删除指定文档索引 |
| `GET` | `/api/knowledge/documents` | 已索引文档列表 |
| `POST` | `/api/knowledge/query` | 直接检索测试（不经过 Agent） |

#### 示例：检索测试

```http
POST /api/knowledge/query
{
  "query": "什么是 RAG 的分块策略",
  "top_k": 5,
  "retrieval_mode": "hybrid",
  "directory_filter": ["docs"]
}
```

```json
{
  "results": [
    {
      "chunk_id": "chunk_xxx",
      "content": "RAG 的分块策略主要有...",
      "file_name": "rag-notes.md",
      "file_path": "docs/rag-notes.md",
      "score": 0.87,
      "chunk_index": 3
    }
  ],
  "total_results": 5,
  "query_time_ms": 45
}
```

### 9.3 RAG 设置 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/settings/rag` | 获取当前 RAG 配置 |
| `PUT` | `/api/settings/rag` | 更新 RAG 配置 |

### 9.4 聊天接口扩展

在现有 `POST /api/chat/send` 中新增可选字段：

```json
{
  "agent_id": "xiao-yan",
  "content": "解释一下 RAG 检索策略",
  "knowledge_scope": {
    "mode": "selected",
    "directory_ids": ["docs/rag"]
  }
}
```

---

## 十、前端组件设计

### 10.1 云空间页面

```text
┌────────────────────────────────────────────────────────────────┐
│  📁 云空间    上传 ↑  新建文件夹 📂  刷新 ↻     [搜索框...]   │
├──────────────────┬─────────────────────────────────────────────┤
│                  │                                             │
│  📁 docs        │  📄 rag-notes.md                            │
│  ├─ 📄 notes.md │  ─────────────────────────────────────────  │
│  ├─ 📄 paper.pdf│  # RAG 知识问答笔记                         │
│  └─ 📁 sub/     │                                             │
│  📁 papers      │  ## 概述                                    │
│  └─ 📄 test.md  │  RAG (Retrieval-Augmented Generation)       │
│                  │  是一种将检索与生成相结合的技术...            │
│                  │                                             │
│                  │  ## 分块策略                                │
│                  │  | 策略 | 说明 |                            │
│                  │  |------|------|                            │
│                  │  | fixed | 固定长度 |                       │
│                  │  | recursive | 递归切分 |                   │
│                  │                                             │
│                  │  ```python                                  │
│                  │  def chunk(text):                           │
│                  │      ...                                    │
│                  │  ```                                        │
│                  │                                             │
├──────────────────┴─────────────────────────────────────────────┤
│  右键菜单：重命名 | 删除 | 复制路径 | 重新索引                   │
└────────────────────────────────────────────────────────────────┘
```

组件树：

```text
CloudSpacePage
├── CloudSpaceToolbar        顶部工具栏（上传/新建/刷新/搜索）
├── CloudSpaceLayout         两栏布局
│   ├── FileTree             左侧文件树（递归展开/折叠）
│   │   └── FileTreeNode     单个节点（文件/目录图标 + 名称 + 大小）
│   └── DocumentPreview      右侧预览区
│       ├── MarkdownPreview  react-markdown 渲染
│       ├── CodePreview      syntax-highlighter 渲染
│       ├── PDFPreview       pymupdf 图片列表 + 页码导航
│       └── ImagePreview     自适应图片 + 灯箱
└── ContextMenu              右键菜单
```

### 10.2 RAG 实验室页面

```text
┌────────────────────────────────────────────────────────────────┐
│  🧪 RAG 实验室                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  💾 Embedding 配置                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  默认模型：[qwen3.7-text-embedding ▼]  维度：1024（只读）│  │
│  │  批处理大小：[32 ▼]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ✂️ 分块策略                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  策略：[固定长度] [递归切分●] [Markdown标题]              │  │
│  │  Chunk 大小：──────●─────── 512                          │  │
│  │  重叠大小：  ──●─────────── 128                          │  │
│  │  分隔符：    [\n\n ▼]                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  🔍 检索策略                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  模式：[向量●] [关键词] [混合]                           │  │
│  │  Top-K：────●────────── 5                               │  │
│  │  阈值：──────●──────── 0.5                              │  │
│  │  重排序：[○ 关闭●]  Top-N：────●──── 5                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  📊 知识库状态                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  已索引：12 篇文档  |  3,847 chunks  |  2.4 MB           │  │
│  │  最后索引：2026-08-22 14:30                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ⚡ 操作                                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [💾 保存配置]  [🔄 重新索引全部]  [🧪 检索测试]          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 十一、后端目录结构

```text
backend/app/
├── cloud_space/                # 新增：云空间模块
│   ├── __init__.py
│   ├── router.py               # /api/files/* 路由
│   ├── file_service.py         # 文件 CRUD 服务
│   └── preview_service.py      # 预览渲染服务
├── knowledge/                  # 新增：RAG 模块
│   ├── __init__.py
│   ├── router.py               # /api/knowledge/* 路由
│   ├── parser.py               # 文档解析器
│   ├── chunker.py              # 分块策略实现
│   ├── embedding_provider.py   # Embedding 供应商抽象
│   ├── retriever.py            # 检索策略实现
│   ├── indexer.py              # 索引管理（增删改查 ChromaDB）
│   └── rag_config.py           # RAG 配置管理
├── settings/                   # 新增：设置模块
│   ├── __init__.py
│   ├── router.py               # /api/settings/* 路由
│   └── rag_settings.py         # RAG 实验室配置
├── api/                        # 现有 API 模块
│   ├── members.py
│   ├── skills.py
│   ├── staff.py
│   └── channels.py
├── memory/                     # 现有记忆模块
│   └── vector_memory.py        # 复用 ChromaDB 基础设施
├── main.py                     # 主入口，注册新路由
├── database.py                 # 数据库（新增 knowledge_documents / rag_settings 表）
└── config.py                   # 全局配置
```

---

## 十二、前端目录结构

```text
frontend/src/
├── components/
│   └── workspace/
│       ├── CloudSpacePage.tsx       # 云空间主页面
│       ├── file-tree/
│       │   ├── FileTree.tsx         # 文件树组件
│       │   ├── FileTreeNode.tsx     # 单个节点
│       │   └── ContextMenu.tsx      # 右键菜单
│       ├── preview/
│       │   ├── DocumentPreview.tsx  # 预览入口
│       │   ├── MarkdownPreview.tsx  # Markdown 渲染
│       │   ├── CodePreview.tsx      # 代码高亮
│       │   ├── PDFPreview.tsx       # PDF 图片预览
│       │   └── ImagePreview.tsx     # 图片灯箱
│       ├── RAGLabPage.tsx          # RAG 实验室页面
│       ├── rag-settings/
│       │   ├── ChunkingSettings.tsx # 分块策略配置
│       │   ├── RetrievalSettings.tsx # 检索策略配置
│       │   └── EmbeddingSettings.tsx # Embedding 配置
│       ├── ModelEditForm.tsx        # 模型编辑表单（扩展字段）
│       ├── AppRail.tsx              # 导航栏（激活云空间入口）
│       └── Workspace.tsx            # 主工作区（新增路由）
```

---

## 十三、依赖安装

### 后端 (requirements.txt 新增)

```
# RAG Pipeline
pymupdf>=1.24.0          # PDF 解析 + 渲染为图片
python-docx>=1.1.0       # Word 文档解析
markitdown>=0.0.1        # 微软多格式转 Markdown（可选）
beautifulsoup4>=4.12.0   # HTML 清洗
httpx>=0.27.0            # DashScope API 调用
```

### 前端 (package.json 新增)

```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "rehype-highlight": "^7.0.0",
  "react-syntax-highlighter": "^15.5.0",
  "yet-another-react-lightbox": "^3.0.0"
}
```

---

## 十四、实施计划

### Phase 1：云空间（2-3 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1 | 后端文件 CRUD API + 目录浏览 | `/api/files/*` |
| Day 1 | 前端文件树组件 + 上传/删除 | 云空间基础页面 |
| Day 2 | Markdown/代码/图片预览渲染 | 文档预览功能 |
| Day 3 | PDF 预览（pymupdf 图片渲染） | PDF 可读 |

### Phase 2：RAG Pipeline（3-4 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 4 | 文档解析器（多格式） | `parser.py` |
| Day 5 | 分块策略实现（fixed / recursive / markdown） | `chunker.py` |
| Day 6 | 千问 Embedding Provider + ChromaDB 索引 | `embedding_provider.py` + `indexer.py` |
| Day 7 | 检索策略（vector / keyword / hybrid）+ 重排序 | `retriever.py` |

### Phase 3：Agent 集成 + RAG 实验室（2-3 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 8 | Agent 对话集成（knowledge_scope + Prompt 注入） | `/api/chat/send` 扩展 |
| Day 9 | RAG 设置 API + 前端页面 | RAG 实验室 |
| Day 10 | 引用溯源 + 检索测试面板 | 产品体验完善 |

### Phase 4：模型配置增强 + 收尾（1-2 天）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 11 | 修复千问 Embedding 测试 404 | DashScope 适配 |
| Day 12 | 模型配置页扩展字段（能力参数 / 计费限量） | 配置页增强 |
| Day 13 | 联调测试 + 文档更新 | 收尾 |

---

## 十五、面试话术

### 15.1 项目介绍

> "我独立实现了一个可配置的 RAG 知识问答系统。系统包含本地云空间文件管理、多种文档解析（PDF/Markdown/DOCX）、可切换的分块策略（fixed/recursive/markdown）、多种检索模式（向量/关键词/Hybrid），Embedding 使用千问 DashScope。"

### 15.2 技术亮点

| 亮点 | 话术 |
|------|------|
| **可配置分块策略** | "我把 RAG 的分块策略做成了可配置项，支持固定长度、递归切分、Markdown 标题切分三种模式。通过调整 chunk_size 和 overlap，可以对比不同策略的检索效果。" |
| **混合检索** | "我实现了向量 + 关键词的 Hybrid 检索，使用 Reciprocal Rank Fusion 融合两种排序结果，兼顾语义理解和精确匹配。" |
| **引用溯源** | "Agent 回答时会自动标注引用来源，用户可以点击链接定位到原文位置。" |
| **RAG 实验室** | "我做了一个 RAG 实验室页面，可以实时调整分块策略、检索模式、Top-K 等参数，并一键重建索引，方便对比不同配置的效果。" |
| **DashScope 适配** | "千问 DashScope 的 Embedding API 和 OpenAI 格式不同，我做了专门的适配层，支持自动分批（25条/次）和错误重试。" |

### 15.3 面试可能追问

| 问题 | 参考回答 |
|------|----------|
| 为什么选 ChromaDB 不选 Milvus？ | "个人项目优先零依赖和快速迭代。ChromaDB 嵌入式部署，无需额外容器。如果未来需要分布式，可以迁移到 Milvus。" |
| 分块大小怎么选？ | "默认 512 字符 + 128 重叠。太小会丢失上下文，太大检索不准。实际效果取决于文档类型，我在 RAG 实验室里可以实时调参对比。" |
| Hybrid 检索的融合策略？ | "使用 Reciprocal Rank Fusion（RRF），score = Σ 1/(k + rank_i)，k=60。不需要分数归一化，简单有效。" |
| 如何降低幻觉？ | "RAG 本身就降低幻觉。另外我让 Agent 在回答中标注引用来源，方便用户验证。还可以通过调低 score_threshold 过滤低相关度结果。" |

---

## 十六、总结

| 模块 | 工作量 | 面试价值 | 优先级 |
|------|--------|----------|--------|
| 云空间 | 2-3 天 | ⭐⭐ 为 RAG 提供数据源 | P0 |
| RAG Pipeline | 3-4 天 | ⭐⭐⭐⭐⭐ 面试核心 | P0 |
| RAG 实验室 | 2-3 天 | ⭐⭐⭐⭐ 展示深度理解 | P0 |
| 模型配置增强 | 1-2 天 | ⭐⭐⭐ 产品完善度 | P1 |
| **总计** | **8-12 天** | | |

> 本方案完成后，AiCumi 将具备完整的 RAG 知识问答能力，面试时可以完整讲述从数据管理、文档解析、分块策略、Embedding、检索到 Agent 集成的全链路。
