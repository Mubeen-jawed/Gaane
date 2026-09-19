#!/usr/bin/env bash
# One-time VPS setup for Gaane (Ubuntu/Debian). Run from the project folder:
#   sudo CERTBOT_EMAIL=you@example.com bash deploy/setup.sh
set -euo pipefail

DOMAIN="gaane.revenuelyft.com"
PORT=7005
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"

echo "==> Installing system packages (nginx, certbot, python3 for yt-dlp)"
apt-get update
apt-get install -y curl ca-certificates nginx certbot python3-certbot-nginx python3

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

command -v pm2 >/dev/null || npm install -g pm2

echo "==> Configuring Nginx for $DOMAIN -> 127.0.0.1:$PORT"
cp "$APP_DIR/deploy/nginx-gaane.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

ENV_FILE="$APP_DIR/.env.local"
if ! grep -qs '^APP_PASSWORD=' "$ENV_FILE"; then
  echo "==> Choose a password for the site (songs are stored on this server)"
  while :; do
    read -rsp "Password: " PW; echo
    # .env files treat $ # quotes and spaces specially, so keep them out.
    if [ ${#PW} -lt 8 ]; then echo "Use at least 8 characters."; continue; fi
    case "$PW" in *[\$\#\"\'\`\\\ ]*) echo "Please avoid \$ # quotes backslashes and spaces."; continue;; esac
    break
  done
  printf 'APP_PASSWORD=%s\n' "$PW" >> "$ENV_FILE"
  chown "$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

mkdir -p "$APP_DIR/data/songs"
chown -R "$APP_USER" "$APP_DIR/data"

echo "==> Building and starting the app as $APP_USER"
sudo -u "$APP_USER" bash "$APP_DIR/deploy/deploy.sh"

# Start PM2 on boot for the app user.
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "$(eval echo "~$APP_USER")"
sudo -u "$APP_USER" pm2 save

echo "==> Requesting HTTPS certificate"
if [ -n "${CERTBOT_EMAIL:-}" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
else
  certbot --nginx -d "$DOMAIN" --redirect
fi

echo "==> Done: https://$DOMAIN"
echo "    Songs are stored in $APP_DIR/data. Back up that folder."
