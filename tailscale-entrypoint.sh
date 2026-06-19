#!/bin/sh
# Entrypoint para correr tailscaled en modo userspace JUNTO al proceso Bun de
# MikoshiTracker, dentro de un contenedor Fly. Patrón oficial de Tailscale para
# PaaS sin /dev/net/tun.
#
# Expone DOS proxies locales (puertos DISTINTOS):
#   - SOCKS5  en localhost:1055  (curl/verify: socks5h://127.0.0.1:1055)
#   - HTTP    en localhost:1099  (Bun fetch: HTTP_PROXY=http://127.0.0.1:1099)
# El cliente de la Platform API sale por ahí hacia jetson:7777 (tailnet).
# El tracker NO gana IP pública por aquí; nada de esto va por internet abierto.
#
# Variables del entorno:
#   TS_AUTHKEY   auth key EFÍMERA del tailnet (fly secrets set), tag acotado.
#                Si NO está, se OMITE el sidecar: el tracker sigue sirviendo web,
#                magic links y escrituras de círculo (todo inbound, público); y
#                el kernel sigue pudiendo hacer pull-backup/push por HTTPS público.
#                Solo se pierde el sync saliente tracker→kernel (roster, story 51).
#   TS_HOSTNAME  opcional, nombre del nodo (default: fly-mikoshi-tracker).
#   DATABASE_URL opcional para migrar (default: file:${DATA_DIR}/mikoshi-tracker.db).
set -e

: "${TS_HOSTNAME:=fly-mikoshi-tracker}"
: "${DATA_DIR:=/data}"
DB_PATH="${DATA_DIR}/mikoshi-tracker.db"

mkdir -p "${DATA_DIR}/attachments"

# --- Import one-shot de la DB local (first run) ---
# Subes la DB consolidada (VACUUM INTO, sin WAL sucio) a $DATA_DIR/_seed.sqlite y
# reinicias: aquí se instala como la DB real (borrando WAL/SHM viejos) y el seed
# se consume. Idempotente: si no hay seed, no toca nada.
if [ -f "${DATA_DIR}/_seed.sqlite" ]; then
  echo "[entrypoint] importando DB seed → ${DB_PATH}"
  rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm"
  mv -f "${DATA_DIR}/_seed.sqlite" "${DB_PATH}"
fi

# --- Migraciones (idempotente; no-op si la DB ya está al día) ---
echo "[entrypoint] aplicando migraciones…"
( cd /app/apps/api && bun scripts/migrate.ts ) || echo "[entrypoint] WARN: migrate falló (¿DB nueva?)"

# Sin TS_AUTHKEY: omitimos el sidecar y limpiamos el proxy saliente para que
# cualquier fetch del proceso salga directo (sin colgarse contra un proxy muerto).
if [ -z "${TS_AUTHKEY:-}" ]; then
  echo "[entrypoint] TS_AUTHKEY ausente → sin sidecar Tailscale (sync saliente al kernel deshabilitado)"
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
  echo "[entrypoint] arrancando app: $*"
  exec "$@"
fi

echo "[entrypoint] arrancando tailscaled (userspace)…"
/usr/local/bin/tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --outbound-http-proxy-listen=localhost:1099 \
  --state=mem: &

# Conecta al tailnet EN SEGUNDO PLANO: así el server (health check :7080) arranca
# ya y no depende de que el tailnet esté listo. La espera es por el SOCKET de
# tailscaled (no por `status`, que no devuelve 0 hasta DESPUÉS de `up`). Si `up`
# falla, se loguea pero la web sigue viva (solo se pierde la Platform API).
(
  i=0
  while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ "$i" -lt 60 ]; do
    i=$((i + 1)); sleep 0.5
  done
  if /usr/local/bin/tailscale up \
       --authkey="${TS_AUTHKEY}" \
       --hostname="${TS_HOSTNAME}" \
       --accept-routes \
       --accept-dns=false; then
    echo "[entrypoint] tailnet UP (hostname=${TS_HOSTNAME})"
  else
    echo "[entrypoint] WARN: 'tailscale up' falló — Platform API/roster no disponible"
  fi
) &

echo "[entrypoint] arrancando app: $*"
exec "$@"
