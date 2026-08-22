// AiCumi — RAG 实验室页面
// 可视化调整 RAG 配置 + 重新索引 + 检索测试

import { useEffect, useState } from 'react';
import { Save, RefreshCw, Search, Database, Brain, Scissors, SlidersHorizontal, AlertCircle, CheckCircle } from 'lucide-react';

interface RagSettings {
  chunk_strategy: string;
  chunk_size: number;
  chunk_overlap: number;
  separator: string;
  retrieval_mode: string;
  top_k: number;
  score_threshold: number;
  rerank_enabled: boolean;
  rerank_top_n: number;
  embedding_model_id: number | null;
}

interface KnowledgeStats {
  total_documents: number;
  indexed_documents: number;
  failed_documents: number;
  total_chunks: number;
}

interface RetrievalResult {
  chunk_id: string;
  content: string;
  file_name: string;
  file_path: string;
  score: number;
  chunk_index: number;
}

interface ModelConfig {
  id: number;
  model_type: string;
  provider: string;
  model_name: string;
  name: string;
  embedding_dimensions?: number;
}

const CHUNK_STRATEGIES = [
  { value: 'fixed', label: '固定长度' },
  { value: 'recursive', label: '递归切分' },
  { value: 'markdown', label: 'Markdown 标题' },
];

const RETRIEVAL_MODES = [
  { value: 'vector', label: '向量' },
  { value: 'keyword', label: '关键词' },
  { value: 'hybrid', label: '混合' },
];

const SEPARATORS = [
  { value: '\n\n', label: '段落 (\\n\\n)' },
  { value: '\n', label: '换行 (\\n)' },
  { value: '。', label: '句号' },
  { value: '. ', label: '英文句号 + 空格' },
  { value: ' ', label: '空格' },
];

export function RAGLabPage() {
  const [settings, setSettings] = useState<RagSettings>({
    chunk_strategy: 'recursive',
    chunk_size: 512,
    chunk_overlap: 128,
    separator: '\n\n',
    retrieval_mode: 'vector',
    top_k: 5,
    score_threshold: 0.5,
    rerank_enabled: false,
    rerank_top_n: 5,
    embedding_model_id: null,
  });
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Retrieval test state
  const [query, setQuery] = useState('');
  const [testResults, setTestResults] = useState<RetrievalResult[]>([]);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    try {
      const [sRes, stRes, mRes] = await Promise.all([
        fetch('/api/settings/rag'),
        fetch('/api/knowledge/stats'),
        fetch('/api/models?model_type=embedding'),
      ]);
      const sData = await sRes.json();
      const stData = await stRes.json();
      const mData = await mRes.json();
      if (sData.ok) setSettings(sData.settings);
      if (stData.ok) setStats(stData.stats);
      setModels((mData.models || []).filter((m: ModelConfig) => m.model_type === 'embedding'));
    } catch (e) {
      setError('加载 RAG 配置失败');
    }
  };

  useEffect(() => { fetchData(); }, []);

  const showMessage = (text: string, isError = false) => {
    if (isError) setError(text); else setMessage(text);
    window.setTimeout(() => { setError(''); setMessage(''); }, 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/rag', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) showMessage('✅ 配置已保存');
      else throw new Error(data.detail || '保存失败');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : '保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async () => {
    if (!confirm('确定重新索引全部文档？这会清空现有索引并按当前配置重建。')) return;
    setReindexing(true);
    try {
      const res = await fetch('/api/knowledge/reindex-all', { method: 'POST' });
      const data = await res.json();
      if (data.ok) showMessage('🔄 重新索引已启动（后台执行）');
      else throw new Error(data.detail || '启动失败');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : '启动失败', true);
    } finally {
      setReindexing(false);
    }
  };

  const handleTest = async () => {
    if (!query.trim()) return;
    setTesting(true); setTestResults([]);
    try {
      const res = await fetch('/api/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: settings.top_k, retrieval_mode: settings.retrieval_mode }),
      });
      const data = await res.json();
      if (data.results) setTestResults(data.results);
      else throw new Error(data.detail || '检索失败');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : '检索失败', true);
    } finally {
      setTesting(false);
    }
  };

  const selectedModel = models.find((m) => m.id === settings.embedding_model_id);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-primary" />
          <h1 className="text-base font-semibold">RAG 实验室</h1>
          <span className="text-xs text-muted-foreground">分块 / Embedding / 检索策略可视化调参</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? '保存中…' : '保存配置'}
          </button>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={reindexing ? 'animate-spin' : ''} /> {reindexing ? '启动中…' : '重新索引全部'}
          </button>
          <button
            onClick={fetchData}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mx-6 mt-4 grid grid-cols-4 gap-3">
          <StatBox icon={Database} label="已索引文档" value={stats.indexed_documents} />
          <StatBox icon={Database} label="总 chunk 数" value={stats.total_chunks} />
          <StatBox icon={AlertCircle} label="失败文档" value={stats.failed_documents} />
          <StatBox icon={CheckCircle} label="总文档数" value={stats.total_documents} />
        </div>
      )}

      {message && <div className="mx-6 mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600">{message}</div>}
      {error && <div className="mx-6 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      {/* Settings */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[420px] overflow-y-auto border-r border-border p-6">
          {/* Embedding */}
          <Section icon={Brain} title="Embedding 配置">
            <label className="text-xs text-muted-foreground">默认 Embedding 模型</label>
            <select
              value={settings.embedding_model_id ?? ''}
              onChange={(e) => setSettings({ ...settings, embedding_model_id: e.target.value ? Number(e.target.value) : null })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">使用系统默认</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {selectedModel?.embedding_dimensions && (
              <p className="mt-2 text-xs text-muted-foreground">向量维度：{selectedModel.embedding_dimensions}</p>
            )}
          </Section>

          {/* Chunking */}
          <Section icon={Scissors} title="分块策略">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">策略</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CHUNK_STRATEGIES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setSettings({ ...settings, chunk_strategy: s.value })}
                      className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        settings.chunk_strategy === s.value
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <RangeInput
                label="Chunk 大小"
                min={256} max={2048} step={128}
                value={settings.chunk_size}
                onChange={(v) => setSettings({ ...settings, chunk_size: v })}
              />
              <RangeInput
                label="重叠大小"
                min={0} max={256} step={64}
                value={settings.chunk_overlap}
                onChange={(v) => setSettings({ ...settings, chunk_overlap: v })}
              />
              <div>
                <label className="text-xs text-muted-foreground">分隔符</label>
                <select
                  value={settings.separator}
                  onChange={(e) => setSettings({ ...settings, separator: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {SEPARATORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </Section>

          {/* Retrieval */}
          <Section icon={SlidersHorizontal} title="检索策略">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">检索模式</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {RETRIEVAL_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setSettings({ ...settings, retrieval_mode: m.value })}
                      className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        settings.retrieval_mode === m.value
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <RangeInput
                label="Top-K"
                min={3} max={20} step={1}
                value={settings.top_k}
                onChange={(v) => setSettings({ ...settings, top_k: v })}
              />
              <RangeInput
                label="相似度阈值"
                min={0} max={1} step={0.05}
                value={settings.score_threshold}
                onChange={(v) => setSettings({ ...settings, score_threshold: v })}
              />
              <div className="flex items-center gap-2">
                <input
                  id="rerank"
                  type="checkbox"
                  checked={settings.rerank_enabled}
                  onChange={(e) => setSettings({ ...settings, rerank_enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="rerank" className="text-sm">启用重排序</label>
              </div>
              {settings.rerank_enabled && (
                <RangeInput
                  label="Rerank Top-N"
                  min={3} max={10} step={1}
                  value={settings.rerank_top_n}
                  onChange={(v) => setSettings({ ...settings, rerank_top_n: v })}
                />
              )}
            </div>
          </Section>
        </div>

        {/* Retrieval test */}
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Search size={16} /> 检索测试
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              placeholder="输入问题，测试当前检索配置效果…"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={handleTest}
              disabled={testing || !query.trim()}
              className="flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Search size={14} /> {testing ? '检索中…' : '测试'}
            </button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto space-y-3">
            {testResults.map((r, i) => (
              <div key={r.chunk_id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>#{i + 1} · {r.file_name}</span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">score: {r.score.toFixed(3)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">来源：{r.file_path}</p>
              </div>
            ))}
            {!testing && testResults.length === 0 && query && (
              <div className="text-center text-sm text-muted-foreground">未检索到相关结果</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Database; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

function RangeInput({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-primary"
      />
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
