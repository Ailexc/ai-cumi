// AiCumi — 分布式 Agent 面板（P2 · AG2 gRPC Worker Runtime）
// 展示：host/worker 拓扑 + 健康状态 + 负载均衡统计 + 故障转移控制 + 真实远程调用
// 设计理念：学习导向 —— 把分布式运行时的内部结构透明地展示出来

import { useState, useEffect, useCallback } from 'react';
import {
  Server, Network, Radio, RefreshCw, Send, Power, PowerOff, RotateCcw,
  Activity, ShieldAlert, GitBranch, Boxes, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';

interface WorkerInfo {
  id: string;
  status: string;
  agents: string[];
  dispatch_count: number;
  error_count: number;
  last_heartbeat?: string;
}

interface DistStatus {
  enabled: boolean;
  host: string;
  worker_count: number;
  started_at?: string;
  stats: { total_dispatches: number; failovers: number; lb_round_robins: number };
  workers: WorkerInfo[];
  agents: Record<string, { worker: string; route: string }[]>;
}

export function DistributedPanel() {
  const [status, setStatus] = useState<DistStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [agentId, setAgentId] = useState('keling');
  const [message, setMessage] = useState('你好，分布式 Worker 调用测试');
  const [lastResult, setLastResult] = useState<string>('');
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/distributed/status');
      const data = await res.json();
      if (data.ok) setStatus(data.status);
      else setError(data.detail || '获取状态失败');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const callApi = async (path: string, body?: any) => {
    setError('');
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || '请求失败');
      return null;
    }
    await fetchStatus();
    return data;
  };

  const handleSend = async () => {
    if (!agentId || !message.trim()) return;
    setSending(true);
    setLastResult('');
    try {
      const data = await callApi('/api/distributed/send', { agent_id: agentId, message });
      if (data?.ok) {
        setLastResult(`✅ ${data.response}\n\n⏱️ 耗时 ${data.latency_ms}ms（worker 路由 + 模型推理）`);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const handleWorkerDown = async (wid: string) => {
    await callApi(`/api/distributed/workers/${wid}/down`);
  };
  const handleWorkerUp = async (wid: string) => {
    await callApi(`/api/distributed/workers/${wid}/up`);
  };
  const handleRebuild = async () => {
    await callApi('/api/distributed/rebuild');
  };

  const agentOptions = status ? Object.keys(status.agents) : [];

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">分布式 Agent</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              status?.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status?.enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {status?.enabled ? '运行中' : '未启用'}
          </span>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
          >
            <RefreshCw className="h-3 w-3" />
            刷新
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">什么是分布式 Worker Runtime？</p>
        <p className="text-muted-foreground">
          基于 AG2 的 gRPC Worker Runtime：一个 <code className="rounded bg-background px-1">Host</code>{' '}
          作为中央协调器，多个 <code className="rounded bg-background px-1">Worker</code> 各自连接 Host，
          Agent 被分布注册到不同 Worker 上，请求经 gRPC 路由到对应 Worker 执行。支持负载均衡（副本轮询）、
          健康检查（心跳）与故障转移（Worker 宕机后自动迁移 Agent）。
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : status ? (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Server} label="Host" value={status.host} />
            <StatCard icon={Network} label="Worker 数" value={String(status.worker_count)} />
            <StatCard icon={Send} label="分发次数" value={String(status.stats?.total_dispatches ?? 0)} />
            <StatCard icon={ShieldAlert} label="故障转移" value={String(status.stats?.failovers ?? 0)} />
          </div>

          {/* 拓扑图：Host + Workers */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <GitBranch className="h-4 w-4 text-primary" />
              运行时拓扑
            </div>

            {/* Host */}
            <div className="mx-auto mb-3 w-fit rounded-lg border border-primary/30 bg-primary-50 px-4 py-2 text-center">
              <div className="text-xs font-semibold text-primary">Host 协调器</div>
              <div className="text-[11px] text-muted-foreground">{status.host} · gRPC</div>
            </div>
            <div className="mb-3 flex items-center gap-2 text-muted-foreground">
              <div className="h-px flex-1 border-t border-dashed border-border" />
              <span className="text-[10px]">gRPC 连接</span>
              <div className="h-px flex-1 border-t border-dashed border-border" />
            </div>

            {/* Workers */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {status.workers.map((w) => {
                const healthy = w.status === 'healthy';
                return (
                  <div
                    key={w.id}
                    className={`rounded-lg border p-3 ${
                      healthy ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className={`h-4 w-4 ${healthy ? 'text-emerald-600' : 'text-red-500'}`} />
                        <span className="text-sm font-semibold">{w.id}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {healthy ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {healthy ? 'healthy' : 'down'}
                      </span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {w.agents.length ? (
                        w.agents.map((a) => (
                          <span key={a} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-foreground">
                            {a}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground">（无托管 Agent）</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>分发 {w.dispatch_count} · 错误 {w.error_count}</span>
                      <div className="flex gap-1">
                        {healthy ? (
                          <button
                            onClick={() => handleWorkerDown(w.id)}
                            className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-200"
                            title="模拟宕机（触发故障转移）"
                          >
                            <PowerOff className="h-3 w-3" /> 下线
                          </button>
                        ) : (
                          <button
                            onClick={() => handleWorkerUp(w.id)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-600 hover:bg-emerald-200"
                            title="恢复 Worker"
                          >
                            <Power className="h-3 w-3" /> 恢复
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 远程调用测试 */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Send className="h-4 w-4 text-primary" />
              通过 gRPC Worker 远程调用
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {agentOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="输入要调用的消息…"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                调用
              </button>
            </div>
            {lastResult && (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-foreground">
                {lastResult}
              </pre>
            )}
          </div>

          {/* Agent 分布表 */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Radio className="h-4 w-4 text-primary" />
                Agent 分布与副本（负载均衡）
              </div>
              <button
                onClick={handleRebuild}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80"
                title="重新注册所有 Agent"
              >
                <RotateCcw className="h-3 w-3" /> 重建
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Agent</th>
                    <th className="pb-2 pr-3 font-medium">路由类型</th>
                    <th className="pb-2 font-medium">托管 Worker</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(status.agents || {}).map(([aid, locs]) =>
                    locs.map((loc, i) => (
                      <tr key={`${aid}-${i}`} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 font-medium">{i === 0 ? aid : ''}</td>
                        <td className="py-1.5 pr-3">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {loc.route}
                          </code>
                          {i > 0 && (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                              副本
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">{loc.worker}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 能力说明 */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="mb-1 font-medium">已实现能力</p>
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              <li><b>分布</b>：Agent 按轮询分配到不同 Worker，各自通过 gRPC 连接 Host</li>
              <li><b>负载均衡</b>：复制的 Agent 以 <code>__r1</code> 别名类型挂在第二个 Worker，请求轮询分发</li>
              <li><b>健康检查</b>：后台心跳探测每个 Worker，异常自动标记 down</li>
              <li><b>故障转移</b>：Worker 宕机 → 其 Agent 自动重新注册到健康 Worker，请求无缝续跑</li>
            </ul>
          </div>
        </>
      ) : null}

      {/* 底部统计 */}
      {status && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" /> 轮询分发 {status.stats?.lb_round_robins ?? 0}
          </span>
          {status.started_at && <span>启动于 {new Date(status.started_at).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
