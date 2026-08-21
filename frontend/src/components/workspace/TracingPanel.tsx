// AiCumi — 追踪面板组件
// 展示 Agent 执行追踪、工具调用、模型调用等
// 设计理念：学习导向，展示可观测性概念

import { useState, useEffect } from 'react';
import { Activity, Clock, Wrench, Brain, Database, AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

interface TraceEvent {
  id: string;
  trace_id: string;
  event_type: string;
  agent_id: string;
  timestamp: string;
  data: Record<string, any>;
  parent_id?: string;
  duration_ms?: number;
}

interface Trace {
  id: string;
  agent_id: string;
  started_at: string;
  ended_at?: string;
  event_count: number;
  events: TraceEvent[];
  metadata: Record<string, any>;
  duration_ms?: number;
}

export function TracingPanel() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tracesRes, statsRes] = await Promise.all([
        fetch('/api/tracing/traces?limit=20'),
        fetch('/api/tracing/stats'),
      ]);
      
      const tracesData = await tracesRes.json();
      const statsData = await statsRes.json();
      
      if (tracesData.ok) setTraces(tracesData.traces);
      if (statsData.ok) setStats(statsData.stats);
    } catch (error) {
      console.error('Failed to fetch tracing data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">执行追踪</h3>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
        >
          <RefreshCw className="h-3 w-3" />
          刷新
        </button>
      </div>

      {/* 说明 */}
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">什么是执行追踪？</p>
        <p className="text-muted-foreground">
          追踪系统记录 Agent 的每一步执行过程，包括工具调用、模型交互、记忆操作等。
          这是调试和优化 Agent 系统的关键能力。
        </p>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={Activity}
            label="活跃追踪"
            value={stats.active_traces}
            color="text-blue-500"
          />
          <StatCard
            icon={Clock}
            label="已完成"
            value={stats.completed_traces}
            color="text-green-500"
          />
          <StatCard
            icon={Database}
            label="总事件数"
            value={stats.total_events}
            color="text-purple-500"
          />
        </div>
      )}

      {/* 追踪列表 */}
      {loading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : traces.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
          <Activity className="mb-2 h-8 w-8" />
          <p>暂无追踪记录</p>
          <p className="text-sm">与 Agent 对话后，这里会显示执行追踪</p>
        </div>
      ) : (
        <div className="space-y-3">
          {traces.map((trace) => (
            <TraceCard
              key={trace.id}
              trace={trace}
              isExpanded={expandedTrace === trace.id}
              onToggle={() => setExpandedTrace(expandedTrace === trace.id ? null : trace.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 统计卡片
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

// 追踪卡片
function TraceCard({
  trace,
  isExpanded,
  onToggle,
}: {
  trace: Trace;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background">
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{trace.agent_id}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {trace.event_count} 事件
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(trace.started_at).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {trace.duration_ms && (
            <span className="text-sm text-muted-foreground">
              {trace.duration_ms.toFixed(0)}ms
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {/* 展开的事件列表 */}
      {isExpanded && (
        <div className="border-t bg-muted/30 p-4">
          <div className="space-y-2">
            {trace.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 事件卡片
function EventCard({ event }: { event: TraceEvent }) {
  const typeConfig: Record<string, { icon: any; color: string; label: string }> = {
    agent_start: { icon: Activity, color: 'text-blue-500', label: 'Agent 启动' },
    agent_end: { icon: Activity, color: 'text-green-500', label: 'Agent 结束' },
    tool_call: { icon: Wrench, color: 'text-orange-500', label: '工具调用' },
    tool_result: { icon: Wrench, color: 'text-green-500', label: '工具结果' },
    model_call: { icon: Brain, color: 'text-purple-500', label: '模型调用' },
    model_response: { icon: Brain, color: 'text-green-500', label: '模型响应' },
    memory_query: { icon: Database, color: 'text-cyan-500', label: '记忆查询' },
    memory_add: { icon: Database, color: 'text-green-500', label: '记忆添加' },
    error: { icon: AlertTriangle, color: 'text-red-500', label: '错误' },
  };

  const config = typeConfig[event.event_type] || { icon: Activity, color: 'text-gray-500', label: event.event_type };
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 rounded-md bg-background p-2">
      <Icon className={`mt-0.5 h-4 w-4 ${config.color}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{config.label}</span>
          {event.duration_ms && (
            <span className="text-xs text-muted-foreground">
              {event.duration_ms.toFixed(1)}ms
            </span>
          )}
        </div>
        <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
