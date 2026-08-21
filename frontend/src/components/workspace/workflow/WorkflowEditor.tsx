// AiCumi — 可视化工作流编辑器（React Flow 画布）
// 左侧工具箱拖入节点 → 画布连线 → 右侧属性面板配置 → 保存/运行/历史
// 学习导向：运行态节点高亮，点击节点可查看输入/输出/错误

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Bot,
  Wrench,
  GitBranch,
  Shuffle,
  ClipboardCheck,
  ArrowLeft,
  Save,
  Play,
  History,
  Trash2,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  NODE_TYPE_META,
  NODE_TYPE_ORDER,
  STATUS_META,
  nodeTypeLabel,
  type Workflow,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowRun,
} from './workflowTypes';

// ---- React Flow 节点数据 ----
interface FlowNodeData extends Record<string, unknown> {
  name: string;
  node_type: WorkflowNodeType;
  config: Record<string, any>;
  status?: string;
  output_data?: any;
  error?: string;
  duration_ms?: number;
}

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge;

const NODE_ICONS: Record<WorkflowNodeType, any> = {
  agent_call: Bot,
  tool_call: Wrench,
  condition: GitBranch,
  transform: Shuffle,
  human_review: ClipboardCheck,
};

const FLOW_NODE_TYPE = 'workflow';

// ---- 自定义画布节点（必须在模块顶层定义） ----
function WorkflowFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const nodeType = data.node_type as WorkflowNodeType;
  const meta = NODE_TYPE_META[nodeType] ?? NODE_TYPE_META.agent_call;
  const statusMeta = STATUS_META[data.status ?? 'pending'] ?? STATUS_META.pending;
  const Icon = NODE_ICONS[nodeType] ?? Bot;
  const isCondition = nodeType === 'condition';

  return (
    <div
      className="group relative min-w-[150px] rounded-lg border bg-card px-3 py-2 shadow-sm transition-shadow"
      style={{
        borderColor: selected ? meta.color : meta.border,
        boxShadow: selected ? `0 0 0 2px ${meta.color}33` : undefined,
      }}
    >
      {/* 目标端口（左侧） */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!h-2.5 !w-2.5 !border-2 !bg-white"
        style={{ borderColor: meta.color }}
      />

      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: meta.bg, color: meta.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">
            {data.name || '未命名节点'}
          </div>
          <div className="truncate text-[10px]" style={{ color: meta.color }}>
            {meta.label}
          </div>
        </div>
        {/* 状态圆点 */}
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: statusMeta.dot,
            boxShadow: `0 0 0 3px ${statusMeta.ring}`,
            animation: data.status === 'running' ? 'pulse 1s infinite' : undefined,
          }}
          title={statusMeta.label}
        />
      </div>

      {data.error && (
        <div className="mt-1 truncate rounded bg-red-50 px-1 text-[10px] text-red-600">
          {data.error}
        </div>
      )}

      {/* 源端口：condition 有 true/false 两个，其余一个 success */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!h-2.5 !w-2.5 !border-2 !bg-white"
            style={{ borderColor: '#22a45c', top: '40%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!h-2.5 !w-2.5 !border-2 !bg-white"
            style={{ borderColor: '#de3b46', top: '75%' }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="success"
          className="!h-2.5 !w-2.5 !border-2 !bg-white"
          style={{ borderColor: meta.color }}
        />
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { [FLOW_NODE_TYPE]: WorkflowFlowNode };

const DEFAULT_POSITION = { x: 40, y: 40 };

function defaultConfig(t: WorkflowNodeType): Record<string, any> {
  switch (t) {
    case 'agent_call':
      return { agent_id: '', prompt: '' };
    case 'tool_call':
      return { tool_name: '', params: {} };
    case 'condition':
      return { expression: 'data["result"] == true' };
    case 'transform':
      return { template: '' };
    case 'human_review':
      return { description: '', timeout: 3600, auto_approve: false };
    default:
      return {};
  }
}

function defaultName(t: WorkflowNodeType): string {
  switch (t) {
    case 'agent_call':
      return 'Agent 节点';
    case 'tool_call':
      return '工具节点';
    case 'condition':
      return '条件判断';
    case 'transform':
      return '数据转换';
    case 'human_review':
      return '人工审核';
    default:
      return '节点';
  }
}

function uid(prefix = 'n'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// 后端节点 → React Flow 节点
function toFlowNode(n: WorkflowNode): FlowNode {
  return {
    id: n.id,
    type: FLOW_NODE_TYPE,
    position: n.position || DEFAULT_POSITION,
    data: {
      name: n.name,
      node_type: n.node_type,
      config: n.config || {},
      status: n.status,
      output_data: n.output_data,
      error: n.error,
      duration_ms: n.duration_ms,
    },
  };
}

// React Flow 节点 → 后端节点（剔除运行时字段）
function fromFlowNode(n: FlowNode): WorkflowNode {
  return {
    id: n.id,
    name: n.data.name,
    node_type: n.data.node_type,
    config: n.data.config,
    position: n.position,
  };
}

function fromFlowEdge(e: FlowEdge): any {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    source_handle: e.sourceHandle ?? 'success',
    condition: (e as any).condition,
    label: (e as any).label,
  };
}

// ---- 编辑器主组件 ----

export function WorkflowEditor({
  initial,
  onExit,
  onSaved,
}: {
  initial: Workflow | null;
  onExit: () => void;
  onSaved: (w: Workflow) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '未命名工作流');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [workflowId, setWorkflowId] = useState<string | null>(initial?.id ?? null);

  const [rfNodes, setRfNodes] = useState<FlowNode[]>(
    initial?.nodes?.map(toFlowNode) ?? [],
  );
  const [rfEdges, setRfEdges] = useState<FlowEdge[]>(
    initial?.edges?.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_handle,
      label: e.label,
      ...(e.condition ? { condition: e.condition } : {}),
      markerEnd: { type: MarkerType.ArrowClosed },
    })) ?? [],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ agent_id: string; name: string }[]>([]);
  const [tools, setTools] = useState<{ name: string; description: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [showRuns, setShowRuns] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const pollRef = useRef<any>(null);

  const selectedNode = useMemo(
    () => rfNodes.find((n) => n.id === selectedId) ?? null,
    [rfNodes, selectedId],
  );

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => setAgents(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch('/api/tools')
      .then((r) => r.json())
      .then((d) => {
        const toolsList = d.tools ?? d;
        setTools(Array.isArray(toolsList) ? toolsList : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (workflowId) loadRuns();
  }, [workflowId]);

  useEffect(() => () => pollRef.current && clearTimeout(pollRef.current), []);

  const loadRuns = async () => {
    if (!workflowId) return;
    const res = await fetch(`/api/workflows/${workflowId}/runs`);
    const d = await res.json();
    if (d.ok) setRuns(d.runs ?? []);
  };

  // ---- 节点 / 边操作 ----

  const onNodesChange = useCallback(
    (changes: any) => setRfNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: any) => setRfEdges((eds) => applyEdgeChanges(changes, eds) as FlowEdge[]),
    [],
  );

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      const src = rfNodes.find((n) => n.id === conn.source);
      const srcType = src?.data.node_type;
      let sourceHandle = conn.sourceHandle ?? 'success';
      let condition: string | undefined;
      let label: string | undefined;
      if (srcType === 'condition') {
        sourceHandle = sourceHandle === 'false' ? 'false' : 'true';
        condition =
          sourceHandle === 'true'
            ? 'data["result"] == true'
            : 'data["result"] == false';
        label = sourceHandle === 'true' ? '是' : '否';
      }
      setRfEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: uid('e'),
            sourceHandle,
            condition,
            label,
            markerEnd: { type: MarkerType.ArrowClosed },
          } as any,
          eds,
        ),
      );
    },
    [rfNodes],
  );

  const addNode = (t: WorkflowNodeType) => {
    const count = rfNodes.length;
    const node: FlowNode = {
      id: uid(),
      type: FLOW_NODE_TYPE,
      position: {
        x: DEFAULT_POSITION.x + (count % 3) * 40,
        y: DEFAULT_POSITION.y + Math.floor(count / 3) * 40,
      },
      data: {
        name: defaultName(t),
        node_type: t,
        config: defaultConfig(t),
      },
    };
    setRfNodes((nds) => [...nds, node]);
    setSelectedId(node.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setRfNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setRfEdges((eds) =>
      eds.filter((e) => e.source !== selectedId && e.target !== selectedId),
    );
    setSelectedId(null);
  };

  const updateSelected = (patch: Partial<FlowNodeData>) => {
    if (!selectedId) return;
    setRfNodes((nds) =>
      nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  };

  const updateConfig = (cfgPatch: Record<string, any>) => {
    if (!selectedId) return;
    setRfNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...cfgPatch } } }
          : n,
      ),
    );
  };

  // ---- 保存 ----

  const buildPayload = () => ({
    name,
    description,
    nodes: rfNodes.map(fromFlowNode),
    edges: rfEdges.map(fromFlowEdge),
  });

  const handleSave = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await fetch(workflowId ? `/api/workflows/${workflowId}` : '/api/workflows', {
        method: workflowId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) {
        setWorkflowId(d.workflow.id);
        onSaved?.(d.workflow);
        return d.workflow.id;
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ---- 运行（后台执行 + 轮询节点状态） ----

  const syncRunState = (w: Workflow) => {
    setRfNodes((nds) =>
      nds.map((n) => {
        const wnode = w.nodes.find((x) => x.id === n.id);
        return wnode
          ? {
              ...n,
              data: {
                ...n.data,
                status: wnode.status,
                output_data: wnode.output_data,
                error: wnode.error,
                duration_ms: wnode.duration_ms,
              },
            }
          : n;
      }),
    );
  };

  const handleRun = async () => {
    // Always persist the current canvas before running, so the executed
    // definition matches what the user is looking at (including unsaved edits).
    const id = await handleSave();
    if (!id) return;
    setRunStatus('running');
    await fetch(`/api/workflows/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_input: '', background: true }),
    });
    const doPoll = async () => {
      const res = await fetch(`/api/workflows/${id}`);
      const d = await res.json();
      if (d.ok) {
        syncRunState(d.workflow);
        if (d.workflow.status === 'running') {
          pollRef.current = setTimeout(doPoll, 1200);
        } else {
          setRunStatus(d.workflow.status === 'completed' ? 'done' : 'failed');
          loadRuns();
        }
      } else {
        setRunStatus('failed');
      }
    };
    pollRef.current = setTimeout(doPoll, 1000);
  };

  // ---- 渲染 ----

  const selectedMeta = selectedNode ? NODE_TYPE_META[selectedNode.data.node_type] : null;
  const selConfig = selectedNode?.data.config ?? {};

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onExit}
          className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground hover:bg-muted/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回列表
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="工作流名称"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-64 rounded-md border bg-background px-2 py-1 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="描述（可选）"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowRuns((v) => !v)}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
          >
            <History className="h-3.5 w-3.5" />
            运行历史
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </button>
          <button
            onClick={handleRun}
            disabled={runStatus === 'running' || rfNodes.length === 0}
            className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {runStatus === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {runStatus === 'running' ? '运行中…' : '运行'}
          </button>
        </div>
      </div>

      {/* 运行历史折叠区 */}
      {showRuns && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">运行历史（{runs.length}）</span>
            <button onClick={() => setShowRuns(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无运行记录，点击「运行」触发。</p>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {runs.map((run) => {
                const st = STATUS_META[run.status] ?? STATUS_META.pending;
                const open = expandedRun === run.id;
                return (
                  <div key={run.id} className="rounded-md border bg-background">
                    <button
                      onClick={() => setExpandedRun(open ? null : run.id)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                    >
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className={`rounded-full px-2 py-0.5 text-xs ${st.bg}`}>{st.label}</span>
                      <span className="text-muted-foreground">
                        {run.started_at ? new Date(run.started_at).toLocaleString() : ''}
                      </span>
                      {run.duration_ms != null && (
                        <span className="text-xs text-muted-foreground">{run.duration_ms.toFixed(0)}ms</span>
                      )}
                    </button>
                    {open && (
                      <div className="space-y-1 border-t px-2 py-1.5">
                        {run.steps.map((s) => {
                          const sst = STATUS_META[s.status ?? 'pending'] ?? STATUS_META.pending;
                          return (
                            <div key={s.id} className="rounded bg-muted/40 px-2 py-1 text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full`} style={{ background: sst.dot }} />
                                <span className="font-medium">{s.name}</span>
                                <span className="text-muted-foreground">{nodeTypeLabel(s.node_type)}</span>
                                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${sst.bg}`}>{sst.label}</span>
                              </div>
                              {s.output_data != null && (
                                <pre className="mt-1 max-h-28 overflow-auto rounded bg-background p-1 text-[10px] text-muted-foreground">
                                  {JSON.stringify(s.output_data, null, 2)}
                                </pre>
                              )}
                              {s.error && <div className="mt-1 text-red-600">错误：{s.error}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 画布 + 工具箱 + 属性面板 */}
      <div className="flex gap-3">
        {/* 工具箱 */}
        <div className="w-40 shrink-0 rounded-lg border bg-card p-2">
          <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">节点工具箱</div>
          <div className="space-y-1.5">
            {NODE_TYPE_ORDER.map((t) => {
              const meta = NODE_TYPE_META[t];
              const Icon = NODE_ICONS[t];
              return (
                <button
                  key={t}
                  onClick={() => addNode(t)}
                  className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:border-primary hover:shadow-sm"
                  style={{ borderColor: meta.border }}
                  title={meta.desc}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded" style={{ background: meta.bg, color: meta.color }}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="truncate">{meta.label}</span>
                  <Plus className="ml-auto h-3 w-3 text-muted-foreground" />
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-md bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground">
            从工具箱添加节点，在节点右侧拖出连线建立依赖。条件节点有「是 / 否」两条出线。
          </div>
        </div>

        {/* 画布 */}
        <div className="h-[600px] min-w-0 flex-1 overflow-hidden rounded-lg border bg-background">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes }) => {
              setSelectedId(nodes[0]?.id ?? null);
            }}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            onEdgeClick={(_, edge) => {
              setRfEdges((eds) => eds.filter((e) => e.id !== edge.id));
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                NODE_TYPE_META[(n.data as any).node_type as WorkflowNodeType]?.color ?? '#94a3b8'
              }
            />
          </ReactFlow>
        </div>

        {/* 属性面板 */}
        <div className="w-72 shrink-0 rounded-lg border bg-card p-3">
          {!selectedNode ? (
            <div className="text-sm text-muted-foreground">
              选中一个节点以编辑配置。
              <p className="mt-2 text-xs leading-relaxed">
                节点输出可通过 <code className="rounded bg-muted px-1">{"{{ input.x }}"}</code> 传递到下游的 prompt / 工具参数 / 模板。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedMeta && (
                    <span className="flex h-6 w-6 items-center justify-center rounded" style={{ background: selectedMeta.bg, color: selectedMeta.color }}>
                      {(() => {
                        const Icon = NODE_ICONS[selectedNode.data.node_type];
                        return <Icon className="h-3.5 w-3.5" />;
                      })()}
                    </span>
                  )}
                  <span className="text-sm font-medium">{selectedMeta?.label}</span>
                </div>
                <button onClick={deleteSelected} className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-red-500 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">节点名称</span>
                <input
                  value={selectedNode.data.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>

              {selectedNode.data.node_type === 'agent_call' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">选择 Agent</span>
                    <select
                      value={selConfig.agent_id ?? ''}
                      onChange={(e) => updateConfig({ agent_id: e.target.value })}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">请选择</option>
                      {agents.map((a) => (
                        <option key={a.agent_id} value={a.agent_id}>
                          {a.name}（{a.agent_id}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                      指令（可选，支持 {"{{ input.x }}"})
                    </span>
                    <textarea
                      value={selConfig.prompt ?? ''}
                      onChange={(e) => updateConfig({ prompt: e.target.value })}
                      rows={3}
                      placeholder="例如：请分析以下材料并给出要点：\n{{ input }}"
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </>
              )}

              {selectedNode.data.node_type === 'tool_call' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">选择工具</span>
                    <select
                      value={selConfig.tool_name ?? ''}
                      onChange={(e) => updateConfig({ tool_name: e.target.value })}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">请选择</option>
                      {tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      参数（JSON 对象，值支持 {"{{ input.x }}"})
                    </span>
                    <textarea
                      value={
                        typeof selConfig.params === 'object'
                          ? JSON.stringify(selConfig.params ?? {}, null, 2)
                          : String(selConfig.params ?? '{}')
                      }
                      onChange={(e) => {
                        try {
                          updateConfig({ params: JSON.parse(e.target.value || '{}') });
                        } catch {
                          updateConfig({ params: e.target.value });
                        }
                      }}
                      rows={4}
                      placeholder={'{"query": "{{ input }}"}'}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </>
              )}

              {selectedNode.data.node_type === 'condition' && (
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">条件表达式</span>
                  <input
                    value={selConfig.expression ?? ''}
                    onChange={(e) => updateConfig({ expression: e.target.value })}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    用 <code>data</code> 引用上游输出，如：<code>{'data["response"] != ""'}</code>、<code>{'"err" in data'}</code>
                  </span>
                </label>
              )}

              {selectedNode.data.node_type === 'transform' && (
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">输出模板</span>
                  <textarea
                    value={selConfig.template ?? ''}
                    onChange={(e) => updateConfig({ template: e.target.value })}
                    rows={3}
                    placeholder={'结果：{{ input.response }}'}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    支持 <code>{'{{ input.field }}'}</code> 引用上游输出字段
                  </span>
                </label>
              )}

              {selectedNode.data.node_type === 'human_review' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">审核说明</span>
                    <input
                      value={selConfig.description ?? ''}
                      onChange={(e) => updateConfig({ description: e.target.value })}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="请确认是否继续…"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">等待超时（秒）</span>
                    <input
                      type="number"
                      value={selConfig.timeout ?? 3600}
                      onChange={(e) => updateConfig({ timeout: Number(e.target.value) || 3600 })}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!selConfig.auto_approve}
                      onChange={(e) => updateConfig({ auto_approve: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    超时自动通过
                  </label>
                </>
              )}

              {/* 学习导向：当前节点运行状态 */}
              {selectedNode.data.status && (
                <div className="rounded-md border bg-muted/40 p-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">运行状态：</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_META[selectedNode.data.status]?.bg ?? ''}`}>
                      {STATUS_META[selectedNode.data.status]?.label ?? selectedNode.data.status}
                    </span>
                  </div>
                  {selectedNode.data.duration_ms != null && (
                    <div className="mt-1 text-[10px] text-muted-foreground">耗时 {selectedNode.data.duration_ms.toFixed(0)}ms</div>
                  )}
                  {selectedNode.data.output_data != null && (
                    <div className="mt-1">
                      <div className="text-[10px] font-medium text-muted-foreground">输出：</div>
                      <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-background p-1.5 text-[10px] text-foreground">
                        {JSON.stringify(selectedNode.data.output_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedNode.data.error && (
                    <div className="mt-1 rounded bg-red-50 p-1 text-[10px] text-red-600">错误：{selectedNode.data.error}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 运行结果摘要 */}
      {runStatus === 'done' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          工作流执行完成，节点已高亮（绿色=成功，灰色=跳过）。点击节点查看输入输出。
        </div>
      )}
      {runStatus === 'failed' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          工作流执行失败，红色节点可查看错误详情。
        </div>
      )}
    </div>
  );
}
