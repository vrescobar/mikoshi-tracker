# Native Deployment (without container rebuild on every deploy)

## Problem

The current `docker-compose.yml` bakes source code into container images at
build time. Changing any source file requires rebuilding the image
(`pnpm install` + `next build` / `tsc`) before the new code runs. On the
Jetson AGX Xavier (ARM64, slow IO) this takes 5–10 minutes for the web and
2–3 minutes for the API — even when only one file changed.

## Target Architecture

Run the web and API as **systemd user services** directly on the host. Caddy
continues to reverse-proxy to `localhost:3001` (API) and `localhost:3000`
(web). The SQLite database and attachments live in a host directory
(`~/.local/share/mikoshi-tracker/`).

```
                ┌─────────────────────────────────────────┐
  internet ───► │  Caddy  :8080 (native or --network host) │
                └──────────┬──────────────────┬────────────┘
                           │ /api/*           │ /*
                    :3001 ─┤                  ├─ :3000
              systemd unit │                  │ systemd unit
         mikoshi-tracker-api                mikoshi-tracker-web
              (Fastify/Node)               (Next.js standalone/Node)
                     │
              ~/.local/share/
              mikoshi-tracker/
              mikoshi-tracker.db
              attachments/
```

### Why not containerise the web layer?

The Next.js standalone output (`server.js`) is a self-contained Node.js
process. It has no system dependencies, no shared state with the API, and no
reason to be isolated inside a container. On this host the only benefit of the
container was a reproducible build environment — which we can get more cheaply
by building on the host (where `node_modules` are already cached) and running
the result directly.

---

## Rebuild workflow after migration

### Web

```bash
pnpm --filter @mikoshi-tracker/web build   # ~60–90 s (node_modules cached)
systemctl --user restart mikoshi-tracker-web
```

### API

```bash
pnpm --filter @mikoshi-tracker/api build   # ~15–30 s
systemctl --user restart mikoshi-tracker-api
```

### Database migrations

```bash
pnpm exec prisma migrate deploy \
  --config prisma.config.ts \
  --schema prisma/schema.prisma
```

A convenience script `scripts/deploy.sh` wraps all three steps.

---

## Migration Plan

### Step 1 — Create the data directory

```bash
mkdir -p ~/.local/share/mikoshi-tracker/attachments
```

Copy existing data out of the `sqlite_data` Podman volume if needed:

```bash
podman run --rm -v mikoshi-tracker_sqlite_data:/data \
  -v ~/.local/share/mikoshi-tracker:/out busybox \
  cp -r /data/. /out/
```

### Step 2 — Environment file

Create `~/.config/mikoshi-tracker/env` (not committed — contains secrets):

```
NODE_ENV=production
BETTER_AUTH_SECRET=<secret>
APP_BASE_URL=http://localhost:8080
DATABASE_URL=file:/home/victor/.local/share/mikoshi-tracker/mikoshi-tracker.db
ATTACHMENTS_DIR=/home/victor/.local/share/mikoshi-tracker/attachments
MIKOSHI_TRACKER_ADMIN_API_KEY=<key>
CORS_ORIGIN=
```

### Step 3 — API systemd unit

File: `~/.config/systemd/user/mikoshi-tracker-api.service`
Template at: `scripts/self-host/mikoshi-tracker-api.service`

```ini
[Unit]
Description=MikoshiTracker API (Fastify)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/victor/projects/mikoshi-tracker
EnvironmentFile=%h/.config/mikoshi-tracker/env
Environment=PORT=3001
ExecStart=%h/.bun/bin/bun apps/api/src/server.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### Step 4 — Web systemd unit

File: `~/.config/systemd/user/mikoshi-tracker-web.service`
Template at: `scripts/self-host/mikoshi-tracker-web.service`

```ini
[Unit]
Description=MikoshiTracker Web (Next.js)
After=mikoshi-tracker-api.service

[Service]
Type=simple
WorkingDirectory=/home/victor/projects/mikoshi-tracker
EnvironmentFile=%h/.config/mikoshi-tracker/env
Environment=PORT=3000
Environment=API_INTERNAL_BASE_URL=http://127.0.0.1:3001
ExecStart=/usr/bin/node apps/web/.next/standalone/apps/web/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### Step 5 — Update Caddyfile

Change container hostnames to loopback addresses:

```diff
-  reverse_proxy api:3001
+  reverse_proxy 127.0.0.1:3001

-  reverse_proxy web:3000
+  reverse_proxy 127.0.0.1:3000
```

Caddy can be run natively (`caddy run --config scripts/self-host/Caddyfile`) or
kept as a container with `--network=host` so it can reach the host's
loopback. Native is simpler.

### Step 6 — First deploy

```bash
# Build
pnpm --filter @mikoshi-tracker/api build
pnpm --filter @mikoshi-tracker/web build

# Migrate DB
pnpm exec prisma migrate deploy \
  --config prisma.config.ts \
  --schema prisma/schema.prisma

# Install + enable units
systemctl --user daemon-reload
systemctl --user enable --now mikoshi-tracker-api mikoshi-tracker-web
```

### Step 7 — Stop old containers

```bash
podman-compose stop web api migrate
podman-compose rm -f web api migrate
```

Caddy can be stopped too once the native Caddy is running.

---

## Files to add/change

| Path | Action |
|---|---|
| `scripts/self-host/mikoshi-tracker-api.service` | New — systemd unit template |
| `scripts/self-host/mikoshi-tracker-web.service` | New — systemd unit template |
| `scripts/deploy.sh` | New — build + migrate + restart wrapper |
| `scripts/self-host/Caddyfile` | Edit — `api:3001` → `127.0.0.1:3001`, same for web |
| `docker-compose.yml` | Edit — remove `web` and `api` services; keep `proxy` + `migrate` as optional helpers |
| `Dockerfile.web` | Keep for reference / third-party deployments; not used locally |
| `Dockerfile.api` | Keep for reference / third-party deployments; not used locally |

---

## Rollback

If anything goes wrong, stop the systemd services and restart the containers:

```bash
systemctl --user stop mikoshi-tracker-api mikoshi-tracker-web
podman-compose up -d
```

The containers are untouched until explicitly removed.

---

## Related

- `docs/architecture/bun-migration.md` — replacing pnpm with Bun as package manager
- `docs/architecture/database-tests.md` — DB test audit (relevant for future ORM changes)
- `scripts/self-host/check.sh` — existing health-check script (will need updating)
