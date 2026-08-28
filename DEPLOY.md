# 可可 · 部署与模型配置指南

本项目采用**全栈动静一体化架构**：单个 Node/Express 容器即可同时托管 Web 网页（手机/电脑端）并为 Windows 桌面端提供统一的 `/api/*` 后端接口（包含大模型流式对话、Edge-TTS 神经网络语音、视觉看图感知与云存档）。

---

## 🐳 服务端 Docker 一键部署

### 1. 首次部署

在服务器上进入目录（如 `~/app/ai-companion`）：

```bash
cd ~/app/ai-companion

# 复制环境变量模板
cp .env.example .env

# 生成安全的随机密码与密钥并写入 .env
nano .env
```

`.env` 必备字段说明：
```env
# 端口设置（宿主机映射端口，默认 8080）
APP_PORT=8080

# 数据库密码与认证密钥（必须修改）
POSTGRES_PASSWORD=your_strong_postgres_password
AUTH_SECRET=your_32_byte_hex_secret

# 注册与找回密码邮件（QQ 邮箱 SMTP）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=2994172661@qq.com
SMTP_FROM=妹妹陪伴 <2994172661@qq.com>
SMTP_AUTH_CODE=your_qq_smtp_authorization_code
EMAIL_CODE_EXPIRES_MINUTES=10

# 生产环境允许代理的 AI 模型供应商域名（逗号分隔）
ALLOWED_PROVIDER_HOSTS=api.openai.com,api.deepseek.com,dashscope.aliyuncs.com,open.bigmodel.cn,api.siliconflow.cn
```

### QQ 邮箱验证码配置

注册账号和找回密码都需要邮箱验证码。登录 `2994172661@qq.com` 的网页版 QQ 邮箱，在“设置 → 账号”中开启 SMTP 服务并生成授权码，然后将授权码填入服务器 `.env` 的 `SMTP_AUTH_CODE`。这里必须填写 SMTP 授权码，不能填写 QQ 登录密码；`.env` 也不能提交到 Git。

邮件默认通过 `smtp.qq.com:465` 的 SSL 连接发送。修改邮件配置后必须重新创建应用容器：

```bash
./scripts/deploy.sh
```

部署后可在网页的“登录 → 注册新账号”中用尚未注册的真实邮箱发送测试验证码。若发送失败，检查应用日志：

```bash
docker compose logs --tail=100 koko
```

常见原因包括 QQ 邮箱未开启 SMTP、误填登录密码、授权码前后带有空格，或服务器无法访问 `smtp.qq.com:465`。验证码默认 10 分钟有效，同一邮箱 60 秒内不能重复发送，每小时最多发送 5 次。

### 2. 启动服务

```bash
# 构建并启动容器（PostgreSQL 数据库 + Web/API 全栈应用）
docker compose up -d --build
```

### 3. 验证部署状态

```bash
# 查看容器健康状态
docker compose ps

# 检查后端健康检查接口（返回 JSON 即表示完全正常）
curl http://127.0.0.1:8080/api/health
```

---

## 🌐 桌面端（Windows 客户端）如何连接云服务端

桌面客户端（Windows `.exe`）内置了智能 `apiUrl()` 地址解析器，支持两种直连方式：

### 方式 1：客户端界面直接填写（免打包 · 随时切换）
1. 启动桌面端 `可可陪伴.exe`；
2. 点击右上角 **`⚙ 设置`**，滑动到最下方；
3. 在 **「🌐 云端服务器后端地址」** 输入您的服务器公网地址：
   - 例如：`http://111.231.79.218:8080` 或已绑定域名的 `https://api.yourdomain.com`；
4. 点击 **保存**，桌面端即可全功能直连您的云端服务器！

### 方式 2：打包时固化默认服务器地址
在打包客户端前，在本地 `ai-companion/` 目录下创建 `.env.production`：
```env
VITE_SERVER_URL=http://你的服务器IP:8080
```
执行打包命令后，生成的 `.exe` 打开即默认连向该服务器：
```bash
npm run build:desktop
```

---

## 🤖 模型配置指南（主聊天模型 + 独立识图模型 + 巡航保活）

为了实现**极高性价比与顶级人设表达**，系统支持**双模型协同流水线（Two-Stage Vision Pipeline）**：

```
┌─────────────────┐       ┌───────────────────────────────┐       ┌───────────────────────────────┐
│  屏幕截图/摄像头  │ ────► │  Stage 1: 视觉模型 (多模态)    │ ────► │  Stage 2: 主模型 (纯文本高智商) │
│  (桌面或战况)   │       │  提取客观事实/代码行数/游戏局势 │       │  注入可可性格台词与情感回复   │
└─────────────────┘       └───────────────────────────────┘       └───────────────────────────────┘
```

### 1. 主聊天模型（Main Chat Model）推荐
负责日常对话、情感陪伴、日记与记忆生成：

| 供应商 | 推荐模型 | 接口地址 Base URL | 特点 |
| :--- | :--- | :--- | :--- |
| **DeepSeek** | `deepseek-chat` (DeepSeek-V3) | `https://api.deepseek.com` | 性价比极高、中文语感好、逻辑强大 |
| **DeepSeek** | `deepseek-reasoner` (DeepSeek-R1) | `https://api.deepseek.com` | 深度思考、推理缜密 |
| **阿里云百炼** | `qwen-plus` / `qwen-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 阿里云通义千问大模型系列 |
| **OpenAI** | `gpt-4o-mini` | `https://api.openai.com/v1` | 极速响应、稳定全面 |

---

### 2. 独立视觉看图模型（Vision Perception Model）推荐
专门负责看懂您屏幕上的代码编辑器、游戏界面（王者/LOL/原神等）或浏览器内容：

| 方案 | 供应商 | 接口地址 Base URL | 模型名 Model | 成本优势 |
| :--- | :--- | :--- | :--- | :--- |
| **方案 A（首选 · 免费）** | **智谱 AI (GLM)** | `https://open.bigmodel.cn/api/paas/v4` | `glm-4v-flash` | **完全免费调用！** 响应极快，非常适合自动巡航 |
| **方案 B（推荐 · 极便宜）** | **阿里云百炼 (通义)** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` | 百万 Token 仅需 1.5 元（带新用户数百万免费额度） |
| **方案 C（高性能）** | **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` | 国际通用多模态视觉模型 |

---

### 3. 如何在可可设置中配置双模型：

1. 打开可可「⚙️ 设置」面板；
2. **【基础模型】**：
   - 模式选择：`自定义接口`
   - 接口地址：填写您的主模型地址（如 `https://api.deepseek.com`）
   - API Key：填写您的主模型 Key
   - 模型名：`deepseek-chat`
3. **【👁️ 独立看图 / 视觉识别模型】**：
   - 勾选：`开启独立看图模型配置`
   - 视觉接口地址：`https://open.bigmodel.cn/api/paas/v4`（或阿里百炼）
   - 视觉 API Key：填写对应的 Key
   - 视觉模型名：`glm-4v-flash`（或 `qwen-vl-plus`）
4. 点击 **保存**！

---

### 4. 屏幕巡航与保活机制（Patrol & Keep-Alive）

在桌面悬浮桌宠模式中：
- **`👁️ 看屏幕` 按钮**：单次主动截屏分析当前活动（识别写代码、刷网页或打游戏，并由可可即时发起吐槽或关心）；
- **`⏱️ 巡航` 按钮**：开启后，可可将每隔 **20 秒** 在后台自动巡航看一次屏幕，发现写代码报错、游戏顺逆风或熬夜时**主动开口搭话**；
- **免打扰与休眠保活**：
  - 鼠标未悬停时，底栏控制按钮与抓手**全自动淡出隐藏**，保持桌面 100% 极简纯粹；
  - 鼠标移入可可身旁时，多功能胶囊底栏与打字/对讲按钮**即时平滑浮现**。

---

## 🔒 Nginx 反向代理配置（可选域名与 HTTPS）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 代理所有前端静态文件与 API 请求
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```
