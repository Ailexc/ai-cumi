// AiCumi — 统一模型管理页面
// 支持多种模型类型：LLM、Embedding、Vision、Search、Code
// 设计理念：学习导向，展示配置中心化设计

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Star, RefreshCw, Cpu, Zap, Loader2, Brain, Eye, Search, Code, Database } from 'lucide-react';

interface ModelConfig {
  id: number;
  model_type: string;
  provider: string;
  model_name: string;
  api_key_hash: string;
  base_url: string | null;
  is_default: boolean;
  status: string;
  description: string | null;
  temperature: number | null;
  max_tokens: number | null;
  created_at: string;
  updated_at: string;
}

// 模型类型配置
const MODEL_TYPES = [
  { value: 'llm', label: 'LLM 对话', icon: Brain, color: 'text-purple-500', description: '对话/推理模型' },
  { value: 'embedding', label: 'Embedding', icon: Database, color: 'text-blue-500', description: '向量化/记忆检索' },
  { value: 'vision', label: 'Vision', icon: Eye, color: 'text-green-500', description: '图片识别' },
  { value: 'search', label: 'Search', icon: Search, color: 'text-orange-500', description: '网络搜索 API' },
  { value: 'code', label: 'Code', icon: Code, color: 'text-cyan-500', description: '代码执行' },
];

const PROVIDERS: Record<string, { value: string; label: string }[]> = {
  llm: [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'custom', label: '自定义' },
  ],
  embedding: [
    { value: 'openai', label: 'OpenAI' },
    { value: 'custom', label: '自定义' },
  ],
  vision: [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'custom', label: '自定义' },
  ],
  search: [
    { value: 'serper', label: 'Serper' },
    { value: 'bing', label: 'Bing' },
    { value: 'custom', label: '自定义' },
  ],
  code: [
    { value: 'e2b', label: 'E2B' },
    { value: 'custom', label: '自定义' },
  ],
};

const PROVIDER_MODELS: Record<string, Record<string, string[]>> = {
  llm: {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    mistral: ['mistral-large-latest', 'mistral-small-latest'],
  },
  embedding: {
    openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  vision: {
    openai: ['gpt-4o', 'gpt-4o-mini'],
    anthropic: ['claude-sonnet-4-20250514'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
};

export function ModelManagement() {
  const [modelsByType, setModelsByType] = useState<Record<string, ModelConfig[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; status: string; message: string } | null>(null);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState('llm');

  const [form, setForm] = useState({
    model_type: 'llm',
    provider: 'openai',
    model_name: '',
    api_key: '',
    base_url: '',
    description: '',
    is_default: false,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models/by-type');
      const data = await res.json();
      setModelsByType(data.models_by_type || {});
    } catch {
      setError('加载模型列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const resetForm = () => {
    setForm({
      model_type: activeType,
      provider: PROVIDERS[activeType]?.[0]?.value || 'custom',
      model_name: '', api_key: '', base_url: '', description: '',
      is_default: false, temperature: 0.7, max_tokens: 1024,
    });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.model_name || (!editingId && !form.api_key)) {
      setError('模型名称和 API Key 为必填');
      return;
    }
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
    setForm({
      model_type: m.model_type,
      provider: m.provider,
      model_name: m.model_name,
      api_key: '',
      base_url: m.base_url || '',
      description: m.description || '',
      is_default: m.is_default,
      temperature: m.temperature || 0.7,
      max_tokens: m.max_tokens || 1024,
    });
    setEditingId(m.id);
    setShowForm(true);
    setActiveType(m.model_type);
  };

  const currentModels = modelsByType[activeType] || [];
  const availableModels = PROVIDER_MODELS[form.model_type]?.[form.provider] || [];
  const currentProviders = PROVIDERS[form.model_type] || PROVIDERS['custom'];

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
        <h1 className="text-lg font-semibold text-foreground">统一模型管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理所有 AI 模型配置：LLM、Embedding、Vision、Search、Code</p>
      </div>

      {/* 模型类型 Tab */}
      <div className="flex gap-1 border-b px-6 py-2">
        {MODEL_TYPES.map((type) => {
          const Icon = type.icon;
          const count = (modelsByType[type.value] || []).length;
          return (
            <button
              key={type.value}
              onClick={() => setActiveType(type.value)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeType === type.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={16} className={type.color} />
              {type.label}
              {count > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{count}</span>
              )}
            </button>
          );
        })}
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
          <h3 className="mb-3 text-sm font-medium text-foreground">
            {editingId ? '编辑模型' : '添加新模型'} — {MODEL_TYPES.find(t => t.value === form.model_type)?.label}
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* 模型类型 */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">模型类型</label>
              <select
                value={form.model_type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setForm({
                    ...form,
                    model_type: newType,
                    provider: PROVIDERS[newType]?.[0]?.value || 'custom',
                    model_name: '',
                  });
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {MODEL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                ))}
              </select>
            </div>

            {/* 提供商 */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">提供商</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value, model_name: '' })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {currentProviders.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* 模型名称 */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">模型名称</label>
              {availableModels.length > 0 ? (
                <select
                  value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">请选择模型</option>
                  {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input
                  value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                  placeholder="输入模型名称或 API 端点"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              )}
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                API Key {editingId && <span className="text-muted-foreground">（留空则不修改）</span>}
              </label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={editingId ? '留空则保持原有 Key 不变' : 'sk-...'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Base URL */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Base URL（可选）</label>
              <input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* 备注 */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">备注</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="可选备注"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* LLM 特有参数 */}
            {form.model_type === 'llm' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    max="128000"
                    value={form.max_tokens}
                    onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {/* 设为默认 */}
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="is_default" className="text-sm text-foreground">
                设为此类型的默认模型
              </label>
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

      {/* 当前类型说明 */}
      <div className="mx-6 mt-4 rounded-lg bg-muted/50 p-3 text-sm">
        <div className="flex items-center gap-2">
          {(() => {
            const type = MODEL_TYPES.find(t => t.value === activeType);
            const Icon = type?.icon || Cpu;
            return <Icon size={16} className={type?.color} />;
          })()}
          <span className="font-medium">{MODEL_TYPES.find(t => t.value === activeType)?.label}</span>
          <span className="text-muted-foreground">— {MODEL_TYPES.find(t => t.value === activeType)?.description}</span>
        </div>
      </div>

      {/* Model List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>
        ) : currentModels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Cpu size={28} className="text-muted-foreground/60" />
            </div>
            <p className="mb-1 text-sm font-medium">暂无{MODEL_TYPES.find(t => t.value === activeType)?.label}配置</p>
            <p className="text-xs">点击右上角「添加模型」按钮添加</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentModels.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${
                  m.is_default ? 'border-primary/30 bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                      {m.provider.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{m.model_name}</span>
                        {m.is_default && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            <Star size={10} /> 默认
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.provider} · {m.api_key_hash}
                        {m.base_url && ` · ${m.base_url}`}
                      </p>
                      {m.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {testResult?.id === m.id && (
                      <span className={`mr-2 text-xs ${testResult.status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.message}
                      </span>
                    )}
                    <button
                      onClick={() => handleTest(m.id)}
                      disabled={testingId === m.id}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title="测试连接"
                    >
                      {testingId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    </button>
                    <button
                      onClick={() => handleEdit(m)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="编辑"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
