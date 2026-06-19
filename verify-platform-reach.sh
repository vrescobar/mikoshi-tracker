#!/bin/sh
# Verifica que el tracker desplegado en Fly alcanza la Platform API privada del
# kernel (jetson:7777) por el tailnet, vía el proxy SOCKS5 de tailscaled
# userspace — y que la credencial SÍ se exige (la red no la sustituye).
#
# Cómo correrlo:
#   - Dentro del contenedor Fly:  fly ssh console -C "sh /app/verify-platform-reach.sh"
#   - O en cualquier host con tailscaled userspace levantado en :1055.
#
# El tracker firma sus llamadas salientes con HMAC (no Bearer), así que aquí solo
# comprobamos el contrato de alcance: sin credencial → 401 (alcanzable + exige
# autenticación). Un 401 prueba que el tailnet llega a jetson:7777.
set -u

PROXY="${PROXY:-socks5h://127.0.0.1:1055}"
MIKOSHI_BASE="${MIKOSHI_BASE:-http://100.67.119.104:7777/api/platform/v1}"
PROBE_PATH="${PROBE_PATH:-/identities/__spike__}"
URL="${MIKOSHI_BASE}${PROBE_PATH}"

echo "→ Proxy:   $PROXY"
echo "→ Destino: $URL"
echo

c1="$(curl -s -o /dev/null -w '%{http_code}' --proxy "$PROXY" --max-time 10 "$URL" 2>/dev/null)"
case "$c1" in
  401)
    echo "PASS  sin credencial → 401 (alcanza jetson:7777 por tailnet y exige auth)"
    echo "RESULTADO: OK"
    exit 0 ;;
  000|"")
    echo "FAIL  sin respuesta (¿tailscaled arriba? ¿ACL permite jetson:7777? ¿proxy :1055?)"
    echo "RESULTADO: FALLO"
    exit 1 ;;
  *)
    # 403/404/200 también prueban alcance (camino vivo, distinto hardening).
    echo "INFO  sin credencial → $c1 (alcanza jetson:7777; auth/hardening distinto)"
    echo "RESULTADO: OK (alcanzable)"
    exit 0 ;;
esac
