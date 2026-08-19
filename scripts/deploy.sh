#!/bin/bash
# AiCumi 部署脚本 — OrbStack Docker 部署
# 用法: ./scripts/deploy.sh
# 部署后通过 web.aicumi.orb.local 访问

set -euo pipefail

LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 AiCumi 部署（OrbStack Docker）"
echo "  项目: $LOCAL_DIR"

cd "$LOCAL_DIR"

# 1. Docker Compose 构建 + 启动
echo "🔨 构建并启动容器..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "✅ 部署完成！"
echo ""
echo "  🌐 Web UI:      http://web.aicumi.orb.local"
echo "  📡 Chat Server: http://chat-server.aicumi.orb.local"
echo ""
echo "  查看日志: docker compose logs -f"
echo "  停止服务: docker compose down"
