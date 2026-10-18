#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 2
fi
command -v docker >/dev/null
command -v flock >/dev/null
# The size flag is required; do not silently fall back to a broad prune.
docker buildx prune --help | grep -q -- --max-used-space
install -d -m 0755 /usr/local/lib/fitness
install -m 0755 "$ROOT/scripts/maintain-vps-build-cache.sh" /usr/local/lib/fitness/maintain-build-cache.sh
for unit in fitness-build-cache@.service fitness-build-cache-budget.timer fitness-build-cache-stale.timer; do
  install -m 0644 "$ROOT/deploy/timeweb/$unit" "/etc/systemd/system/$unit"
done
systemd-analyze verify /etc/systemd/system/fitness-build-cache@.service /etc/systemd/system/fitness-build-cache-budget.timer /etc/systemd/system/fitness-build-cache-stale.timer
systemctl daemon-reload
systemctl enable --now fitness-build-cache-budget.timer fitness-build-cache-stale.timer
systemctl start fitness-build-cache@budget.service
systemctl --no-pager list-timers 'fitness-build-cache-*.timer'
echo "BUILD_CACHE_TIMERS_OK"
