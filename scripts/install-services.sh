#!/usr/bin/env bash
# Install MikoshiTracker as systemd user services (API + Web + Caddy proxy).
# Run once on first setup. Subsequent deploys use scripts/deploy.sh.
#
# Prerequisites:
#   - Node.js in /usr/bin/node
#   - Caddy binary in ~/.local/bin/caddy
#     Download: https://github.com/caddyserver/caddy/releases
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
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found in PATH" >&2; exit 1
fi
if [[ ! -x "${HOME}/.local/bin/caddy" ]]; then
  echo "ERROR: ~/.local/bin/caddy not found or not executable." >&2
  echo "Download from https://github.com/caddyserver/caddy/releases" >&2
  exit 1
fi

echo "==> Creating directories"
mkdir -p "$SYSTEMD_USER_DIR"
mkdir -p "$MIKOSHI_CONFIG_DIR"
mkdir -p "${DATA_DIR}/attachments"

echo "==> Installing systemd unit files"
cp "${SCRIPT_DIR}/self-host/mikoshi-tracker-api.service"   "${SYSTEMD_USER_DIR}/mikoshi-tracker-api.service"
cp "${SCRIPT_DIR}/self-host/mikoshi-tracker-web.service"   "${SYSTEMD_USER_DIR}/mikoshi-tracker-web.service"
cp "${SCRIPT_DIR}/self-host/mikoshi-tracker-proxy.service" "${SYSTEMD_USER_DIR}/mikoshi-tracker-proxy.service"

echo "==> Reloading systemd daemon"
systemctl --user daemon-reload

echo "==> Enabling units (start on login)"
systemctl --user enable mikoshi-tracker-api mikoshi-tracker-web mikoshi-tracker-proxy

PORT="${MIKOSHI_TRACKER_PUBLIC_PORT:-7080}"

echo ""
echo "Units installed. Create ${MIKOSHI_CONFIG_DIR}/env with:"
echo ""
echo "  NODE_ENV=production"
echo "  BETTER_AUTH_SECRET=<secret>   # openssl rand -hex 32"
echo "  APP_BASE_URL=http://localhost:${PORT}"
echo "  DATABASE_URL=file:${DATA_DIR}/mikoshi-tracker.db"
echo "  ATTACHMENTS_DIR=${DATA_DIR}/attachments"
echo "  MIKOSHI_TRACKER_ADMIN_API_KEY=<key>   # openssl rand -hex 32"
echo "  MIKOSHI_TRACKER_SITE_ADDRESS=:${PORT} # port Caddy binds on"
echo ""
echo "Then run: systemctl --user start mikoshi-tracker-api mikoshi-tracker-web mikoshi-tracker-proxy"
echo "Or run:   ./scripts/deploy.sh  (build + migrate + restart all)"
