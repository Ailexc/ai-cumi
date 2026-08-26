// AiCumi — 文档中心
// 将后端 /api/docs/categories 返回的分类文档以卡片形式展示;
// 点击卡片进入详情页查看文档本体。
import { useEffect, useState } from 'react';
import {
  Rocket, Layers, MessageSquare, Wrench, Brain, ShieldCheck,
  Activity, GitBranch, Boxes, Database, Cpu, MonitorSmartphone,
  FileText, GraduationCap, Loader2, ChevronRight,
  type LucideIcon,
} from 'lucide-react';

interface DocMeta {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  order: number;
}

interface Category {
  name: string;
  docs: DocMeta[];
}

// meta.icon(字符串) → lucide 图标组件
const ICON_MAP: Record<string, LucideIcon> = {
  rocket: Rocket,
  layers: Layers,
  'message-square': MessageSquare,
  wrench: Wrench,
  brain: Brain,
  'shield-check': ShieldCheck,
  activity: Activity,
  'git-branch': GitBranch,
  boxes: Boxes,
  database: Database,
  cpu: Cpu,
  'monitor-smartphone': MonitorSmartphone,
  'file-text': FileText,
};

// 分类配色的柔和渐变(卡片头部装饰)
const CATEGORY_STYLE: Record<string, { gradient: string; chip: string }> = {
  入门: { gradient: 'from-indigo-500/15 to-sky-400/5', chip: 'bg-indigo-50 text-indigo-600' },
  架构: { gradient: 'from-violet-500/15 to-fuchsia-400/5', chip: 'bg-violet-50 text-violet-600' },
  核心能力: { gradient: 'from-emerald-500/15 to-teal-400/5', chip: 'bg-emerald-50 text-emerald-600' },
  进阶: { gradient: 'from-amber-500/15 to-orange-400/5', chip: 'bg-amber-50 text-amber-600' },
  工程与部署: { gradient: 'from-rose-500/15 to-pink-400/5', chip: 'bg-rose-50 text-rose-600' },
};

export function DocsCenterPage({ onOpen }: { onOpen: (docId: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/docs/categories')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setError(data.detail || '加载失败');
        } else {
          setCategories(data.categories || []);
        }
        setLoading(false);
      })
      .catch(() => !cancelled && (setError('网络错误'), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, []);

  const total = categories.reduce((n, c) => n + c.docs.length, 0);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      {/* 页头 */}
      <div className="shrink-0 border-b border-border bg-surface px-8 pb-6 pt-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">学习文档</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              面向学习：每个功能「是什么 · 怎么用 · 做了什么 · 业内对比与评分」，
              含 SVG 架构图与代码导读 · 共 {total} 篇
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 size={22} className="mr-2 animate-spin" /> 文档加载中…
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          categories.map((cat) => {
            const style = CATEGORY_STYLE[cat.name] || CATEGORY_STYLE['核心能力'];
            return (
              <section key={cat.name} className="mb-10">
                <div className="mb-4 flex items-center gap-2.5">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.chip}`}>
                    {cat.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{cat.docs.length} 篇</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {cat.docs.map((doc) => {
                    const Icon = ICON_MAP[doc.icon] || FileText;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => onOpen(doc.id)}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      >
                        {/* 顶部渐变装饰 */}
                        <div className={`h-1.5 bg-gradient-to-r ${style.gradient.split(' ')[0]} to-transparent`} />
                        <div className="flex flex-1 flex-col p-5">
                          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${style.gradient} text-foreground`}>
                            <Icon size={20} />
                          </div>
                          <h3 className="text-[15px] font-semibold text-foreground">
                            {doc.title}
                          </h3>
                          <p className="mt-1.5 line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                            {doc.description}
                          </p>
                          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                            阅读文档
                            <ChevronRight size={14} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
