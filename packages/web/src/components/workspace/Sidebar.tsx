// AiCumi — 侧栏「我的团队」（roster），忠实移植 design-reference/pages/chat-main.html
// 产品语义：团队成员列表（点成员 = 进入与 TA 的持续对话），不是"会话列表"，无"新建对话"
// 注意：添加成员入口在左侧功能栏（AppRail），此处不重复
// 阶段二：两级列表（我的团队 / 群聊）
import { useState } from 'react';
import { Search, X, Users, Plus } from 'lucide-react';
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
  /** group 专用 */
  isGroup?: boolean;
  memberNames?: string;
}

interface SidebarProps {
  convs: Conv[];
  groupConvs: Conv[];
  connected: boolean;
  onSelect: (id: string) => void;
  onCreateGroup?: () => void;
  /** 移动端抽屉状态 */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ convs, groupConvs, connected, onSelect, onCreateGroup, open, onClose }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'groups'>('team');

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

        {/* Tab 切换：团队 / 群聊 */}
        <div className="flex shrink-0 border-b border-border">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'team'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            我的团队
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'groups'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            群聊
          </button>
        </div>

        {/* 列表内容 */}
        <div className="aicumi-scroll flex-1 px-3 py-3">
          {activeTab === 'team' ? (
            convs.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {connected ? '还没有团队成员' : '连接服务中…'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {convs.map((c) => (
                  <MemberRow key={c.id} c={c} onClick={() => onSelect(c.id)} />
                ))}
              </div>
            )
          ) : (
            <>
              {onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary"
                >
                  <Plus size={14} /> 创建群聊
                </button>
              )}
              {groupConvs.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">还没有群聊</p>
              ) : (
                <div className="space-y-0.5">
                  {groupConvs.map((c) => (
                    <MemberRow key={c.id} c={c} onClick={() => onSelect(c.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* 团队成员/群聊行 */
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
      {c.isGroup ? (
        <div className="mt-0.5 flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary">
          <Users size={16} />
        </div>
      ) : (
        <AgentAvatar
          avatar={c.avatar}
          kind={c.avatarKind}
          letter={c.avatarLetter}
          title={c.title}
          size={36}
          className="mt-0.5"
          statusColorValue={c.status ? statusColor[c.status] : undefined}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{c.time}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="flex-1 truncate text-xs text-muted-foreground">
            {c.isGroup && c.memberNames ? (
              <span className="text-muted-foreground/70">{c.memberNames} · </span>
            ) : null}
            {c.preview}
          </p>
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
