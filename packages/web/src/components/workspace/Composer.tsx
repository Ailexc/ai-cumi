// AiCumi — 输入区（Composer），忠实移植 design-reference/pages/chat-main.html
import { useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}

export function Composer({ disabled, onSend, placeholder = '给团队发送指令…' }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度（4px 网格：24px 起，最高 120px）
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    const el = textareaRef.current;
    if (el) el.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-surface p-4">
      <div className="mx-auto flex max-w-[780px] items-end gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-sm transition-colors focus-within:border-[var(--aicumi-primary-300)]">
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="添加附件"
        >
          <Paperclip size={18} className="h-[18px] w-[18px]" />
        </button>

        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent py-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            style={{ minHeight: 24, maxHeight: 120 }}
            aria-label="消息输入框"
          />
        </div>

        <button
          onClick={send}
          disabled={disabled}
          aria-label="发送"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          <Send size={18} className="h-[18px] w-[18px]" />
        </button>
      </div>

      <p className="mx-auto mt-2 max-w-[780px] text-center text-xs text-muted-foreground">
        按 Enter 发送，Shift + Enter 换行
      </p>
    </div>
  );
}
