// AiCumi Chat Server — WebSocket 服务器
// 处理 Web UI 的实时通信（通过 Gateway WS 协议对接 OpenClaw）

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import type { ClientMessage, ServerMessage, ChatMessage, HistoryMessage } from './types.js';
import { gatewayChatSend, gatewayGetHistory, onGatewayEvent } from './gateway-ws.js';
import * as rooms from './rooms.js';

/** 广播消息给所有连接的客户端 */
function broadcast(wss: WebSocketServer, msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/** 处理单条客户端消息 */
async function handleMessage(
  ws: WebSocket,
  wss: WebSocketServer,
  msg: ClientMessage,
): Promise<void> {
  switch (msg.type) {
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' } satisfies ServerMessage));
      break;
    }

    case 'agent.list': {
      // 从本地配置读取（快速），不等 Gateway
      const agentList = getDefaultAgents();
      ws.send(JSON.stringify({ type: 'agent.list', agents: agentList } satisfies ServerMessage));
      break;
    }

    case 'room.list': {
      const roomList = rooms.listRooms();
      ws.send(JSON.stringify({ type: 'room.list', rooms: roomList } satisfies ServerMessage));
      break;
    }

    case 'room.create': {
      const room = rooms.createRoom(msg.name, msg.agentId);
      broadcast(wss, { type: 'room.created', room });
      break;
    }

    case 'group.create': {
      const room = rooms.createGroupRoom(
        msg.name,
        msg.memberAgentIds,
        msg.ownerAgentId,
      );
      broadcast(wss, { type: 'room.created', room });
      break;
    }

    case 'group.add-member': {
      const ok = rooms.addGroupMember(msg.roomId, msg.agentId);
      if (!ok) {
        ws.send(JSON.stringify({ type: 'chat.error', roomId: msg.roomId, error: '群聊不存在' } satisfies ServerMessage));
      } else {
        // 通知所有客户端刷新房间列表
        broadcast(wss, { type: 'room.list', rooms: rooms.listRooms() });
      }
      break;
    }

    case 'chat.history': {
      const room = rooms.getRoom(msg.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'chat.history', roomId: msg.roomId, messages: [] } satisfies ServerMessage));
        return;
      }

      // 群聊：合并多个 agent 的 session 历史
      if (rooms.isGroupRoom(room) && room.memberAgentIds) {
        const allMsgs: HistoryMessage[] = [];
        for (const agentId of room.memberAgentIds) {
          const sk = rooms.getGroupSessionKey(msg.roomId, agentId);
          try {
            const msgs = await gatewayGetHistory(sk, 50);
            for (const m of msgs) {
              allMsgs.push({ ...m, agentId } as any);
            }
          } catch {
            // 单个 agent 历史拉取失败不影响其他
          }
        }
        // 按时间排序 + 去重（用户消息可能出现在多个 session）
        allMsgs.sort((a, b) => a.timestamp - b.timestamp);
        const seen = new Set<string>();
        const merged: HistoryMessage[] = allMsgs.filter((m) => {
          if (m.role === 'assistant') return true; // assistant 消息天然不重复
          const key = `${m.role}:${m.content}:${Math.round(m.timestamp / 1000)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        ws.send(JSON.stringify({
          type: 'chat.history',
          roomId: msg.roomId,
          messages: merged,
        } satisfies ServerMessage));
      } else {
        // 私聊：单 session 历史（现状）
        const sessionKey = rooms.getSessionKey(msg.roomId);
        try {
          const remoteMsgs = await gatewayGetHistory(sessionKey, 100);
          ws.send(JSON.stringify({
            type: 'chat.history',
            roomId: msg.roomId,
            messages: remoteMsgs,
          } satisfies ServerMessage));
        } catch (err: any) {
          console.error('[ws] chat.history error:', err.message);
          ws.send(JSON.stringify({ type: 'chat.history', roomId: msg.roomId, messages: [] } satisfies ServerMessage));
        }
      }
      break;
    }

    case 'chat.send': {
      const room = rooms.getRoom(msg.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'chat.error', roomId: msg.roomId, error: '房间不存在' } satisfies ServerMessage));
        return;
      }

      // 创建用户消息（显示用，不落盘——Gateway 负责持久化）
      const userMsg: ChatMessage = {
        id: randomUUID(),
        roomId: msg.roomId,
        role: 'user',
        content: msg.content,
        timestamp: Date.now(),
      };
      rooms.addMessage(msg.roomId, userMsg);

      // 群聊路由：@ 路由到对应 agent，不 @ 则发给群主
      if (rooms.isGroupRoom(room)) {
        const memberIds = room.memberAgentIds || [];
        const mentions = msg.mentions || [];

        // 确定目标 agent 列表
        let targets: string[];
        if (mentions.length > 0) {
          // 有 @：只发给被 @ 的成员（且必须是群成员）
          targets = mentions.filter((m) => memberIds.includes(m));
        } else {
          // 无 @：只回群主
          targets = [room.ownerAgentId || room.agentId];
        }

        if (targets.length === 0) {
          ws.send(JSON.stringify({
            type: 'chat.error',
            roomId: msg.roomId,
            error: '未找到有效的 @ 目标',
          } satisfies ServerMessage));
          return;
        }

        // 为每个目标 agent 发送消息并订阅事件
        for (const targetAgentId of targets) {
          const sessionKey = rooms.getGroupSessionKey(msg.roomId, targetAgentId);
          const assistantMsgId = randomUUID();
          let fullContent = '';

          try {
            const runId = await gatewayChatSend(sessionKey, msg.content, randomUUID());
            console.log(`[ws] group chat.send ok room=${msg.roomId} agent=${targetAgentId} runId=${runId}`);

            let finished = false;
            const finish = () => {
              if (finished) return;
              finished = true;
              unsubscribe();
            };
            const fallbackTimer = setTimeout(finish, 120000);

            const unsubscribe = onGatewayEvent((event, payload) => {
              if (payload?.runId !== runId) return;

              if (event === 'agent') {
                const data = payload?.data;
                if (payload?.stream === 'assistant' && data?.delta) {
                  const delta = data.delta;
                  fullContent += delta;
                  ws.send(JSON.stringify({
                    type: 'chat.chunk',
                    roomId: msg.roomId,
                    messageId: assistantMsgId,
                    content: delta,
                    agentId: targetAgentId,
                  } satisfies ServerMessage));
                }
              } else if (event === 'chat') {
                if (payload?.state === 'final' && payload?.message) {
                  const text = extractText(payload.message.content);
                  if (text) {
                    fullContent = text;
                    const assistantMsg: ChatMessage = {
                      id: assistantMsgId,
                      roomId: msg.roomId,
                      role: 'assistant',
                      content: fullContent,
                      agentId: targetAgentId,
                      timestamp: Date.now(),
                      streaming: false,
                    };
                    rooms.addMessage(msg.roomId, assistantMsg);

                    ws.send(JSON.stringify({
                      type: 'chat.done',
                      roomId: msg.roomId,
                      messageId: assistantMsgId,
                      fullContent,
                      agentId: targetAgentId,
                    } satisfies ServerMessage));
                  }
                  finish();
                  clearTimeout(fallbackTimer);
                }
              }
            });
          } catch (err: any) {
            console.error(`[ws] group chat.send error agent=${targetAgentId}:`, err);
            ws.send(JSON.stringify({
              type: 'chat.error',
              roomId: msg.roomId,
              error: `${targetAgentId}: ${err.message || '发送失败'}`,
            } satisfies ServerMessage));
          }
        }
        return; // 群聊已处理，不走下面的私聊逻辑
      }

      // ===== 私聊逻辑（现状） =====
      // 创建 assistant 消息占位（流式累积）
      const assistantMsgId = randomUUID();
      let fullContent = '';
      const sessionKey = rooms.getSessionKey(msg.roomId);

      try {
        // 通过 Gateway WS 协议发送（官方通道，会话落盘云端）
        const runId = await gatewayChatSend(
          sessionKey,
          msg.content,
          randomUUID(),
        );
        console.log(`[ws] chat.send ok room=${msg.roomId} runId=${runId} sessionKey=${sessionKey}`);

        // 订阅该 runId 的事件流，把增量转发给浏览器
        // ⚠️ 修复：按 runId 精确过滤（而非仅 sessionKey）——
        //   同一会话快速连发时，各订阅只转发自己的事件，避免消息内容互相污染；
        //   收到 final 即取消订阅（而非固定 5s），避免慢回复丢失 chat.done 导致前端光标卡死。
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          unsubscribe();
        };
        // 兜底超时：final 事件异常缺失时防止订阅泄漏
        const fallbackTimer = setTimeout(finish, 120000);

        const unsubscribe = onGatewayEvent((event, payload) => {
          // 只处理本 runId 的事件（runId 在 payload 里）
          if (payload?.runId !== runId) return;

          if (event === 'agent') {
            // 增量文本
            const data = payload?.data;
            if (payload?.stream === 'assistant' && data?.delta) {
              const delta = data.delta;
              fullContent += delta;
              ws.send(JSON.stringify({
                type: 'chat.chunk',
                roomId: msg.roomId,
                messageId: assistantMsgId,
                content: delta,
              } satisfies ServerMessage));
            }
          } else if (event === 'chat') {
            // 最终消息（final state）→ 发送 chat.done 并结束订阅
            if (payload?.state === 'final' && payload?.message) {
              const text = extractText(payload.message.content);
              if (text) {
                fullContent = text;
                // 保存完整消息
                const assistantMsg: ChatMessage = {
                  id: assistantMsgId,
                  roomId: msg.roomId,
                  role: 'assistant',
                  content: fullContent,
                  agentId: room.agentId,
                  timestamp: Date.now(),
                  streaming: false,
                };
                rooms.addMessage(msg.roomId, assistantMsg);

                ws.send(JSON.stringify({
                  type: 'chat.done',
                  roomId: msg.roomId,
                  messageId: assistantMsgId,
                  fullContent,
                } satisfies ServerMessage));
              }
              finish();
              clearTimeout(fallbackTimer);
            }
          }
        });
      } catch (err: any) {
        console.error('[ws] chat.send error:', err);
        ws.send(JSON.stringify({
          type: 'chat.error',
          roomId: msg.roomId,
          error: err.message || '发送失败',
        } satisfies ServerMessage));
      }
      break;
    }
  }
}

/** 从消息 content 提取纯文本 */
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

/** 获取默认 agent 列表（兜底） */
function getDefaultAgents() {
  return [
    { id: 'keling', name: '可灵', status: 'running' as const },
    { id: 'xiaoyan', name: '小研', status: 'running' as const },
    { id: 'staff-dde57f', name: '小文', status: 'running' as const },
  ];
}

/** 创建 WebSocket 服务器 */
export function createWsServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[ws] client connected');

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        await handleMessage(ws, wss, msg);
      } catch (err) {
        console.error('[ws] message parse error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: '消息格式错误',
        } satisfies ServerMessage));
      }
    });

    ws.on('close', () => {
      console.log('[ws] client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[ws] error:', err);
    });

    // 连接后立即发送房间列表和 agent 列表
    ws.send(JSON.stringify({
      type: 'room.list',
      rooms: rooms.listRooms(),
    } satisfies ServerMessage));

    ws.send(JSON.stringify({
      type: 'agent.list',
      agents: getDefaultAgents(),
    } satisfies ServerMessage));
  });

  return wss;
}
