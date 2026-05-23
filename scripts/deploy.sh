#!/usr/bin/env bash
# Deploy MikoshiTracker natively: build → migrate → restart.
# Usage: ./scripts/deploy.sh [--skip-web] [--skip-api] [--skip-migrate]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

SKIP_WEB=0
SKIP_API=0
SKIP_MIGRATE=0

for arg in "$@"; do
  case "$arg" in
    --skip-web)     SKIP_WEB=1 ;;
    --skip-api)     SKIP_API=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

echo "==> Building API"
if [[ $SKIP_API -eq 0 ]]; then
  if command -v bun >/dev/null 2>&1 && [[ -f bun.lockb ]]; then
    bun --filter @mikoshi-tracker/api run build
  else
    pnpm --filter @mikoshi-tracker/api build
  fi
fi

echo "==> Building web"
if [[ $SKIP_WEB -eq 0 ]]; then
  if command -v bun >/dev/null 2>&1 && [[ -f bun.lockb ]]; then
    bun --filter @mikoshi-tracker/web run build
  else
    pnpm --filter @mikoshi-tracker/web build
  fi
fi

echo "==> Running database migrations"
if [[ $SKIP_MIGRATE -eq 0 ]]; then
  if command -v bun >/dev/null 2>&1 && [[ -f bun.lockb ]]; then
    bun run prisma:migrate
  else
    pnpm exec prisma migrate deploy \
      --config prisma.config.ts \
      --schema prisma/schema.prisma
  fi
fi

echo "==> Restarting services"
systemctl --user restart mikoshi-tracker-api mikoshi-tracker-web mikoshi-tracker-proxy

echo "==> Waiting for services to start"
sleep 3

echo "==> Verifying health"
SITE_ADDR="${MIKOSHI_TRACKER_SITE_ADDRESS:-}"
if [[ "$SITE_ADDR" =~ ^:[0-9]+$ ]]; then
  API_URL="http://localhost${SITE_ADDR}"
else
  API_URL="${APP_BASE_URL:-http://localhost:7080}"
fi
if curl --fail --silent --show-error "${API_URL}/health" | grep -q '"ok":true'; then
  echo "Deploy complete. API healthy at ${API_URL}/health"
else
  echo "WARNING: /health check did not return ok:true"
  echo "  Check: journalctl --user -u mikoshi-tracker-api"
fi
