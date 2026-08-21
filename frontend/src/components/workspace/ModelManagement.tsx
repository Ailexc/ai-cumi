// AiCumi — 模型管理页面
// 功能：CRUD 管理 LLM 模型配置，API Key 加密存储，只显示脱敏后的 hash
import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Star, RefreshCw, Cpu, Zap, Loader2 } from 'lucide-react';

interface ModelConfig {
  id: number;
  provider: string;
  model_name: string;
  api_key_hash: string;
  base_url: string | null;
  is_default: boolean;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'custom', label: '自定义' },
];

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
  custom: [],
};

export function ModelManagement() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; status: string; message: string } | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    provider: 'openai',
    model_name: '',
    api_key: '',
    base_url: '',
    description: '',
    is_default: false,
  });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data.models || []);
    } catch {
      setError('加载模型列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const resetForm = () => {
    setForm({ provider: 'openai', model_name: '', api_key: '', base_url: '', description: '', is_default: false });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.model_name || !form.api_key) { setError('模型名称和 API Key 为必填'); return; }
    try {
      const url = editingId ? `/api/models/${editingId}` : '/api/models';
      const method = editingId ? 'PUT' : 'POST';
      const body: Record<string, unknown> = { ...form };
      if (editingId && !form.api_key) delete body.api_key;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '操作失败'); }
      resetForm();
      fetchModels();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleTest = async (id: number) => {
    setTestingId(id); setTestResult(null);
    try {
      const res = await fetch(`/api/models/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setTestResult({ id, status: 'ok', message: `✅ 连接成功 · ${data.reply} · ${data.latency_ms}ms` });
      } else {
        setTestResult({ id, status: 'error', message: `❌ 连接失败: ${data.error?.slice(0, 80)}` });
      }
    } catch { setTestResult({ id, status: 'error', message: '❌ 请求失败' }); }
    finally { setTestingId(null); setTimeout(() => setTestResult(null), 5000); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此模型配置？')) return;
    await fetch(`/api/models/${id}`, { method: 'DELETE' });
    fetchModels();
  };

  const handleEdit = (m: ModelConfig) => {
    setForm({ provider: m.provider, model_name: m.model_name, api_key: '', base_url: m.base_url || '', description: m.description || '', is_default: m.is_default });
    setEditingId(m.id); setShowForm(true);
  };

  const availableModels = PROVIDER_MODELS[form.provider] || [];

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* 右上角操作按钮 */}
      <div className="absolute right-6 top-4 z-10 flex gap-2">
        <button onClick={fetchModels} className="flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-sm hover:bg-muted">
          <RefreshCw size={14} /> 刷新
        </button>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground shadow-sm hover:opacity-90">
          <Plus size={14} /> 添加模型
        </button>
      </div>

      {/* 标题区 */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">模型管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理 AI 模型配置，API Key 加密存储</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mx-6 mt-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">{editingId ? '编辑模型' : '添加新模型'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">提供商</label>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value, model_name: '' })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">模型名称</label>
              {availableModels.length > 0 ? (
                <select value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">请选择模型</option>
                  {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="输入模型名称" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              )}
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">API Key {editingId && <span className="text-muted-foreground">（留空则不修改）</span>}</label>
              <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editingId ? '留空则保持原有 Key 不变' : 'sk-...'} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Base URL（可选）</label>
              <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.openai.com/v1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">备注</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="可选备注" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_default" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="rounded" />
              <label htmlFor="is_default" className="text-sm text-foreground">设为默认模型</label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmit} className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
              <Check size={14} /> {editingId ? '保存修改' : '添加'}
            </button>
            <button onClick={resetForm} className="flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
              <X size={14} /> 取消
            </button>
          </div>
        </div>
      )}

      {/* Model List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>
        ) : models.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Cpu size={28} className="text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium">暂无模型配置</p>
            <p className="mt-1 text-xs">点击右上角「添加模型」开始配置你的第一个 AI 模型</p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((m) => (
              <div key={m.id}>
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-xs font-semibold text-primary uppercase">
                      {m.provider.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{m.model_name}</span>
                        {m.is_default && (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            <Star size={10} /> 默认
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{PROVIDERS.find(p => p.value === m.provider)?.label || m.provider}</span>
                        <span className="font-mono">{m.api_key_hash}</span>
                        {m.description && <span>· {m.description}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleTest(m.id)} disabled={testingId === m.id} className="rounded-lg p-2 text-muted-foreground hover:bg-green-50 hover:text-green-600 disabled:opacity-50" title="测试连接">
                      {testingId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    </button>
                    <button onClick={() => handleEdit(m)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="编辑">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500" title="删除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {testResult && testResult.id === m.id && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${testResult.status === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
