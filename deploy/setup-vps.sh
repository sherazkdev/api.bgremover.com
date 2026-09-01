#!/usr/bin/env bash
set -euo pipefail

# Run from the project root on the VPS (as root or with sudo):
#   chmod +x deploy/setup-vps.sh
#   sudo bash deploy/setup-vps.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SITE_NAME="bgremove.recipehubapi.com"
NGINX_AVAIL="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
SERVICE_PATH="/etc/systemd/system/bgremover.service"
NPM_BIN="$(command -v npm)"

if [[ -z "${NPM_BIN}" ]]; then
  echo "npm not found in PATH. Install Node 22+ first."
  exit 1
fi

if [[ ! -d /etc/nginx/sites-available ]]; then
  echo "Nginx sites-available not found. Install nginx first: sudo apt install nginx"
  exit 1
fi

sed "s#WorkingDirectory=.*#WorkingDirectory=${APP_DIR}#" "${APP_DIR}/deploy/bgremover.service" \
  | sed "s#ExecStart=.*#ExecStart=${NPM_BIN} start#" \
  > "${SERVICE_PATH}"

cp "${APP_DIR}/deploy/nginx.conf" "${NGINX_AVAIL}"
ln -sfn "${NGINX_AVAIL}" "${NGINX_ENABLED}"

nginx -t
systemctl enable nginx
systemctl start nginx
systemctl reload nginx

systemctl daemon-reload
systemctl enable bgremover
systemctl restart bgremover
systemctl --no-pager --full status bgremover || true

echo
echo "Nginx -> http://127.0.0.1:3014  (server_name ${SITE_NAME} www.${SITE_NAME})"
echo "App dir: ${APP_DIR}"
echo "Check: curl -I http://127.0.0.1:3014/api/v1/health"
echo "Public: http://${SITE_NAME}/  (DNS A record -> this VPS)"
echo "TLS: sudo certbot --nginx -d ${SITE_NAME} -d www.${SITE_NAME}"
