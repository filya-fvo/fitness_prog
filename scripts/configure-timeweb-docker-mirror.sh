#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

install -d -m 0755 /etc/docker

if [[ -f /etc/docker/daemon.json ]]; then
  echo "/etc/docker/daemon.json already exists; refusing to overwrite it." >&2
  echo "Merge this setting manually: registry-mirrors=https://dockerhub.timeweb.cloud" >&2
  exit 1
fi

install -m 0644 /dev/null /etc/docker/daemon.json
printf '%s\n' '{"registry-mirrors":["https://dockerhub.timeweb.cloud"]}' > /etc/docker/daemon.json

systemctl reload docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
