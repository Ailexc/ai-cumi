// AiCumi Chat Server — 房间管理
// 房间元数据持久化到本地文件（消息内容不存本地，始终从云端 Gateway 拉取）

import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Room, ChatMessage } from './types.js';

/** 本地 OpenClaw 实例目录（本地 dev：项目根 local/；容器模式：env 覆盖，挂载 /data/aicumi-local） */
const OPENCLAW_LOCAL_DIR = process.env.OPENCLAW_LOCAL_DIR
  ? resolve(process.env.OPENCLAW_LOCAL_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../../local');

/** 数据文件位置
 *  本地 dev：server/data/rooms.json
 *  容器模式：<local>/server-data/rooms.json（持久化到宿主 local/，重启不丢） */
const DATA_DIR = process.env.OPENCLAW_LOCAL_DIR
  ? join(OPENCLAW_LOCAL_DIR, 'server-data')
  : resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const ROOMS_FILE = join(DATA_DIR, 'rooms.json');

/**
 * 默认团队成员（产品语义：1 员工 = 1 固定房间）
 * room.id = agentId（稳定），保证「点成员 → 永远同一个持续对话」，无"新建对话"概念
 */
const DEFAULT_MEMBERS: { id: string; name: string }[] = [
  { id: 'keling', name: '可灵' },
  { id: 'xiaoyan', name: '小研' },
  { id: 'staff-dde57f', name: '小文' },
];

/** openclaw.json 路径（本地实例）：src/rooms.ts → 项目根 AiCumi/local */
const OPENCLAW_CONFIG = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');

/** 从 openclaw.json 读取已注册 agent（保证所有同事都有房间，重启不丢） */
function registeredAgents(): { id: string; name: string }[] {
  try {
    if (!existsSync(OPENCLAW_CONFIG)) return [];
    const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
    return (cfg?.agents?.list || [])
      .map((a: any) => ({ id: String(a?.id || ''), name: String(a?.name || a?.id || '') }))
      .filter((a: { id: string }) => a.id);
  } catch {
    return [];
  }
}

/** 房间存储 */
const rooms = new Map<string, Room>();

/** 消息历史（按房间，仅进程内展示缓存，非权威源） */
const messageHistory = new Map<string, ChatMessage[]>();

// ---------- 持久化 ----------

function loadRooms(): void {
  try {
    if (!existsSync(ROOMS_FILE)) return;
    const data = JSON.parse(readFileSync(ROOMS_FILE, 'utf8'));
    const list: Room[] = Array.isArray(data) ? data : [];
    for (const room of list) {
      if (room?.id && room?.name && room?.agentId) {
        rooms.set(room.id, room);
        messageHistory.set(room.id, []);
      }
    }
  } catch (err) {
    console.error('[rooms] 加载房间失败:', err);
  }
}

function saveRooms(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(ROOMS_FILE, JSON.stringify(Array.from(rooms.values()), null, 2), 'utf8');
  } catch (err) {
    console.error('[rooms] 保存房间失败:', err);
  }
}

// ---------- 房间操作 ----------

/** 创建房间（id 可选：默认随机；成员房间固定用 agentId） */
export function createRoom(name: string, agentId: string, id?: string): Room {
  const room: Room = {
    id: id ?? randomUUID(),
    name,
    agentId,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);
  messageHistory.set(room.id, []);
  saveRooms();
  return room;
}

/** 获取房间列表 */
export function listRooms(): Room[] {
  return Array.from(rooms.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** 获取单个房间 */
export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

/** 删除房间 */
export function deleteRoom(id: string): boolean {
  rooms.delete(id);
  messageHistory.delete(id);
  saveRooms();
  return true;
}

/** 更新房间名（成员改名时同步，如 P2 编辑身份） */
export function updateRoomName(id: string, name: string): boolean {
  const room = rooms.get(id);
  if (!room) return false;
  room.name = name;
  saveRooms();
  return true;
}

/** 添加消息到历史 */
export function addMessage(roomId: string, message: ChatMessage): void {
  const history = messageHistory.get(roomId);
  if (history) {
    history.push(message);
    // 保留最近 200 条
    if (history.length > 200) {
      history.splice(0, history.length - 200);
    }
  }
  // 更新房间最后消息
  const room = rooms.get(roomId);
  if (room) {
    room.lastMessage = message;
  }
}

/** 获取房间消息历史 */
export function getMessages(roomId: string, limit = 50): ChatMessage[] {
  const history = messageHistory.get(roomId) || [];
  return history.slice(-limit);
}

/** 获取 Gateway session key（官方格式：agent:<agentId>:webchat:channel:<roomId>） */
export function getSessionKey(roomId: string): string {
  const room = rooms.get(roomId);
  const agentId = room?.agentId || 'main';
  return `agent:${agentId}:webchat:channel:${roomId}`;
}

/** 初始化：优先从磁盘加载；确保所有同事（默认 + 已注册 agent）都有固定房间 */
export function initDefaultRooms(): void {
  loadRooms();

  // 清理旧格式房间（uuid 临时房间，如"和可灵聊天"）——成员固定房间以 agentId 为 id
  for (const m of DEFAULT_MEMBERS) {
    for (const r of Array.from(rooms.values())) {
      if (r.agentId === m.id && r.id !== m.id) {
        rooms.delete(r.id);
        messageHistory.delete(r.id);
      }
    }
  }

  // 1 员工 = 1 固定房间（默认成员 + 已注册 agent；main 为引擎默认，非同事，排除）
  const known = new Map<string, string>();
  for (const m of DEFAULT_MEMBERS) known.set(m.id, m.name);
  for (const a of registeredAgents()) {
    if (a.id === 'main') continue;
    if (!known.has(a.id)) known.set(a.id, a.name);
  }

  // 删除引擎默认 agent 的房间（历史遗留）
  if (rooms.has('main')) {
    rooms.delete('main');
    messageHistory.delete('main');
  }

  // 确保房间存在；英文 fallback 名（room.name === id）同步为中文配置名
  for (const [id, name] of known) {
    const room = rooms.get(id);
    if (!room) {
      createRoom(name, id, id);
      continue;
    }
    if (room.name === id && name && name !== id) {
      room.name = name;
    }
  }
  saveRooms();
}

/** 按 agentId 获取（或创建）成员房间：新员工入职自动开房，对话持续 */
export function ensureMemberRoom(agentId: string, name?: string): Room {
  const existing = Array.from(rooms.values()).find((r) => r.agentId === agentId);
  if (existing) return existing;
  return createRoom(name || agentId, agentId, agentId);
}
