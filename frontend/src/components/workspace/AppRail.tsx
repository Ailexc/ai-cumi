// AiCumi — 功能导航栏（AppRail）— 三段式布局最左侧
// 产品语义：像飞书/微信的左侧功能列——消息、成员管理（当前），
// 未来能力（知识问答/云文档/日历/任务…）直接在这里扩展，无需塞进聊天主页。
// 交互：点击功能项 → 右侧主区域切换对应视图（导航范式，非弹窗）。
// 设计：窄栏 64px，竖排图标 + 标签；active 高亮；disabled 项为未来扩展位。
import { MessageSquare, Users, BookOpen, FileText, CalendarDays, ListChecks, Settings, Radio, Cpu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RailItemId = 'chat' | 'members' | string;

interface RailItem {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** 未来扩展位（点击提示"规划中"） */
  planned?: boolean;
}

/** 主导航功能项（已启用） */
const RAIL_ITEMS: RailItem[] = [
  { id: 'chat', label: '消息', icon: MessageSquare },
  { id: 'members', label: '成员管理', icon: Users },
  { id: 'channels', label: '渠道', icon: Radio },
  { id: 'models', label: '模型', icon: Cpu },
];

/** 未来扩展位（底部灰显） */
const PLANNED_ITEMS: RailItem[] = [
  { id: 'knowledge', label: '知识问答', icon: BookOpen, planned: true },
  { id: 'docs', label: '云文档', icon: FileText, planned: true },
  { id: 'calendar', label: '日历', icon: CalendarDays, planned: true },
  { id: 'tasks', label: '任务', icon: ListChecks, planned: true },
  { id: 'settings', label: '设置', icon: Settings, planned: true },
];

interface AppRailProps {
  active: string;
  /** 点击启用项 */
  onSelect: (id: string) => void;
  /** 点击扩展位 */
  onPlanned?: (label: string) => void;
}

export function AppRail({ active, onSelect, onPlanned }: AppRailProps) {
  return (
    <div className="flex h-full w-[64px] shrink-0 flex-col items-center border-r border-border bg-surface py-3">
      {/* Logo */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
        A
      </div>

      {/* 功能项 */}
      <nav className="flex w-full flex-1 flex-col items-center gap-0.5 px-1.5" aria-label="功能导航">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          if (item.planned) {
            return (
              <button
                key={item.id}
                className="flex w-full flex-col items-center gap-1 rounded-lg py-2 text-muted-foreground opacity-60 transition-colors hover:bg-muted hover:opacity-100"
                aria-label={item.label}
                title={`${item.label}（规划中）`}
                onClick={() => onPlanned?.(item.label)}
              >
                <Icon size={20} />
                <span className="text-[10px] leading-none">{item.label}</span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={20} />
              <span className="text-[10px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 底部：未来扩展位（灰显） */}
      <div className="flex w-full flex-col items-center gap-0.5 border-t border-border px-1.5 pt-2">
        {PLANNED_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className="flex w-full flex-col items-center gap-1 rounded-lg py-2 text-muted-foreground opacity-50 transition-colors hover:bg-muted hover:opacity-100"
              aria-label={item.label}
              title={`${item.label}（规划中）`}
              onClick={() => onPlanned?.(item.label)}
            >
              <Icon size={18} />
              <span className="text-[10px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
