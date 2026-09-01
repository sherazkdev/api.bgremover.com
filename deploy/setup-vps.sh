#!/usr/bin/env bash
set -euo pipefail

# Run from /var/www/background-remover-api on the VPS:
#   chmod +x deploy/setup-vps.sh
#   sudo bash deploy/setup-vps.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_NAME="background-remover-api"
PM2_NAME="background-remover-api"
DOMAIN="bgremove.recipehubapi.com"
NGINX_AVAIL="/etc/nginx/sites-available/${NGINX_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_NAME}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Install Node 22+ first."
  exit 1
fi

if [[ ! -d /etc/nginx/sites-available ]]; then
  echo "Nginx sites-available not found. Install nginx first: sudo apt install nginx"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

cp "${APP_DIR}/deploy/${NGINX_NAME}" "${NGINX_AVAIL}"
ln -sfn "${NGINX_AVAIL}" "${NGINX_ENABLED}"

nginx -t
systemctl enable nginx
systemctl start nginx
systemctl reload nginx

cd "${APP_DIR}"
pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
pm2 start "${APP_DIR}/deploy/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 status

echo
echo "Folder: ${APP_DIR}"
echo "Nginx:  /etc/nginx/sites-available/${NGINX_NAME}"
echo "PM2:    ${PM2_NAME} -> http://127.0.0.1:3014"
echo "Check:  curl -I http://127.0.0.1:3014/api/v1/health"
echo "Public: http://${DOMAIN}/  (DNS A record -> this VPS)"
echo "TLS:    sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
