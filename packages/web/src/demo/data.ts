// AiCumi 聊天界面 — Mock 数据

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'busy' | 'offline';
  gradient: string;
  icon: string;
  avatar?: string;
  lastSeen: string;
}

export const agents: Agent[] = [
  { id: 'keling', name: '可灵', role: '前台秘书', status: 'online', gradient: 'linear-gradient(135deg, #5e6ad2, #8b5cf6)', icon: '✨', avatar: '/avatars/avatar-keling.jpg', lastSeen: '在线' },
  { id: 'xiaoyan', name: '小研', role: '调研专员', status: 'online', gradient: 'linear-gradient(135deg, #0ea5a4, #22d3ee)', icon: '🔍', avatar: '/avatars/avatar-xiaoyan.jpg', lastSeen: '在线' },
  { id: 'xiaowen', name: '小文', role: '内容运营', status: 'busy', gradient: 'linear-gradient(135deg, #f97316, #fb923c)', icon: '✍️', avatar: '/avatars/avatar-xiaowen.jpg', lastSeen: '5 分钟前' },
];

export interface GroupChat {
  id: string;
  name: string;
  members: string[]; // agent ids
  unread: number;
}

export const groups: GroupChat[] = [
  { id: 'g-all', name: '全员 · 助理团队', members: ['keling', 'xiaoyan', 'xiaowen'], unread: 2 },
  { id: 'g-proj', name: '项目 · 周报讨论', members: ['keling', 'xiaoyan'], unread: 0 },
];

export interface Conversation {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  unread?: number;
  agentId?: string;
  groupId?: string;
  active?: boolean;
}

export const conversations: Conversation[] = [
  { id: 'c-keling', title: '可灵', subtitle: '好的，我看了下你的日历…', time: '09:14', agentId: 'keling', unread: 0, active: true },
  { id: 'c-xiaoyan', title: '小研', subtitle: '行业报告已整理完毕 📄', time: '昨天', agentId: 'xiaoyan', unread: 3 },
  { id: 'c-all', title: '全员 · 助理团队', subtitle: '小文：第二版文案已上传', time: '昨天', groupId: 'g-all', unread: 0 },
  { id: 'c-proj', title: '项目 · 周报讨论', subtitle: '可灵：周五前汇总即可', time: '周一', groupId: 'g-proj', unread: 0 },
  { id: 'c-xiaowen', title: '小文', subtitle: '新写的公众号文章', time: '周一', agentId: 'xiaowen', unread: 0 },
];

export interface ChatMessage {
  id: number;
  role: 'user' | 'agent';
  agentId?: string;
  text: string;
  time: string;
}

export const initialMessages: ChatMessage[] = [
  { id: 1, role: 'agent', agentId: 'keling', text: '早上好！我是可灵，今天想先从哪件事开始？', time: '09:12' },
  { id: 2, role: 'user', text: '帮我把今天的日程整理一下，看看下午有没有空。', time: '09:13' },
  { id: 3, role: 'agent', agentId: 'keling', text: '我看了你的日历：下午 2 点到 4 点有一个空档，其他时段安排了两个会议。需要我帮你做什么调整吗？', time: '09:13' },
  { id: 4, role: 'user', text: '那帮我约一个 3 点的电话会议吧。', time: '09:14' },
];

export const statusColor: Record<Agent['status'], string> = {
  online: '#53b559',
  busy: '#e8a13a',
  offline: '#c4c4c4',
};
