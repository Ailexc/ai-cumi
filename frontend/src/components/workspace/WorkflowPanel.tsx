// AiCumi — 工作流面板
// 三种模式：列表 / 可视化编辑器 / 模板库
// 学习导向：运行历史 + 步骤可视化 + 执行/编辑/复制/删除

import { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  Plus,
  RefreshCw,
  Play,
  Pencil,
  Copy,
  Trash2,
  Clock,
  XCircle,
  Zap,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { WorkflowEditor } from './workflow/WorkflowEditor';
import {
  WORKFLOW_STATUS_META,
  STATUS_META,
  nodeTypeLabel,
  NODE_TYPE_META,
  type Workflow,
  type WorkflowTemplate,
} from './workflow/workflowTypes';

type Mode = 'list' | 'editor' | 'templates';

export function WorkflowPanel() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wr, sr] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/workflows/stats'),
      ]);
      const wd = await wr.json();
      const sd = await sr.json();
      if (wd.ok) setWorkflows(wd.workflows);
      if (sd.ok) setStats(sd.stats);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchTemplates = async () => {
    const r = await fetch('/api/workflow-templates');
    const d = await r.json();
    if (d.ok) setTemplates(d.templates);
  };

  const openNew = () => {
    setEditing(null);
    setMode('editor');
  };

  const openEdit = (w: Workflow) => {
    setEditing(w);
    setMode('editor');
  };

  const handleUseTemplate = async (t: WorkflowTemplate) => {
    const r = await fetch('/api/workflows/from-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: t.id }),
    });
    const d = await r.json();
    if (d.ok) {
      setMode('list');
      fetchData();
    }
  };

  const handleExecute = async (id: string) => {
    setExecuting(id);
    try {
      await fetch(`/api/workflows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_input: '', background: true }),
      });
      // 等待一小段后刷新
      await new Promise((r) => setTimeout(r, 800));
      fetchData();
    } finally {
      setExecuting(null);
    }
  };

  const handleCancel = async (id: string) => {
    await fetch(`/api/workflows/${id}/cancel`, { method: 'POST' });
    fetchData();
  };

  const handleDuplicate = async (id: string) => {
    await fetch(`/api/workflows/${id}/duplicate`, { method: 'POST' });
    fetchData();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定删除工作流「${name}」及其运行历史？`)) return;
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // ---- 编辑器模式 ----
  if (mode === 'editor') {
    return (
      <div className="min-w-0">
        <WorkflowEditor
          initial={editing}
          onExit={() => {
            setMode('list');
            fetchData();
          }}
          onSaved={() => {
            /* 列表在退出时刷新 */
          }}
        />
      </div>
    );
  }

  // ---- 模板库模式 ----
  if (mode === 'templates') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('list')}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground hover:bg-muted/80"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回列表
          </button>
          <h3 className="text-lg font-semibold">从模板创建</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border bg-card p-4">
              <div className="mb-1 flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <span className="font-medium">{t.name}</span>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {t.nodes.map((n) => (
                  <span
                    key={n.id}
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      background: NODE_TYPE_META[n.node_type]?.bg ?? '#f3f3f5',
                      color: NODE_TYPE_META[n.node_type]?.color ?? '#5f6368',
                    }}
                  >
                    {nodeTypeLabel(n.node_type)}
                  </span>
                ))}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t.nodes.length} 节点 · {t.edges.length} 连线
                </span>
              </div>
              <button
                onClick={() => handleUseTemplate(t)}
                className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                使用此模板创建
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- 列表模式 ----
  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">工作流编排</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
          >
            <RefreshCw className="h-3 w-3" />
            刷新
          </button>
          <button
            onClick={() => {
              setMode('templates');
              fetchTemplates();
            }}
            className="flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-sm hover:bg-muted/80"
          >
            <LayoutTemplate className="h-3 w-3" />
            模板库
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            新建工作流
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">可视化工作流编排</p>
        <p className="text-muted-foreground">
          拖拽搭建多步骤流程：调用 Agent / 工具、条件分支、并行、人工审核。每一步真实执行，运行过程节点高亮可视化。
        </p>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">工作流</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.completed_workflows}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">总步骤数</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.total_steps}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">累计运行</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.total_runs}</p>
          </div>
        </div>
      )}

      {/* 工作流列表 */}
      {loading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
          <GitBranch className="h-8 w-8" />
          <p>还没有工作流</p>
          <div className="flex gap-2">
            <button
              onClick={openNew}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3 w-3" />
              新建空白工作流
            </button>
            <button
              onClick={() => {
                setMode('templates');
                fetchTemplates();
              }}
              className="flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-sm hover:bg-muted/80"
            >
              <LayoutTemplate className="h-3 w-3" />
              从模板开始
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              isExpanded={expanded === workflow.id}
              isExecuting={executing === workflow.id}
              onToggle={() => setExpanded(expanded === workflow.id ? null : workflow.id)}
              onEdit={() => openEdit(workflow)}
              onExecute={() => handleExecute(workflow.id)}
              onCancel={() => handleCancel(workflow.id)}
              onDuplicate={() => handleDuplicate(workflow.id)}
              onDelete={() => handleDelete(workflow.id, workflow.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- 工作流卡片 ----
function WorkflowCard({
  workflow,
  isExpanded,
  isExecuting,
  onToggle,
  onEdit,
  onExecute,
  onCancel,
  onDuplicate,
  onDelete,
}: {
  workflow: Workflow;
  isExpanded: boolean;
  isExecuting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onExecute: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const wm = WORKFLOW_STATUS_META[workflow.status] ?? WORKFLOW_STATUS_META.draft;
  const lastRun = workflow.last_run_status
    ? STATUS_META[workflow.last_run_status] ?? STATUS_META.pending
    : null;

  return (
    <div className="rounded-lg border bg-background">
      {/* 头部 */}
      <div className="cursor-pointer p-4" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{workflow.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${wm.cls}`}>{wm.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {workflow.description || '无描述'} · {workflow.step_count} 节点 · 运行 {workflow.run_count} 次
                {lastRun && (
                  <span className="ml-1 text-xs">
                    · 上次 <span className="font-medium">{lastRun.label}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/80"
              title="在可视化编辑器中打开"
            >
              <Pencil className="h-3 w-3" />
              编辑
            </button>
            <button
              onClick={onExecute}
              disabled={isExecuting || workflow.status === 'running'}
              className="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {workflow.status === 'running' ? '运行中' : '运行'}
            </button>
            {workflow.status === 'running' && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
              >
                <XCircle className="h-3 w-3" />
                取消
              </button>
            )}
            <button
              onClick={onDuplicate}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/80"
              title="复制"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              title="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* 展开的节点列表 */}
      {isExpanded && (
        <div className="border-t bg-muted/30 p-4">
          <div className="mb-2 text-xs text-muted-foreground">
            节点执行顺序与状态（展开节点可查看步骤详情）
          </div>
          <div className="space-y-2">
            {workflow.nodes.map((node, index) => {
              const meta = NODE_TYPE_META[node.node_type];
              const st = STATUS_META[node.status ?? 'pending'] ?? STATUS_META.pending;
              return (
                <div key={node.id} className="flex items-start gap-3 rounded-md bg-background p-3">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    style={{ background: meta?.bg ?? '#f3f3f5', color: meta?.color ?? '#5f6368' }}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                      <span className="font-medium">{node.name}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-xs"
                        style={{ background: meta?.bg ?? '#f3f3f5', color: meta?.color ?? '#5f6368' }}
                      >
                        {nodeTypeLabel(node.node_type)}
                      </span>
                      <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${st.bg}`}>{st.label}</span>
                    </div>

                    {node.node_type === 'agent_call' && (
                      <div className="mt-1 text-xs text-muted-foreground">Agent：{node.config?.agent_id || '未配置'}</div>
                    )}
                    {node.node_type === 'tool_call' && (
                      <div className="mt-1 text-xs text-muted-foreground">工具：{node.config?.tool_name || '未配置'}</div>
                    )}
                    {node.node_type === 'condition' && (
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{node.config?.expression}</div>
                    )}
                    {node.node_type === 'transform' && (
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{node.config?.template}</div>
                    )}

                    {node.error && (
                      <div className="mt-1 rounded bg-red-50 p-1.5 text-xs text-red-600">错误：{node.error}</div>
                    )}
                    {node.output_data != null && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
                        {JSON.stringify(node.output_data, null, 2)}
                      </pre>
                    )}
                    {node.duration_ms != null && (
                      <div className="mt-1 text-xs text-muted-foreground">耗时：{node.duration_ms.toFixed(0)}ms</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {workflow.duration_ms != null && (
            <div className="mt-3 text-xs text-muted-foreground">总耗时：{workflow.duration_ms.toFixed(0)}ms</div>
          )}
        </div>
      )}
    </div>
  );
}
