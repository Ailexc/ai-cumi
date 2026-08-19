// AiCumi — 成员管理页（P1：员工档案中心，只读查看）
// AppRail「成员管理」的右侧视图；导航范式（非弹窗）
// 结构：左（成员列表 280px）+ 右（Tab 档案：概览/人设/技能/记忆/对话/工作目录 + 添加成员）
// 数据：/api/members* 一组只读档案接口（读 workspace 档案 + gateway 历史）

import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Search, Loader2, Pencil, Cpu, LogOut, RefreshCw, UserCog, Sparkles } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { AddStaffForm } from './AddStaffForm';
import { statusColor, statusLabel, formatTime } from './agentMeta';
import type { Conv } from './Sidebar';

interface MemberManagementProps {
  members: Conv[];
  connected: boolean;
  onAdded: () => void;
}

type TabId = 'overview' | 'persona' | 'skills' | 'memory' | 'history' | 'files';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'persona', label: '人设' },
  { id: 'skills', label: '技能' },
  { id: 'memory', label: '记忆' },
  { id: 'history', label: '对话' },
  { id: 'files', label: '工作目录' },
];

export function MemberManagement({ members, connected, onAdded }: MemberManagementProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const selectedIdSafe = selectedId && members.some((m) => m.id === selectedId) ? selectedId : members[0]?.id || null;
  const selected = members.find((m) => m.id === selectedIdSafe) || null;

  // P3：部门分组（后端 /api/members 下发 department）
  const [departmentMap, setDepartmentMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        const map: Record<string, string> = {};
        for (const m of d.members || []) map[m.id] = m.department || '未分组';
        setDepartmentMap(map);
      })
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.trim().toLowerCase();
    return members.filter((m) => m.title.toLowerCase().includes(q));
  }, [members, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Conv[]>();
    for (const m of filtered) {
      const dept = departmentMap[m.id] || '未分组';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(m);
    }
    return [...map.entries()];
  }, [filtered, departmentMap]);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* 左：成员列表 */}
      <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold text-foreground">成员管理</span>
          <button
            onClick={() => setShowAdd(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="添加成员"
            title="添加成员"
          >
            <UserPlus size={16} />
          </button>
        </div>
        <div className="shrink-0 border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <Search size={16} className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索成员"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="aicumi-scroll flex-1 px-3 py-3">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {connected ? '还没有团队成员' : '连接服务中…'}
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([dept, ms]) => (
                <div key={dept}>
                  <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">{dept}</div>
                  <div className="space-y-0.5">
                    {ms.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedId(m.id);
                          setShowAdd(false);
                          setActiveTab('overview');
                        }}
                        className={`flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors ${
                          m.id === selectedIdSafe && !showAdd
                            ? 'bg-primary-50 hover:bg-primary-100'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <AgentAvatar
                          avatar={m.avatar}
                          kind={m.avatarKind}
                          letter={m.avatarLetter}
                          title={m.title}
                          size={36}
                          className="mt-0.5"
                          statusColorValue={m.status ? statusColor[m.status] : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{m.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{m.time}</span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.role ? `${m.role} · ` : ''}
                            {m.preview || '暂无消息'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 右：档案 / 添加 */}
      <section className="flex h-full min-w-0 flex-1 flex-col bg-background" data-region="member-detail">
        {showAdd ? (
          <div className="aicumi-scroll flex-1 overflow-y-auto">
            <div className="px-8 py-8">
              <AddStaffForm
                onAdded={() => {
                  onAdded();
                  setShowAdd(false);
                  setActiveTab('overview');
                }}
                onBack={() => setShowAdd(false)}
              />
            </div>
          </div>
        ) : selected ? (
          <ProfileView
            key={selected.id}
            member={selected}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={onAdded}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            请选择一个成员查看档案
          </div>
        )}
      </section>
    </div>
  );
}

/* ============ 右侧档案页 ============ */

type AdminAction = 'identity' | 'model' | 'delete' | null;

function ProfileView({
  member,
  activeTab,
  onTabChange,
  onRefresh,
}: {
  member: Conv;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  onRefresh: () => void;
}) {
  const [adminAction, setAdminAction] = useState<AdminAction>(null);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Tab 栏 */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <AgentAvatar
            avatar={member.avatar}
            kind={member.avatarKind}
            letter={member.avatarLetter}
            title={member.title}
            size={28}
          />
          <span className="text-sm font-semibold text-foreground">{member.title}</span>
          {member.status && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: 'rgba(94,106,210,.08)', color: 'var(--aicumi-primary)' }}
            >
              {statusLabel[member.status]}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-1" aria-label="成员档案">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                activeTab === t.id
                  ? 'bg-primary-50 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 内容 */}
      <div className="aicumi-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 py-6">
          {activeTab === 'overview' && <OverviewView member={member} onAdminAction={setAdminAction} />}
          {activeTab === 'persona' && <PersonaView memberId={member.id} />}
          {activeTab === 'skills' && <SkillsView memberId={member.id} />}
          {activeTab === 'memory' && <MemoryView memberId={member.id} />}
          {activeTab === 'history' && <HistoryView memberId={member.id} />}
          {activeTab === 'files' && <FilesView memberId={member.id} />}
          {adminAction === 'identity' && (
            <EditIdentityView
              member={member}
              onDone={() => {
                setAdminAction(null);
                onRefresh();
              }}
              onCancel={() => setAdminAction(null)}
            />
          )}
          {adminAction === 'model' && (
            <ModelSwitchView
              memberId={member.id}
              onDone={() => setAdminAction(null)}
              onCancel={() => setAdminAction(null)}
            />
          )}
          {adminAction === 'delete' && (
            <DeleteMemberView
              member={member}
              onDone={() => {
                setAdminAction(null);
                onRefresh();
              }}
              onCancel={() => setAdminAction(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* 概览 */
function OverviewView({
  member,
  onAdminAction,
}: {
  member: Conv;
  onAdminAction: (a: Exclude<AdminAction, null>) => void;
}) {
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    setProfile(null);
    fetch(`/api/members/${member.id}`)
      .then((r) => r.json())
      .then((d) => d.ok && setProfile(d.profile))
      .catch(() => setProfile(null));
  }, [member.id]);

  return (
    <div className="space-y-6">
      {/* 头部卡片 */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <AgentAvatar
            avatar={member.avatar}
            kind={member.avatarKind}
            letter={member.avatarLetter}
            title={member.title}
            size={64}
            statusColorValue={member.status ? statusColor[member.status] : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{member.title}</h3>
              {member.status && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: 'rgba(94,106,210,.08)', color: 'var(--aicumi-primary)' }}
                >
                  {statusLabel[member.status]}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {member.role ? `${member.role} · AiCumi 团队成员` : 'AiCumi 团队成员'}
            </p>
          </div>
        </div>
      </div>

      {/* 岗位职责 */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-foreground">岗位职责</h4>
        <p className="text-sm leading-relaxed text-foreground-secondary">
          {profile?.duty || '（该成员尚未填写岗位职责）'}
        </p>
      </div>

      {/* 数据统计 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '技能', value: profile ? String(profile.skillsCount ?? 0) : '—' },
          { label: '人设档案', value: profile ? (profile.hasPersona ? '已建档' : '无') : '—' },
          { label: '长期记忆', value: profile ? (profile.hasMemory ? '已启用' : '无') : '—' },
          { label: '最近活跃', value: member.time || '—' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
            <div className="text-lg font-semibold text-foreground">{s.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 管理操作（P2：写操作，自动备份） */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-foreground">管理操作</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAdminAction('identity')}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Pencil size={14} /> 编辑资料
          </button>
          <button
            onClick={() => onAdminAction('model')}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Cpu size={14} /> 切换模型
          </button>
          <button
            onClick={() => onAdminAction('delete')}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut size={14} /> 离职
          </button>
        </div>
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          写操作会自动备份（人设存 *.bak-*，离职备份整个工作目录），可放心调整。
        </p>
      </div>

      {/* 最近操作（P3：审计日志） */}
      <AuditCard memberId={member.id} />
    </div>
  );
}

/* 最近操作：该成员的写操作审计记录 */
function AuditCard({ memberId }: { memberId: string }) {
  const { data, loading } = useFetch<{
    entries: { id: string; ts: number; action: string; summary: string }[];
  }>(`/api/members/${memberId}/audit?limit=10`);
  if (loading) return null;
  const entries = data?.entries || [];
  if (entries.length === 0) return null;
  const iconMap: Record<string, any> = {
    persona_update: Pencil,
    persona_refine: Sparkles,
    identity_update: UserCog,
    model_switch: Cpu,
    reindex: RefreshCw,
    member_delete: LogOut,
    staff_add: UserPlus,
  };
  const labelMap: Record<string, string> = {
    persona_update: '人设',
    persona_refine: '精修',
    identity_update: '资料',
    model_switch: '模型',
    reindex: '记忆',
    member_delete: '离职',
    staff_add: '入职',
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-foreground">最近操作</h4>
      <div className="space-y-2.5">
        {entries.map((e) => {
          const Icon = iconMap[e.action] || Pencil;
          return (
            <div key={e.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">{e.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatTime(e.ts)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {labelMap[e.action] || e.action}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 通用：拉取内容 */
function useFetch<T>(url: string | null): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    setData(null);
    fetch(url)
      .then((r) => r.json())
      .then((d) => alive && d.ok && setData(d))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, loading };
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{text}</p>;
}

/* 人设（P2：可编辑，保存前自动备份） */
function PersonaView({ memberId }: { memberId: string }) {
  const [tick, setTick] = useState(0);
  const { data, loading } = useFetch<{ data: { content: string } }>(
    `/api/members/${memberId}/persona?t=${tick}`,
  );
  const [editing, setEditing] = useState(false);
  const [wiz, setWiz] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data?.data?.content && !editing && !wiz) setDraft(data.data.content);
  }, [data, editing, wiz]);

  if (wiz) {
    return (
      <RefineWizardView
        memberId={memberId}
        onDone={() => {
          setWiz(false);
          setTick((t) => t + 1);
          setMsg('精修已写入人设，旧版已自动备份');
        }}
        onBack={() => setWiz(false)}
      />
    );
  }

  if (loading) return <Loading />;
  if (!data?.data?.content) return <Empty text="该成员还没有人设档案" />;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/members/${memberId}/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const d = await res.json();
      if (!d.ok) return setMsg(d.error || '保存失败');
      setEditing(false);
      setMsg('已保存，旧版已自动备份');
    } catch (e: any) {
      setMsg(e.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {!editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDraft(data.data.content);
                setEditing(true);
                setMsg('');
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Pencil size={14} /> 编辑人设
            </button>
            <button
              onClick={() => setWiz(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-100"
            >
              <Sparkles size={14} /> 精修向导
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setMsg('');
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              取消
            </button>
          </div>
        )}
      </div>
      {msg && <p className="text-xs text-primary">{msg}</p>}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={22}
          className="w-full resize-y rounded-2xl border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground-secondary shadow-sm outline-none focus:border-primary"
        />
      ) : (
        <article className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-foreground-secondary shadow-sm">
          {data.data.content}
        </article>
      )}
    </div>
  );
}

/* 人设精修向导（P3）：逐步配置职责/性格/风格/边界，增量写入不覆盖 */
function RefineWizardView({
  memberId,
  onDone,
  onBack,
}: {
  memberId: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [duty, setDuty] = useState('');
  const [tone, setTone] = useState('');
  const [style, setStyle] = useState('');
  const [boundary, setBoundary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTpl, setActiveTpl] = useState('');
  const { data: tplData } = useFetch<{
    templates: { id: string; name: string; desc: string; tone: string; style: string; boundary: string; duty?: string }[];
  }>('/api/persona-templates');

  const toneOptions = ['温暖贴心', '干练高效', '幽默风趣', '沉稳可靠', '犀利直率'];
  const styleOptions = [
    { id: '主动出击', desc: '自己先做，做完汇报结果' },
    { id: '响应式', desc: '等明确指令再行动' },
    { id: '混合', desc: '简单直接做，复杂先问一句' },
  ];

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/members/${memberId}/persona/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duty: duty.trim(),
          tone: tone.trim(),
          style: style.trim(),
          boundary: boundary.trim(),
        }),
      });
      const d = await res.json();
      if (!d.ok) return setError(d.error || '精修失败');
      onDone();
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'border-primary bg-primary-50 font-medium text-primary'
        : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles size={15} className="text-primary" /> 人设精修向导
        </h4>
        <p className="mb-4 text-xs text-muted-foreground">
          几步设定让 TA 更像你想要的那位同事。写入的是新增的「精修设定」章节，不覆盖原人设；保存前自动备份。
        </p>

        {/* 从模板快速开始 */}
        <div className="mb-5">
          <div className="mb-1.5 text-xs font-medium text-foreground">从模板快速开始（可再微调）</div>
          <div className="flex flex-wrap gap-2">
            {(tplData?.templates || []).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (activeTpl === t.id) {
                    setActiveTpl('');
                    return;
                  }
                  setActiveTpl(t.id);
                  setTone(t.tone);
                  setStyle(t.style);
                  setBoundary(t.boundary);
                  if (t.duty) setDuty(t.duty);
                }}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  activeTpl === t.id
                    ? 'border-primary bg-primary-50'
                    : 'border-border bg-surface hover:bg-muted'
                }`}
              >
                <div className="text-sm font-medium text-foreground">{t.name}</div>
                <div className="mt-0.5 max-w-[200px] text-[11px] leading-snug text-muted-foreground">
                  {t.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 岗位职责 */}
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-foreground">TA 主要负责什么</div>
          <textarea
            value={duty}
            onChange={(e) => setDuty(e.target.value)}
            rows={2}
            placeholder="如：负责团队内容创作、新媒体运营与文案生产"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* 性格与语气 */}
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-foreground">性格与语气</div>
          <div className="flex flex-wrap gap-2">
            {toneOptions.map((t) => (
              <button key={t} onClick={() => setTone(tone === t ? '' : t)} className={chip(tone === t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 工作风格 */}
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-foreground">工作风格</div>
          <div className="space-y-2">
            {styleOptions.map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(style === s.id ? '' : s.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  style === s.id
                    ? 'border-primary bg-primary-50'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                <span className="font-medium text-foreground">{s.id}</span>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 边界 */}
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-foreground">边界与禁忌（不该做什么）</div>
          <textarea
            value={boundary}
            onChange={(e) => setBoundary(e.target.value)}
            rows={2}
            placeholder="如：不擅自修改系统配置，涉及删除先确认"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '写入中…' : '写入人设'}
          </button>
          <button
            onClick={onBack}
            className="rounded-lg border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}

/* 技能（P3：显示描述 + 可展开查看 SKILL.md 文档） */
function SkillsView({ memberId }: { memberId: string }) {
  const { data, loading } = useFetch<{
    skills: { name: string; files: string[]; description: string; doc: string }[];
  }>(`/api/members/${memberId}/skills`);
  const [openId, setOpenId] = useState<string | null>(null);
  if (loading) return <Loading />;
  const skills = data?.skills || [];
  if (skills.length === 0) return <Empty text="该成员还没有安装技能" />;
  return (
    <div className="space-y-3">
      {skills.map((s) => {
        const open = openId === s.name;
        return (
          <div key={s.name} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <button
              onClick={() => setOpenId(open ? null : s.name)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{s.name}</div>
                {s.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                )}
                <div className="mt-1.5 text-[11px] text-muted-foreground">{s.files.length} 个文件</div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  open ? 'bg-primary-100 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {open ? '收起' : '文档'}
              </span>
            </button>
            {open && s.doc && (
              <pre className="aicumi-scroll mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-4 font-mono text-xs leading-relaxed text-foreground-secondary">
                {s.doc}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* 记忆（P2：可重建索引） */
function MemoryView({ memberId }: { memberId: string }) {
  const { data, loading } = useFetch<{ data: { content: string } }>(`/api/members/${memberId}/memory`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (loading) return <Loading />;
  if (!data?.data?.content) return <Empty text="该成员还没有长期记忆" />;

  const rebuild = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/members/${memberId}/reindex`, { method: 'POST' });
      const d = await res.json();
      setMsg(d.ok ? '记忆索引已重建' : d.error || '重建失败');
    } catch (e: any) {
      setMsg(e.message || '网络错误');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={rebuild}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? '重建中…' : '重建记忆索引'}
        </button>
      </div>
      {msg && <p className="text-xs text-primary">{msg}</p>}
      <article className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-foreground-secondary shadow-sm">
        {data.data.content}
      </article>
    </div>
  );
}

/* 对话历史 */
function HistoryView({ memberId }: { memberId: string }) {
  const { data, loading } = useFetch<{ messages: { role: string; content: string; timestamp: number }[] }>(
    `/api/members/${memberId}/history?limit=100`,
  );
  if (loading) return <Loading />;
  const msgs = data?.messages || [];
  if (msgs.length === 0) return <Empty text="还没有对话记录" />;
  return (
    <div className="space-y-3">
      {msgs.map((m, i) => {
        const isUser = m.role === 'user';
        return (
          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                isUser
                  ? 'rounded-tr-md bg-primary text-primary-foreground'
                  : 'rounded-tl-md border border-border bg-surface text-foreground-secondary'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              <div className={`mt-1 text-[11px] ${isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {formatTime(m.timestamp)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* 工作目录 */
function FilesView({ memberId }: { memberId: string }) {
  const { data, loading } = useFetch<{ files: { path: string; size: number; isDir: boolean }[] }>(
    `/api/members/${memberId}/files`,
  );
  if (loading) return <Loading />;
  const files = data?.files || [];
  if (files.length === 0) return <Empty text="工作目录为空" />;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      {files.map((f) => {
        const depth = f.path.split('/').length - (f.isDir ? 1 : 0);
        const name = f.isDir ? f.path : f.path.split('/').pop();
        return (
          <div
            key={f.path}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
            style={{ paddingLeft: `${8 + depth * 16}px` }}
          >
            <span className={f.isDir ? 'text-primary' : 'text-muted-foreground'}>
              {f.isDir ? '📁' : '📄'}
            </span>
            <span className="truncate text-foreground-secondary">{name}</span>
            {!f.isDir && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{f.size} B</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ============ P2 管理操作视图 ============ */

/* 编辑资料（名字/emoji/主题） */
function EditIdentityView({
  member,
  onDone,
  onCancel,
}: {
  member: Conv;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(member.title);
  const [emoji, setEmoji] = useState('');
  const [theme, setTheme] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/members/${member.id}`)
      .then((r) => r.json())
      .then((d) => d.ok && setDepartment(d.profile?.department || ''))
      .catch(() => undefined);
  }, [member.id]);

  const submit = async () => {
    if (saving) return;
    if (!name.trim()) return setError('名字不能为空');
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}/identity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          emoji: emoji.trim(),
          theme: theme.trim(),
          department: department.trim(),
        }),
      });
      const d = await res.json();
      if (!d.ok) return setError(d.error || '保存失败');
      onDone();
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-foreground">编辑资料</h4>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">名字</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Emoji（可选）</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="如 🦊"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">主题（可选）</span>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="如 清新蓝"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">部门</span>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="如 行政 / 研究 / 运维…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/* 切换模型 */
function ModelSwitchView({
  memberId,
  onDone,
  onCancel,
}: {
  memberId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data, loading } = useFetch<{ models: { id: string; name: string }[] }>('/api/models');
  const [current, setCurrent] = useState('');
  const [modelId, setModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/members/${memberId}`)
      .then((r) => r.json())
      .then((d) => d.ok && setCurrent(d.profile?.model || ''))
      .catch(() => undefined);
  }, [memberId]);

  useEffect(() => {
    if (!modelId && data?.models?.length) setModelId(data.models[0].id);
  }, [data, modelId]);

  const submit = async () => {
    if (saving || !modelId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/members/${memberId}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const d = await res.json();
      if (!d.ok) return setError(d.error || '切换失败');
      onDone();
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-foreground">切换模型</h4>
      <p className="mb-3 text-xs text-muted-foreground">当前模型：{current || '默认（未单独配置）'}</p>
      {loading ? (
        <Loading />
      ) : (
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          {data?.models?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={saving || loading}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '切换中…' : '切换'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          取消
        </button>
      </div>
    </div>
  );
}

/* 离职（删除成员，二次确认 + 自动备份） */
function DeleteMemberView({
  member,
  onDone,
  onCancel,
}: {
  member: Conv;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ok = confirm === member.title;

  const submit = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.ok) return setError(d.error || '删除失败');
      onDone();
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
        <LogOut size={15} /> 离职：{member.title}
      </h4>
      <p className="mb-3 text-xs leading-relaxed text-red-600/80">
        将删除该同事的 agent、固定房间与工作目录。操作前会先自动备份整个工作目录到{' '}
        <code className="rounded bg-red-100 px-1">workspace/{member.id}.bak-*</code>，可随时恢复。
      </p>
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={`输入「${member.title}」以确认离职`}
        className="w-full rounded-lg border border-red-200 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-red-400"
      />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={!ok || saving}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? '处理中…' : '确认离职'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-red-200 bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-700"
        >
          取消
        </button>
      </div>
    </div>
  );
}
