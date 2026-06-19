# Public deployment & hardening

This guide covers the hardening required before exposing MikoshiTracker
**publicly on the internet**. It complements — does not replace —
`docs/self-hosting.md`.

> **Architecture note:** MikoshiTracker no longer ships a Caddy proxy — a single
> Bun process serves the API and the SPA on one port. TLS is therefore
> **external**: put a terminator you control in front of `PORT` (Tailscale
> Serve, or a Caddy/nginx instance). The Caddy/Let's-Encrypt specifics below are
> retained as one worked example of such a terminator, not a bundled component.

---

## Official deployment: Fly.io (the canonical production host)

Production runs on **Fly.io** at `https://mikoshi-tracker.fly.dev` (app
`mikoshi-tracker`, region `cdg`). The systemd self-host below is now the
**legacy / local-dev** path: locally you only run `bun dev`. The committed
artifacts (`fly.toml`, `Containerfile.fly`, `tailscale-entrypoint.sh`,
`verify-platform-reach.sh`) define the deployment; the fleet source-of-truth is
`mikoshi-stack/stack.yaml` (`tracker` is `managed: external`).

- **One always-on Bun process** serves the API + built SPA on `:7080`; Fly
  terminates TLS. DB (`/data/mikoshi-tracker.db`) and attachments
  (`/data/attachments`) live on a persistent volume.
- **Public env** (`BETTER_AUTH_URL`/`APP_BASE_URL`/`CORS_ORIGIN`) is the
  `fly.dev` URL — required so WhatsApp magic links open from phones.
- **Kernel reach (Tailscale userspace sidecar):** the tracker reaches the
  private Mikoshi Platform API (`jetson:7777`) over the tailnet via the
  tailscaled HTTP proxy. Set `TS_AUTHKEY` (ephemeral, tagged) via
  `fly secrets set`; without it the sidecar is skipped and only the outbound
  roster sync is lost (web, magic links, circle writes and the kernel's
  pull-backup all still work over public HTTPS).
- **Secrets** (never in git): `fly secrets set BETTER_AUTH_SECRET=…
  MIKOSHI_TRACKER_ADMIN_API_KEY=… TS_AUTHKEY=…`. The admin key MUST equal the
  bot's `mikoshi_tracker_admin_key` secret (the kernel signs circle writes /
  backup pulls with it).
- **Deploy:** `fly deploy --ha=false`. **Seed/restore data:** upload a
  VACUUM'd DB to `/data/_seed.sqlite` (`fly ssh sftp put`) and restart — the
  entrypoint installs it as the live DB on first boot.
- **Backups (two layers):** Fly volume daily snapshots (5 retained) **and** the
  kernel's pull-backup (`POST /api/platform/backup`, signed) stored on jetson at
  `data/ext-backups/tracker/`. Trigger manually with the kernel's
  `scripts/run-ext-backup-now.ts`.

---

## Hardening for public internet exposure

MikoshiTracker is multi-user with correct per-user data isolation, but the defaults
target localhost. Before putting it on the public internet:

### TLS (required)

Without TLS, session cookies and API bearer tokens travel in clear text.

1. Point a DNS record at the host.
2. In `~/.config/mikoshi-tracker/env`, set
   `MIKOSHI_TRACKER_SITE_ADDRESS=your-hostname` (no port).
3. Allow Caddy to bind the privileged ports 80/443. Rootless options:
   `sudo sysctl net.ipv4.ip_unprivileged_port_start=80`, or
   `sudo setcap cap_net_bind_service=+ep ~/.local/bin/caddy`, or a host
   firewall DNAT from 80/443 to high ports.
4. Restart the proxy: `systemctl --user restart mikoshi-tracker-proxy`.

Caddy then provisions and renews a Let's Encrypt certificate automatically and
enables HSTS. Certificates persist in Caddy's data directory
(`~/.local/share/caddy` by default).

### Built-in protections (already applied)

- **Rate limiting**: global 300 req/min per client IP, plus a stricter
  20 req/min on `/api/auth/*` to slow brute-force attacks
  (`apps/api/src/plugins/security.ts`). Tuned down automatically in the test
  environment.
- **Security headers**: `@fastify/helmet` sets CSP, `X-Content-Type-Options`,
  `X-Frame-Options`, etc. on the API; the Caddyfile adds equivalents for the
  web responses.
- The API trusts the `X-Forwarded-For` header from the Caddy proxy
  (`trustProxy`) so rate limiting keys on the real client IP. This is safe
  only because the API binds on localhost behind the proxy — keep it that way.

### SQLite durability

Keep the database file (`DATABASE_URL`) on local disk. SQLite in WAL mode can
corrupt on network/overlay filesystems (NFS).

### Operator checklist

- [ ] Generate a fresh `BETTER_AUTH_SECRET` (`openssl rand -hex 32`); never
      reuse the placeholder. Restrict the env file permissions
      (`chmod 600 ~/.config/mikoshi-tracker/env`).
- [ ] **Claim the admin account immediately.** The first user to register
      becomes admin. On a public instance, register your own account before
      announcing the URL, or an attacker could grab admin.
- [ ] After your account exists, disable open registration from the in-app
      admin settings (Admin → registration) if you do not want public sign-ups.
- [ ] Run `bun audit` and keep dependencies patched before exposure —
      see `docs/SECURITY-REVIEW.md` §7.
- [ ] Back up the SQLite database file regularly (it is a single file; see
      `docs/self-hosting-upgrades.md`).
- [ ] Keep `CORS_ORIGIN`/`APP_BASE_URL` set to your real hostname so CORS stays
      restricted to your own origin.
