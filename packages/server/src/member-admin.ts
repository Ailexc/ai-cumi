// AiCumi — 员工管理写操作（P2：编辑人设/身份/模型、重建记忆、删除/停用）
// 数据源：local/workspace/<agentId>/ 档案文件 + openclaw.json + docker exec（openclaw CLI）
// 安全原则：
//   - 所有写操作先做**自动备份**（*.bak-<ts> 或 rename 目录）
//   - roomId → rooms.getRoom 校验后取 agentId，杜绝路径穿越
//   - 删除/编辑仅本地测试实例可用（同添加员工，容器模式暂不支持写）
//   - main 引擎 agent 禁止删除/改名

import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  copyFileSync,
} from 'fs';
import { join } from 'path';
import { OPENCLAW_LOCAL_DIR } from './staff.js';
import * as rooms from './rooms.js';

const execAsync = promisify(exec);

const GATEWAY_CONTAINER = process.env.OPENCLAW_GATEWAY_CONTAINER || 'openclaw-gateway-local';
const WORKSPACE_DIR = join(OPENCLAW_LOCAL_DIR, 'workspace');
const OPENCLAW_CONFIG = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');
const AUDIT_FILE = join(OPENCLAW_LOCAL_DIR, 'audit-log.json');

// ---------- 审计日志（P3：写操作可追溯） ----------

export interface AuditEntry {
  id: string;
  ts: number;
  agentId: string;
  memberName: string;
  /** persona_update | identity_update | model_switch | reindex | member_delete | staff_add */
  action: string;
  summary: string;
}

/** 追加一条审计记录（保留最近 500 条） */
export function logAudit(entry: Omit<AuditEntry, 'id' | 'ts'>): void {
  try {
    const log: AuditEntry[] = existsSync(AUDIT_FILE)
      ? JSON.parse(readFileSync(AUDIT_FILE, 'utf8'))
      : [];
    log.push({ ...entry, id: randomUUID(), ts: Date.now() });
    writeFileSync(AUDIT_FILE, JSON.stringify(log.slice(-500), null, 2), 'utf8');
  } catch (err: any) {
    console.warn(`[audit] 写入失败: ${err.message}`);
  }
}

/** 查询审计日志（可按 agentId 过滤；按时间倒序） */
export function getAudit(agentId?: string, limit = 50): AuditEntry[] {
  try {
    if (!existsSync(AUDIT_FILE)) return [];
    const log: AuditEntry[] = JSON.parse(readFileSync(AUDIT_FILE, 'utf8'));
    const filtered = agentId ? log.filter((e) => e.agentId === agentId) : log;
    return filtered.slice(-limit).reverse();
  } catch {
    return [];
  }
}

/** 引擎主 agent（禁止删除/改名） */
const ENGINE_AGENTS = new Set(['main']);

function agentDir(agentId: string): string {
  return join(WORKSPACE_DIR, agentId);
}

function readConfig(): any {
  return JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
}

function writeConfig(cfg: any): void {
  mkdirSync(join(OPENCLAW_LOCAL_DIR, 'openclaw'), { recursive: true });
  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
}

async function restartGateway(): Promise<void> {
  try {
    await execAsync(`docker restart ${GATEWAY_CONTAINER}`, { timeout: 30000 });
    console.log('[member-admin] gateway restarted');
  } catch (err: any) {
    console.warn(`[member-admin] gateway restart 失败: ${err.message}`);
  }
}

/** 可用模型列表（从 openclaw.json models.providers 提取） */
export function listModels(): { id: string; name: string; provider: string; input: string[] }[] {
  const cfg = readConfig();
  const providers = cfg?.models?.providers || {};
  const out: { id: string; name: string; provider: string; input: string[] }[] = [];
  for (const [provider, p] of Object.entries<any>(providers)) {
    for (const m of p?.models || []) {
      out.push({ id: `${provider}/${m.id}`, name: m.name || m.id, provider, input: m.input || [] });
    }
  }
  return out;
}

/**
 * 编辑人设（写 AGENTS.md）
 * 自动备份旧文件为 AGENTS.md.bak-<ts>
 */
export function updatePersona(roomId: string, content: string): { filename: string; size: number } {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  if (!content?.trim()) throw new Error('人设内容不能为空');
  const dir = agentDir(room.agentId);
  const file = join(dir, 'AGENTS.md');
  mkdirSync(dir, { recursive: true });
  if (existsSync(file)) {
    copyFileSync(file, join(dir, `AGENTS.md.bak-${Date.now()}`));
  }
  writeFileSync(file, content, 'utf8');
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'persona_update',
    summary: `编辑人设（${content.length} 字符，旧版已备份）`,
  });
  console.log(`[member-admin] persona updated: ${room.agentId}`);
  return { filename: 'AGENTS.md', size: content.length };
}

/**
 * 人设精修向导（P3）：增量写入「精修设定」章节，不覆盖原有内容
 * 已有该章节则替换，否则追加到末尾；自动备份
 */
export function refinePersona(
  roomId: string,
  cfg: { duty?: string; tone?: string; style?: string; boundary?: string },
): { ok: boolean; size: number } {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const dir = agentDir(room.agentId);
  const file = join(dir, 'AGENTS.md');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';

  const section = [
    '## 精修设定（向导 v1）',
    '',
    cfg.duty?.trim() ? `### 岗位职责\n${cfg.duty.trim()}` : '',
    cfg.tone?.trim() ? `### 性格与语气\n${cfg.tone.trim()}` : '',
    cfg.style?.trim() ? `### 工作风格\n${cfg.style.trim()}` : '',
    cfg.boundary?.trim() ? `### 边界与禁忌\n${cfg.boundary.trim()}` : '',
  ]
    .filter((s) => s !== '')
    .join('\n\n');

  if (section.split('\n').filter((l) => l.trim()).length <= 2) {
    throw new Error('至少填写一项精修内容');
  }

  mkdirSync(dir, { recursive: true });
  if (existsSync(file)) {
    copyFileSync(file, join(dir, `AGENTS.md.bak-${Date.now()}`));
  }
  const marker = /## 精修设定（向导[^\n]*）[\s\S]*?(?=\n## |$)/;
  const next = marker.test(current)
    ? current.replace(marker, section)
    : `${current.trimEnd()}\n\n${section}\n`;
  writeFileSync(file, next, 'utf8');
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'persona_refine',
    summary: '精修人设（向导）',
  });
  console.log(`[member-admin] persona refined: ${room.agentId}`);
  return { ok: true, size: next.length };
}

/**
 * 更新身份（名字/emoji/主题）——docker exec agents set-identity + 同步房间名
 * name 为空表示不修改名字（只改 emoji/theme）
 */
export async function updateIdentity(
  roomId: string,
  patch: { name?: string; emoji?: string; theme?: string; department?: string },
): Promise<{ ok: boolean; name: string }> {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  if (ENGINE_AGENTS.has(room.agentId)) throw new Error('引擎主 agent 不允许改名');

  const args = [`--agent ${room.agentId}`];
  if (patch.name?.trim()) args.push(`--name "${patch.name.trim()}"`);
  if (patch.emoji?.trim()) args.push(`--emoji "${patch.emoji.trim()}"`);
  if (patch.theme?.trim()) args.push(`--theme "${patch.theme.trim()}"`);

  const cmd = `docker exec ${GATEWAY_CONTAINER} bash -lc 'node /app/openclaw.mjs agents set-identity ${args.join(' ')} --json'`;
  try {
    await execAsync(cmd, { timeout: 30000 });
  } catch (err: any) {
    throw new Error(`更新身份失败: ${err.message}`);
  }

  // 同步 openclaw.json agent.name + department + 房间名
  if (patch.name?.trim() || patch.department?.trim()) {
    try {
      const cfg = readConfig();
      const entry = (cfg?.agents?.list || []).find((a: any) => a.id === room.agentId);
      if (entry) {
        if (patch.name?.trim()) entry.name = patch.name.trim();
        if (patch.department?.trim()) entry.department = patch.department.trim();
        writeConfig(cfg);
      }
      if (patch.name?.trim()) rooms.updateRoomName(roomId, patch.name.trim());
    } catch (err: any) {
      console.warn(`[member-admin] 同步资料失败: ${err.message}`);
    }
  }
  const changed = [
    patch.name?.trim() && `名字→${patch.name.trim()}`,
    patch.emoji?.trim() && `emoji→${patch.emoji.trim()}`,
    patch.theme?.trim() && `主题→${patch.theme.trim()}`,
    patch.department?.trim() && `部门→${patch.department.trim()}`,
  ]
    .filter(Boolean)
    .join('、');
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'identity_update',
    summary: `更新资料：${changed}`,
  });
  return { ok: true, name: patch.name?.trim() || room.name };
}

/** 重建记忆索引（docker exec openclaw memory index --agent <id> --force） */
export async function reindexMemory(roomId: string): Promise<{ ok: boolean; detail: string }> {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const cmd = `docker exec ${GATEWAY_CONTAINER} bash -lc 'node /app/openclaw.mjs memory index --agent "${room.agentId}" --force'`;
  let out = '';
  try {
    const { stdout } = await execAsync(cmd, { timeout: 120000 });
    out = stdout;
  } catch (err: any) {
    throw new Error(`重建索引失败: ${err.message}`);
  }
  console.log(`[member-admin] memory reindexed: ${room.agentId}`);
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'reindex',
    summary: '重建记忆索引',
  });
  return { ok: true, detail: out.slice(0, 300) };
}

/** 切换模型（改 openclaw.json agent.model.primary + 重启 gateway） */
export async function switchModel(roomId: string, modelId: string): Promise<{ ok: boolean; model: string }> {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');

  const valid = listModels().find((m) => m.id === modelId);
  if (!valid) throw new Error(`未知模型: ${modelId}`);

  const cfg = readConfig();
  const entry = (cfg?.agents?.list || []).find((a: any) => a.id === room.agentId);
  if (!entry) throw new Error('agent 配置不存在');

  const current = entry.model || {};
  entry.model = {
    primary: modelId,
    fallbacks: (current.fallbacks || []).filter((f: string) => f !== modelId),
  };
  writeConfig(cfg);
  await restartGateway();
  console.log(`[member-admin] model switched: ${room.agentId} → ${modelId}`);
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'model_switch',
    summary: `切换模型 → ${valid.name}`,
  });
  return { ok: true, model: modelId };
}

/**
 * 删除员工（离职）：备份 workspace → agents delete → 移除 openclaw.json → 删房间 → 重启 gateway
 * 自动备份：workspace/<agentId> → workspace/<agentId>.bak-<ts>
 */
export async function deleteMember(roomId: string): Promise<{ ok: boolean; agentId: string }> {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  if (ENGINE_AGENTS.has(room.agentId)) throw new Error('引擎主 agent 不允许删除');

  const dir = agentDir(room.agentId);
  // 1. 备份 workspace（改名保留现场，可恢复）
  if (existsSync(dir)) {
    const bak = join(WORKSPACE_DIR, `${room.agentId}.bak-${Date.now()}`);
    renameSync(dir, bak);
    console.log(`[member-admin] workspace backed up → ${room.agentId}.bak-*`);
  }
  // 2. docker exec agents delete
  try {
    const cmd = `docker exec ${GATEWAY_CONTAINER} bash -lc 'node /app/openclaw.mjs agents delete "${room.agentId}" --force --json'`;
    await execAsync(cmd, { timeout: 30000 });
  } catch (err: any) {
    console.warn(`[member-admin] agents delete 失败（继续清理）: ${err.message}`);
  }
  // 3. 从 openclaw.json 移除
  try {
    const cfg = readConfig();
    cfg.agents.list = (cfg.agents.list || []).filter((a: any) => a.id !== room.agentId);
    writeConfig(cfg);
  } catch (err: any) {
    console.warn(`[member-admin] 移除 openclaw.json 失败: ${err.message}`);
  }
  // 4. 删房间（持久化）
  rooms.deleteRoom(roomId);
  // 5. 重启 gateway
  await restartGateway();
  console.log(`[member-admin] member deleted: ${room.agentId}`);
  logAudit({
    agentId: room.agentId,
    memberName: room.name,
    action: 'member_delete',
    summary: '离职：agent/房间/工作目录已删除（已备份 .bak-*）',
  });
  return { ok: true, agentId: room.agentId };
}
