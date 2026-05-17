#!/usr/bin/env bash
# Shared helpers for the self-host scripts.

# Detect an available container-compose command. Prefers Docker, then falls
# back to Podman (podman-compose, or `podman compose` if the plugin exists).
# Prints the command to stdout; exits 1 if none is found.
detect_compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v podman-compose >/dev/null 2>&1; then
    echo "podman-compose"
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    echo "podman compose"
  else
    echo "No 'docker compose' or 'podman-compose' command found." >&2
    exit 1
  fi
}
