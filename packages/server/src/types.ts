// AiCumi Chat Server — 类型定义

/** 代理（AI 员工）信息 */
export interface Agent {
  id: string;
  name: string;
  model?: string;
  status: 'running' | 'stopped';
}

/** 房间类型：dm（私聊）或 group（群聊） */
export type RoomType = 'dm' | 'group';

/** 房间（聊天会话） */
export interface Room {
  id: string;
  name: string;
  /** dm: 单个 agentId；group: 不使用此字段（用 memberAgentIds） */
  agentId: string;
  /** 房间类型，默认 'dm' 向后兼容 */
  type?: RoomType;
  createdAt: number;
  lastMessage?: ChatMessage;

  // === group 专用字段 ===
  /** 群主 agentId（不 @ 时的默认响应者） */
  ownerAgentId?: string;
  /** 群成员 agentId 列表（含群主） */
  memberAgentIds?: string[];
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  roomId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** group: 该消息来自哪个成员（user 消息可为 null） */
  agentId?: string;
  timestamp: number;
  streaming?: boolean;
}

/** Gateway 历史消息 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** group: 该消息来自哪个成员 */
  agentId?: string;
}

/** WebSocket 客户端 → 服务器 消息 */
export type ClientMessage =
  | { type: 'chat.send'; roomId: string; content: string; mentions?: string[] }
  | { type: 'room.create'; name: string; agentId: string }
  | { type: 'group.create'; name: string; memberAgentIds: string[]; ownerAgentId?: string }
  | { type: 'group.add-member'; roomId: string; agentId: string }
  | { type: 'room.list' }
  | { type: 'agent.list' }
  | { type: 'chat.history'; roomId: string }
  | { type: 'ping' };

/** WebSocket 服务器 → 客户端 消息 */
export type ServerMessage =
  | { type: 'chat.chunk'; roomId: string; messageId: string; content: string; agentId?: string }
  | { type: 'chat.done'; roomId: string; messageId: string; fullContent: string; agentId?: string }
  | { type: 'chat.error'; roomId: string; error: string }
  | { type: 'room.created'; room: Room }
  | { type: 'room.list'; rooms: Room[] }
  | { type: 'agent.list'; agents: Agent[] }
  | { type: 'chat.history'; roomId: string; messages: HistoryMessage[] }
  | { type: 'pong' }
  | { type: 'error'; message: string };
