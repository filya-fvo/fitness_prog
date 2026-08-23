#!/bin/sh
set -eu

source_dir=/opt/fitness-release
target_dir=/usr/share/nginx/html

test -f "$source_dir/index.html"
mkdir -p "$target_dir"

# Keep recent immutable chunks for Telegram WebViews/PWAs opened before a deploy.
# The current release is copied again below, so an infrequently deployed app is safe.
if [ -d "$target_dir/assets" ]; then
  find "$target_dir/assets" -type f -mtime +30 -delete
fi

cp -a "$source_dir/." "$target_dir/"
test -f "$target_dir/index.html"
