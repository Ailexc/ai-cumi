// AiCumi — 工具面板组件
// 展示可用工具、工具详情、Agent 工具绑定
// 设计理念：学习导向，展示内部实现细节

import { useState, useEffect } from 'react';
import { Wrench, Play, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import type { ToolDefinition, ToolParameter } from '../../types';

interface ToolPanelProps {
  agentId?: string;
  agentName?: string;
}

export function ToolPanel({ agentId, agentName }: ToolPanelProps) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [agentTools, setAgentTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ tool: string; result: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  // 加载所有工具
  useEffect(() => {
    fetch('/api/tools')
      .then(r => r.json())
      .then(d => {
        if (d.ok) setTools(d.tools);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 加载 Agent 绑定的工具
  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/tools`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setAgentTools(d.tool_names);
      })
      .catch(console.error);
  }, [agentId]);

  // 测试工具执行
  const handleTestTool = async (toolName: string) => {
    setTesting(toolName);
    setTestResult(null);
    
    try {
      // 根据工具类型生成测试参数
      const testParams = generateTestParams(toolName);
      
      const response = await fetch(`/api/tools/${toolName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testParams),
      });
      
      const data = await response.json();
      setTestResult({
        tool: toolName,
        result: data.ok ? data.result : `Error: ${data.detail || 'Unknown error'}`,
      });
    } catch (error) {
      setTestResult({
        tool: toolName,
        result: `Error: ${error}`,
      });
    } finally {
      setTesting(null);
    }
  };

  // 生成测试参数
  const generateTestParams = (toolName: string): Record<string, any> => {
    switch (toolName) {
      case 'web_search':
        return { query: 'AI agent framework', num_results: 3 };
      case 'code_execute':
        return { code: 'print("Hello from AiCumi!")\nprint(2 + 2)' };
      case 'file_read':
        return { file_path: '/tmp/test.txt' };
      case 'file_write':
        return { file_path: '/tmp/test.txt', content: 'Hello from AiCumi!' };
      case 'json_parse':
        return { data: '{"name": "AiCumi", "version": "1.0"}' };
      case 'datetime_utils':
        return { action: 'now' };
      default:
        return {};
    }
  };

  // 按类别分组工具
  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, ToolDefinition[]>);

  // 类别显示名称
  const categoryNames: Record<string, string> = {
    general: '通用',
    search: '搜索',
    code: '代码执行',
    file: '文件操作',
    data: '数据处理',
    utility: '实用工具',
    api: 'API 调用',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Wrench className="mr-2 h-4 w-4 animate-spin" />
        加载工具列表...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {agentName ? `${agentName} 的工具` : '工具箱'}
          </h3>
        </div>
        <span className="text-sm text-muted-foreground">
          {tools.length} 个工具可用
        </span>
      </div>

      {/* Agent 工具绑定提示 */}
      {agentId && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">已绑定工具：{agentTools.length} 个</p>
          <p className="text-muted-foreground">
            {agentTools.length > 0 
              ? agentTools.join(', ')
              : '未绑定任何工具'}
          </p>
        </div>
      )}

      {/* 工具分类列表 */}
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {categoryNames[category] || category}
          </h4>
          
          <div className="space-y-1">
            {categoryTools.map(tool => (
              <ToolCard
                key={tool.name}
                tool={tool}
                isBound={agentTools.includes(tool.name)}
                isExpanded={expandedTool === tool.name}
                isTesting={testing === tool.name}
                onToggle={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                onTest={() => handleTestTool(tool.name)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* 测试结果 */}
      {testResult && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">测试结果：{testResult.tool}</span>
          </div>
          <pre className="overflow-auto rounded bg-background p-3 text-xs">
            {testResult.result}
          </pre>
        </div>
      )}
    </div>
  );
}

// 工具卡片组件
interface ToolCardProps {
  tool: ToolDefinition;
  isBound: boolean;
  isExpanded: boolean;
  isTesting: boolean;
  onToggle: () => void;
  onTest: () => void;
}

function ToolCard({ tool, isBound, isExpanded, isTesting, onToggle, onTest }: ToolCardProps) {
  return (
    <div className={`rounded-lg border ${isBound ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
      {/* 工具头部 */}
      <div
        className="flex cursor-pointer items-center justify-between p-3"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{tool.name}</span>
              {isBound && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                  已绑定
                </span>
              )}
              {!tool.enabled && (
                <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                  已禁用
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 测试按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTest();
            }}
            disabled={isTesting || !tool.enabled}
            className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            {isTesting ? '测试中...' : '测试'}
          </button>
          
          {/* 展开/折叠 */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {/* 展开详情 */}
      {isExpanded && (
        <div className="border-t bg-muted/30 p-3">
          {/* 参数列表 */}
          <div className="mb-3">
            <h5 className="mb-2 text-sm font-medium">参数</h5>
            <div className="space-y-2">
              {tool.parameters.map(param => (
                <ParameterCard key={param.name} param={param} />
              ))}
              {tool.parameters.length === 0 && (
                <p className="text-sm text-muted-foreground">无参数</p>
              )}
            </div>
          </div>
          
          {/* 元数据 */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>版本: {tool.version}</span>
            <span>类别: {tool.category}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// 参数卡片组件
function ParameterCard({ param }: { param: ToolParameter }) {
  return (
    <div className="rounded-md bg-background p-2">
      <div className="flex items-center gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{param.name}</code>
        <span className="text-xs text-muted-foreground">{param.type}</span>
        {param.required && (
          <span className="text-xs text-destructive">*</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{param.description}</p>
      {param.enum && (
        <div className="mt-1 flex flex-wrap gap-1">
          {param.enum.map(value => (
            <span key={value} className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {value}
            </span>
          ))}
        </div>
      )}
      {param.default !== undefined && param.default !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          默认值: <code>{JSON.stringify(param.default)}</code>
        </p>
      )}
    </div>
  );
}
