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

## Android APK

Android 客户端通过 Capacitor 复用现有手机布局，需要 Java 21 与 Android SDK 36。首次或前端更新后执行：

```powershell
$env:JAVA_HOME="D:\environ\Java\jdk-21"
npm run build:apk
```

## GitHub 自动构建

推送任意分支到 GitHub 后，Actions 会并行构建 Windows 安装包和 Android APK。构建完成后，在仓库的 **Actions** 页面打开对应任务，在 **Artifacts** 区域下载：

- `koko-windows-<提交号>`：Windows `.exe` 安装包。
- `koko-android-<提交号>`：Android 调试版 `.apk`。

也可以在 Actions 页面手动运行 `Build desktop and Android apps`。构建产物保留 14 天；当前 APK 使用调试签名，正式公开发布前需要配置专用 Android 签名证书。

测试安装包生成在 `android/app/build/outputs/apk/debug/app-debug.apk`。首次打开后在设置中填写服务器地址，例如 `http://服务器IP:8080`；正式公开发布前应配置 HTTPS 和独立签名证书。

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

部署脚本会先下载并校验固定版本的 Pikafish、备份 PostgreSQL，再重新构建容器并等待健康检查。引擎文件会缓存在 `vendor/pikafish/`，不会提交到 Git；首次部署会多下载约 55 MB。脚本会优先尝试下载代理，再尝试 GitHub 官方地址，也可在 `.env` 通过 `PIKAFISH_DOWNLOAD_URL` 指定自己的镜像。部署完成信息中出现“Pikafish 已启用”才表示专业象棋引擎运行正常。不要执行 `docker compose down -v`，否则会删除数据库卷。完整说明参见 [DEPLOY.md](DEPLOY.md)。

## 目录结构

- `src/`：React 页面、组件、角色数据与 Zustand 状态
- `server/`：模型代理、账号、云存档和服务端钱包 API
- `server/pikafish.ts`：服务端中国象棋 UCI 引擎适配器
- `public/`：立绘等静态资源
- `scripts/`：服务器部署脚本
- `live2d-source/`：正式 Live2D 的后续制作资料

## 安全说明

- `.env`、模型 API Key、数据库密码和认证密钥不会提交到 Git。
- 自定义供应商密钥仅用于当前设备与模型代理请求。
- 公开部署应配置域名与 HTTPS；直接使用公网 IP + HTTP 只适合个人测试。
- 成人内容入口目前不向用户展示，相关内容仍受模型供应商政策与产品年龄边界约束。
- Pikafish 按 GPLv3 使用，镜像内保留其 `Copying.txt`、README 和 NNUE 许可证；项目未修改引擎源码。
