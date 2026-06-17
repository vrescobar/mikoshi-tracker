# Self-hosting / 自托管

MikoshiTracker is deployed natively: a **single** systemd user unit runs one
Bun process that serves both the API and the built Vite SPA on one port. There
is no ORM (data access is native `bun:sqlite` + zod), no reverse proxy, and no
container runtime. For public HTTPS, terminate TLS in front of the port
(Tailscale Serve, or a Caddy/nginx you already run) — see PUBLIC-DEPLOYMENT.md.

MikoshiTracker 采用原生部署：**单个** systemd 用户单元运行一个 Bun 进程，
同一端口同时提供 API 和已构建的 Vite SPA。没有 ORM（数据访问使用原生
`bun:sqlite` + zod）、没有反向代理、没有容器。公网 HTTPS 请在该端口前做 TLS 终结。

> **Note:** earlier releases used a Caddy reverse proxy + Prisma ORM. Both were
> removed; the deploy scripts (`scripts/`) are the source of truth. Some Chinese
> sections below may still mention the old Caddy topology.

## English

### Topology

- **One unit** (`mikoshi-tracker-api`) is the only service: a Bun process that
  serves auth, habit/entry/today/stats/OpenAPI under `/api/*` plus `/magic`,
  `/health`, and the static SPA (with index.html fallback) for everything else,
  on the configured `PORT` (default 7080). It runs from TypeScript source under
  Bun and applies SQL migrations from `apps/api/migrations` on boot.

By default the stack stores data in `~/.local/share/mikoshi-tracker/` and
serves the app at `http://localhost:7080`.

### Prerequisites

- Bun 1.3+ (`curl -fsSL https://bun.sh/install | bash`) — runs the API + builds the SPA
- Node.js 20+ in `PATH` — dev tooling (vitest, playwright)
- A systemd user session (`loginctl enable-linger $USER` for boot-time start)

### First install

```bash
git clone https://github.com/vrescobar/mikoshi-tracker.git
cd mikoshi-tracker
bun install

# Install + enable the systemd user units
./scripts/install-services.sh
```

The install script prints the runtime configuration it expects at
`~/.config/mikoshi-tracker/env`. Create that file with at least:

```bash
NODE_ENV=production
PORT=7080                             # Bun serves API + SPA on this port
BETTER_AUTH_SECRET=<secret>          # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:7080
APP_BASE_URL=http://localhost:7080
CORS_ORIGIN=http://localhost:7080
DATABASE_URL=file:$HOME/.local/share/mikoshi-tracker/mikoshi-tracker.db
ATTACHMENTS_DIR=$HOME/.local/share/mikoshi-tracker/attachments
MIKOSHI_TRACKER_ADMIN_API_KEY=<key>  # openssl rand -hex 32, enables /api/admin/*
```

Then build, migrate and start everything:

```bash
./scripts/deploy.sh
```

If the health check at the end passes, open `${APP_BASE_URL}/` to register.

### After installation

- **First user is admin**: the first account registered is automatically promoted to admin and can toggle whether new user registration is allowed. On a public instance, register your own account immediately — before announcing the URL — so an attacker cannot claim the admin role, then disable open registration from the admin settings if you do not want public sign-ups. See [Public deployment & hardening](./PUBLIC-DEPLOYMENT.md).
- **API access**: each user can generate a personal API token from the API Access page. Tokens are hashed with SHA-256 at rest — the plaintext is shown only once on creation.
- **Interactive API docs**: visit `${APP_BASE_URL}/api/docs` for the full OpenAPI documentation, or fetch the spec at `${APP_BASE_URL}/api/openapi.json`.

### Locale behavior for operators

The shipped product uses one shared locale model for the main app and docs surfaces:

- On first visit, the app chooses between Chinese and English from the browser language.
- Unsupported browser locales fall back to English.
- The user can switch language from the auth page and from the signed-in shell.
- Once a user switches language manually, the browser remembers that preference with the `mikoshi-tracker-locale` cookie.
- The main app keeps the same route structure instead of using `/zh` or `/en` route prefixes.

### What the health check validates

`./scripts/self-host/check.sh` verifies:

- the systemd user units are active
- `${APP_BASE_URL}/health` returns `{ "ok": true }`
- `${APP_BASE_URL}/api/openapi.json` is reachable
- the web entrypoint returns HTML through the public proxy

### Troubleshooting

#### `BETTER_AUTH_SECRET is required`

Your `~/.config/mikoshi-tracker/env` is missing `BETTER_AUTH_SECRET`, or it is too short. Generate a new one with `openssl rand -hex 32`.

#### `APP_BASE_URL` does not match where you are browsing

Set `APP_BASE_URL` to the actual public URL operators will use, including the port when not using default HTTP ports.

#### A unit fails to start

```bash
systemctl --user status mikoshi-tracker-api mikoshi-tracker-proxy
journalctl --user -u mikoshi-tracker-api -n 50
```

#### `/health` works but `/api/*` does not

This indicates the proxy is up but API routing is wrong. Re-check `scripts/self-host/Caddyfile`, and rerun `./scripts/self-host/check.sh`.


## 中文

### 拓扑

- **Caddy 代理**（`mikoshi-tracker-proxy`）是唯一对外发布的服务，将 `/api/*`、
  `/health` 和 `/magic` 转发到 API，其余请求以静态文件方式提供 Web 应用
  （Vite 构建，SPA 回退）。
- **API**（`mikoshi-tracker-api`）在 `127.0.0.1:3001` 提供认证、习惯/条目、
  today、统计与 OpenAPI 接口，由 Bun 直接运行 TypeScript 源码。

默认情况下数据保存在 `~/.local/share/mikoshi-tracker/`，应用地址为
`http://localhost:7080`。

### 前置条件

- Bun 1.3+（`curl -fsSL https://bun.sh/install | bash`）
- `PATH` 中有 Node.js 20+
- `~/.local/bin/caddy` 处有 Caddy 二进制
  （从 https://github.com/caddyserver/caddy/releases 下载）
- systemd 用户会话（开机自启需 `loginctl enable-linger $USER`）

### 首次安装

```bash
git clone https://github.com/vrescobar/mikoshi-tracker.git
cd mikoshi-tracker
bun install

# 安装并启用 systemd 用户单元
./scripts/install-services.sh
```

安装脚本会打印它期望的运行时配置文件 `~/.config/mikoshi-tracker/env`，至少包含：

```bash
NODE_ENV=production
BETTER_AUTH_SECRET=<secret>          # openssl rand -hex 32
APP_BASE_URL=http://localhost:7080
DATABASE_URL=file:$HOME/.local/share/mikoshi-tracker/mikoshi-tracker.db
ATTACHMENTS_DIR=$HOME/.local/share/mikoshi-tracker/attachments
MIKOSHI_TRACKER_ADMIN_API_KEY=<key>  # openssl rand -hex 32，启用 /api/admin/*
MIKOSHI_TRACKER_SITE_ADDRESS=:7080   # Caddy 绑定的端口
```

然后构建、迁移并启动全部服务：

```bash
./scripts/deploy.sh
```

末尾的健康检查通过后，打开 `${APP_BASE_URL}/` 注册账号。

### 安装之后

- **首个用户即管理员**：首个注册的账号会自动成为管理员，可以开关是否允许新用户注册。在公网实例上，请在公布 URL 之前立即注册你自己的账号，以免攻击者抢占管理员角色；如果不希望公开注册，注册后请在管理员设置中关闭它。参见 [Public deployment & hardening](./PUBLIC-DEPLOYMENT.md)。
- **API 访问**：每个用户可以在 API Access 页面生成个人 API Token。Token 以 SHA-256 哈希存储，明文仅在创建时展示一次。
- **交互式 API 文档**：访问 `${APP_BASE_URL}/api/docs` 查看完整的 OpenAPI 文档，或通过 `${APP_BASE_URL}/api/openapi.json` 获取规范文件。

### 面向 operator 的语言行为说明

当前已发布产品在主应用和文档相关页面上使用同一套语言行为：

- 首次访问时，应用会根据浏览器语言在中文和英文之间选择默认语言。
- 如果浏览器语言不受支持，会回退到英文。
- 用户可以在登录页和登录后的应用 shell 中手动切换语言。
- 一旦用户手动切换语言，浏览器会通过 `mikoshi-tracker-locale` cookie 记住该偏好。
- 主应用保持同一套路由结构，不使用 `/zh` 或 `/en` 这样的语言前缀路由。

### 健康检查会验证什么

`./scripts/self-host/check.sh` 会验证：

- systemd 用户单元处于 active 状态
- `${APP_BASE_URL}/health` 返回 `{ "ok": true }`
- `${APP_BASE_URL}/api/openapi.json` 可访问
- web 入口能通过公网代理正常返回 HTML

### 故障排查

#### `BETTER_AUTH_SECRET is required`

说明你的 `~/.config/mikoshi-tracker/env` 缺少 `BETTER_AUTH_SECRET`，或者它太短。请重新用 `openssl rand -hex 32` 生成一个。

#### 某个单元启动失败

```bash
systemctl --user status mikoshi-tracker-api mikoshi-tracker-proxy
journalctl --user -u mikoshi-tracker-api -n 50
```

#### `/health` 正常，但 `/api/*` 不正常

这通常意味着代理已经起来了，但 API 路由有问题。请重新检查 `scripts/self-host/Caddyfile`，然后再次运行 `./scripts/self-host/check.sh`。

