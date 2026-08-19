// AiCumi 聊天界面 — 三栏布局（员工导航 / 会话列表 / 聊天窗）
// 对标：Slack/飞书的团队通讯结构 + ChatGPT 的现代质感

import { useState } from 'react';
import {
  Sparkles, Compass, PenLine, Search, Plus, Send, Paperclip, Settings,
  MoreHorizontal, Hash, ChevronDown,
} from 'lucide-react';
import { agents, groups, conversations, initialMessages, statusColor, type Agent, type ChatMessage } from './data';

// ============ 设计令牌 ============
const t = {
  canvas: '#f7f7f8',
  surface: '#ffffff',
  textPrimary: '#1a1b1e',
  textSecondary: '#5f6368',
  textMuted: '#9aa0a6',
  border: 'rgba(0,0,0,.07)',
  borderStrong: 'rgba(0,0,0,.12)',
  hover: 'rgba(0,0,0,.04)',
  active: 'rgba(0,0,0,.07)',
  primary: '#5e6ad2',
  primaryHover: '#4a56c4',
  primarySoft: '#eef0fb',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
};

const agentIcons: Record<string, typeof Sparkles> = {
  keling: Sparkles,
  xiaoyan: Compass,
  xiaowen: PenLine,
};

function agentMark(agentId: string, size = 28) {
  const agent = agents.find((a) => a.id === agentId);
  const Icon = agentIcons[agentId] || Sparkles;
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.32, background: agent?.gradient, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)' }}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} color="#fff" />
    </div>
  );
}

function GroupMark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center rounded-[8px]" style={{ background: t.primarySoft, color: t.primary }}>
        <Hash size={size * 0.5} strokeWidth={2.2} />
      </div>
    </div>
  );
}

// ============ 主组件 ============
export function AiCumiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text, time }]);
    setInput('');
  };

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ fontFamily: t.font, background: t.canvas, color: t.textPrimary }}>
      {/* ===== 左栏：员工 / 群聊导航 ===== */}
      <aside className="flex w-[232px] shrink-0 flex-col border-r" style={{ background: t.surface, borderColor: t.border }}>
        <LeftNav />
      </aside>

      {/* ===== 中栏：会话列表 ===== */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r" style={{ background: t.surface, borderColor: t.border }}>
        <ConversationList />
      </aside>

      {/* ===== 右栏：聊天窗 ===== */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatWindow messages={messages} input={input} setInput={setInput} onSend={send} />
      </main>
    </div>
  );
}

// ============ 左栏 ============
function LeftNav() {
  return (
    <>
      {/* 品牌 */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] text-white" style={{ background: 'linear-gradient(135deg,#5e6ad2,#8b5cf6)', boxShadow: '0 2px 8px rgba(94,106,210,.35)' }}>
          <Sparkles size={18} strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[16px] font-bold tracking-tight">AiCumi</div>
          <div className="text-[11px]" style={{ color: t.textMuted }}>私人 AI 助理团队</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {/* AI 员工 */}
        <SectionLabel>AI 员工</SectionLabel>
        <div className="space-y-0.5">
          {agents.map((a) => <AgentItem key={a.id} agent={a} />)}
        </div>

        {/* 群聊 */}
        <div className="mt-6">
          <SectionLabel>群聊</SectionLabel>
          <div className="space-y-0.5">
            {groups.map((g) => (
              <div key={g.id} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors" style={{ color: t.textSecondary }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <GroupMark size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium" style={{ color: t.textPrimary }}>{g.name}</div>
                  <div className="text-[11px]" style={{ color: t.textMuted }}>{g.members.length} 位成员</div>
                </div>
                {g.unread > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white" style={{ background: t.primary }}>{g.unread}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部 */}
      <div className="flex items-center gap-2.5 border-t px-4 py-3" style={{ borderColor: t.border }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>
          <Sparkles size={14} color="#fff" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">我的工作区</div>
          <div className="text-[11px]" style={{ color: t.textMuted }}>个人版</div>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: t.textMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Settings size={16} strokeWidth={1.8} />
        </button>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>
      {children}
    </div>
  );
}

function AgentItem({ agent }: { agent: Agent }) {
  return (
    <div className="group flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="relative shrink-0">
        {agentMark(agent.id, 32)}
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2" style={{ background: statusColor[agent.status], borderColor: '#fff' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold" style={{ color: t.textPrimary }}>{agent.name}</div>
        <div className="truncate text-[11px]" style={{ color: t.textMuted }}>{agent.role}</div>
      </div>
    </div>
  );
}

// ============ 中栏：会话列表 ============
function ConversationList() {
  return (
    <>
      {/* 醒目新建按钮 */}
      <div className="px-3 pb-3 pt-4">
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[14px] font-semibold text-white transition-all hover:brightness-105 active:scale-[0.99]"
          style={{ background: t.primary, boxShadow: '0 2px 10px rgba(94,106,210,.3)' }}
        >
          <Plus size={17} strokeWidth={2.5} /> 新建对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        <SectionLabel>今天</SectionLabel>
        <div className="space-y-0.5">
          {conversations.slice(0, 2).map((c) => <ConvRow key={c.id} c={c} />)}
        </div>

        <div className="mt-4">
          <SectionLabel>最近</SectionLabel>
          <div className="space-y-0.5">
            {conversations.slice(2).map((c) => <ConvRow key={c.id} c={c} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function ConvRow({ c }: { c: (typeof conversations)[number] }) {
  return (
    <div className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 transition-colors"
      style={{ background: c.active ? t.active : 'transparent' }}
      onMouseEnter={(e) => { if (!c.active) e.currentTarget.style.background = t.hover; }}
      onMouseLeave={(e) => { if (!c.active) e.currentTarget.style.background = 'transparent'; }}
    >
      {c.agentId ? agentMark(c.agentId, 34) : <GroupMark size={34} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold" style={{ color: t.textPrimary }}>{c.title}</span>
          <span className="shrink-0 text-[11px]" style={{ color: t.textMuted }}>{c.time}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[12px]" style={{ color: t.textSecondary }}>{c.subtitle}</span>
          {c.unread ? (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: t.primary }}>{c.unread}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============ 右栏：聊天窗 ============
function ChatWindow({ messages, input, setInput, onSend }: {
  messages: ChatMessage[]; input: string; setInput: (v: string) => void; onSend: () => void;
}) {
  const active = conversations[0];
  return (
    <>
      {/* 顶栏 */}
      <header className="flex h-[62px] shrink-0 items-center gap-3 border-b px-5" style={{ background: t.surface, borderColor: t.border }}>
        {active.agentId && agentMark(active.agentId, 34)}
        {active.groupId && <GroupMark size={34} />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold tracking-tight">{active.title}</span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: t.textMuted }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#53b559' }} />
              {active.agentId ? '在线' : '3 位成员'}
            </span>
          </div>
          <div className="truncate text-[12px]" style={{ color: t.textMuted }}>
            {active.agentId ? '前台秘书 · 随时待命' : '你的 AI 助理团队'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {[Search, MoreHorizontal].map((Icon, i) => (
            <button key={i} className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors" style={{ color: t.textSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon size={18} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </header>

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-8 py-8">
          <div className="mb-8 mt-2 text-center">
            <h1 className="text-[22px] font-bold tracking-tight">早上好 👋</h1>
            <p className="mt-1.5 text-[14px]" style={{ color: t.textSecondary }}>我是可灵，今天想先做点什么？可以试试下面这些。</p>
          </div>

          <div className="space-y-6">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto w-full max-w-[760px] rounded-[18px] border bg-white transition-shadow" style={{ borderColor: t.borderStrong, boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
          <div className="flex items-end gap-1 p-2">
            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-colors" style={{ color: t.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.textSecondary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted; }}
            >
              <Paperclip size={18} strokeWidth={1.8} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              placeholder={`发消息给 ${active.agentId ? '可灵' : '群组'}…`}
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] outline-none"
              style={{ color: t.textPrimary }}
            />
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white transition-all disabled:opacity-35"
              style={{ background: t.primary }}
            >
              <Send size={17} strokeWidth={2.2} />
            </button>
          </div>
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="flex items-center gap-1 text-[12px]" style={{ color: t.textMuted }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.primary }} />
              发送给 {active.agentId ? '可灵' : '全员'}
              <span className="mx-1" style={{ color: t.borderStrong }}>·</span>
              DeepSeek-V4 <ChevronDown size={12} />
            </span>
            <span className="text-[12px]" style={{ color: t.textMuted }}>⌘ Enter 发送</span>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] px-4 py-2.5 text-[15px] leading-[1.65] text-white"
          style={{ background: t.primary, borderRadius: '16px 16px 6px 16px' }}
        >
          {msg.text}
        </div>
      </div>
    );
  }
  const agent = agents.find((a) => a.id === msg.agentId);
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0">{agentMark(msg.agentId || 'keling', 30)}</div>
      <div className="min-w-0 max-w-[78%]">
        <div className="mb-1 text-[13px] font-semibold" style={{ color: t.textPrimary }}>
          {agent?.name || '可灵'}
          <span className="ml-2 text-[11px] font-normal" style={{ color: t.textMuted }}>{msg.time}</span>
        </div>
        <div className="rounded-[16px] border bg-white px-4 py-2.5 text-[15px] leading-[1.65]" style={{ borderColor: t.border, borderRadius: '6px 16px 16px 16px' }}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}
