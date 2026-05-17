#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/self-host/lib.sh
source "${SCRIPT_DIR}/lib.sh"
COMPOSE="$(detect_compose)"

export APP_BASE_URL="${APP_BASE_URL:-http://localhost:${HAAABIT_PUBLIC_PORT:-8080}}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-12345678901234567890123456789012}"

cleanup() {
  ${COMPOSE} down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
${COMPOSE} build web api
${COMPOSE} run --rm migrate
${COMPOSE} up -d
./scripts/self-host/check.sh
