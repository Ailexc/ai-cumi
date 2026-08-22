// AiCumi — 本地云空间页面
// 文件管理 + 高质量预览（只读）

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder, File, Upload, Trash2, RefreshCw, Plus,
  ChevronRight, ChevronDown, Search, X, FileText,
  Image as ImageIcon, FileCode, AlertCircle,
} from 'lucide-react';
import { DocumentPreview } from './DocumentPreview';

interface FsNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mime_type?: string;
  modified_at?: string;
  children?: FsNode[];
}

export function CloudSpacePage() {
  const [tree, setTree] = useState<FsNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [search, setSearch] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolder, setCurrentFolder] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const fetchTree = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/files/tree');
      const data = await res.json();
      setTree(data.tree || null);
    } catch (e) {
      setError('加载文件树失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTree(); }, []);

  const filteredTree = useMemo(() => {
    if (!tree || !search.trim()) return tree;
    const term = search.toLowerCase();
    const walk = (node: FsNode): FsNode | null => {
      const match = node.name.toLowerCase().includes(term);
      const children = (node.children || []).map(walk).filter(Boolean) as FsNode[];
      if (match || children.length) {
        return { ...node, children: node.type === 'directory' ? children : undefined };
      }
      return null;
    };
    return walk(tree);
  }, [tree, search]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('file', f));
    if (currentFolder) form.append('path', currentFolder);
    try {
      await fetch('/api/files/upload', { method: 'POST', body: form });
      await fetchTree();
    } catch {
      setError('上传失败');
    } finally {
      setLoading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const rel = currentFolder ? `${currentFolder}/${newFolderName}` : newFolderName;
    try {
      await fetch('/api/files/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: rel }),
      });
      setNewFolderName(''); setShowNewFolder(false);
      await fetchTree();
      setExpanded((prev) => new Set(prev).add(currentFolder));
    } catch {
      setError('创建文件夹失败');
    }
  };

  const handleDelete = async (node: FsNode) => {
    if (!confirm(`确定删除 ${node.name}？`)) return;
    try {
      await fetch(`/api/files/${encodeURIComponent(node.path)}`, { method: 'DELETE' });
      if (selectedPath === node.path) setSelectedPath('');
      await fetchTree();
    } catch {
      setError('删除失败');
    }
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const fileIcon = (node: FsNode) => {
    if (node.type === 'directory') return <Folder size={16} className="text-amber-500" />;
    const mime = node.mime_type || '';
    if (mime.startsWith('image/')) return <ImageIcon size={16} className="text-purple-500" />;
    const ext = node.name.split('.').pop()?.toLowerCase();
    if (['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'html', 'css', 'sql', 'sh'].includes(ext || '')) {
      return <FileCode size={16} className="text-cyan-500" />;
    }
    if (ext === 'pdf') return <FileText size={16} className="text-red-500" />;
    return <File size={16} className="text-slate-500" />;
  };

  const renderNode = (node: FsNode, depth = 0) => {
    const isExpanded = expanded.has(node.path);
    const isSelected = selectedPath === node.path;
    const paddingLeft = 8 + depth * 16;

    return (
      <div key={node.path}>
        <div
          className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm ${
            isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
          }`}
          style={{ paddingLeft }}
          onClick={() => {
            if (node.type === 'directory') {
              toggleExpand(node.path);
              setCurrentFolder(node.path);
            } else {
              setSelectedPath(node.path);
              setCurrentFolder(node.path.split('/').slice(0, -1).join('/'));
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {node.type === 'directory' ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }}
                className="text-muted-foreground"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="w-[14px]" />}
            {fileIcon(node)}
            <span className="truncate" title={node.name}>{node.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(node); }}
              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {node.type === 'directory' && isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Folder size={18} className="text-primary" />
          <h1 className="text-base font-semibold">云空间</h1>
          <span className="text-xs text-muted-foreground">本地文件 · 只读预览</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文件..."
              className="h-8 w-40 rounded-lg border border-border bg-background pl-7 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs hover:bg-muted"
          >
            <Plus size={14} /> 新建
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs text-primary-foreground hover:opacity-90"
          >
            <Upload size={14} /> 上传
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button onClick={fetchTree} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted" title="刷新">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {showNewFolder && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="文件夹名称"
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <button onClick={handleCreateFolder} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">确定</button>
          <button onClick={() => setShowNewFolder(false)} className="rounded-md border border-border px-3 py-1.5 text-xs">取消</button>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-72 flex-col border-r border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>文件树</span>
            {loading && <RefreshCw size={12} className="animate-spin" />}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredTree ? renderNode(filteredTree) : (
              <div className="p-4 text-center text-xs text-muted-foreground">暂无文件</div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          {selectedPath ? (
            <DocumentPreview path={selectedPath} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Folder size={48} className="mb-3 opacity-20" />
              <p className="text-sm">选择左侧文件开始预览</p>
              <p className="mt-1 text-xs opacity-60">支持 Markdown / PDF / 代码 / 图片</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
