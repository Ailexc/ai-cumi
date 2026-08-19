// AiCumi — 员工管理（P0：添加员工向导的后端）
// 产品语义：招一位「新同事」= 创建 OpenClaw agent + 固定房间
// 依赖：本地 OpenClaw 测试实例（<项目>/local/，docker 容器 openclaw-gateway-local）
// 操作顺序（参考 local/workspace/tools/add-staff-container.sh，但去掉飞书绑定）：
//   1. 生成 workspace/<name>/AGENTS.md（角色模板）+ TOOLS.md
//   2. docker exec openclaw-gateway-local: openclaw agents add ...
//   3. 创建固定房间（1 员工 = 1 房间，id = agentId）
//   4. 重启 gateway 使配置生效（本地测试环境）

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { ensureMemberRoom } from './rooms.js';

const execAsync = promisify(exec);

/** 本地 OpenClaw 实例目录
 *  本地 dev：cwd = packages/server → 项目根 ../../ + local
 *  容器模式：通过 OPENCLAW_LOCAL_DIR 环境变量覆盖（compose 挂载 ./local → /data/aicumi-local） */
export const OPENCLAW_LOCAL_DIR = process.env.OPENCLAW_LOCAL_DIR
  ? resolve(process.env.OPENCLAW_LOCAL_DIR)
  : resolve(process.cwd(), '../../local');
const WORKSPACE_DIR = join(OPENCLAW_LOCAL_DIR, 'workspace');
const OPENCLAW_CONFIG = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');
const ROLES_DIR = join(WORKSPACE_DIR, 'tools/roles');
const GATEWAY_CONTAINER = process.env.OPENCLAW_GATEWAY_CONTAINER || 'openclaw-gateway-local';
const DEFAULT_MODEL = process.env.OPENCLAW_NEW_AGENT_MODEL || 'custom-api-deepseek-com/deepseek-v4-flash';

/**
 * 解析 agent 的 workspace 目录（本地路径）
 * 优先按 openclaw.json 里 agent.workspace 的 basename 映射——
 * 兼容早期 agent 指向共享目录的情况（如 xiaoyan → /data/workspace/researcher）；
 * 缺省/解析失败时回退到 workspace/<agentId>。
 */
export function agentWorkspace(agentId: string): string {
  try {
    if (existsSync(OPENCLAW_CONFIG)) {
      const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
      const entry = (cfg?.agents?.list || []).find((a: any) => a.id === agentId);
      const ws = entry?.workspace;
      if (typeof ws === 'string' && ws.trim()) {
        const name = basename(ws);
        if (name) return join(WORKSPACE_DIR, name);
      }
    }
  } catch {
    /* 解析失败回退 */
  }
  return join(WORKSPACE_DIR, agentId);
}

/** 角色 → 中文标签 */
const ROLE_LABELS: Record<string, string> = {
  researcher: '研究员',
  operator: '运维',
  analyst: '分析师',
  pm: '项目经理',
  support: '支持专员',
  secretary: '秘书',
};

/** 角色 → 默认部门（P3 分组） */
const ROLE_DEPARTMENT: Record<string, string> = {
  researcher: '研究',
  operator: '运维',
  analyst: '分析',
  pm: '产品',
  support: '支持',
  secretary: '行政',
};

export interface RoleInfo {
  id: string;
  label: string;
  title: string;
}

export interface AddStaffInput {
  name: string;
  /** 英文标识（agentId，如 keling/xiaoyan）——OpenClaw 要求 ASCII */
  agentId: string;
  role: string;
  /** 岗位职责（选填：工作内容 / 工作方式，会写入人设） */
  duty?: string;
}

export interface AddStaffResult {
  agentId: string;
  name: string;
  role: string;
  roomId: string;
}

/** 列出可用角色模板 */
export function listRoles(): RoleInfo[] {
  if (!existsSync(ROLES_DIR)) return [];
  return readdirSync(ROLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const id = basename(f, '.md');
      return { id, label: ROLE_LABELS[id] || id, title: ROLE_LABELS[id] || id };
    });
}

/** 校验英文标识（agentId：小写字母数字连字符） */
function normalizeAgentId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * 生成人设文本（纯函数，不落盘不创建）——供"添加员工预览"使用
 * 与 addStaff 生成逻辑一致：角色模板占位符替换 + 岗位职责追加章节
 * @throws 名字/角色无效时抛错
 */
export function previewPersona(input: { name: string; role: string; duty?: string }): {
  persona: string;
  filename: string;
  roleLabel: string;
  roleTitle: string;
} {
  const name = input.name.trim();
  const role = input.role;
  const duty = input.duty?.trim() || '';

  if (!name) throw new Error('员工名字不能为空');
  const roles = listRoles();
  const roleInfo = roles.find((r) => r.id === role);
  if (!roleInfo) throw new Error(`未知角色: ${role}（可选: ${roles.map((r) => r.id).join(', ')}）`);
  if (!existsSync(join(ROLES_DIR, `${role}.md`))) throw new Error(`角色模板不存在: ${role}`);

  const template = readFileSync(join(ROLES_DIR, `${role}.md`), 'utf8');
  const persona = template
    .replaceAll('{NAME}', name)
    .replaceAll('{ROLE_TITLE}', roleInfo.title || roleInfo.label);
  const personaWithDuty = duty
    ? `${persona}

## 岗位职责（主管指定）
${duty}
`
    : persona;

  return {
    persona: personaWithDuty,
    filename: 'AGENTS.md',
    roleLabel: roleInfo.label,
    roleTitle: roleInfo.title || roleInfo.label,
  };
}

/**
 * 添加员工（招同事）：
 * 生成人设 → openclaw agents add → 固定房间 → 重启 gateway
 */
export async function addStaff(input: AddStaffInput): Promise<AddStaffResult> {
  const name = input.name.trim();
  const agentId = normalizeAgentId(input.agentId);
  const role = input.role;
  const duty = input.duty?.trim() || '';

  if (!name) throw new Error('员工名字不能为空');
  if (agentId.length < 2) throw new Error('英文标识太短（至少 2 个字符，如 xiaoma）');
  if (!/^[a-z][a-z0-9-]*$/.test(agentId)) throw new Error('英文标识需以字母开头，仅含小写字母/数字/连字符');
  const roles = listRoles();
  const roleInfo = roles.find((r) => r.id === role);
  if (!roleInfo) {
    throw new Error(`未知角色: ${role}（可选: ${roles.map((r) => r.id).join(', ')}）`);
  }

  // 1. 生成人设 workspace/<agentId>/AGENTS.md + TOOLS.md
  const agentWorkspace = join(WORKSPACE_DIR, agentId);
  mkdirSync(join(agentWorkspace, 'skills'), { recursive: true });

  const template = readFileSync(join(ROLES_DIR, `${role}.md`), 'utf8');
  const persona = template
    .replaceAll('{NAME}', name)
    .replaceAll('{ROLE_TITLE}', roleInfo.title || roleInfo.label);
  // 岗位职责（用户指定）追加到人设
  const personaWithDuty = duty
    ? `${persona}

## 岗位职责（主管指定）
${duty}
`
    : persona;
  writeFileSync(join(agentWorkspace, 'AGENTS.md'), personaWithDuty, 'utf8');
  writeFileSync(
    join(agentWorkspace, 'TOOLS.md'),
    [
      '# TOOLS.md - 本地配置',
      '',
      '## 技能',
      `- 技能放在本目录 skills/ 下（自动发现）`,
      `- 遇到能力缺口可用 clawhub 自主搜索/安装：clawhub search <关键词> / clawhub install <技能> --dir /data/workspace/${agentId}/skills`,
      '',
    ].join('\n'),
    'utf8',
  );

  // 2. openclaw agents add（容器内；自动写 openclaw.json + 创建 agentDir + workspace 骨架）
  const containerWorkspace = `/data/workspace/${agentId}`;
  const containerAgentDir = `/home/node/.openclaw/agents/${agentId}/agent`;
  const innerCmd = [
    `node /app/openclaw.mjs agents add "${agentId}"`,
    `--workspace "${containerWorkspace}"`,
    `--agent-dir "${containerAgentDir}"`,
    `--model "${DEFAULT_MODEL}"`,
    '--non-interactive',
    '--json',
  ].join(' ');
  const cmd = `docker exec ${GATEWAY_CONTAINER} bash -lc '${innerCmd}'`;

  let addOut = '';
  try {
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    addOut = stdout;
    console.log(`[staff] agents add ok: ${agentId}`, addOut.slice(0, 200));
  } catch (err: any) {
    // agents add 失败（如已存在）→ 报错
    throw new Error(`创建 agent 失败: ${err.message}`);
  }

  // 把中文显示名写入 openclaw.json（agent.name），保证引擎层与房间都用中文名
  try {
    const cfgPath = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const entry = (cfg.agents?.list || []).find((a: any) => a.id === agentId);
    if (entry) {
      entry.name = name;
      entry.department = ROLE_DEPARTMENT[role] || '未分组';
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
    }
  } catch (err: any) {
    console.warn(`[staff] 更新 openclaw.json name 失败（可手动改）: ${err.message}`);
  }

  // 3. 创建固定房间（1 员工 = 1 房间，id = agentId）
  const room = ensureMemberRoom(agentId, name);

  // 4. 重启 gateway 使新 agent 生效（本地测试环境；云端由运维流程处理）
  try {
    await execAsync(`docker restart ${GATEWAY_CONTAINER}`, { timeout: 30000 });
    console.log(`[staff] gateway restarted (${agentId} 生效)`);
  } catch (err: any) {
    console.warn(`[staff] gateway restart 失败（可手动重启）: ${err.message}`);
  }

  return { agentId, name, role, roomId: room.id };
}
