// AiCumi — 渠道向导（P2：渠道管理）
// 管理外部 IM 通道（飞书/Telegram/WhatsApp 等）
import { useEffect, useState, useMemo } from 'react';
import { Loader2, Check, X, Plus, Settings, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';

interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  accountCount: number;
  accounts: { id: string; name: string; botName?: string; enabled: boolean }[];
}

interface ChannelTemplate {
  name: string;
  description: string;
  fields: { key: string; label: string; type: string; required: boolean }[];
}

interface ChannelWizardProps {
  onClose: () => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  feishu: '🐦',
  telegram: '✈️',
  whatsapp: '💬',
  slack: '💼',
  discord: '🎮',
};

export function ChannelWizard({ onClose }: ChannelWizardProps) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [templates, setTemplates] = useState<Record<string, ChannelTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormChannel, setAddFormChannel] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formAccountId, setFormAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);

  // 加载通道数据
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [channelsRes, templatesRes] = await Promise.all([
          fetch('/api/channels').then((r) => r.json()),
          fetch('/api/channels/templates').then((r) => r.json()),
        ]);
        if (channelsRes.ok) setChannels(channelsRes.channels);
        if (templatesRes.ok) setTemplates(templatesRes.templates);
      } catch {
        // ignore
      }
      setLoading(false);
    };
    load();
  }, []);

  // 切换通道启用/禁用
  const toggleChannel = async (channelId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/channels/${channelId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, enabled } : c)),
        );
      }
    } catch {
      // ignore
    }
  };

  // 删除账号
  const removeAccount = async (channelId: string, accountId: string) => {
    try {
      const res = await fetch(`/api/channels/${channelId}/accounts/${accountId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        setChannels((prev) =>
          prev.map((c) =>
            c.id === channelId
              ? {
                  ...c,
                  accounts: c.accounts.filter((a) => a.id !== accountId),
                  accountCount: c.accountCount - 1,
                }
              : c,
          ),
        );
      }
    } catch {
      // ignore
    }
  };

  // 添加账号
  const addAccount = async () => {
    if (!addFormChannel || !formAccountId.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/channels/${addFormChannel}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: formAccountId.trim(), ...formData }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || '添加失败');
      } else {
        setShowAddForm(false);
        setFormData({});
        setFormAccountId('');
        // 重新加载
        const channelsRes = await fetch('/api/channels').then((r) => r.json());
        if (channelsRes.ok) setChannels(channelsRes.channels);
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
    }
    setSaving(false);
  };

  // 重启 gateway
  const restartGateway = async () => {
    setRestarting(true);
    try {
      await fetch('/api/channels/restart', { method: 'POST' });
    } catch {
      // ignore
    }
    setRestarting(false);
  };

  // 可添加的通道（未配置或可多账号）
  const availableChannels = useMemo(() => {
    return Object.entries(templates).filter(
      ([id]) => !channels.some((c) => c.id === id),
    );
  }, [templates, channels]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 头部 */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary">
            <Settings size={16} />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">渠道管理</span>
            <span className="ml-2 text-xs text-muted-foreground">配置外部 IM 通道</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={restartGateway}
            disabled={restarting}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {restarting ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
            {restarting ? '重启中…' : '重启 Gateway'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            返回
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="aicumi-scroll flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {/* 提示 */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <h4 className="text-sm font-semibold text-foreground">渠道说明</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    渠道是连接外部 IM 的桥梁。配置后，用户可以通过飞书、Telegram 等与 AI 员工对话。
                    修改配置后需要重启 Gateway 才能生效。
                  </p>
                </div>
              </div>
            </div>

            {/* 已配置的通道 */}
            {channels.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">已配置通道</h3>
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className={`rounded-xl border p-4 transition-all ${
                      channel.enabled
                        ? 'border-primary/20 bg-primary-50/30'
                        : 'border-border bg-surface opacity-60'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{CHANNEL_ICONS[channel.id] || '📱'}</span>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{channel.name}</div>
                          <div className="text-xs text-muted-foreground">{channel.description}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleChannel(channel.id, !channel.enabled)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
                      >
                        {channel.enabled ? (
                          <ToggleRight size={24} className="text-primary" />
                        ) : (
                          <ToggleLeft size={24} className="text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    {/* 账号列表 */}
                    <div className="space-y-2">
                      {channel.accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between rounded-lg bg-background px-3 py-2"
                        >
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {account.botName || account.name}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">{account.id}</span>
                          </div>
                          <button
                            onClick={() => removeAccount(channel.id, account.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* 添加账号按钮 */}
                    <button
                      onClick={() => {
                        setAddFormChannel(channel.id);
                        setShowAddForm(true);
                        setFormData({});
                        setFormAccountId('');
                        setError('');
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary"
                    >
                      <Plus size={14} /> 添加账号
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 可添加的通道 */}
            {availableChannels.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">可添加通道</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableChannels.map(([id, template]) => (
                    <button
                      key={id}
                      onClick={() => {
                        setAddFormChannel(id);
                        setShowAddForm(true);
                        setFormData({});
                        setFormAccountId('');
                        setError('');
                      }}
                      className="rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-primary/20 hover:shadow-sm"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xl">{CHANNEL_ICONS[id] || '📱'}</span>
                        <span className="text-sm font-semibold text-foreground">{template.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 添加账号表单 */}
            {showAddForm && addFormChannel && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <h4 className="mb-3 text-sm font-semibold text-foreground">
                  添加 {templates[addFormChannel]?.name || addFormChannel} 账号
                </h4>

                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">账号 ID（唯一标识）</span>
                    <input
                      value={formAccountId}
                      onChange={(e) => setFormAccountId(e.target.value)}
                      placeholder="如：keling"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>

                  {templates[addFormChannel]?.fields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                      </span>
                      <input
                        type={field.type}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.label}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </label>
                  ))}

                  {error && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={addAccount}
                      disabled={saving || !formAccountId.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {saving ? '保存中…' : '保存'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setAddFormChannel(null);
                      }}
                      className="rounded-lg border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}