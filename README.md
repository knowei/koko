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

发布正式下载版本时，推送以 `v` 开头的版本标签，例如：

```bash
git tag v0.2.2
git push github v0.2.2
```

标签构建通过后会自动创建 GitHub Release，并把 EXE 和 APK 作为永久发布附件上传。流程使用仓库自动提供的 `GITHUB_TOKEN`，无需配置 Personal Access Token。

正式 APK 生成在 `android/app/build/outputs/apk/release/app-release.apk`。首次打开后在设置中填写服务器地址，例如 `http://服务器IP:8080`；正式发布须为 GitHub Actions 配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 与 `ANDROID_KEY_PASSWORD` 四个仓库 Secret，确保后续更新使用同一签名证书。缺少任一项时，工作流会明确停止，不会误上传未签名的 APK。

本机首次打包前，将 `android/keystore.properties.example` 复制为 `android/keystore.properties`，并填写自己的签名证书信息。`android/app/koko-release.jks` 与 `android/keystore.properties` 必须妥善备份且不可提交；遗失后，Android 将无法把后续版本作为当前 App 的更新安装。

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

`.env` 中必须更换 `POSTGRES_PASSWORD` 和 `AUTH_SECRET`。注册与找回密码均使用邮箱验证码，因此还需在 QQ 邮箱中开启 SMTP，并把单独生成的授权码填入 `SMTP_AUTH_CODE`；不要填写或提交 QQ 登录密码。默认发件账号为 `2994172661@qq.com`。默认公开端口为 `8080`，可通过 `APP_PORT` 修改。

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
