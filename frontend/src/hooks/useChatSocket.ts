// AiCumi Web — WebSocket Hook
// 管理与 Chat Server 的 WebSocket 连接（带自动重连）

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ClientMessage, ServerMessage, Room, Agent, ChatMessage } from '../types';

/**
 * 生成 UUID v4。
 * crypto.randomUUID 仅 secure context（https 或 localhost）可用；
 * 部署在 http 域名（如 web.aicumi.orb.local）时不可用 → 用 getRandomValues 兜底。
 */
function uuid(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface UseChatSocketReturn {
  connected: boolean;
  rooms: Room[];
  agents: Agent[];
  messages: Map<string, ChatMessage[]>;
  /** 未读角标（roomId → 条数；只计不在当前房间时到达的 assistant 新消息） */
  unread: Record<string, number>;
  /** 正在思考中的房间（roomId → true） */
  thinking: Record<string, boolean>;
  /** 关联到消息的记忆（roomId → messageId → 记忆列表） */
  memories: Record<string, Record<string, { id: string; content: string; memory_type: string }[]>>;
  sendMessage: (roomId: string, content: string, mentions?: string[]) => void;
  createRoom: (name: string, agentId: string) => void;
  createGroup: (name: string, memberAgentIds: string[], ownerAgentId?: string, mode?: 'free' | 'supervisor' | 'parallel') => void;
  addGroupMember: (roomId: string, agentId: string) => void;
  loadHistory: (roomId: string) => void;
  refreshRooms: () => void;
  /** 标记房间已读（并设为当前活跃房间，切走前不计其未读） */
  setActiveRoom: (roomId: string | null) => void;
}

export function useChatSocket(): UseChatSocketReturn {
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Map<string, ChatMessage[]>>(new Map());
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [thinking, setThinking] = useState<Record<string, boolean>>({});
  const [memories, setMemories] = useState<Record<string, Record<string, { id: string; content: string; memory_type: string }[]>>>({});
  const activeRoomRef = useRef<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const streamingRef = useRef<Map<string, string>>(new Map());

  // 用 ref 存 handler，避免 useEffect 依赖链问题
  const handlerRef = useRef<(msg: ServerMessage) => void>(() => {});
  handlerRef.current = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'room.list':
        setRooms(msg.rooms);
        break;
      case 'agent.list':
        setAgents(msg.agents);
        break;
      case 'room.created':
        setRooms((prev) => [msg.room, ...prev]);
        break;
      case 'chat.chunk': {
        // Clear thinking indicator when content starts arriving
        setThinking((t) => {
          if (t[msg.roomId]) {
            const next = { ...t };
            delete next[msg.roomId];
            return next;
          }
          return t;
        });
        const key = `${msg.roomId}:${msg.messageId}`;
        const isNew = !streamingRef.current.has(key);
        const existing = streamingRef.current.get(key) || '';
        streamingRef.current.set(key, existing + msg.content);
        // 新 assistant 消息到达且不在当前房间 → 未读 +1
        if (isNew && activeRoomRef.current !== msg.roomId) {
          setUnread((u) => ({ ...u, [msg.roomId]: (u[msg.roomId] || 0) + 1 }));
        }
        setMessages((prev) => {
          const next = new Map(prev);
          const roomMsgs = next.get(msg.roomId) || [];
          const idx = roomMsgs.findIndex((m) => m.id === msg.messageId);
          if (idx >= 0) {
            roomMsgs[idx] = { ...roomMsgs[idx], content: existing + msg.content };
          } else {
            roomMsgs.push({
              id: msg.messageId,
              roomId: msg.roomId,
              role: 'assistant',
              content: existing + msg.content,
              agentId: msg.agentId,
              timestamp: Date.now(),
              streaming: true,
            });
          }
          next.set(msg.roomId, [...roomMsgs]);
          return next;
        });
        break;
      }
      case 'chat.done': {
        streamingRef.current.delete(`${msg.roomId}:${msg.messageId}`);
        // Clear thinking indicator
        setThinking((t) => {
          if (t[msg.roomId]) {
            const next = { ...t };
            delete next[msg.roomId];
            return next;
          }
          return t;
        });
        setMessages((prev) => {
          const next = new Map(prev);
          const roomMsgs = next.get(msg.roomId) || [];
          const idx = roomMsgs.findIndex((m) => m.id === msg.messageId);
          if (idx >= 0) {
            roomMsgs[idx] = { ...roomMsgs[idx], content: msg.fullContent, agentId: msg.agentId, streaming: false };
          } else if (msg.fullContent) {
            // Fallback: no prior chat.chunk (e.g. all content was reasoning-stripped)
            // Create the assistant message directly from chat.done.
            roomMsgs.push({
              id: msg.messageId,
              roomId: msg.roomId,
              role: 'assistant',
              content: msg.fullContent,
              agentId: msg.agentId,
              timestamp: Date.now(),
              streaming: false,
            });
          }
          next.set(msg.roomId, [...roomMsgs]);
          return next;
        });
        break;
      }
      case 'chat.thinking':
        setThinking((t) => ({ ...t, [msg.roomId]: true }));
        break;
      case 'chat.memory':
        // Retrieved long-term memory for an incoming assistant message
        setMemories((prev) => ({
          ...prev,
          [msg.roomId]: {
            ...(prev[msg.roomId] || {}),
            [msg.messageId]: msg.memories || [],
          },
        }));
        break;
      case 'chat.error':
        // Clear thinking on error too
        setThinking((t) => {
          if (t[msg.roomId]) {
            const next = { ...t };
            delete next[msg.roomId];
            return next;
          }
          return t;
        });
        console.error('[chat] error:', msg.error);
        break;
      case 'chat.history': {
        setMessages((prev) => {
          const next = new Map(prev);
          const historyMsgs: ChatMessage[] = msg.messages.map((m, i) => ({
            id: `hist-${msg.roomId}-${i}`,
            roomId: msg.roomId,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            agentId: m.agentId,
            timestamp: m.timestamp,
          }));
          const localMsgs = prev.get(msg.roomId) || [];
          const streamingMsgs = localMsgs.filter(m => m.streaming);
          next.set(msg.roomId, [...historyMsgs, ...streamingMsgs]);
          return next;
        });
        break;
      }
    }
  };

  // 建立连接 — 只在挂载时执行一次
  useEffect(() => {
    let alive = true;

    function connect() {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[ws] connecting to', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ws] connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data) as ServerMessage);
        } catch (err) {
          console.error('[ws] parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[ws] disconnected');
        setConnected(false);
        wsRef.current = null;
        if (alive) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error('[ws] error:', err);
      };
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback((roomId: string, content: string, mentions?: string[]) => {
    // 立即在本地显示用户消息
    const userMsg: ChatMessage = {
      id: uuid(),
      roomId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const next = new Map(prev);
      const roomMsgs = next.get(roomId) || [];
      next.set(roomId, [...roomMsgs, userMsg]);
      return next;
    });
    // 发送到服务器（支持群聊 mentions）
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat.send',
        roomId,
        content,
        mentions,
      } satisfies ClientMessage));
    }
  }, []);

  const createGroup = useCallback((name: string, memberAgentIds: string[], ownerAgentId?: string, mode?: 'free' | 'supervisor' | 'parallel') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'group.create',
        name,
        memberAgentIds,
        ownerAgentId,
        mode,
      } satisfies ClientMessage));
    }
  }, []);

  const addGroupMember = useCallback((roomId: string, agentId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'group.add-member',
        roomId,
        agentId,
      } satisfies ClientMessage));
    }
  }, []);

  const createRoom = useCallback((name: string, agentId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'room.create',
        name,
        agentId,
      } satisfies ClientMessage));
    }
  }, []);

  const loadHistory = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat.history',
        roomId,
      } satisfies ClientMessage));
    }
  }, []);

  /** 重新拉取团队列表（添加员工后调用） */
  const refreshRooms = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room.list' } satisfies ClientMessage));
    }
  }, []);

  /** 切换活跃房间：记录 ref（新消息只计非活跃房间）+ 清空未读 */
  const setActiveRoom = useCallback((roomId: string | null) => {
    activeRoomRef.current = roomId;
    if (roomId) {
      setUnread((prev) => {
        if (!prev[roomId]) return prev;
        const n = { ...prev };
        delete n[roomId];
        return n;
      });
    }
  }, []);

  return {
    connected,
    rooms,
    agents,
    messages,
    unread,
    thinking,
    memories,
    sendMessage,
    createRoom,
    createGroup,
    addGroupMember,
    loadHistory,
    refreshRooms,
    setActiveRoom,
  };
}
