// AiCumi — 添加成员表单（内嵌式，用于成员管理页）
// 3 步向导：填资料 → 预览人设（可迭代）→ 确认创建
import { useEffect, useState } from 'react';
import { Loader2, UserPlus, ArrowLeft, Eye, Edit3, Check, Sparkles } from 'lucide-react';

interface Role {
  id: string;
  label: string;
  title: string;
}

interface AddStaffFormProps {
  onAdded: () => void;
  onBack: () => void;
}

/** 简易 Markdown → HTML（加粗/标题/列表，用于人设预览） */
function renderMarkdown(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1 class="text-lg font-bold text-foreground mb-2">${line.slice(2)}</h1>`;
      if (line.startsWith('## ')) return `<h2 class="text-sm font-semibold text-foreground mt-4 mb-1">${line.slice(3)}</h2>`;
      if (line.startsWith('### ')) return `<h3 class="text-sm font-medium text-foreground-secondary mt-3 mb-1">${line.slice(4)}</h3>`;
      if (line.startsWith('- ')) return `<li class="ml-4 text-xs text-foreground-secondary">${line.slice(2)}</li>`;
      if (line.startsWith('  ')) return `<p class="ml-2 text-xs text-muted-foreground">${line.trim()}</p>`;
      if (!line.trim()) return '<br/>';
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return `<p class="text-xs text-foreground-secondary leading-relaxed">${bold}</p>`;
    })
    .join('');
}

export function AddStaffForm({ onAdded, onBack }: AddStaffFormProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState('');
  const [duty, setDuty] = useState('');
  const [error, setError] = useState('');

  // 预览步骤
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [personaPreview, setPersonaPreview] = useState('');
  const [previewRoleLabel, setPreviewRoleLabel] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.roles?.length) {
          setRoles(d.roles);
          setRole((cur) => cur || d.roles[0].id);
        }
      })
      .catch(() => setError('无法加载角色模板'));
  }, []);

  /** 步骤 1 → 2：生成人设预览（不落盘） */
  const goPreview = async () => {
    if (!name.trim()) return setError('请输入员工中文名');
    if (!agentId.trim()) return setError('请输入英文标识（如 xiaoma）');
    if (!role) return setError('请选择角色');

    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/staff/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role, duty: duty.trim() }),
      });
      const data = await res.json();
      if (!data.ok) return setError(data.error || '生成预览失败');
      setPersonaPreview(data.persona || '');
      setPreviewRoleLabel(data.roleLabel || data.roleTitle || '');
      setStep(2);
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setPreviewing(false);
    }
  };

  /** 步骤 2 → 3：确认添加（落盘+创建） */
  const confirmAdd = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), agentId: agentId.trim(), role, duty: duty.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || '添加失败');
        return;
      }
      setStep(3);
      setName('');
      setAgentId('');
      setDuty('');
      setTimeout(() => onAdded(), 800);
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* 返回 */}
      <button
        onClick={step === 2 ? () => { setStep(1); setError(''); } : onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} /> {step === 2 ? '返回修改资料' : '返回成员列表'}
      </button>

      {/* 标题 */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary">
          {step === 3 ? <Check size={18} /> : step === 2 ? <Eye size={18} /> : <UserPlus size={18} />}
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {step === 3 ? '添加成功' : step === 2 ? '预览人设' : '添加成员'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === 3 ? '🎉 新同事已入职' : step === 2 ? '确认生成的人设，不满意可返回修改' : '给团队招一位新同事，入职后即可对话'}
          </p>
        </div>
      </div>

      {/* ========== 步骤 1：填资料 ========== */}
      {step === 1 && (
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-secondary">员工中文名</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：小码"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground-secondary">
                英文标识
                <span className="ml-1 text-muted-foreground">（如 xiaoma）</span>
              </label>
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="xiaoma"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-secondary">角色</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    role === r.id
                      ? 'border-primary-300 bg-primary-50 text-primary'
                      : 'border-border bg-background text-foreground-secondary hover:bg-muted'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground-secondary">
              岗位职责
              <span className="ml-1 text-muted-foreground">（选填：工作内容 / 工作方式，会写入人设）</span>
            </label>
            <textarea
              value={duty}
              onChange={(e) => setDuty(e.target.value)}
              placeholder="如：负责数据分析与报表产出，接单后主动汇报进度…"
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-300"
            />
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(222,59,70,.08)', color: 'var(--aicumi-error)' }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              onClick={goPreview}
              disabled={previewing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
            >
              {previewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              预览人设
            </button>
          </div>
        </div>
      )}

      {/* ========== 步骤 2：预览人设 ========== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* 信息摘要 */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-primary-50 px-2 py-1 font-medium text-primary">{name}</span>
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{agentId}</span>
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{previewRoleLabel}</span>
          </div>

          {/* 人设预览卡片 */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <span className="text-xs font-medium text-foreground-secondary">生成的人设（AGENTS.md）</span>
            </div>
            <div
              className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-background p-4 prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(personaPreview) }}
            />
          </div>

          {/* 操作 */}
          {error && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(222,59,70,.08)', color: 'var(--aicumi-error)' }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setStep(1); setError(''); }}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:bg-muted"
            >
              <Edit3 size={13} /> 修改人设
            </button>
            <button
              onClick={confirmAdd}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* ========== 步骤 3：成功 ========== */}
      {step === 3 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-2xl">
            🎉
          </div>
          <h3 className="text-base font-semibold text-foreground">{name} 已加入团队</h3>
          <p className="mt-1 text-sm text-muted-foreground">入职完成，可以去消息页和 TA 聊天了</p>
        </div>
      )}
    </div>
  );
}
