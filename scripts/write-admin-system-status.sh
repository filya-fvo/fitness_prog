#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env.production}"
STATUS_DIR="${ADMIN_SYSTEM_STATUS_DIR_HOST:-/opt/fitness/status}"

case "$STATUS_DIR" in
  /opt/fitness/status) ;;
  *) echo "ADMIN_SYSTEM_STATUS_DIR_HOST must be /opt/fitness/status" >&2; exit 2 ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env: $ENV_FILE" >&2
  exit 2
fi

install -d -m 0755 "$STATUS_DIR"
umask 022

commit="$(git -C "$ROOT" rev-parse HEAD)"
version="$(sed -n 's/^## \([^ ]*\).*/\1/p' "$ROOT/docs/CHANGELOG.md" | head -n 1 | tr -cd '0-9A-Za-z._-')"
deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
deployment_tmp="$(mktemp "$STATUS_DIR/deployment.XXXXXX")"
printf '{"version":"%s","commit":"%s","deployed_at":"%s"}\n' \
  "$version" "$commit" "$deployed_at" > "$deployment_tmp"
chmod 0644 "$deployment_tmp"
mv "$deployment_tmp" "$STATUS_DIR/deployment.json"

domain="$(sed -n 's/^API_DOMAIN=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed "s/^[[:space:]\"']//;s/[[:space:]\"']$//")"
if [ -n "$domain" ]; then
  certificate_end="$({
    timeout 10 openssl s_client -servername "$domain" -connect "$domain:443" </dev/null 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null
  } || true)"
  if [ -n "$certificate_end" ]; then
    expires_at="$(date -u -d "${certificate_end#notAfter=}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
    if [ -n "$expires_at" ]; then
      https_tmp="$(mktemp "$STATUS_DIR/https.XXXXXX")"
      printf '{"expires_at":"%s"}\n' "$expires_at" > "$https_tmp"
      chmod 0644 "$https_tmp"
      mv "$https_tmp" "$STATUS_DIR/https.json"
    fi
  fi
fi

echo "ADMIN_SYSTEM_STATUS_OK"
