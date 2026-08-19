// AiCumi Chat Server — 类型定义

/** 代理（AI 员工）信息 */
export interface Agent {
  id: string;
  name: string;
  model?: string;
  status: 'running' | 'stopped';
}

/** 房间（聊天会话） */
export interface Room {
  id: string;
  name: string;
  agentId: string;
  createdAt: number;
  lastMessage?: ChatMessage;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  roomId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  timestamp: number;
  streaming?: boolean;
}

/** Gateway 历史消息 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** WebSocket 客户端 → 服务器 消息 */
export type ClientMessage =
  | { type: 'chat.send'; roomId: string; content: string }
  | { type: 'room.create'; name: string; agentId: string }
  | { type: 'room.list' }
  | { type: 'agent.list' }
  | { type: 'chat.history'; roomId: string }
  | { type: 'ping' };

/** WebSocket 服务器 → 客户端 消息 */
export type ServerMessage =
  | { type: 'chat.chunk'; roomId: string; messageId: string; content: string }
  | { type: 'chat.done'; roomId: string; messageId: string; fullContent: string }
  | { type: 'chat.error'; roomId: string; error: string }
  | { type: 'room.created'; room: Room }
  | { type: 'room.list'; rooms: Room[] }
  | { type: 'agent.list'; agents: Agent[] }
  | { type: 'chat.history'; roomId: string; messages: HistoryMessage[] }
  | { type: 'pong' }
  | { type: 'error'; message: string };
