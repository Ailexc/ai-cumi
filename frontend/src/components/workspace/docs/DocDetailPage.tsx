// AiCumi — 文档详情页
// 学习文档以独立 HTML 文件存储, 此处用 Shadow DOM 隔离渲染文档自身的样式,
// 并将文档内手写的目录(<nav class="doc-toc">)提取到侧栏:
//   1. 滚动时目录跟随高亮(IntersectionObserver 监听各 section 进入视口)
//   2. 点击目录平滑滚动到文档对应位置
import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, ListTree, Loader2 } from 'lucide-react';

interface TocItem {
  href: string;   // '#anchor'
  text: string;
  level: number;  // 2/3/4 对应 h2/h3/h4
}

interface DocMeta {
  id: string;
  title: string;
  category: string;
  description: string;
}

export function DocDetailPage({ docId, onBack }: { docId: string; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const activeRef = useRef(active);
  activeRef.current = active;

  // Effect 1: 仅负责拉取文档数据
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setRawHtml(null);
    setToc([]);
    setActive('');
    setError('');

    fetch(`/api/docs/${docId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok || !data.doc) {
          setError(data.detail || '文档加载失败');
          return;
        }
        const { html, ...rest } = data.doc;
        setMeta(rest as DocMeta);
        setRawHtml(html);
      })
      .catch(() => !cancelled && setError('网络错误, 请稍后重试'));
    return () => { cancelled = true; };
  }, [docId]);

  // Effect 2: meta 就绪后注入 Shadow DOM + 提取目录 + 滚动监听
  useEffect(() => {
    if (!meta || !rawHtml) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    if (host.shadowRoot) host.shadowRoot.replaceChildren();
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadowRef.current = root;

    // 提取全部 <style> 与 <body> 内容
    const styleTags = (rawHtml.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []) as string[];
    const styles = styleTags.map((s) => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : rawHtml;
    root.innerHTML = `<style>${styles}</style>${body}`;

    // 提取手写目录: nav.doc-toc 下的锚点链接, 然后隐藏它(侧栏已有导航)
    const tocNav = root.querySelector('nav.doc-toc') as HTMLElement | null;
    const links = tocNav ? tocNav.querySelectorAll('a[href^="#"]') : [];
    const items: TocItem[] = Array.from(links).map((a) => {
      const m = /doc-toc-h(\d)/.exec(a.className || '');
      return {
        href: a.getAttribute('href') || '',
        text: (a.textContent || '').trim(),
        level: m ? Number(m[1]) : 2,
      };
    });
    setToc(items.filter((i) => i.href && i.text));
    if (tocNav) tocNav.style.display = 'none';

    // 滚动跟随高亮: 监听每个目标 section 进入视口顶部区域
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
          );
          setActive('#' + (top.target as HTMLElement).id);
        }
      },
      { rootMargin: '-15% 0px -78% 0px', threshold: 0 }
    );
    items.forEach((i) => {
      const el = root.querySelector(i.href);
      if (el) observer.observe(el);
    });

    return () => { observer.disconnect(); };
  }, [meta, rawHtml]);

  // 点击目录 → 平滑滚动
  const jump = useCallback((href: string) => {
    const root = shadowRef.current;
    if (!root) return;
    const el = root.querySelector(href);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(href);
    }
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* 顶栏: 返回 + 标题 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="返回文档中心"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        {meta ? (
          <>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary">
              {meta.category}
            </span>
            <h1 className="truncate text-sm font-semibold text-foreground">{meta.title}</h1>
          </>
        ) : (
          <h1 className="text-sm font-semibold text-foreground">加载中…</h1>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧目录 */}
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
          <div className="flex items-center gap-2 px-4 pb-2 pt-4 text-xs font-medium text-muted-foreground">
            <ListTree size={14} />
            本文目录
          </div>
          {toc.length === 0 && !error && (
            <p className="px-4 text-xs text-muted-foreground/70">加载中…</p>
          )}
          <nav className="flex flex-col gap-0.5 px-2 pb-4">
            {toc.map((item) => (
              <button
                key={item.href}
                onClick={() => jump(item.href)}
                style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
                className={`rounded-md py-1.5 text-left text-[13px] leading-snug transition-colors ${
                  active === item.href
                    ? 'bg-primary-50 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>

        {/* 右侧文档内容(Shadow DOM 隔离渲染) */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-background">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : !meta ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 size={20} className="mr-2 animate-spin" />
              文档加载中…
            </div>
          ) : (
            <div ref={hostRef} className="doc-shadow-host" />
          )}
        </div>
      </div>
    </div>
  );
}
