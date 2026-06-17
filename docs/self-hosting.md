# Self-hosting

MikoshiTracker is deployed natively: a **single** systemd user unit runs one
Bun process that serves both the API and the built Vite SPA on one port. There
is no ORM (data access is native `bun:sqlite` + zod), no reverse proxy, and no
container runtime. For public HTTPS, terminate TLS in front of the port
(Tailscale Serve, or a Caddy/nginx you already run) — see PUBLIC-DEPLOYMENT.md.

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

#### The unit fails to start

```bash
systemctl --user status mikoshi-tracker-api
journalctl --user -u mikoshi-tracker-api -n 50
```

#### `/health` works but the SPA or `/api/*` does not

The single Bun process serves both. If `/api/*` 404s, the API failed to register routes (check the logs above). If the SPA is missing, the Vite build was not produced — run `bun run --filter @mikoshi-tracker/web build` (or `./scripts/deploy.sh`) so `apps/web/dist` exists, then rerun `./scripts/self-host/check.sh`.
