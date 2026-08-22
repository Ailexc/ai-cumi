// AiCumi — 云空间文件预览入口
// 支持 Markdown / 代码 / PDF / 图片

import { useEffect, useState } from 'react';
import MarkdownPreview from './MarkdownPreview';
import CodePreview from './CodePreview';
import PDFPreview from './PDFPreview';
import ImagePreview from './ImagePreview';

interface PreviewPayload {
  type: 'text' | 'pdf' | 'image' | 'unsupported';
  mime_type?: string;
  content?: string;
  language?: string;
  page_count?: number;
  pages?: string[];
  data_url?: string;
  size?: number;
  reason?: string;
}

export function DocumentPreview({ path }: { path: string }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetch(`/api/files/${encodeURIComponent(path)}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<PreviewPayload>;
      })
      .then((data) => { if (!cancelled) { setPayload(data); } })
      .catch((e) => { if (!cancelled) setError(e.message || '预览失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载预览…</div>;
  if (error) return <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>;
  if (!payload) return null;

  const fileName = path.split('/').pop() || path;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium">{fileName}</span>
        <span className="text-xs text-muted-foreground">{payload.mime_type}</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {payload.type === 'text' && (
          payload.language === 'markdown' ? <MarkdownPreview content={payload.content || ''} /> : <CodePreview content={payload.content || ''} language={payload.language || 'text'} />
        )}
        {payload.type === 'pdf' && <PDFPreview pages={payload.pages || []} />}
        {payload.type === 'image' && payload.data_url && <ImagePreview dataUrl={payload.data_url} alt={fileName} />}
        {payload.type === 'unsupported' && (
          <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
            <p>暂不支持的文件格式</p>
            {payload.reason && <p className="mt-1 text-xs">{payload.reason}</p>}
            {payload.size && <p className="mt-1 text-xs">{Math.round(payload.size / 1024)} KB</p>}
          </div>
        )}
      </div>
    </div>
  );
}
