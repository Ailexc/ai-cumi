// AiCumi — 侧栏「我的团队」（roster），忠实移植 design-reference/pages/chat-main.html
// 产品语义：团队成员列表（点成员 = 进入与 TA 的持续对话），不是"会话列表"，无"新建对话"
// 注意：添加成员入口在左侧功能栏（AppRail），此处不重复
import { Search, X } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { statusColor } from './agentMeta';

export interface Conv {
  id: string;
  title: string;
  role?: string;
  preview: string;
  time: string;
  avatar?: string;
  avatarKind?: 'photo' | 'users' | 'folder' | 'letter';
  avatarLetter?: string;
  status?: 'online' | 'busy' | 'offline';
  unread?: number;
  active?: boolean;
}

interface SidebarProps {
  convs: Conv[];
  connected: boolean;
  onSelect: (id: string) => void;
  /** 移动端抽屉状态 */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ convs, connected, onSelect, open, onClose }: SidebarProps) {
  return (
    <>
      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={`aicumi-pane aicumi-roster fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        id="conversation-list"
        data-region="conversation-list"
        aria-label="我的团队"
      >
        {/* 品牌栏 */}
        <div className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">A</div>
            <span className="font-semibold text-foreground">AiCumi</span>
          </div>
          <div className="flex items-center gap-1">
            {/* 移动端关闭 */}
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="关闭会话列表"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 搜索成员 */}
        <div className="shrink-0 border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <Search size={16} className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">搜索成员</span>
          </div>
        </div>

        {/* 我的团队（成员列表） */}
        <div className="aicumi-scroll flex-1 px-3 py-3">
          {convs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {connected ? '还没有团队成员' : '连接服务中…'}
            </p>
          ) : (
            <>
              <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">我的团队</p>
              <div className="space-y-0.5">
                {convs.map((c) => (
                  <MemberRow key={c.id} c={c} onClick={() => onSelect(c.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* 团队成员行 */
function MemberRow({ c, onClick }: { c: Conv; onClick: () => void }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`group flex items-start gap-3 rounded-lg p-2 transition-colors ${
        c.active ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-muted'
      }`}
    >
      <AgentAvatar
        avatar={c.avatar}
        kind={c.avatarKind}
        letter={c.avatarLetter}
        title={c.title}
        size={36}
        className="mt-0.5"
        statusColorValue={c.status ? statusColor[c.status] : undefined}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{c.time}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="flex-1 truncate text-xs text-muted-foreground">{c.preview}</p>
          {c.unread ? (
            <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {c.unread}
            </span>
          ) : null}
        </div>
      </div>
    </a>
  );
}
