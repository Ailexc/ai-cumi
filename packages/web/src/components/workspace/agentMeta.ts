// AiCumi — 员工元数据与格式化工具
// Phase 1：元数据为前端常量；后续可改为后端下发（agent.list 扩展）

export interface AgentMeta {
  avatar?: string;
  role: string;
  status: 'online' | 'busy' | 'offline';
}

export const AGENT_META: Record<string, AgentMeta> = {
  keling: { avatar: '/avatars/avatar-keling.jpg', role: '前台秘书', status: 'online' },
  xiaoyan: { avatar: '/avatars/avatar-xiaoyan.jpg', role: '调研专员', status: 'online' },
  xiaowen: { avatar: '/avatars/avatar-xiaowen.jpg', role: '内容运营', status: 'busy' },
  // 后端 agentId 别名 → 同一员工
  'staff-dde57f': { avatar: '/avatars/avatar-xiaowen.jpg', role: '内容运营', status: 'busy' },
};

export const DEFAULT_META: AgentMeta = { role: '助理', status: 'online' };

export const statusColor = {
  online: 'var(--aicumi-success)',
  busy: 'var(--aicumi-warning)',
  offline: 'var(--aicumi-foreground-tertiary)',
} as const;

export const statusLabel = {
  online: '在线',
  busy: '忙碌',
  offline: '离线',
} as const;

export function getAgentMeta(agentId?: string): AgentMeta {
  return (agentId && AGENT_META[agentId]) || DEFAULT_META;
}

/** 时间戳 → "09:41" / "昨天" / "8/10" */
export function formatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  if (diffDays === 0) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 1) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 截断预览文本 */
export function truncate(s: string, n = 26): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
