#!/bin/sh
# Only BuildKit cache is eligible; service images and persistent volumes stay intact.
set -eu
mode="${1:-}"
case "$mode" in
  --budget|--stale|--after-release) ;;
  *) echo "Usage: $0 --budget|--stale|--after-release" >&2; exit 2 ;;
esac
if [ "$#" -ne 1 ]; then
  echo "Expected one maintenance mode" >&2
  exit 2
fi
lock_file="${FITNESS_CACHE_LOCK_FILE:-/run/lock/fitness-build-cache.lock}"
exec 9>"$lock_file"
if flock -n 9; then
  :
else
  result="$?"
  if [ "$result" -eq 1 ]; then
    echo "BUILD_CACHE_BUSY"
    exit 0
  fi
  exit "$result"
fi
if [ "$mode" = --after-release ]; then
  curl -fsS --connect-timeout 5 --max-time 20 https://api.filfitclub.ru/health >/dev/null
  curl -fsS --connect-timeout 5 --max-time 20 https://app.filfitclub.ru >/dev/null
fi
if [ "$mode" = --stale ] || [ "$mode" = --after-release ]; then
  docker buildx prune --all --force --filter until=72h
fi
if [ "$mode" = --budget ] || [ "$mode" = --after-release ]; then
  docker buildx prune --all --force --max-used-space=5GB
fi
echo "BUILD_CACHE_OK mode=$mode"
