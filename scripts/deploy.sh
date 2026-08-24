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

PIKAFISH_VERSION="2026-01-02"
PIKAFISH_SHA256="84257063905615919fb4ee6a70273a94843bb6ec04c45e3ac706098838bc1a49"
PIKAFISH_DIR="vendor/pikafish"
PIKAFISH_ARCHIVE="$PIKAFISH_DIR/Pikafish.${PIKAFISH_VERSION}.7z"
PIKAFISH_OFFICIAL_URL="https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-${PIKAFISH_VERSION}/Pikafish.${PIKAFISH_VERSION}.7z"
PIKAFISH_CUSTOM_URL="$(grep -E '^PIKAFISH_DOWNLOAD_URL=' .env | tail -n 1 | cut -d= -f2- || true)"
mkdir -p "$PIKAFISH_DIR"

archive_is_valid() {
  [[ -f "$PIKAFISH_ARCHIVE" ]] && echo "$PIKAFISH_SHA256  $PIKAFISH_ARCHIVE" | sha256sum -c - >/dev/null 2>&1
}

if ! archive_is_valid; then
  rm -f "$PIKAFISH_ARCHIVE" "$PIKAFISH_ARCHIVE.part"
  DOWNLOAD_URLS=()
  [[ -n "$PIKAFISH_CUSTOM_URL" ]] && DOWNLOAD_URLS+=("$PIKAFISH_CUSTOM_URL")
  DOWNLOAD_URLS+=("https://gh-proxy.com/$PIKAFISH_OFFICIAL_URL" "$PIKAFISH_OFFICIAL_URL")
  for url in "${DOWNLOAD_URLS[@]}"; do
    echo "正在下载 Pikafish：$url"
    rm -f "$PIKAFISH_ARCHIVE.part"
    if curl --fail --location --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 20 \
      --output "$PIKAFISH_ARCHIVE.part" "$url"; then
      if echo "$PIKAFISH_SHA256  $PIKAFISH_ARCHIVE.part" | sha256sum -c - >/dev/null 2>&1; then
        mv "$PIKAFISH_ARCHIVE.part" "$PIKAFISH_ARCHIVE"
        break
      fi
      echo "下载文件校验失败，正在尝试下一个地址。"
    fi
  done
fi

if ! archive_is_valid; then
  echo "Pikafish 下载失败。可在 .env 设置 PIKAFISH_DOWNLOAD_URL，或手动放置：$PIKAFISH_ARCHIVE"
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
  HEALTH_JSON="$(curl --fail --silent "http://127.0.0.1:${APP_PORT}/api/health" || true)"
  if [[ "$HEALTH_JSON" == *'"ok":true'* && "$HEALTH_JSON" == *'"pikafish":true'* ]]; then
    "${COMPOSE[@]}" ps
    echo "部署完成：http://服务器IP:${APP_PORT}（Pikafish 已启用）"
    exit 0
  fi
  sleep 2
done

echo "健康检查超时或 Pikafish 未启用，最近日志如下："
"${COMPOSE[@]}" logs --tail=120 koko postgres
exit 1
