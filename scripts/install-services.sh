#!/usr/bin/env bash
# Install MikoshiTracker as a single systemd user service: one Bun process that
# serves the API AND the built Vite SPA (apps/web/dist) — no reverse proxy.
# Run once on first setup. Subsequent deploys use scripts/deploy.sh.
#
# Prerequisites:
#   - Bun in ~/.bun/bin/bun (https://bun.sh) — runs the API and the SPA build
#   - Node.js in PATH — runs dev tooling (vitest, playwright)
#
# Usage: ./scripts/install-services.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
MIKOSHI_CONFIG_DIR="${HOME}/.config/mikoshi-tracker"
DATA_DIR="${HOME}/.local/share/mikoshi-tracker"

echo "==> Checking dependencies"
if [[ ! -x "${HOME}/.bun/bin/bun" ]]; then
  echo "ERROR: ~/.bun/bin/bun not found or not executable." >&2
  echo "Install with: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found in PATH" >&2; exit 1
fi

echo "==> Creating directories"
mkdir -p "$SYSTEMD_USER_DIR"
mkdir -p "$MIKOSHI_CONFIG_DIR"
mkdir -p "${DATA_DIR}/attachments"

echo "==> Installing systemd unit file"
cp "${SCRIPT_DIR}/self-host/mikoshi-tracker-api.service" "${SYSTEMD_USER_DIR}/mikoshi-tracker-api.service"

# Upgrade cleanup: the SPA used to run as its own Next.js unit, then behind a
# Caddy proxy unit. Both are gone — Bun serves everything in one process now.
for stale in mikoshi-tracker-web mikoshi-tracker-proxy; do
  systemctl --user disable --now "$stale" 2>/dev/null || true
  rm -f "${SYSTEMD_USER_DIR}/${stale}.service"
done

echo "==> Reloading systemd daemon"
systemctl --user daemon-reload

echo "==> Enabling unit (start on login)"
systemctl --user enable mikoshi-tracker-api

PORT="${MIKOSHI_TRACKER_PUBLIC_PORT:-7080}"

echo ""
echo "Unit installed. Create ${MIKOSHI_CONFIG_DIR}/env with:"
echo ""
echo "  NODE_ENV=production"
echo "  PORT=${PORT}                  # Bun serves API + SPA on this port"
echo "  BETTER_AUTH_SECRET=<secret>   # openssl rand -hex 32"
echo "  BETTER_AUTH_URL=http://localhost:${PORT}"
echo "  APP_BASE_URL=http://localhost:${PORT}"
echo "  CORS_ORIGIN=http://localhost:${PORT}"
echo "  DATABASE_URL=file:${DATA_DIR}/mikoshi-tracker.db"
echo "  ATTACHMENTS_DIR=${DATA_DIR}/attachments"
echo "  MIKOSHI_TRACKER_ADMIN_API_KEY=<key>   # openssl rand -hex 32"
echo ""
echo "Then run: ./scripts/deploy.sh   (build + migrate + restart)"
echo "For public HTTPS, put a TLS terminator (Tailscale/Caddy/nginx) in front of PORT."
