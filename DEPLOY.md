# Docker 部署

项目使用当前 Docker Compose 格式，并包含 PostgreSQL、应用健康检查和自动建表。签到、事件奖励、商城钱包及资产数据保存在 `koko-postgres-data` 命名卷中。

## 首次部署

把 `ai-companion` 整个目录上传到服务器，例如 `/opt/koko`：

```bash
cd /opt/koko
cp .env.example .env
nano .env
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

`.env` 中必须修改 `POSTGRES_PASSWORD` 和 `AUTH_SECRET`。推荐生成方式：

```bash
openssl rand -base64 24 | tr -dc 'A-Za-z0-9'
openssl rand -hex 32
```

脚本同时兼容 `docker compose` 和旧版 `docker-compose`，但推荐使用新版 Compose 插件。

访问 `http://服务器公网IP:8080`。服务器安全组和防火墙需要放行 TCP 8080。

不配置 `ANTHROPIC_API_KEY` 时，默认供应商使用回声模式；用户仍可在设置中填写自己的 DeepSeek/OpenAI Key。生产模式只允许 HTTPS 接口，并通过 `ALLOWED_PROVIDER_HOSTS` 限制可代理的供应商域名。追加域名示例：

```env
ALLOWED_PROVIDER_HOSTS=api.openai.com,api.deepseek.com,dashscope.aliyuncs.com,api.example.com
```

## 更新

上传新代码后仍执行同一个脚本：

```bash
cd /opt/koko
./scripts/deploy.sh
```

更新前脚本会把数据库备份到 `backups/koko-日期-时间.sql.gz`，随后检查配置、拉取 PostgreSQL 基础镜像、重建应用并等待健康检查。数据库命名卷不会因重建容器而删除；不要运行 `docker compose down -v`。

## 日志与状态

```bash
docker compose logs -f --tail=200
docker compose ps
curl http://127.0.0.1:8080/api/health
```

如果 `.env` 修改了 `APP_PORT`，请把示例中的 `8080` 换成对应端口。部署失败时脚本会自动显示应用与数据库的最近日志。

## 恢复数据库备份

先确认备份文件名，再执行：

```bash
gunzip -c backups/koko-20260819-120000.sql.gz | docker compose exec -T postgres psql -U koko -d koko
```

恢复会修改现有数据，应仅在确认需要回滚时执行。

## HTTPS

IP + HTTP 仅用于个人测试。HTTP 会暴露用户填写的 API Key 和聊天内容，不应直接提供给公众。正式上线应准备域名，并在容器前增加 Caddy、Traefik 或 Nginx 申请可信证书；不建议让用户忽略自签名证书警告。
