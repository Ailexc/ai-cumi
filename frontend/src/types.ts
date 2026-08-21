// AiCumi Web — 类型定义（与 server 同步）

export interface Agent {
  id: string;
  name: string;
  model?: string;
  status: 'running' | 'stopped';
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameter[];
  enabled: boolean;
  version: string;
}

export type RoomType = 'dm' | 'group';

export interface Room {
  id: string;
  name: string;
  agentId: string;
  type?: RoomType;
  createdAt: number;
  lastMessage?: ChatMessage;
  /** group 专用 */
  ownerAgentId?: string;
  memberAgentIds?: string[];
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
  | { type: 'chat.send'; roomId: string; content: string; mentions?: string[] }
  | { type: 'room.create'; name: string; agentId: string }
  | { type: 'group.create'; name: string; memberAgentIds: string[]; ownerAgentId?: string }
  | { type: 'group.add-member'; roomId: string; agentId: string }
  | { type: 'room.list' }
  | { type: 'agent.list' }
  | { type: 'chat.history'; roomId: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'chat.chunk'; roomId: string; messageId: string; content: string; agentId?: string }
  | { type: 'chat.done'; roomId: string; messageId: string; fullContent: string; agentId?: string }
  | { type: 'chat.thinking'; roomId: string; messageId: string; agentId?: string }
  | { type: 'chat.error'; roomId: string; error: string }
  | { type: 'chat.history'; roomId: string; messages: { role: string; content: string; timestamp: number; agentId?: string }[] }
  | { type: 'room.created'; room: Room }
  | { type: 'room.list'; rooms: Room[] }
  | { type: 'agent.list'; agents: Agent[] }
  | { type: 'pong' }
  | { type: 'error'; message: string };
