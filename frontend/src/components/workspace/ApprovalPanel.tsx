// AiCumi — 审批面板组件
// 展示待审批请求和审批历史
// 设计理念：学习导向，展示 Human-in-the-loop 机制

import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

interface ApprovalRequest {
  id: string;
  agent_id: string;
  action: string;
  description: string;
  params: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';
  created_at: string;
  resolved_at?: string;
  response?: string;
  auto_approve_after?: number;
}

export function ApprovalPanel() {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch('/api/approval/pending'),
        fetch('/api/approval/history?limit=20'),
      ]);
      
      const pendingData = await pendingRes.json();
      const historyData = await historyRes.json();
      
      if (pendingData.ok) setPending(pendingData.requests);
      if (historyData.ok) setHistory(historyData.history);
    } catch (error) {
      console.error('Failed to fetch approval data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (requestId: string, status: 'approved' | 'rejected', response?: string) => {
    try {
      await fetch(`/api/approval/${requestId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, response }),
      });
      fetchData();
    } catch (error) {
      console.error('Failed to resolve approval:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Human-in-the-Loop</h3>
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
        <p className="font-medium">什么是 Human-in-the-Loop？</p>
        <p className="text-muted-foreground">
          Agent 在执行敏感操作前会请求人类审核。这是生产级 Agent 的关键能力，
          确保 AI 在关键决策点有人类监督。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('pending')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          待审批 ({pending.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          历史记录 ({history.length})
        </button>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : activeTab === 'pending' ? (
        <PendingList requests={pending} onResolve={handleResolve} />
      ) : (
        <HistoryList requests={history} />
      )}
    </div>
  );
}

// 待审批列表
function PendingList({
  requests,
  onResolve,
}: {
  requests: ApprovalRequest[];
  onResolve: (id: string, status: 'approved' | 'rejected', response?: string) => void;
}) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <CheckCircle className="mb-2 h-8 w-8" />
        <p>没有待审批的请求</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <ApprovalCard key={req.id} request={req} onResolve={onResolve} />
      ))}
    </div>
  );
}

// 审批卡片
function ApprovalCard({
  request,
  onResolve,
}: {
  request: ApprovalRequest;
  onResolve: (id: string, status: 'approved' | 'rejected', response?: string) => void;
}) {
  const [response, setResponse] = useState('');

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
              待审批
            </span>
            <span className="text-sm text-muted-foreground">{request.agent_id}</span>
          </div>
          <p className="mt-1 font-medium">{request.description}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(request.created_at).toLocaleTimeString()}
        </div>
      </div>

      {/* 参数 */}
      {Object.keys(request.params).length > 0 && (
        <div className="mb-3 rounded bg-muted p-2 text-xs">
          <p className="mb-1 font-medium">参数：</p>
          <pre className="overflow-auto">{JSON.stringify(request.params, null, 2)}</pre>
        </div>
      )}

      {/* 操作类型 */}
      <div className="mb-3 text-sm text-muted-foreground">
        操作类型：<code className="rounded bg-muted px-1">{request.action}</code>
      </div>

      {/* 响应输入 */}
      <div className="mb-3">
        <input
          type="text"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="可选：输入审核意见..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => onResolve(request.id, 'approved', response || undefined)}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-green-500 px-3 py-2 text-sm text-white hover:bg-green-600"
        >
          <CheckCircle className="h-4 w-4" />
          批准
        </button>
        <button
          onClick={() => onResolve(request.id, 'rejected', response || undefined)}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
        >
          <XCircle className="h-4 w-4" />
          拒绝
        </button>
      </div>
    </div>
  );
}

// 历史记录列表
function HistoryList({ requests }: { requests: ApprovalRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Clock className="mb-2 h-8 w-8" />
        <p>暂无审批历史</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <HistoryCard key={req.id} request={req} />
      ))}
    </div>
  );
}

// 历史记录卡片
function HistoryCard({ request }: { request: ApprovalRequest }) {
  const statusConfig = {
    approved: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: '已批准' },
    rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: '已拒绝' },
    timeout: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', label: '已超时' },
    cancelled: { icon: AlertTriangle, color: 'text-gray-500', bg: 'bg-gray-50', label: '已取消' },
    pending: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50', label: '待处理' },
  };

  const config = statusConfig[request.status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-3 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="text-sm font-medium">{request.description}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(request.created_at).toLocaleString()}
        </span>
      </div>
      {request.response && (
        <p className="mt-1 text-sm text-muted-foreground">审核意见：{request.response}</p>
      )}
    </div>
  );
}
