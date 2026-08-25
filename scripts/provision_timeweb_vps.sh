#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  fail2ban \
  git \
  jq \
  rsync \
  ufw \
  unattended-upgrades

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
architecture="$(dpkg --print-architecture)"
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $architecture
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get install -y \
  containerd.io \
  docker-buildx-plugin \
  docker-ce \
  docker-ce-cli \
  docker-compose-plugin

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "Root authorized_keys is missing" >&2
  exit 1
fi

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi

hostnamectl set-hostname fitness-prod-vps

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now docker
systemctl enable --now fail2ban

if [ ! -e /etc/docker/daemon.json ]; then
  printf '%s\n' '{"registry-mirrors":["https://dockerhub.timeweb.cloud"]}' \
    > /etc/docker/daemon.json
  systemctl reload docker
fi

install -d -m 0750 -o root -g root \
  /opt/fitness \
  /opt/fitness/backups \
  /opt/fitness/logs

echo "PROVISION_OK"
docker version --format 'docker={{.Server.Version}}'
docker compose version
free -h
ufw status verbose
