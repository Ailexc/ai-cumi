// AiCumi — 员工档案读取（P1：档案中心，全部只读）
// 数据源：<项目>/local/workspace/<agentId>/ 下的档案文件 + gateway 对话历史
// 产品语义：像人事部一样展示每位 AI 同事的人设/技能/记忆/对话/工作目录
// 安全：roomId → rooms.getRoom 校验后取 agentId 拼路径，杜绝路径穿越

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename, relative } from 'path';
import { OPENCLAW_LOCAL_DIR } from './staff.js';
import { gatewayGetHistory } from './gateway-ws.js';
import * as rooms from './rooms.js';

const WORKSPACE_DIR = join(OPENCLAW_LOCAL_DIR, 'workspace');
const MAX_TEXT_FILE = 512 * 1024; // 512KB 内读全文
const OPENCLAW_CONFIG = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');
/** 文件树排除项 */
const EXCLUDE_PREFIX = ['.openclaw', '.pi', '.', 'node_modules', 'skills/..'];
const EXCLUDE_FILE = [/\.bak-/, /\.png$/, /\.jpg$/, /\.jpeg$/, /\.webp$/, /\.qrcode/, /^auth-qr/];

function agentWorkspace(agentId: string): string {
  return join(WORKSPACE_DIR, agentId);
}

function safeRead(p: string): string {
  try {
    if (!existsSync(p)) return '';
    const st = statSync(p);
    if (!st.isFile() || st.size > MAX_TEXT_FILE) return '';
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function countSkills(agentId: string): number {
  const dir = join(agentWorkspace(agentId), 'skills');
  try {
    return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
  } catch {
    return 0;
  }
}

/** 提取人设中的「岗位职责」（addStaff 注入的章节）；否则取身份段摘要 */
function extractDuty(persona: string): string {
  if (!persona) return '';
  const m = persona.match(/## 岗位职责（主管指定）\s*\n([\s\S]*?)(?=\n## |$)/);
  if (m?.[1]?.trim()) return m[1].trim();
  // fallback：身份段落
  const id = persona.match(/## 身份\s*\n([\s\S]*?)(?=\n## |$)/);
  return id?.[1]?.trim()?.slice(0, 160) || '';
}

/** 成员列表摘要（供 /api/members） */
export function listMemberSummaries() {
  return rooms.listRooms().map((r) => {
    const dir = agentWorkspace(r.agentId);
    return {
      id: r.id,
      agentId: r.agentId,
      name: r.name,
      role: agentRole(r.agentId, r.name) || agentDepartment(r.agentId),
      department: agentDepartment(r.agentId),
      personaExists: existsSync(join(dir, 'AGENTS.md')),
      memoryExists: existsSync(join(dir, 'MEMORY.md')),
      skillsCount: countSkills(r.agentId),
      createdAt: r.createdAt,
      lastMessage: r.lastMessage
        ? { content: r.lastMessage.content, timestamp: r.lastMessage.timestamp }
        : null,
    };
  });
}

/** 当前模型（openclaw.json agent.model.primary） */
function agentModel(agentId: string): string {
  try {
    if (!existsSync(OPENCLAW_CONFIG)) return '';
    const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
    const entry = (cfg?.agents?.list || []).find((a: any) => a.id === agentId);
    return entry?.model?.primary || '';
  } catch {
    return '';
  }
}

/** 默认部门映射（openclaw.json entry.department 可覆盖） */
const DEPARTMENT_DEFAULT: Record<string, string> = {
  keling: '行政',
  xiaoyan: '研究',
  xiaoma: '运维',
  xiaai: '分析',
  xiaohao: '产品',
  'staff-dde57f': '内容',
};

/**
 * 从 AGENTS.md 首行标题提取角色（"# 岗位 — 名字" / "# 名字 — 岗位"）
 * 例："# 运维 — 小码" → "运维"；"# 可灵 — 私人 AI 秘书" → "私人 AI 秘书"
 */
function agentRole(agentId: string, name: string): string {
  const file = join(agentWorkspace(agentId), 'AGENTS.md');
  try {
    if (!existsSync(file)) return '';
    const first = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith('# '));
    if (!first) return '';
    const title = first.replace(/^#\s*/, '').trim();
    const parts = title.split(/[—\-–]/).map((s) => s.trim()).filter(Boolean);
    return parts.find((p) => p !== name) || parts[0] || '';
  } catch {
    return '';
  }
}

/** 当前部门（openclaw.json agent.department，缺省按默认映射） */
function agentDepartment(agentId: string): string {
  try {
    if (existsSync(OPENCLAW_CONFIG)) {
      const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
      const entry = (cfg?.agents?.list || []).find((a: any) => a.id === agentId);
      if (entry?.department) return entry.department;
    }
  } catch {
    /* ignore */
  }
  return DEPARTMENT_DEFAULT[agentId] || '未分组';
}

/** 单个成员档案概览（供 /api/members/:roomId） */
export function getMemberProfile(roomId: string) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const dir = agentWorkspace(room.agentId);
  const persona = safeRead(join(dir, 'AGENTS.md'));
  const memory = safeRead(join(dir, 'MEMORY.md'));
  return {
    id: room.id,
    agentId: room.agentId,
    name: room.name,
    role: agentRole(room.agentId, room.name) || agentDepartment(room.agentId),
    department: agentDepartment(room.agentId),
    model: agentModel(room.agentId),
    persona: persona.slice(0, 800),
    duty: extractDuty(persona),
    hasPersona: !!persona,
    hasMemory: !!memory,
    hasTools: existsSync(join(dir, 'TOOLS.md')),
    hasIdentity: existsSync(join(dir, 'IDENTITY.md')),
    hasSoul: existsSync(join(dir, 'SOUL.md')),
    skillsCount: countSkills(room.agentId),
    memorySize: existsSync(join(dir, 'MEMORY.md')) ? statSync(join(dir, 'MEMORY.md')).size : 0,
    createdAt: room.createdAt,
    lastMessage: room.lastMessage
      ? { content: room.lastMessage.content, timestamp: room.lastMessage.timestamp }
      : null,
  };
}

/** 人设全文（AGENTS.md） */
export function getPersona(roomId: string) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const content = safeRead(join(agentWorkspace(room.agentId), 'AGENTS.md'));
  return { filename: 'AGENTS.md', content, size: content.length };
}

/** 技能清单（skills/ 目录，含 SKILL.md 描述与文档） */
export function getSkills(roomId: string) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const dir = join(agentWorkspace(room.agentId), 'skills');
  const skills: { name: string; files: string[]; description: string; doc: string }[] = [];
  try {
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillDir = join(dir, entry.name);
        const files = readdirSync(skillDir).filter((f) => !EXCLUDE_FILE.some((re) => re.test(f)));
        let description = '';
        let doc = '';
        const md = join(skillDir, 'SKILL.md');
        if (existsSync(md)) {
          const raw = readFileSync(md, 'utf8');
          doc = raw.slice(0, 5000);
          const fm = raw.match(/^---\n([\s\S]*?)\n---/);
          if (fm) {
            const desc = fm[1].match(/description:\s*"?([^\n"]*)"?/) || fm[1].match(/description:\s*([^\n]+)/);
            if (desc?.[1]?.trim()) description = desc[1].trim();
          }
          if (!description) {
            const first = raw.split('\n').find((l) => l.startsWith('# '));
            description = first?.replace(/^#\s*/, '') || entry.name;
          }
        }
        skills.push({ name: entry.name, files, description, doc });
      }
    }
  } catch {
    /* ignore */
  }
  return skills;
}

/** 记忆（MEMORY.md 全文 + 索引状态文件） */
export function getMemory(roomId: string) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const content = safeRead(join(agentWorkspace(room.agentId), 'MEMORY.md'));
  return { filename: 'MEMORY.md', content, size: content.length };
}

/** 工作目录文件树（只读浏览，排除隐藏/备份/媒体/大文件） */
export function getFiles(roomId: string) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const root = agentWorkspace(room.agentId);
  const files: { path: string; size: number; isDir: boolean }[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name;
      if (EXCLUDE_PREFIX.some((p) => name.startsWith(p)) && name !== 'skills') continue;
      if (EXCLUDE_FILE.some((re) => re.test(name))) continue;
      const full = join(dir, name);
      if (e.isDirectory()) {
        files.push({ path: `${relative(root, full)}/`, size: 0, isDir: true });
        walk(full, depth + 1);
      } else if (e.isFile()) {
        let size = 0;
        try {
          size = statSync(full).size;
        } catch {
          /* ignore */
        }
        if (size <= MAX_TEXT_FILE) files.push({ path: relative(root, full), size, isDir: false });
      }
    }
  };
  walk(root, 0);
  return files;
}

/** 对话历史（gateway chat.history） */
export async function getHistory(roomId: string, limit = 100) {
  const room = rooms.getRoom(roomId);
  if (!room) throw new Error('成员不存在');
  const sessionKey = rooms.getSessionKey(roomId);
  return gatewayGetHistory(sessionKey, limit);
}

export { basename };
