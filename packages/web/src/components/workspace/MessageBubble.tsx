// AiCumi — 消息气泡（用户 / AI），忠实移植 design-reference/pages/chat-main.html
import type { ChatMessage } from '../../types';

interface MessageBubbleProps {
  msg: ChatMessage;
  agentAvatar?: string;
  agentTitle: string;
}

export function MessageBubble({ msg, agentAvatar, agentTitle }: MessageBubbleProps) {
  const isUser = msg.role !== 'assistant';
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

  return (
    <div className="msg-enter flex items-start gap-3">
      {agentAvatar ? (
        <img src={agentAvatar} alt={agentTitle} className="mt-1 h-9 w-9 rounded-full object-cover bg-muted" />
      ) : (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
          {agentTitle.slice(0, 1)}
        </div>
      )}

      <div className="max-w-[80%]">
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
