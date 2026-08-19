// AiCumi — 头像组件（多形态：照片 / 群 / 文件夹 / 字母），忠实移植设计稿
import { Users2, FolderOpen } from 'lucide-react';
import { statusColor } from './agentMeta';

export type AvatarKind = 'photo' | 'users' | 'folder' | 'letter';

interface AgentAvatarProps {
  /** 头像 URL（photo 形态） */
  avatar?: string;
  /** 头像形态 */
  kind?: AvatarKind;
  /** 字母形态显示的字符 */
  letter?: string;
  /** 语义化名称（alt / title） */
  title?: string;
  /** 状态点颜色（传 CSS 颜色值） */
  statusColorValue?: string;
  size?: number;
  className?: string;
}

export function AgentAvatar({
  avatar,
  kind = avatar ? 'photo' : 'letter',
  letter,
  title = 'AiCumi',
  statusColorValue,
  size = 36,
  className = '',
}: AgentAvatarProps) {
  const round = { width: size, height: size } as const;

  const inner = (() => {
    if (kind === 'photo' && avatar) {
      return <img src={avatar} alt={title} className="rounded-full object-cover bg-muted" style={round} />;
    }
    if (kind === 'users') {
      return (
        <div className="flex items-center justify-center rounded-full bg-primary-100 text-primary" style={round}>
          <Users2 size={Math.round(size * 0.45)} />
        </div>
      );
    }
    if (kind === 'folder') {
      return (
        <div className="flex items-center justify-center rounded-full bg-muted text-muted-foreground" style={round}>
          <FolderOpen size={Math.round(size * 0.45)} />
        </div>
      );
    }
    return (
      <div
        className="flex items-center justify-center rounded-full text-sm font-medium"
        style={{ ...round, background: 'var(--aicumi-primary-100)', color: 'var(--aicumi-primary)' }}
      >
        {letter || title.slice(0, 1)}
      </div>
    );
  })();

  return (
    <div className={`relative shrink-0 ${className}`}>
      {inner}
      {statusColorValue && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface"
          style={{ background: statusColorValue }}
        />
      )}
    </div>
  );
}

export { statusColor };
