#!/usr/bin/env bash
# First-time nginx site for bgremove (Ubuntu/Debian). Run with sudo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_SRC="$ROOT/deploy/background-remover-api"
SITE_NAME="${NGINX_SITE_NAME:-background-remover-api}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/install-nginx-site.sh" >&2
  exit 1
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "Missing $SITE_SRC" >&2
  exit 1
fi

install -d /var/www/certbot
cp "$SITE_SRC" "/etc/nginx/sites-available/$SITE_NAME"
ln -sf "/etc/nginx/sites-available/$SITE_NAME" "/etc/nginx/sites-enabled/$SITE_NAME"
nginx -t
systemctl reload nginx
echo "Nginx site enabled: $SITE_NAME (proxy -> 127.0.0.1:3014)"
