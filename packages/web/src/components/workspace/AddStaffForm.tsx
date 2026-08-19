// AiCumi — 添加成员表单（内嵌式，用于成员管理页）
// 从弹窗改为页内表单：中文名 + 英文标识 + 角色 + 岗位职责 → POST /api/staff
import { useEffect, useState } from 'react';
import { Loader2, UserPlus, ArrowLeft } from 'lucide-react';

interface Role {
  id: string;
  label: string;
  title: string;
}

interface AddStaffFormProps {
  onAdded: () => void;
  onBack: () => void;
}

export function AddStaffForm({ onAdded, onBack }: AddStaffFormProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState('');
  const [duty, setDuty] = useState('');
  const [error, setError] = useState('');
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

  const submit = async () => {
    if (submitting) return;
    if (!name.trim()) return setError('请输入员工中文名');
    if (!agentId.trim()) return setError('请输入英文标识（如 xiaoma）');
    if (!role) return setError('请选择角色');

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
      setName('');
      setAgentId('');
      setDuty('');
      onAdded();
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* 返回详情 */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} /> 返回成员列表
      </button>

      {/* 标题 */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary">
          <UserPlus size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">添加成员</h2>
          <p className="text-xs text-muted-foreground">给团队招一位新同事，入职后即可对话</p>
        </div>
      </div>

      {/* 表单 */}
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
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}
