// AiCumi — 消息气泡（用户 / AI），忠实移植 design-reference/pages/chat-main.html
// 阶段二：支持群聊（显示 agent 名字 + 头像）
import { useState } from 'react';
import type { ChatMessage } from '../../types';

interface MessageBubbleProps {
  msg: ChatMessage;
  agentAvatar?: string;
  agentTitle: string;
  /** 群聊时：该消息的 agent 名字（覆盖默认 agentTitle） */
  agentName?: string;
  /** 群聊时：该消息的 agent 头像 */
  agentMsgAvatar?: string;
  /** 该消息关联的长期记忆（动态检索注入，学习导向展示） */
  memories?: { id: string; content: string; memory_type: string }[];
}

export function MessageBubble({ msg, agentAvatar, agentTitle, agentName, agentMsgAvatar, memories }: MessageBubbleProps) {
  const isUser = msg.role !== 'assistant';
  const [memOpen, setMemOpen] = useState(false);
  const time = new Date(msg.timestamp);
  const timeText = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  if (isUser) {
    return (
      <div className="msg-enter flex flex-row-reverse items-start gap-3">
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          我
        </div>
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
          </div>
          <span className="mt-1.5 block text-right text-xs text-muted-foreground">{timeText}</span>
        </div>
      </div>
    );
  }

  // 群聊：显示消息来源的 agent 名字 + 头像
  const displayName = agentName || agentTitle;
  const displayAvatar = agentMsgAvatar || agentAvatar;

  return (
    <div className="msg-enter flex items-start gap-3">
      {displayAvatar ? (
        <img src={displayAvatar} alt={displayName} className="mt-1 h-9 w-9 rounded-full object-cover bg-muted" />
      ) : (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
          {displayName.slice(0, 1)}
        </div>
      )}

      <div className="max-w-[80%]">
        {/* 群聊：显示 agent 名字 */}
        {agentName && (
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{agentName}</span>
        )}
        {/* 长期记忆关联提示（学习导向） */}
        {memories && memories.length > 0 && (
          <button
            onClick={() => setMemOpen((v) => !v)}
            className="mb-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-100"
            title="点击展开本次注入的长期记忆"
          >
            🧠 已关联 {memories.length} 条记忆
            <span className="text-[10px]">{memOpen ? '▲' : '▼'}</span>
          </button>
        )}
        {memories && memOpen && memories.length > 0 && (
          <div className="mb-1 space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
            {memories.map((mem) => (
              <div key={mem.id} className="text-[11px] leading-snug text-amber-800">
                <span className="mr-1 rounded bg-amber-100 px-1 text-[10px]">{mem.memory_type}</span>
                {mem.content}
              </div>
            ))}
          </div>
        )}
        <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 shadow-sm">
          {msg.streaming && !msg.content ? (
            /* 流式回复尚未产出内容 → 打字指示点 */
            <TypingDots />
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {msg.content}
              {msg.streaming && <StreamingCaret />}
            </p>
          )}
        </div>
        <span className="mt-1.5 block text-xs text-muted-foreground">{timeText}</span>
      </div>
    </div>
  );
}

/** AI 思考/等待时的三点动画 */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="正在输入">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** 流式输出中的闪烁光标 */
function StreamingCaret() {
  return (
    <span
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse rounded-full"
      style={{ background: 'var(--aicumi-primary)' }}
      aria-hidden="true"
    />
  );
}
