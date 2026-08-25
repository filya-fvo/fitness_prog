#!/bin/sh
set -eu

ROOT="${ROOT:-/opt/fitness/source}"
BACKUP_DIR="${BACKUP_DIR:-/opt/fitness/backups/daily}"
SERVICE_FILE=/etc/systemd/system/fitness-backup.service
TIMER_FILE=/etc/systemd/system/fitness-backup.timer

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 2
fi
if [ ! -f "$ROOT/scripts/backup_vps.sh" ] || [ ! -f "$ROOT/backend/.env.production" ]; then
  echo "Fitness production checkout or env is missing under $ROOT" >&2
  exit 2
fi
case "$BACKUP_DIR" in
  /opt/fitness/backups/*) ;;
  *) echo "BACKUP_DIR must stay under /opt/fitness/backups" >&2; exit 2 ;;
esac

install -d -m 700 "$BACKUP_DIR"

printf '%s\n' \
  '[Unit]' \
  'Description=Daily Fitness PostgreSQL backup' \
  'After=docker.service' \
  'Requires=docker.service' \
  '' \
  '[Service]' \
  'Type=oneshot' \
  "ExecStart=/usr/bin/env BACKUP_DIR=$BACKUP_DIR /bin/sh $ROOT/scripts/backup_vps.sh" \
  > "$SERVICE_FILE"

printf '%s\n' \
  '[Unit]' \
  'Description=Run Fitness PostgreSQL backup every day' \
  '' \
  '[Timer]' \
  'OnCalendar=*-*-* 03:15:00 UTC' \
  'Persistent=true' \
  'RandomizedDelaySec=10m' \
  'Unit=fitness-backup.service' \
  '' \
  '[Install]' \
  'WantedBy=timers.target' \
  > "$TIMER_FILE"

chmod 644 "$SERVICE_FILE" "$TIMER_FILE"
systemctl daemon-reload
systemctl enable --now fitness-backup.timer
systemctl start fitness-backup.service
systemctl --no-pager --full status fitness-backup.service
systemctl --no-pager list-timers fitness-backup.timer
