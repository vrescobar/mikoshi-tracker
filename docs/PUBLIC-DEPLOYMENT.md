# Public deployment & Podman

This guide covers two things the base `docs/self-hosting.md` does not:

1. Running the stack with **Podman** (rootless) instead of Docker.
2. Hardening required before exposing MikoshiTracker **publicly on the internet**.

It complements — does not replace — `docs/self-hosting.md`.

---

## 1. Running with Podman (rootless)

The container files are engine-agnostic: no `host.docker.internal`, no Docker
socket mounts, no privileged mode. They were verified with `podman` 5.x and
`podman-compose` 1.4.x on rootless `aarch64` (ARM64). Both `node:22-bookworm-slim`
and `caddy:2.10-alpine` publish multi-arch manifests, so no `--platform` flag is
needed.

### Prerequisites

- `podman` 4.4+ and `podman-compose` 1.1+ (`podman --version`, `podman-compose --version`).
- Rootless mode enabled: `podman info --format '{{.Host.Security.Rootless}}'` → `true`.
- A subuid/subgid range for your user: `grep "$USER" /etc/subuid /etc/subgid`.

### First install

```bash
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET (openssl rand -hex 32) and APP_BASE_URL
podman-compose build api web
podman-compose run --rm migrate      # creates the volume, db file, runs migrations
podman-compose up -d
./scripts/self-host/check.sh          # auto-detects podman-compose
```

Open `${APP_BASE_URL}/` and register. The `self-host` scripts detect the
container engine automatically (Docker preferred, Podman fallback).

### Notes specific to rootless Podman

- **Ports**: the proxy publishes host port `8080` (or `MIKOSHI_TRACKER_PUBLIC_PORT`),
  which is >1024 and binds fine rootless. Publishing 80/443 for public TLS
  needs `sysctl net.ipv4.ip_unprivileged_port_start=80`, or a host firewall
  DNAT, or running the proxy under a small rootful exception.
- **SQLite volume ownership**: the containers run as the non-root `node` user
  (uid 1000). `Dockerfile.api` `chown`s `/data` to `node` before dropping
  privileges, so the named volume `sqlite_data` inherits writable ownership on
  first creation. The `migrate`, `api` and `migrate` services all use the same
  image/user, so the mapping is consistent.
- **SQLite durability**: keep the `sqlite_data` volume on local disk. SQLite in
  WAL mode can corrupt on network/overlay filesystems (NFS).
- **Production runtime**: for an always-on box, consider migrating from
  `podman-compose` to native **Podman Quadlet** units (`.container`/`.kube`,
  systemd-managed since Podman 4.4). Quadlet gives boot-time start, `Restart=`
  policies and journald logging with no extra daemon.

---

## 2. Hardening for public internet exposure

MikoshiTracker is multi-user with correct per-user data isolation, but the defaults
target localhost. Before putting it on the public internet:

### TLS (required)

Without TLS, session cookies and API bearer tokens travel in clear text.

1. Point a DNS record at the host.
2. In `.env`, set `MIKOSHI_TRACKER_SITE_ADDRESS=your-hostname`.
3. In `docker-compose.yml`, publish port `443` and uncomment the proxy
   `environment:` block so the variable reaches Caddy.
4. Re-create the proxy: `podman-compose up -d proxy`.

Caddy then provisions and renews a Let's Encrypt certificate automatically and
enables HSTS. The `caddy_data` volume persists the certificates.

### Built-in protections (already applied)

- **Rate limiting**: global 300 req/min per client IP, plus a stricter
  20 req/min on `/api/auth/*` to slow brute-force attacks
  (`apps/api/src/plugins/security.ts`). Tuned down automatically in the test
  environment.
- **Security headers**: `@fastify/helmet` sets CSP, `X-Content-Type-Options`,
  `X-Frame-Options`, etc. on the API; the Caddyfile adds equivalents for the
  web responses.
- **Non-root containers**: both images run as uid 1000.
- The API trusts the `X-Forwarded-For` header from the Caddy proxy
  (`trustProxy`) so rate limiting keys on the real client IP. This is safe
  only because `api` is not published to the host — keep it that way.

### Operator checklist

- [ ] Generate a fresh `BETTER_AUTH_SECRET` (`openssl rand -hex 32`); never
      reuse the placeholder. Restrict `.env` permissions (`chmod 600 .env`).
- [ ] **Claim the admin account immediately.** The first user to register
      becomes admin. On a public instance, register your own account before
      announcing the URL, or an attacker could grab admin.
- [ ] After your account exists, disable open registration from the in-app
      admin settings (Admin → registration) if you do not want public sign-ups.
- [ ] Run `pnpm audit` and apply `pnpm update next fastify` before exposure —
      see `docs/SECURITY-REVIEW.md` §7.
- [ ] Back up the `sqlite_data` volume regularly (the DB is a single file).
- [ ] Keep `CORS_ORIGIN`/`APP_BASE_URL` set to your real hostname so CORS stays
      restricted to your own origin.
