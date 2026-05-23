#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$ROOT_DIR"

APP_BASE_URL="${APP_BASE_URL:-http://localhost:${MIKOSHI_TRACKER_PUBLIC_PORT:-8080}}"

echo "==> Checking systemd user units"
for unit in mikoshi-tracker-api mikoshi-tracker-web; do
  status="$(systemctl --user is-active "${unit}" 2>/dev/null || true)"
  if [[ "$status" != "active" ]]; then
    echo "Unit '${unit}' is not active (status: ${status})"
    echo "Run: journalctl --user -u ${unit} -n 50"
    exit 1
  fi
  echo "  ${unit}: active"
done

echo "==> Checking API health endpoint"
health_body="$(curl --fail --silent --show-error "${APP_BASE_URL}/health")"
if [[ "$health_body" != *'"ok":true'* ]]; then
  echo "Unexpected /health response: $health_body"
  exit 1
fi

echo "==> Checking OpenAPI endpoint"
curl --fail --silent --show-error "${APP_BASE_URL}/api/openapi.json" >/dev/null

echo "==> Checking web entrypoint"
homepage="$(curl --fail --silent --show-error "${APP_BASE_URL}/")"
if [[ "$homepage" != *"<html"* && "$homepage" != *"<!DOCTYPE html"* ]]; then
  echo "Unexpected homepage response"
  exit 1
fi

echo "Self-host stack is healthy."
