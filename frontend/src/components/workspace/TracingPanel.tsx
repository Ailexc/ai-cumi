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
        <>
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

          {/* 性能监控 */}
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-semibold">性能监控</span>
              <span className="text-xs text-muted-foreground">
                （样本 {stats.response_time_ms?.sample_count ?? 0} 次）
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PerfCard label="平均响应" value={formatMs(stats.response_time_ms?.avg)} color="text-indigo-600" />
              <PerfCard label="P95 响应" value={formatMs(stats.response_time_ms?.p95)} color="text-purple-600" />
              <PerfCard label="最大响应" value={formatMs(stats.response_time_ms?.max)} color="text-rose-600" />
              <PerfCard label="模型调用" value={stats.calls?.model_calls ?? 0} color="text-sky-600" />
              <PerfCard label="工具调用" value={stats.calls?.tool_calls ?? 0} color="text-amber-600" />
              <PerfCard label="记忆查询" value={stats.calls?.memory_queries ?? 0} color="text-emerald-600" />
              <PerfCard label="错误事件" value={stats.errors?.error_events ?? 0} color="text-red-600" />
              <PerfCard label="错误率" value={`${stats.errors?.error_rate ?? 0}%`} color="text-red-600" />
            </div>

            {/* 按 Agent 拆分 */}
            {stats.agents && Object.keys(stats.agents).length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">按 Agent 拆分</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">Agent</th>
                        <th className="py-1 pr-3 font-medium">追踪</th>
                        <th className="py-1 pr-3 font-medium">平均响应</th>
                        <th className="py-1 pr-3 font-medium">模型调用</th>
                        <th className="py-1 pr-3 font-medium">工具调用</th>
                        <th className="py-1 font-medium">错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(stats.agents).map(([aid, a]) => (
                        <tr key={aid} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 pr-3 font-medium">{aid}</td>
                          <td className="py-1.5 pr-3">{(a as any).traces}</td>
                          <td className="py-1.5 pr-3">{formatMs((a as any).avg_duration_ms)}</td>
                          <td className="py-1.5 pr-3">{(a as any).model_calls}</td>
                          <td className="py-1.5 pr-3">{(a as any).tool_calls}</td>
                          <td className="py-1.5">{(a as any).errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
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

// 性能指标卡片
function PerfCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

// 毫秒格式化（<1s 显示 ms，否则显示秒）
function formatMs(v: number | undefined | null): string {
  if (v === undefined || v === null) return '-';
  return v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(2)}s`;
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
