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

# The API runs from TypeScript source under Bun; "building" it is a typecheck.
echo "==> Typechecking API"
if [[ $SKIP_API -eq 0 ]]; then
  bun run --filter @mikoshi-tracker/api typecheck
fi

echo "==> Building web"
if [[ $SKIP_WEB -eq 0 ]]; then
  bun run --filter @mikoshi-tracker/web build
fi

echo "==> Running database migrations"
if [[ $SKIP_MIGRATE -eq 0 ]]; then
  bun run db:migrate
fi

echo "==> Restarting service"
systemctl --user restart mikoshi-tracker-api

echo "==> Verifying health"
API_URL="${APP_BASE_URL:-http://localhost:${PORT:-7080}}"
# Bun parses the API's TypeScript on boot, so allow a few seconds of retries.
for attempt in $(seq 1 15); do
  if curl --fail --silent "${API_URL}/health" 2>/dev/null | grep -q '"ok":true'; then
    if curl --fail --silent "${API_URL}/dashboard" | grep -q '<div id="root">'; then
      echo "Deploy complete. API healthy and web SPA served by Bun at ${API_URL}"
      exit 0
    fi
    echo "WARNING: API healthy but the web SPA is not served (did 'vite build' run? check apps/web/dist)"
    exit 1
  fi
  sleep 2
done
echo "WARNING: /health check did not return ok:true after 30s"
echo "  Check: journalctl --user -u mikoshi-tracker-api"
exit 1
