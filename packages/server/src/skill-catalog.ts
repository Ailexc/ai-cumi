// AiCumi — 技能管理（P2：技能市场 + 绑定/解绑）
// 技能目录：预置常用技能列表，可从 OpenClaw 实例发现已安装技能
// 绑定：将技能从目录复制到 agent workspace/skills/

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { OPENCLAW_LOCAL_DIR, agentWorkspace } from './staff.js';

const execAsync = promisify(exec);
const WORKSPACE_DIR = join(OPENCLAW_LOCAL_DIR, 'workspace');

// ============ 技能目录（预置常用技能） ============

export interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  /** 技能来源：本地目录 / clawhub */
  source: 'local' | 'clawhub';
  /** 是否已安装到 OpenClaw 实例 */
  installed?: boolean;
}

/** 预置技能目录 */
const BUILTIN_SKILLS: SkillCatalogItem[] = [
  {
    id: 'browser-search',
    name: '网络搜索',
    description: '零成本网页搜索（必应中国），适合日常信息查询、资料查找',
    category: '信息获取',
    source: 'local',
  },
  {
    id: 'github-research',
    name: 'GitHub 调研',
    description: 'GitHub 项目深度调研，搜索代码、读 README、分析 Star/Issue',
    category: '信息获取',
    source: 'local',
  },
  {
    id: 'media-gen',
    name: '媒体生成',
    description: '图像生成（百炼生图）+ 语音合成（TTS），基于阿里云 DashScope',
    category: '创作',
    source: 'local',
  },
  {
    id: 'voice-transcribe',
    name: '语音转文字',
    description: '飞书语音消息转文字，基于阿里云百炼',
    category: '信息获取',
    source: 'local',
  },
  {
    id: 'add-staff',
    name: '招聘新员工',
    description: '对话式定制人设 + 飞书一键扫码创建，自动接入 OpenClaw',
    category: '管理',
    source: 'local',
  },
  {
    id: 'douyin-mcp',
    name: '抖音视频解析',
    description: '解析抖音视频链接，提取文字/语音内容',
    category: '信息获取',
    source: 'local',
  },
  {
    id: 'feishu-doc',
    name: '飞书文档',
    description: '创建/编辑飞书文档，支持 Markdown 格式',
    category: '协作',
    source: 'local',
  },
  {
    id: 'feishu-im',
    name: '飞书消息',
    description: '发送飞书消息/文件，支持私聊和群聊',
    category: '协作',
    source: 'local',
  },
  {
    id: 'feishu-calendar',
    name: '飞书日历',
    description: '管理飞书日程，创建/查询/修改会议',
    category: '协作',
    source: 'local',
  },
  {
    id: 'feishu-base',
    name: '飞书多维表格',
    description: '操作飞书多维表格，增删改查记录',
    category: '协作',
    source: 'local',
  },
];

// ============ 技能操作 ============

/** 获取技能目录（含已安装状态） */
export function getSkillCatalog(): SkillCatalogItem[] {
  // 检查哪些技能已安装到 OpenClaw 实例
  const installedDir = join(WORKSPACE_DIR, 'tools/skills');
  const installed = existsSync(installedDir) ? readdirSync(installedDir) : [];

  return BUILTIN_SKILLS.map((skill) => ({
    ...skill,
    installed: installed.includes(skill.id),
  }));
}

/** 获取 agent 已绑定的技能列表 */
export function getAgentSkills(agentId: string): string[] {
  const dir = join(agentWorkspace(agentId), 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** 绑定技能到 agent（从实例 skills/ 复制到 agent workspace/skills/） */
export function bindSkill(agentId: string, skillId: string): { ok: boolean; error?: string } {
  // 检查技能是否存在于实例
  const sourceDir = join(WORKSPACE_DIR, `tools/skills/${skillId}`);
  if (!existsSync(sourceDir)) {
    // 尝试从 agent 自己的 skills 目录查找（已安装）
    const altSource = join(agentWorkspace(agentId), `skills/${skillId}`);
    if (existsSync(altSource)) {
      return { ok: true }; // 已经绑定
    }
    return { ok: false, error: `技能 ${skillId} 未找到` };
  }

  const targetDir = join(agentWorkspace(agentId), `skills/${skillId}`);
  if (existsSync(targetDir)) {
    return { ok: true }; // 已经绑定
  }

  try {
    mkdirSync(targetDir, { recursive: true });
    // 复制技能目录内容
    const files = readdirSync(sourceDir);
    for (const file of files) {
      copyFileSync(join(sourceDir, file), join(targetDir, file));
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** 解绑技能（从 agent workspace/skills/ 删除） */
export function unbindSkill(agentId: string, skillId: string): { ok: boolean; error?: string } {
  const targetDir = join(agentWorkspace(agentId), `skills/${skillId}`);
  if (!existsSync(targetDir)) {
    return { ok: true }; // 已经解绑
  }

  try {
    rmSync(targetDir, { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** 从 OpenClaw 实例发现已安装的技能（clawhub install 的） */
export async function discoverInstalledSkills(): Promise<{ id: string; name: string; description: string }[]> {
  try {
    const { stdout } = await execAsync(
      'docker exec openclaw-gateway-local bash -lc "ls /data/workspace/tools/skills/ 2>/dev/null"',
      { timeout: 10000 },
    );
    const dirs = stdout.trim().split('\n').filter(Boolean);
    const skills: { id: string; name: string; description: string }[] = [];

    for (const dir of dirs) {
      const skillMd = join(WORKSPACE_DIR, `tools/skills/${dir}/SKILL.md`);
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf8');
        const match = content.match(/^---\nname:\s*(.+)\ndescription:\s*(.+)\n---/);
        skills.push({
          id: dir,
          name: match?.[1] || dir,
          description: match?.[2] || '',
        });
      }
    }

    return skills;
  } catch {
    return [];
  }
}