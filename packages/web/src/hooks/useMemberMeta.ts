// AiCumi — 员工元数据（P：从后端 /api/members 拉取 role/avatar，解决新员工显示"助理"缺口）
// 数据源：member-profile.listMemberSummaries（role 从 AGENTS.md 标题提取）
// 用途：覆盖前端常量 AGENT_META（老员工有头像图，新员工走后端 role + 字母头像）
import { useEffect, useState } from 'react';

export interface MemberMeta {
  role: string;
  avatar?: string;
}

export function useMemberMeta(): Record<string, MemberMeta> {
  const [map, setMap] = useState<Record<string, MemberMeta>>({});
  useEffect(() => {
    let alive = true;
    fetch('/api/members')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok || alive === false) return;
        const m: Record<string, MemberMeta> = {};
        for (const x of d.members || []) {
          m[x.agentId] = { role: x.role || '', avatar: x.avatar };
        }
        if (alive) setMap(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return map;
}
