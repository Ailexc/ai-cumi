// AiCumi — 技能市场（P2：技能编排）
// 展示所有可用技能，支持绑定/解绑到 agent
import { useEffect, useState, useMemo } from 'react';
import { Search, Check, Plus, Loader2, Package, Zap } from 'lucide-react';

interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  source: 'local' | 'clawhub';
  installed?: boolean;
}

interface SkillMarketProps {
  /** 当前选中的 agent ID */
  agentId: string;
  /** agent 名称 */
  agentName: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 绑定/解绑后的刷新回调 */
  onRefresh?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  '信息获取': '🔍',
  '创作': '🎨',
  '协作': '🤝',
  '管理': '⚙️',
};

export function SkillMarket({ agentId, agentName, onClose, onRefresh }: SkillMarketProps) {
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [boundSkills, setBoundSkills] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [bindingSkill, setBindingSkill] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 加载技能目录和已绑定技能
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [catalogRes, boundRes] = await Promise.all([
          fetch('/api/skills/catalog').then((r) => r.json()),
          fetch(`/api/members/${agentId}/skills/bound`).then((r) => r.json()),
        ]);
        if (catalogRes.ok) setCatalog(catalogRes.catalog);
        if (boundRes.ok) setBoundSkills(new Set(boundRes.skills));
      } catch {
        // ignore
      }
      setLoading(false);
    };
    load();
  }, [agentId]);

  // 分类列表
  const categories = useMemo(() => {
    const cats = new Set(catalog.map((s) => s.category));
    return Array.from(cats);
  }, [catalog]);

  // 过滤技能
  const filtered = useMemo(() => {
    let list = catalog;
    if (activeCategory) {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalog, query, activeCategory]);

  // 绑定/解绑技能
  const toggleSkill = async (skillId: string) => {
    const isBound = boundSkills.has(skillId);
    setBindingSkill(skillId);
    try {
      const endpoint = isBound ? 'unbind' : 'bind';
      const res = await fetch(`/api/members/${agentId}/skills/${skillId}/${endpoint}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setBoundSkills((prev) => {
          const next = new Set(prev);
          if (isBound) next.delete(skillId);
          else next.add(skillId);
          return next;
        });
        onRefresh?.();
      }
    } catch {
      // ignore
    }
    setBindingSkill(null);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 头部 */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary">
            <Package size={16} />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">技能市场</span>
            <span className="ml-2 text-xs text-muted-foreground">为 {agentName} 配置技能</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          返回
        </button>
      </div>

      {/* 搜索 + 分类 */}
      <div className="shrink-0 border-b border-border p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <Search size={16} className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索技能…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {CATEGORY_ICONS[cat] || '📦'} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 技能列表 */}
      <div className="aicumi-scroll flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {query ? '没有找到匹配的技能' : '暂无可用技能'}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((skill) => {
              const isBound = boundSkills.has(skill.id);
              const isBinding = bindingSkill === skill.id;
              return (
                <div
                  key={skill.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isBound
                      ? 'border-primary/30 bg-primary-50/50'
                      : 'border-border bg-surface hover:border-primary/20 hover:shadow-sm'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CATEGORY_ICONS[skill.category] || '📦'}</span>
                      <span className="text-sm font-semibold text-foreground">{skill.name}</span>
                    </div>
                    <button
                      onClick={() => toggleSkill(skill.id)}
                      disabled={isBinding}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                        isBound
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                      }`}
                    >
                      {isBinding ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : isBound ? (
                        <Check size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                    </button>
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {skill.category}
                    </span>
                    {skill.source === 'clawhub' && (
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] text-primary">
                        <Zap size={10} className="mr-0.5 inline" />
                        clawhub
                      </span>
                    )}
                    {isBound && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        已绑定
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}