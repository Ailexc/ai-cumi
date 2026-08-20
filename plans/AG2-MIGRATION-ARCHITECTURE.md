# AiCumi 迁移至 AG2 架构设计文档

> 文档版本：v1.0
> 日期：2026-08-20
> 状态：规划中
> 目标：将 AiCumi 从 OpenClaw 引擎迁移至 AG2 框架，实现对话/群聊式多 Agent 协作

---

## 一、迁移动机

### 1.1 学习价值
- **行业标杆**：AG2（AutoGen 继任者）是对话/群聊式多 Agent 协作的行业标杆，由微软出品
- **面试竞争力**：掌握 AG2 比掌握 OpenClaw 更具面试竞争力
- **技术广度**：配合 CrewAI（企业编排）、LangGraph（复杂流程），形成完整技术矩阵
- **Python 能力**：补齐 Python Agent 开发能力，对转型 AI Agent 工程师至关重要

### 1.2 技术价值
- **对话驱动协作**：AG2 的 GroupChat 模式支持 Agent 之间的自由讨论、辩论、协商
- **企业级特性**：评估、追踪、检查点、记忆、缓存
- **分布式支持**：gRPC Worker Runtime，Agent 可分布在不同机器
- **标准化协议**：A2A 和 MCP，内置企业安全

### 1.3 项目定位
- **学习项目**：主要目的是学习，不是商业化
- **技术覆盖**：CrewAI + LangGraph + AG2 覆盖主流 Agent 开发范式
- **简历加分**：三个项目形成完整技术栈展示

---

## 二、当前架构分析

### 2.1 当前架构图

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器（React）                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Chat UI    │  │ Member Mgmt │  │ Skill Mkt   │     │
│  │  聊天界面    │  │ 成员管理     │  │ 技能市场    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │ HTTP/WS                      │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    Node.js 聊天服务器                     │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              ws-server.ts                       │     │
│  │  - WebSocket 桥接                               │     │
│  │  - 房间/会话映射                                │     │
│  │  - @路由                                       │     │
│  │  - 消息持久化                                   │     │
│  └───────────────────────┬────────────────────────┘     │
│                          │ Gateway WS 协议              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              API 路由层                          │     │
│  │  - /api/members (成员管理)                       │     │
│  │  - /api/staff (添加员工)                         │     │
│  │  - /api/audit (审计日志)                         │     │
│  │  - /api/skills (技能市场)                        │     │
│  └───────────────────────────────────────────────┘     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    OpenClaw 引擎                         │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              Gateway (WS Server)                │     │
│  │  - 会话管理                                     │     │
│  │  - 消息路由                                     │     │
│  │  - 事件流                                       │     │
│  └───────────────────────┬────────────────────────┘     │
│                          │                              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              Agent Runtime                       │     │
│  │  - AGENTS.md (人设)                              │     │
│  │  - sessions_spawn (委派)                         │     │
│  │  - 记忆 (MEMORY.md)                              │     │
│  │  - 工具 (skills/)                                │     │
│  │  - cron (定时任务)                               │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 当前技术栈

| 组件 | 技术栈 | 说明 |
|------|--------|------|
| **前端** | React + TypeScript | 聊天界面、成员管理、技能市场 |
| **后端** | Node.js + Express | WebSocket 服务器、API 路由 |
| **引擎** | OpenClaw (Node.js) | Agent 运行时、记忆、工具、插件 |
| **通信** | WebSocket + HTTP | 前端 ↔ 后端 ↔ 引擎 |
| **数据** | JSON 文件 + SQLite | 房间、成员、审计日志、记忆索引 |
| **部署** | Docker Compose | 容器化部署 |

### 2.3 当前能力

| 能力 | 状态 | 说明 |
|------|------|------|
| ✅ 私聊 | 完成 | 1 用户 ↔ 1 员工，流式回复 |
| ✅ 群聊 + @ 路由 | 完成 | 1 群 ↔ 多员工，@ 触发 |
| ✅ 成员管理 | 完成 | 增删改查、档案中心 |
| ✅ 人设系统 | 完成 | 模板库 + 精修向导 |
| ✅ 技能市场 | 完成 | 10 个预置技能，绑定/解绑 |
| ✅ 渠道管理 | 完成 | 5 个通道模板，配置管理 |
| ✅ 未读角标 | 完成 | 实时计数 |
| ✅ 审计日志 | 完成 | 写操作追溯 |
| ✅ 容器化部署 | 完成 | Docker Compose |

---

## 三、新架构设计（AG2）

### 3.1 新架构图

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器（React）                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Chat UI    │  │ Member Mgmt │  │ Skill Mkt   │     │
│  │  聊天界面    │  │ 成员管理     │  │ 技能市场    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │ HTTP/WS                      │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    Python 后端（FastAPI）                 │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              WebSocket 服务器                    │     │
│  │  - 实时消息推送                                  │     │
│  │  - 流式响应                                      │     │
│  │  - 房间状态同步                                  │     │
│  └───────────────────────┬────────────────────────┘     │
│                          │                              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              API 路由层                          │     │
│  │  - /api/members (成员管理)                       │     │
│  │  - /api/staff (添加员工)                         │     │
│  │  - /api/audit (审计日志)                         │     │
│  │  - /api/skills (技能市场)                        │     │
│  │  - /api/rooms (房间管理)                         │     │
│  └───────────────────────┬────────────────────────┘     │
│                          │                              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              AG2 集成层                          │     │
│  │  - Agent 创建/管理                               │     │
│  │  - GroupChat 编排                                │     │
│  │  - 对话路由                                      │     │
│  │  - 状态管理                                      │     │
│  └───────────────────────────────────────────────┘     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    AG2 引擎                              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              Agent Runtime                       │     │
│  │  - AssistantAgent (基础 Agent)                   │     │
│  │  - GroupChat (群聊编排)                          │     │
│  │  - GroupChatManager (群聊管理)                   │     │
│  │  - Tools (工具系统)                              │     │
│  │  - Memory (记忆系统)                             │     │
│  └───────────────────────┬────────────────────────┘     │
│                          │                              │
│  ┌───────────────────────▼────────────────────────┐     │
│  │              模型层                               │     │
│  │  - OpenAI (GPT-4o, GPT-4o-mini)                 │     │
│  │  - Anthropic (Claude)                            │     │
│  │  - 本地模型 (Ollama)                             │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 新技术栈

| 组件 | 技术栈 | 说明 |
|------|--------|------|
| **前端** | React + TypeScript | 聊天界面、成员管理、技能市场（保留） |
| **后端** | Python + FastAPI | WebSocket 服务器、API 路由、AG2 集成 |
| **引擎** | AG2 (Python) | Agent 运行时、GroupChat、工具、记忆 |
| **通信** | WebSocket + HTTP | 前端 ↔ 后端 ↔ AG2 引擎 |
| **数据** | SQLite + JSON | 成员、房间、审计日志、记忆 |
| **部署** | Docker Compose | Python 后端 + React 前端 |

### 3.3 组件职责

| 组件 | 职责 | 技术实现 |
|------|------|----------|
| **React 前端** | 用户界面、交互体验 | React + TypeScript + Tailwind |
| **FastAPI 后端** | API 路由、WebSocket、业务逻辑 | Python + FastAPI + Uvicorn |
| **AG2 集成层** | Agent 管理、GroupChat 编排 | AG2 AgentChat API |
| **AG2 引擎** | Agent 运行时、工具执行、记忆 | AG2 Core API |
| **数据层** | 持久化存储 | SQLite + JSON 文件 |

---

## 四、核心模块设计

### 4.1 Agent 管理模块

#### 4.1.1 Agent 定义
```python
# agent_manager.py
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

class AgentManager:
    def __init__(self):
        self.agents = {}
        self.model_client = OpenAIChatCompletionClient(model="gpt-4o")
    
    def create_agent(self, agent_id: str, name: str, persona: str, tools: list = None):
        """创建新 Agent"""
        agent = AssistantAgent(
            name=agent_id,
            model_client=self.model_client,
            system_message=persona,
            description=f"{name} - AI 员工",
            tools=tools or [],
            model_client_stream=True,
        )
        self.agents[agent_id] = agent
        return agent
    
    def get_agent(self, agent_id: str):
        """获取 Agent"""
        return self.agents.get(agent_id)
    
    def delete_agent(self, agent_id: str):
        """删除 Agent"""
        if agent_id in self.agents:
            del self.agents[agent_id]
```

#### 4.1.2 人设系统
```python
# persona_manager.py
PERSONA_TEMPLATES = {
    "assistant": "你是一个贴心的助理，善于理解用户需求，提供周到的服务。",
    "executor": "你是一个高效的执行者，专注于完成任务，注重细节和效率。",
    "partner": "你是一个幽默的伙伴，善于用轻松的方式交流，让对话充满乐趣。",
    "advisor": "你是一个沉稳的顾问，善于分析问题，提供深思熟虑的建议。",
    "direct": "你是一个犀利直率的交流者，直接表达观点，不绕弯子。",
}

def generate_persona(name: str, role: str, template: str = None, 
                    tone: str = None, style: str = None) -> str:
    """生成 Agent 人设"""
    base = PERSONA_TEMPLATES.get(template, PERSONA_TEMPLATES["assistant"])
    
    persona = f"# {role} — {name}\n\n"
    persona += f"## 基本人设\n{base}\n\n"
    
    if tone:
        persona += f"## 语气风格\n{tone}\n\n"
    if style:
        persona += f"## 工作风格\n{style}\n\n"
    
    return persona
```

### 4.2 群聊编排模块

#### 4.2.1 GroupChat 管理
```python
# group_chat_manager.py
from autogen_agentchat.teams import GroupChat, GroupChatManager
from autogen_agentchat.conditions import TextMentionTermination

class GroupChatManager:
    def __init__(self, agent_manager):
        self.agent_manager = agent_manager
        self.group_chats = {}
    
    def create_group_chat(self, room_id: str, agent_ids: list, 
                         owner_agent_id: str = None):
        """创建群聊"""
        agents = [self.agent_manager.get_agent(aid) for aid in agent_ids if aid]
        
        if not agents:
            raise ValueError("至少需要一个 Agent")
        
        # 设置终止条件
        termination = TextMentionTermination("TERMINATE")
        
        # 创建 GroupChat
        group_chat = GroupChat(
            agents=agents,
            termination_condition=termination,
        )
        
        # 创建 GroupChatManager
        manager = GroupChatManager(group_chat=group_chat)
        
        self.group_chats[room_id] = {
            "manager": manager,
            "agents": agents,
            "owner": owner_agent_id,
        }
        
        return manager
    
    def send_message(self, room_id: str, message: str, sender: str = None):
        """发送消息到群聊"""
        if room_id not in self.group_chats:
            raise ValueError(f"群聊 {room_id} 不存在")
        
        manager = self.group_chats[room_id]["manager"]
        
        # 运行群聊
        response = manager.run(task=message)
        
        return response
```

#### 4.2.2 对话路由
```python
# chat_router.py
class ChatRouter:
    def __init__(self, agent_manager, group_chat_manager):
        self.agent_manager = agent_manager
        self.group_chat_manager = group_chat_manager
    
    async def route_message(self, room_id: str, message: str, 
                          room_type: str = "dm", mentions: list = None):
        """路由消息"""
        if room_type == "dm":
            # 私聊：直接发送给 Agent
            agent = self.agent_manager.get_agent(room_id)
            if not agent:
                raise ValueError(f"Agent {room_id} 不存在")
            
            response = await agent.run(task=message)
            return response
        
        elif room_type == "group":
            # 群聊：发送到 GroupChat
            if mentions:
                # @ 指定 Agent
                message = f"{message} (请 @{', @'.join(mentions)} 回复)"
            
            response = await self.group_chat_manager.send_message(
                room_id=room_id,
                message=message
            )
            return response
        
        else:
            raise ValueError(f"不支持的房间类型: {room_type}")
```

### 4.3 记忆系统模块

#### 4.3.1 记忆管理
```python
# memory_manager.py
import json
import os
from datetime import datetime

class MemoryManager:
    def __init__(self, memory_dir: str = "memory"):
        self.memory_dir = memory_dir
        os.makedirs(memory_dir, exist_ok=True)
    
    def save_memory(self, agent_id: str, key: str, value: str, 
                   metadata: dict = None):
        """保存记忆"""
        memory_file = os.path.join(self.memory_dir, f"{agent_id}.json")
        
        # 读取现有记忆
        memories = {}
        if os.path.exists(memory_file):
            with open(memory_file, 'r', encoding='utf-8') as f:
                memories = json.load(f)
        
        # 添加新记忆
        memories[key] = {
            "value": value,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {},
        }
        
        # 保存记忆
        with open(memory_file, 'w', encoding='utf-8') as f:
            json.dump(memories, f, ensure_ascii=False, indent=2)
    
    def get_memory(self, agent_id: str, key: str = None):
        """获取记忆"""
        memory_file = os.path.join(self.memory_dir, f"{agent_id}.json")
        
        if not os.path.exists(memory_file):
            return {} if key is None else None
        
        with open(memory_file, 'r', encoding='utf-8') as f:
            memories = json.load(f)
        
        if key is None:
            return memories
        
        return memories.get(key)
    
    def search_memory(self, agent_id: str, query: str):
        """搜索记忆"""
        memories = self.get_memory(agent_id)
        
        results = []
        for key, memory in memories.items():
            if query.lower() in key.lower() or query.lower() in memory["value"].lower():
                results.append({
                    "key": key,
                    "value": memory["value"],
                    "timestamp": memory["timestamp"],
                })
        
        return results
```

### 4.4 工具系统模块

#### 4.4.1 工具管理
```python
# tool_manager.py
from autogen_ext.tools import FunctionTool

class ToolManager:
    def __init__(self):
        self.tools = {}
    
    def register_tool(self, name: str, func, description: str):
        """注册工具"""
        tool = FunctionTool(
            func=func,
            name=name,
            description=description,
        )
        self.tools[name] = tool
        return tool
    
    def get_tool(self, name: str):
        """获取工具"""
        return self.tools.get(name)
    
    def get_tools(self, names: list = None):
        """获取工具列表"""
        if names is None:
            return list(self.tools.values())
        
        return [self.tools[name] for name in names if name in self.tools]

# 示例工具
def web_search(query: str) -> str:
    """网络搜索工具"""
    # 实现搜索逻辑
    return f"搜索结果: {query}"

def file_read(file_path: str) -> str:
    """文件读取工具"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def file_write(file_path: str, content: str) -> str:
    """文件写入工具"""
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    return f"文件已保存: {file_path}"
```

---

## 五、数据流设计

### 5.1 私聊数据流

```
用户输入 → React 前端
    ↓ HTTP POST /api/chat/send
FastAPI 后端
    ↓ 路由到 Agent
AG2 Agent
    ↓ LLM 调用
模型层 (OpenAI/Anthropic)
    ↓ 流式响应
AG2 Agent → FastAPI 后端
    ↓ WebSocket 推送
React 前端 → 用户看到响应
```

### 5.2 群聊数据流

```
用户输入 "@小码 明天汇报" → React 前端
    ↓ HTTP POST /api/chat/send (mentions: ["xiaoma"])
FastAPI 后端
    ↓ 解析 @ 提及
    ↓ 路由到 GroupChat
AG2 GroupChat
    ↓ 多 Agent 讨论
    ↓ 流式响应
AG2 GroupChat → FastAPI 后端
    ↓ WebSocket 推送 (包含多个 Agent 的响应)
React 前端 → 用户看到群聊对话
```

### 5.3 记忆数据流

```
Agent 交互 → AG2 Agent
    ↓ 记忆存储
MemoryManager
    ↓ 保存到文件
JSON 文件 (memory/{agent_id}.json)

用户查询 → React 前端
    ↓ HTTP GET /api/memory/search
FastAPI 后端
    ↓ 搜索记忆
MemoryManager
    ↓ 返回结果
React 前端 → 用户看到记忆
```

---

## 六、部署架构

### 6.1 开发环境

```
┌─────────────────────────────────────────┐
│              开发环境                      │
│  ┌─────────────────┐                    │
│  │ React 前端       │ :5173 (Vite)      │
│  └─────────────────┘                    │
│  ┌─────────────────┐                    │
│  │ FastAPI 后端     │ :8000 (Uvicorn)   │
│  └─────────────────┘                    │
│  ┌─────────────────┐                    │
│  │ AG2 引擎         │ 内置               │
│  └─────────────────┘                    │
└─────────────────────────────────────────┘
```

### 6.2 生产环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=sqlite:///./data/aicumi.db
    volumes:
      - ./data:/app/data
      - ./memory:/app/memory
    depends_on:
      - db

  db:
    image: sqlite:latest
    volumes:
      - ./data:/data
```

### 6.3 目录结构

```
AiCumi/
├── web/                          # React 前端
│   ├── src/
│   │   ├── components/           # React 组件
│   │   ├── hooks/                # 自定义 Hooks
│   │   ├── stores/               # 状态管理
│   │   └── utils/                # 工具函数
│   ├── package.json
│   └── Dockerfile
├── server/                       # Python 后端
│   ├── app/
│   │   ├── agents/               # Agent 管理
│   │   ├── api/                  # API 路由
│   │   ├── chat/                 # 聊天逻辑
│   │   ├── memory/               # 记忆系统
│   │   ├── tools/                # 工具系统
│   │   └── utils/                # 工具函数
│   ├── requirements.txt
│   └── Dockerfile
├── memory/                       # 记忆存储
├── data/                         # 数据存储
├── plans/                        # 规划文档
├── docker-compose.yml            # Docker 编排
└── README.md                     # 项目说明
```

---

## 七、技术选型理由

### 7.1 为什么选择 AG2？

| 维度 | AG2 优势 |
|------|----------|
| **行业地位** | 微软出品，AutoGen 继任者，60K+ GitHub Stars |
| **技术特性** | 对话驱动、GroupChat、分布式、企业级 |
| **学习价值** | 面试加分，行业标杆 |
| **生态系统** | A2A、MCP 协议，企业级安全 |
| **社区支持** | 活跃社区，丰富文档 |

### 7.2 为什么选择 FastAPI？

| 维度 | FastAPI 优势 |
|------|--------------|
| **性能** | 高性能异步框架，适合实时应用 |
| **类型安全** | 原生支持 Python 类型提示 |
| **自动文档** | 自动生成 API 文档 (Swagger) |
| **WebSocket** | 原生支持 WebSocket |
| **学习曲线** | 简单易学，快速上手 |

### 7.3 为什么保留 React？

| 维度 | React 优势 |
|------|------------|
| **现有投资** | 已有成熟前端代码 |
| **生态系统** | 丰富的组件库和工具 |
| **性能** | 虚拟 DOM，高效渲染 |
| **社区支持** | 庞大社区，丰富资源 |
| **学习价值** | 前端必备技能 |

---

## 八、风险评估

### 8.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **AG2 成熟度** | 🟡 中 | AG2 还在早期，可能有坑。通过充分测试缓解 |
| **Python 学习曲线** | 🟡 中 | 需要学习 Python + AG2。通过文档和示例缓解 |
| **性能问题** | 🟡 中 | Python 可能比 Node.js 慢。通过异步和优化缓解 |
| **调试复杂度** | 🟡 中 | 跨模块调试。通过日志和监控缓解 |

### 8.2 项目风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **时间超支** | 🟡 中 | 6-8周可能不够。预留缓冲时间 |
| **功能缺失** | 🟡 中 | 迁移可能丢失功能。优先实现核心功能 |
| **学习价值** | 🟢 低 | 学习项目，失败也是学习 |

### 8.3 缓解策略

1. **分阶段实施**：先实现核心功能，再逐步完善
2. **充分测试**：每个模块都写测试用例
3. **文档记录**：记录所有决策和问题
4. **定期复盘**：每周复盘进度，及时调整

---

## 九、成功标准

### 9.1 技术标准

| 标准 | 目标 |
|------|------|
| **功能完整性** | 实现当前所有核心功能 |
| **性能** | 响应时间 < 2秒，支持 10 并发 |
| **稳定性** | 连续运行 24 小时无崩溃 |
| **代码质量** | 类型安全，测试覆盖 > 70% |

### 9.2 学习标准

| 标准 | 目标 |
|------|------|
| **AG2 掌握** | 能独立使用 AG2 开发多 Agent 应用 |
| **Python 能力** | 熟练使用 Python + FastAPI |
| **架构设计** | 能设计完整的 Agent 系统架构 |
| **面试准备** | 能清晰讲解项目和技术选型 |

---

## 十、附录

### 10.1 参考文档

- [AG2 官方文档](https://ag2.ai/)
- [AG2 GitHub](https://github.com/ag2ai/ag2)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [React 文档](https://react.dev/)
- [AutoGen 论文](https://arxiv.org/abs/2308.08155)

### 10.2 术语表

| 术语 | 说明 |
|------|------|
| **AG2** | AutoGen 继任者，对话式多 Agent 框架 |
| **GroupChat** | AG2 的群聊编排模式 |
| **AssistantAgent** | AG2 的基础 Agent 类型 |
| **FastAPI** | Python 高性能异步 Web 框架 |
| **WebSocket** | 全双工通信协议 |

### 10.3 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-08-20 | 初始版本，架构设计 |