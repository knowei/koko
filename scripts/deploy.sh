#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "未找到 Docker Compose，请先安装 Docker Compose 插件。"
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "已创建 .env。请先修改 POSTGRES_PASSWORD 和 AUTH_SECRET，再重新执行此脚本。"
  exit 1
fi

DB_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n 1 | cut -d= -f2- || true)"
AUTH_SECRET_VALUE="$(grep -E '^AUTH_SECRET=' .env | tail -n 1 | cut -d= -f2- || true)"
if [[ ! "$DB_PASSWORD" =~ ^[A-Za-z0-9]{24,}$ ]]; then
  echo "POSTGRES_PASSWORD 必须是至少 24 位的字母和数字。"
  exit 1
fi
if [[ ${#AUTH_SECRET_VALUE} -lt 32 || "$AUTH_SECRET_VALUE" == *"请替换"* || "$AUTH_SECRET_VALUE" == *"change-this"* ]]; then
  echo "AUTH_SECRET 必须替换为至少 32 位的随机字符串。"
  exit 1
fi

mkdir -p backups
if "${COMPOSE[@]}" ps --status running postgres 2>/dev/null | grep -q postgres; then
  BACKUP_FILE="backups/koko-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo "正在备份数据库到 $BACKUP_FILE"
  "${COMPOSE[@]}" exec -T postgres pg_dump -U koko -d koko | gzip > "$BACKUP_FILE"
fi

echo "正在检查配置并构建新版本..."
"${COMPOSE[@]}" config >/dev/null
"${COMPOSE[@]}" pull postgres
"${COMPOSE[@]}" build --pull koko
"${COMPOSE[@]}" up -d --remove-orphans

APP_PORT="$(grep -E '^APP_PORT=' .env | tail -n 1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-8080}"
echo "等待服务通过健康检查..."
for _ in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null; then
    "${COMPOSE[@]}" ps
    echo "部署完成：http://服务器IP:${APP_PORT}"
    exit 0
  fi
  sleep 2
done

echo "健康检查超时，最近日志如下："
"${COMPOSE[@]}" logs --tail=120 koko postgres
exit 1
