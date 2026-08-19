// AiCumi — 聊天顶栏，忠实移植 design-reference/pages/chat-main.html
import { Search, MoreHorizontal, Menu } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { statusColor, statusLabel } from './agentMeta';
import type { AgentMeta } from './agentMeta';

interface ChatHeaderProps {
  title: string;
  meta: AgentMeta | null;
  connected: boolean;
  onOpenSidebar?: () => void;
}

export function ChatHeader({ title, meta, connected, onOpenSidebar }: ChatHeaderProps) {
  const subtitle = meta
    ? `${meta.role} · ${statusLabel[meta.status]}`
    : connected
      ? '已连接'
      : '连接中…';

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
      <div className="flex items-center gap-3">
        {/* 移动端打开会话列表 */}
        {onOpenSidebar && (
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="打开会话列表"
            onClick={onOpenSidebar}
          >
            <Menu size={18} />
          </button>
        )}

        <div className="relative">
          <AgentAvatar
            avatar={meta?.avatar}
            title={title}
            size={36}
            statusColorValue={meta ? statusColor[meta.status] : undefined}
          />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="搜索"
        >
          <Search size={18} className="h-[18px] w-[18px]" />
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="更多"
        >
          <MoreHorizontal size={18} className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
