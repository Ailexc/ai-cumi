// AiCumi — 工作流共享类型与元数据常量
// 供 WorkflowPanel / WorkflowEditor 复用

export type WorkflowNodeType =
  | 'agent_call'
  | 'tool_call'
  | 'condition'
  | 'transform'
  | 'human_review';

export interface WorkflowNode {
  id: string;
  name: string;
  node_type: WorkflowNodeType;
  config: Record<string, any>;
  position: { x: number; y: number };
  status?: string;
  input_data?: any;
  output_data?: any;
  error?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  condition?: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
  run_count: number;
  last_run_status?: string;
  last_run_at?: string;
  duration_ms?: number;
  step_count: number;
  completed_count: number;
  failed_count: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  input_data?: any;
  output_data?: any;
  steps: WorkflowNode[];
  error?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

// ---- 节点类型元数据（图标用 lucide，这里只存颜色与文案） ----

export const NODE_TYPE_META: Record<
  WorkflowNodeType,
  { label: string; color: string; bg: string; border: string; desc: string }
> = {
  agent_call: {
    label: 'Agent 调用',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#c4b5fd',
    desc: '调用团队 Agent（AG2）执行任务',
  },
  tool_call: {
    label: '工具调用',
    color: '#ea580c',
    bg: '#fff7ed',
    border: '#fdba74',
    desc: '调用内置工具（搜索 / 代码 / 文件…）',
  },
  condition: {
    label: '条件判断',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#93c5fd',
    desc: '按表达式求值，走 true / false 分支',
  },
  transform: {
    label: '数据转换',
    color: '#64748b',
    bg: '#f8fafc',
    border: '#cbd5e1',
    desc: '模板渲染 / 数据映射',
  },
  human_review: {
    label: '人工审核',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fcd34d',
    desc: '暂停等待人工审批（HITL）',
  },
};

export const NODE_TYPE_ORDER: WorkflowNodeType[] = [
  'agent_call',
  'tool_call',
  'condition',
  'transform',
  'human_review',
];

// ---- 状态元数据 ----

export const STATUS_META: Record<
  string,
  { label: string; dot: string; ring: string; bg: string }
> = {
  pending: { label: '待执行', dot: '#9aa0a6', ring: 'rgba(154,160,166,0.25)', bg: 'bg-gray-100 text-gray-600' },
  running: { label: '运行中', dot: '#3b82f6', ring: 'rgba(59,130,246,0.45)', bg: 'bg-blue-100 text-blue-700' },
  completed: { label: '成功', dot: '#22a45c', ring: 'rgba(34,164,92,0.45)', bg: 'bg-green-100 text-green-700' },
  failed: { label: '失败', dot: '#de3b46', ring: 'rgba(222,59,70,0.45)', bg: 'bg-red-100 text-red-700' },
  skipped: { label: '跳过', dot: '#c4c7cc', ring: 'rgba(196,199,204,0.3)', bg: 'bg-gray-100 text-gray-400' },
  waiting: { label: '等待审批', dot: '#d97706', ring: 'rgba(217,119,6,0.45)', bg: 'bg-amber-100 text-amber-700' },
  draft: { label: '草稿', dot: '#9aa0a6', ring: 'rgba(154,160,166,0.25)', bg: 'bg-gray-100 text-gray-600' },
  cancelled: { label: '已取消', dot: '#9aa0a6', ring: 'rgba(154,160,166,0.25)', bg: 'bg-gray-100 text-gray-600' },
};

export const WORKFLOW_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-gray-100 text-gray-600' },
  running: { label: '运行中', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', cls: 'bg-green-100 text-green-700' },
  failed: { label: '失败', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: '已取消', cls: 'bg-gray-100 text-gray-600' },
};

export function nodeTypeLabel(t: string): string {
  return NODE_TYPE_META[t as WorkflowNodeType]?.label ?? t;
}
