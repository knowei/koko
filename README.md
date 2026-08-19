# 可可 AI Companion

可可是一个面向 Web 与移动端布局的 AI 陪伴应用。项目包含沉浸式聊天、动态性格、长期记忆、约定与日记、现实天气、外出事件、签到积分、礼物商城、账号和云存档等功能。

## 技术栈

- React 18 + TypeScript + Vite
- Zustand 本地状态管理
- Node.js + Express 模型代理与业务 API
- PostgreSQL 账号、云存档、钱包和资产数据
- Docker Compose 生产部署

## 本地开发

需要 Node.js 22 和 PostgreSQL 16/17。

```bash
npm ci
cp .env.example .env
npm run dev
```

前端默认地址为 `http://localhost:5174`，API 默认地址为 `http://localhost:8787`。未配置默认模型密钥时可以进入回声模式；也可在设置中填写 OpenAI 兼容供应商。

提交修改前建议执行：

```bash
npm run typecheck
npm run build
```

## 服务器部署

服务器需要 Docker 26+ 与 Docker Compose 插件。首次部署：

```bash
git clone https://gitee.com/knowei/koko.git
cd koko
cp .env.example .env
nano .env
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

`.env` 中必须更换 `POSTGRES_PASSWORD` 和 `AUTH_SECRET`。默认公开端口为 `8080`，可通过 `APP_PORT` 修改。

以后更新不需要重新打包上传：

```bash
cd koko
git pull --ff-only
./scripts/deploy.sh
```

部署脚本会先备份 PostgreSQL，再重新构建容器并等待健康检查。不要执行 `docker compose down -v`，否则会删除数据库卷。完整说明参见 [DEPLOY.md](DEPLOY.md)。

## 目录结构

- `src/`：React 页面、组件、角色数据与 Zustand 状态
- `server/`：模型代理、账号、云存档和服务端钱包 API
- `public/`：立绘等静态资源
- `scripts/`：服务器部署脚本
- `live2d-source/`：正式 Live2D 的后续制作资料

## 安全说明

- `.env`、模型 API Key、数据库密码和认证密钥不会提交到 Git。
- 自定义供应商密钥仅用于当前设备与模型代理请求。
- 公开部署应配置域名与 HTTPS；直接使用公网 IP + HTTP 只适合个人测试。
- 成人内容入口目前不向用户展示，相关内容仍受模型供应商政策与产品年龄边界约束。
