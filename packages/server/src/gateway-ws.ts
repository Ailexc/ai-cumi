// AiCumi Chat Server — OpenClaw Gateway WebSocket 客户端
// 官方 WebChat 协议：connect 握手 + chat.send + chat.history
// 长连接，断线自动重连

import WebSocket from 'ws';
import { cfg } from './config.js';

// ============ 类型 ============

interface PendingReq {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  method: string;
}

interface EventHandler {
  (event: string, payload: any, frame: any): void;
}

/** 历史消息（规范化后） */
export interface HistoryMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ============ 状态 ============

let ws: WebSocket | null = null;
let msgId = 0;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;

const pending = new Map<string, PendingReq>();
const eventHandlers: EventHandler[] = [];

// ============ 连接管理 ============

/** 初始化并连接 Gateway */
export function initGatewayWs(): void {
  connect();
}

function connect(): void {
  if (manualClose) return;

  const wsUrl = cfg.gatewayWsUrl;
  console.log(`[gateway-ws] connecting to ${wsUrl}...`);

  const socket = new WebSocket(wsUrl, {
    headers: { Origin: 'http://127.0.0.1:18789' },
  });
  ws = socket;

  socket.on('open', async () => {
    try {
      await handshake(socket);
      connected = true;
      console.log('[gateway-ws] connected & handshaked');
    } catch (err: any) {
      console.error('[gateway-ws] handshake failed:', err.message);
      socket.close();
    }
  });

  socket.on('message', (raw) => {
    handleFrame(raw.toString());
  });

  socket.on('close', () => {
    console.log('[gateway-ws] disconnected');
    connected = false;
    // 清空 pending
    for (const [, p] of pending) {
      p.reject(new Error('gateway ws closed'));
    }
    pending.clear();
    ws = null;
    scheduleReconnect();
  });

  socket.on('error', (err) => {
    console.error('[gateway-ws] error:', (err as Error).message);
  });
}

function scheduleReconnect(): void {
  if (manualClose || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

/** 握手 */
async function handshake(socket: WebSocket): Promise<void> {
  const hello = await rawRequest(socket, 'connect', {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'openclaw-control-ui',
      version: '0.1.0',
      platform: 'web',
      mode: 'webchat',
    },
    role: 'operator',
    scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
    caps: [],
    auth: { token: cfg.gatewayToken },
    userAgent: 'aicumi-chat-server/0.1.0',
    locale: 'zh-CN',
  });
  if (!hello) throw new Error('no hello-ok');
}

// ============ 帧处理 ============

function handleFrame(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'event') {
    // 派发给所有 handler
    for (const h of eventHandlers) {
      try {
        h(msg.event, msg.payload, msg);
      } catch (err) {
        console.error('[gateway-ws] event handler error:', err);
      }
    }
    return;
  }

  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.payload);
      else p.reject(new Error(`RPC ${p.method} failed: ${JSON.stringify(msg.error || msg)}`));
    }
  }
}

/** 直接向指定 socket 发请求（握手用） */
function rawRequest(
  socket: WebSocket,
  method: string,
  params: any,
): Promise<any> {
  const id = `req_${++msgId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC ${method} timeout`));
    }, 10000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
      method,
    });
    socket.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

/** RPC 请求（需已连接） */
function request(method: string, params: any): Promise<any> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('gateway ws not connected'));
  }
  return rawRequest(ws, method, params);
}

// ============ 对外 API ============

export function isGatewayWsConnected(): boolean {
  return connected && !!ws && ws.readyState === WebSocket.OPEN;
}

/** 订阅事件 */
export function onGatewayEvent(handler: EventHandler): () => void {
  eventHandlers.push(handler);
  return () => {
    const idx = eventHandlers.indexOf(handler);
    if (idx >= 0) eventHandlers.splice(idx, 1);
  };
}

/** 发送聊天消息，返回 runId（回复通过事件流推送） */
export async function gatewayChatSend(
  sessionKey: string,
  text: string,
  idempotencyKey: string,
): Promise<string> {
  const res = await request('chat.send', {
    sessionKey,
    message: text,
    deliver: false,
    idempotencyKey,
  });
  return res?.runId as string;
}

/** 读取历史消息 */
export async function gatewayGetHistory(
  sessionKey: string,
  limit = 100,
): Promise<HistoryMsg[]> {
  const res = await request('chat.history', { sessionKey, limit });
  const messages: any[] = res?.messages || [];
  return messages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: extractText(m.content),
      timestamp: m.timestamp || Date.now(),
    }));
}

/** 从 content 提取纯文本（跳过 thinking/toolCall） */
function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}

/** 优雅关闭 */
export function closeGatewayWs(): void {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}
