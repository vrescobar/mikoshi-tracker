# @mikoshi-tracker/admin

Standalone operator "god-mode" SPA (Vite + React), separate from the user-facing
Next.js app. It consumes the versioned **`/api/v1`** surface by Bearer token and
is the first proof that the API supports multiple independent frontends.

## Auth

The only credential is the static `MIKOSHI_TRACKER_ADMIN_API_KEY` (the same key
the API's `/api/v1/admin/*` routes validate). It is **never** baked into the
bundle — the operator pastes it on the login screen and it lives in memory +
`sessionStorage` for the tab's lifetime only.

> Serve this app **only on a trusted origin** (LAN / VPN / behind Caddy auth).
> A future hardening could exchange the admin key for a short-lived session
> token; out of scope for the scaffold.

## Develop

```bash
# 1. Run the API (port 3001) with the admin key set:
MIKOSHI_TRACKER_ADMIN_API_KEY=dev-admin-key bun run --filter @mikoshi-tracker/api dev

# 2. Run the SPA (port 5174). Vite proxies /api → :3001 (same-origin, no CORS):
bun run --filter @mikoshi-tracker/admin dev
```

Open http://localhost:5174 and paste `dev-admin-key`.

## Production CORS

When served from its own origin (not via the dev proxy), add that origin to the
API's `CORS_ORIGIN` allowlist. The SPA authenticates by `Authorization` header,
not cookies, so credentials are not required — but the origin must still be
allow-listed for the preflight.

## What it shows

- **Dashboard** — system-wide counts (`/api/v1/admin/dashboard/metrics`).
- **Circles** — every circle with member counts and contest window
  (`/api/v1/admin/circles`), with a per-row **Snapshot** action that freezes the
  leaderboard (`/api/v1/admin/circles/snapshot/create`) — exercising a read and
  the new write end-to-end.

Types flow from `@mikoshi-tracker/contracts` (envelope + error codes), the same
single source of truth the API, MCP package, and web app share.
