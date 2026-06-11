# Native Deployment

## Architecture

MikoshiTracker deploys natively — no containers. Two systemd user units plus
a static build:

```
                ┌──────────────────────────────────────────┐
  internet ───► │  Caddy  :7080 (native binary)            │
                │  systemd unit: mikoshi-tracker-proxy     │
                └───────┬──────────────┬───────────────────┘
                        │ /api/*       │ /* (static + SPA fallback)
                        │ /health      │
                        │ /magic       ▼
                  :3001 ┤        apps/web/dist
           systemd unit │        (Vite build, plain files)
      mikoshi-tracker-api
           (Fastify/Bun)
                  │
           ~/.local/share/mikoshi-tracker/
           mikoshi-tracker.db (SQLite) + attachments/
```

- **API** runs directly from TypeScript source under Bun
  (`bun apps/api/src/server.ts`). There is no build/emit step — `tsc --noEmit`
  is the type gate, run by `scripts/deploy.sh` before restarting.
- **Web** is a static Vite SPA served by Caddy with `try_files` fallback to
  `index.html`. There is no web server process. The session-gated operator
  console lives inside the SPA at `/admin`.
- **Caddy** is the single public entrypoint. `/api/*`, `/health` and `/magic`
  (the magic-link landing used by the Mikoshi WhatsApp bot) proxy to the API;
  everything else is the SPA.

## Units and files

| Path | Purpose |
|---|---|
| `scripts/self-host/mikoshi-tracker-api.service` | API unit — `ExecStart=%h/.bun/bin/bun apps/api/src/server.ts` |
| `scripts/self-host/mikoshi-tracker-proxy.service` | Caddy unit — `caddy run --config scripts/self-host/Caddyfile` |
| `scripts/self-host/Caddyfile` | Live proxy config (routing + static SPA) |
| `scripts/install-services.sh` | First-time unit installation (also removes the retired web unit on upgrades) |
| `scripts/deploy.sh` | Typecheck API → build web → migrate → restart → health-check |
| `scripts/self-host/check.sh` | Health check: units active, /health, OpenAPI, SPA entrypoint |

Runtime configuration lives in `~/.config/mikoshi-tracker/env`
(see `docs/self-hosting.md`). Data lives in
`~/.local/share/mikoshi-tracker/` (SQLite file + attachments directory).

## Deploy workflow

```bash
git pull && bun install   # when dependencies changed
./scripts/deploy.sh       # typecheck api, build web, migrate, restart, verify
```

The web build is the only compile step (~10–15 s on the Jetson). API restarts
take a few seconds while Bun parses the TypeScript tree; deploy.sh retries the
health check for up to 30 s.

## History

This file once described the migration from a containerised deployment to
systemd units, and later from Node (Next.js standalone + tsc-emitted API) to
the current Bun + static-SPA shape. The container files were removed entirely
(commit history has the details), the Next.js web server was replaced by the
static Vite build, and the API dropped its build step when it moved to Bun.

## Related

- `docs/self-hosting.md` — install guide (prerequisites, env reference)
- `docs/self-hosting-upgrades.md` — backup-first upgrade + rollback
- `docs/PUBLIC-DEPLOYMENT.md` — TLS and public-internet hardening
- `scripts/self-host/check.sh` — health-check script
