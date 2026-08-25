"""
清理长期记忆中被污染的条目（工具原始 JSON / 错误信息 / 调用失败标记）。

在 aicumi-chat-server-1 容器内运行（脚本拷入容器后执行）：
    docker cp scripts/clean_memory_noise.py aicumi-chat-server-1:/tmp/ && \
    docker exec aicumi-chat-server-1 python /tmp/clean_memory_noise.py

判定逻辑复用 agent_manager._is_memory_noise（与线上写入守卫同一套规则）。
"""

import sys

sys.path.insert(0, "/app")

from app.memory import vector_memory, init_memory  # noqa: E402
from app.agents.agent_manager import _is_memory_noise  # noqa: E402


def main() -> None:
    global vector_memory
    if vector_memory is None:
        # 独立运行时需手动初始化（与线上同一持久化目录）
        vector_memory = init_memory(persist_dir="data/memory")

    # 已知 agent 列表（可按需扩展）
    agents = ["keling", "xiaoyan", "xiaoma"]
    removed = 0
    kept = 0
    for agent_id in agents:
        entries = vector_memory.get_by_agent(agent_id, limit=500)
        for e in entries:
            if _is_memory_noise(e.content):
                vector_memory.delete(e.id)
                removed += 1
                print(f"🗑️  {agent_id}: {e.content[:60]!r}")
            else:
                kept += 1

    stats = vector_memory.stats()
    print(f"\n✅ 完成：删除 {removed} 条噪声记忆，保留 {kept} 条")
    print(f"   chromadb_count={stats['chromadb_count']}, "
          f"in_memory_count={stats['in_memory_count']}")


if __name__ == "__main__":
    main()
