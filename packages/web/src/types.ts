// AiCumi Web — 类型定义（与 server 同步）

export interface Agent {
  id: string;
  name: string;
  model?: string;
  status: 'running' | 'stopped';
}

export interface Room {
  id: string;
  name: string;
  agentId: string;
  createdAt: number;
  lastMessage?: ChatMessage;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  timestamp: number;
  streaming?: boolean;
}

export type ClientMessage =
  | { type: 'chat.send'; roomId: string; content: string }
  | { type: 'room.create'; name: string; agentId: string }
  | { type: 'room.list' }
  | { type: 'agent.list' }
  | { type: 'chat.history'; roomId: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'chat.chunk'; roomId: string; messageId: string; content: string }
  | { type: 'chat.done'; roomId: string; messageId: string; fullContent: string }
  | { type: 'chat.error'; roomId: string; error: string }
  | { type: 'chat.history'; roomId: string; messages: { role: string; content: string; timestamp: number }[] }
  | { type: 'room.created'; room: Room }
  | { type: 'room.list'; rooms: Room[] }
  | { type: 'agent.list'; agents: Agent[] }
  | { type: 'pong' }
  | { type: 'error'; message: string };
