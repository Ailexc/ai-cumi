// AiCumi — 消息滚动区，忠实移植 design-reference/pages/chat-main.html + empty-state.html
// 阶段二：支持群聊（按 agentId 显示不同头像/名字）
import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import type { ChatMessage } from '../../types';
import { MessageBubble } from './MessageBubble';
import { getAgentMeta } from './agentMeta';
import { useMemberMeta } from '../../hooks/useMemberMeta';

interface MessageListProps {
  roomMessages: ChatMessage[];
  /** 当前是否有选中会话 */
  hasActiveRoom: boolean;
  /** 会话标题（agent 名） */
  roomTitle?: string;
  agentAvatar?: string;
  /** 在线 agent 数量（用于欢迎语） */
  onlineCount?: number;
  connected: boolean;
  /** 是否为群聊 */
  isGroup?: boolean;
  /** 群聊：agentId → 名称映射 */
  agentNameMap?: Map<string, string>;
  /** 推理模型正在思考中 */
  isThinking?: boolean;
}

/** 按时段生成问候语 */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，让团队帮你把事办完，早点休息';
  if (h < 12) return '早安，今天想让团队帮你做什么？';
  if (h < 18) return '下午好，今天想让团队帮你做什么？';
  return '晚上好，今天想让团队帮你做什么？';
}

export function MessageList({ roomMessages, hasActiveRoom, roomTitle, agentAvatar, onlineCount, connected, isGroup, agentNameMap, isThinking }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const memberMeta = useMemberMeta();

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 新消息/流式更新时，若用户停留在底部则自动滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [roomMessages]);

  // 无选中成员 → 空状态（源自 empty-state.html）
  if (!hasActiveRoom) {
    return (
      <div className="aicumi-scroll flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary-100 text-primary/80">
          <MessageCircle size={80} className="h-20 w-20" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">选择一个团队成员开始对话</h2>
        <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
          点击左侧的团队成员，即可开始和 TA 对话——就像走进办公室找同事聊聊。
        </p>
      </div>
    );
  }

  return (
    <div
      className="aicumi-scroll flex-1 overflow-y-auto"
      data-scroll-region="primary"
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <div className="mx-auto max-w-[780px] px-6 py-8">
        {/* 问候区（ChatGPT 风格，恒在顶部） */}
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{greeting()}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {connected && onlineCount
              ? `${onlineCount} 位团队成员已经在线，随时待命。`
              : connected
                ? '团队成员已经就绪，随时待命。'
                : '正在连接团队服务…'}
          </p>
        </div>

        <div className="space-y-6">
          {roomMessages.map((m) => {
            // 群聊：根据 agentId 获取对应的头像和名字
            const msgAgentId = m.agentId;
            let msgAgentName: string | undefined;
            let msgAgentAvatar: string | undefined;
            if (isGroup && msgAgentId && m.role === 'assistant') {
              msgAgentName = agentNameMap?.get(msgAgentId) || msgAgentId;
              const meta = getAgentMeta(msgAgentId);
              const mm = memberMeta[msgAgentId];
              msgAgentAvatar = mm?.avatar || meta.avatar;
            }
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                agentAvatar={agentAvatar}
                agentTitle={roomTitle || '助理'}
                agentName={msgAgentName}
                agentMsgAvatar={msgAgentAvatar}
              />
            );
          })}

          {/* 推理模型思考中指示器 */}
          {isThinking && (
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                <span className="ml-1 text-sm text-muted-foreground">思考中…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
