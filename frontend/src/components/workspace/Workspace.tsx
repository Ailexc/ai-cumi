// AiCumi — 主界面壳（项目基底）
// 架构：三段式（飞书模式）—— 功能导航栏(AppRail) + 主内容区
// 交互：点击左侧功能栏 → 右侧主区域切换视图（导航范式，非弹窗）
//   消息 → 我的团队 + 聊天窗；成员管理 → 成员管理页
// 产品语义：点成员 = 进入与 TA 的持续对话（无"新建对话"）
// 组件：AppRail / Sidebar / ChatHeader / MessageList / Composer / MemberManagement

import { useEffect, useMemo, useState } from 'react';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useMemberMeta } from '../../hooks/useMemberMeta';
import { AppRail } from './AppRail';
import { Sidebar } from './Sidebar';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MemberManagement } from './MemberManagement';
import { ChannelWizard } from './ChannelWizard';
import { ModelManagement } from './ModelManagement';
import { getAgentMeta, formatTime, truncate } from './agentMeta';
import type { Conv } from './Sidebar';

export function Workspace() {
  const { connected, rooms, agents, messages, sendMessage, loadHistory, refreshRooms, unread, setActiveRoom, createGroup } =
    useChatSocket();
  const memberMeta = useMemberMeta(); // agentId → {role, avatar}（后端下发，覆盖前端常量）
  const [activeNav, setActiveNav] = useState('chat'); // 'chat' | 'members' | 未来扩展
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // 轻提示（扩展位点击用），3 秒后消失
  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3000);
  };

  // agent id → 名称
  const agentName = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  // 默认选中第一个成员；成员房间变化时校正
  useEffect(() => {
    setActiveRoomId((cur) => {
      if (cur && rooms.some((r) => r.id === cur)) return cur;
      return rooms.length > 0 ? rooms[0].id : null;
    });
  }, [rooms]);

  // 活跃房间变化 → 同步未读（清空 + 记录 ref）
  useEffect(() => {
    setActiveRoom(activeRoomId);
  }, [activeRoomId, setActiveRoom]);

  // 切换成员 → 拉取云端历史
  useEffect(() => {
    if (activeRoomId) loadHistory(activeRoomId);
  }, [activeRoomId, loadHistory]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;
  const isGroupChat = activeRoom?.type === 'group';
  const activeTitle = activeRoom
    ? isGroupChat
      ? activeRoom.name
      : agentName.get(activeRoom.agentId) || activeRoom.name
    : 'AiCumi';
  // 活跃成员元数据：前端常量打底 + 后端 role/avatar 覆盖
  const activeMeta = useMemo(() => {
    if (!activeRoom) return null;
    const base = getAgentMeta(activeRoom.agentId);
    const mm = memberMeta[activeRoom.agentId];
    return { ...base, role: mm?.role || base.role, avatar: mm?.avatar || base.avatar };
  }, [activeRoom, memberMeta]);
  const roomMessages = activeRoomId ? (messages.get(activeRoomId) || []) : [];

  // 团队成员列表（真实 rooms → Conv，只包含私聊）
  const convList: Conv[] = useMemo(() => {
    return rooms
      .filter((r) => r.type !== 'group')
      .map((r) => {
        const meta = getAgentMeta(r.agentId);
        const mm = memberMeta[r.agentId];
        return {
          id: r.id,
          title: agentName.get(r.agentId) || r.name,
          role: mm?.role || meta.role,
          preview: r.lastMessage ? truncate(r.lastMessage.content.replace(/\s+/g, ' ')) : '暂无消息',
          time: formatTime(r.lastMessage?.timestamp),
          avatar: mm?.avatar || meta.avatar,
          status: meta.status,
          unread: unread[r.id] || 0,
          active: r.id === activeRoomId,
        };
      });
  }, [rooms, agentName, activeRoomId, memberMeta, unread]);

  // 群聊列表
  const groupConvList: Conv[] = useMemo(() => {
    return rooms
      .filter((r) => r.type === 'group')
      .map((r) => {
        const memberNames = (r.memberAgentIds || [])
          .map((id) => agentName.get(id) || id)
          .join('、');
        return {
          id: r.id,
          title: r.name,
          preview: r.lastMessage ? truncate(r.lastMessage.content.replace(/\s+/g, ' ')) : '暂无消息',
          time: formatTime(r.lastMessage?.timestamp),
          isGroup: true,
          memberNames,
          unread: unread[r.id] || 0,
          active: r.id === activeRoomId,
        };
      });
  }, [rooms, agentName, activeRoomId, unread]);

  // 在线员工数（欢迎语用）
  const onlineCount = useMemo(() => {
    const online = new Set(rooms.filter((r) => getAgentMeta(r.agentId).status === 'online').map((r) => r.agentId));
    return Math.max(online.size, agents.some((a) => a.status === 'running') ? 1 : 0);
  }, [rooms, agents]);

  const handleSelect = (id: string) => {
    setActiveRoomId(id);
    setRosterOpen(false); // 移动端选中后收起抽屉
  };

  const sendDisabled = !activeRoomId || !connected;

  // 群聊成员列表（供 Composer @ 功能）
  const groupMembers = useMemo(() => {
    if (!activeRoom || activeRoom.type !== 'group' || !activeRoom.memberAgentIds) return undefined;
    return activeRoom.memberAgentIds.map((id) => ({
      id,
      name: agentName.get(id) || id,
    }));
  }, [activeRoom, agentName]);

  return (
    <main className="aicumi-shell" data-viewport-mode="app-shell">
      {/* 功能导航栏（三段式最左侧）—— 点击切换右侧主区域 */}
      <AppRail
        active={activeNav}
        onSelect={(id) => {
          if (id === 'chat' || id === 'members' || id === 'channels' || id === 'models') setActiveNav(id);
          setRosterOpen(false);
        }}
        onPlanned={(label) => showToast(`${label} · 规划中，敬请期待`)}
      />

      {activeNav === 'members' ? (
        /* ===== 成员管理视图 ===== */
        <MemberManagement
          members={convList}
          connected={connected}
          onAdded={refreshRooms}
        />
      ) : activeNav === 'channels' ? (
        /* ===== 渠道管理视图 ===== */
        <ChannelWizard onClose={() => setActiveNav('chat')} />
      ) : activeNav === 'models' ? (
        /* ===== 模型管理 ===== */
        <ModelManagement />
      ) : (
        /* ===== 消息视图：我的团队 + 聊天窗 ===== */
        <>
          {/* 我的团队 */}
          <Sidebar
            convs={convList}
            groupConvs={groupConvList}
            connected={connected}
            onSelect={handleSelect}
            onCreateGroup={() => setShowCreateGroup(true)}
            open={rosterOpen}
            onClose={() => setRosterOpen(false)}
          />

          {/* 聊天窗 */}
          <section className="aicumi-pane aicumi-chat-canvas" data-region="chat-canvas">
            <ChatHeader
              title={activeRoom ? activeTitle : 'AiCumi'}
              meta={activeMeta}
              connected={connected}
              onOpenSidebar={() => setRosterOpen(true)}
            />

            <MessageList
              roomMessages={roomMessages}
              hasActiveRoom={!!activeRoom}
              roomTitle={activeRoom ? activeTitle : undefined}
              agentAvatar={activeMeta?.avatar}
              onlineCount={onlineCount}
              connected={connected}
              isGroup={isGroupChat}
              agentNameMap={agentName}
            />

            <Composer
              disabled={sendDisabled}
              onSend={(text, mentions) => activeRoomId && sendMessage(activeRoomId, text, mentions)}
              groupMembers={groupMembers}
            />
          </section>
        </>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground shadow-2">
          {toast}
        </div>
      )}

      {/* 创建群聊弹窗 */}
      {showCreateGroup && (
        <CreateGroupModal
          agents={agents}
          agentName={agentName}
          onConfirm={(name, memberIds) => {
            createGroup(name, memberIds);
            setShowCreateGroup(false);
          }}
          onCancel={() => setShowCreateGroup(false)}
        />
      )}
    </main>
  );
}

/* 创建群聊弹窗 */
function CreateGroupModal({
  agents,
  agentName,
  onConfirm,
  onCancel,
}: {
  agents: { id: string; name: string }[];
  agentName: Map<string, string>;
  onConfirm: (name: string, memberIds: string[]) => void;
  onCancel: () => void;
}) {
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!groupName.trim() || selected.size === 0) return;
    onConfirm(groupName.trim(), Array.from(selected));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-foreground">创建群聊</h3>

        {/* 群名 */}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted-foreground">群名称</span>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="如：项目A群"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        {/* 选择成员 */}
        <div className="mb-4">
          <span className="mb-1.5 block text-xs text-muted-foreground">选择成员（至少 1 位）</span>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {agents.filter((a) => a.id !== 'main').map((a) => (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected.has(a.id) ? 'bg-primary-50 text-primary' : 'hover:bg-muted'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected.has(a.id) ? 'border-primary bg-primary text-white' : 'border-border'
                  }`}
                >
                  {selected.has(a.id) && <span className="text-[10px]">✓</span>}
                </span>
                <span className="font-medium text-foreground">{agentName.get(a.id) || a.name}</span>
                <span className="text-xs text-muted-foreground">{a.id}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!groupName.trim() || selected.size === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
