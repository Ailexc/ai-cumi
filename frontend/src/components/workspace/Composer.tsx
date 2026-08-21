// AiCumi — 输入区（Composer），忠实移植 design-reference/pages/chat-main.html
// 阶段二：支持群聊 @ 提及
import { useRef, useState, useEffect, useCallback } from 'react';
import { Paperclip, Send, AtSign } from 'lucide-react';

interface MentionCandidate {
  id: string;
  name: string;
}

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string, mentions?: string[]) => void;
  placeholder?: string;
  /** 群聊时传入群成员列表，启用 @ 功能 */
  groupMembers?: MentionCandidate[];
}

export function Composer({ disabled, onSend, placeholder = '给团队发送指令…', groupMembers }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const mentionListRef = useRef<HTMLDivElement>(null);

  const isGroupMode = !!groupMembers && groupMembers.length > 0;

  // 过滤 @ 候选人
  const filteredCandidates = isGroupMode
    ? (groupMembers || []).filter(
        (m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase()) || m.id.includes(mentionQuery.toLowerCase()),
      )
    : [];

  // 检测 @ 输入
  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      if (!isGroupMode) return;
      // 找光标前最近的 @
      const before = text.slice(0, cursorPos);
      const atIndex = before.lastIndexOf('@');
      if (atIndex < 0) {
        setShowMentions(false);
        return;
      }
      // @ 后面不能有空格（表示已选完）
      const afterAt = before.slice(atIndex + 1);
      if (/\s/.test(afterAt)) {
        setShowMentions(false);
        return;
      }
      setMentionStart(atIndex);
      setMentionQuery(afterAt);
      setShowMentions(true);
    },
    [isGroupMode],
  );

  // 选择 @ 候选人
  const selectMention = (candidate: MentionCandidate) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    const newValue = `${before}@${candidate.name} ${after}`;
    setValue(newValue);
    setShowMentions(false);
    setMentionQuery('');
    // 聚焦并移动光标
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = before.length + candidate.name.length + 2;
        el.setSelectionRange(pos, pos);
        el.focus();
      }
    }, 0);
  };

  // 解析消息中的 @ 提及
  const parseMentions = (text: string): string[] => {
    if (!isGroupMode) return [];
    const mentions: string[] = [];
    for (const member of groupMembers || []) {
      // 匹配 @名字（中文名或 id）
      const patterns = [`@${member.name}`, `@${member.id}`];
      for (const p of patterns) {
        if (text.includes(p) && !mentions.includes(member.id)) {
          mentions.push(member.id);
        }
      }
    }
    return mentions;
  };

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
    const mentions = parseMentions(text);
    onSend(text, mentions.length > 0 ? mentions : undefined);
    setValue('');
    setShowMentions(false);
    const el = textareaRef.current;
    if (el) el.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showMentions && filteredCandidates.length > 0) {
        // @ 列表打开时 Enter 选择第一个
        e.preventDefault();
        selectMention(filteredCandidates[0]);
        return;
      }
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && showMentions) {
      setShowMentions(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    autoResize();
    // 检测 @ 输入
    detectMention(newValue, e.target.selectionStart);
  };

  // 点击外部关闭 @ 列表
  useEffect(() => {
    if (!showMentions) return;
    const handler = (e: MouseEvent) => {
      if (mentionListRef.current && !mentionListRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMentions]);

  return (
    <div className="shrink-0 border-t border-border bg-surface p-4">
      <div className="relative mx-auto max-w-[780px]">
        {/* @ 提及弹出列表 */}
        {showMentions && filteredCandidates.length > 0 && (
          <div
            ref={mentionListRef}
            className="absolute bottom-full left-0 mb-2 max-h-48 w-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg"
          >
            {filteredCandidates.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(c);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <AtSign size={14} className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{c.id}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-sm transition-colors focus-within:border-[var(--aicumi-primary-300)]">
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
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={isGroupMode ? '输入 @ 提及成员…' : placeholder}
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
      </div>

      <p className="mx-auto mt-2 max-w-[780px] text-center text-xs text-muted-foreground">
        {isGroupMode ? '输入 @ 提及成员，不 @ 时群主回复 · Enter 发送' : '按 Enter 发送，Shift + Enter 换行'}
      </p>
    </div>
  );
}
