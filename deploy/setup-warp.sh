#!/usr/bin/env bash
# Free fix for "Sign in to confirm you're not a bot" on a VPS:
# route ONLY yt-dlp's YouTube traffic through Cloudflare WARP (free).
# WARP runs in proxy mode, so SSH, the website and all other traffic are untouched.
#   sudo bash deploy/setup-warp.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"
PORT=40000
PROXY="socks5://127.0.0.1:$PORT"

if ! command -v warp-cli >/dev/null; then
  echo "==> Installing Cloudflare WARP"
  apt-get install -y gpg lsb-release
  curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
    | gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/cloudflare-client.list
  apt-get update
  apt-get install -y cloudflare-warp
fi

echo "==> Configuring WARP as a local-only proxy on 127.0.0.1:$PORT"
warp-cli --accept-tos registration show >/dev/null 2>&1 || warp-cli --accept-tos registration new
# Proxy mode MUST be set before connecting, so the server's own traffic is never rerouted.
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port "$PORT"
warp-cli --accept-tos connect
sleep 5

if curl -fsS --max-time 15 -x "socks5h://127.0.0.1:$PORT" https://www.cloudflare.com/cdn-cgi/trace | grep -q 'warp=on'; then
  echo "==> WARP proxy is working"
else
  echo "!! WARP proxy isn't responding. Check: warp-cli status"; exit 1
fi

echo "==> Testing YouTube through WARP"
RESULT=$(sudo -u "$APP_USER" env YTDLP_PROXY="$PROXY" bash "$APP_DIR/deploy/check-youtube.sh" 2>&1 || true)
echo "$RESULT"
if grep -q '^OK:' <<<"$RESULT"; then
  ENV_FILE="$APP_DIR/.env.local"
  touch "$ENV_FILE"
  sed -i '/^YTDLP_PROXY=/d' "$ENV_FILE"
  echo "YTDLP_PROXY=$PROXY" >> "$ENV_FILE"
  chown "$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pm2 restart gaane --update-env >/dev/null"
  echo "==> Done. YouTube downloads now go through WARP. Try it on the site."
else
  echo "!! YouTube also blocks this WARP address. Options:"
  echo "   - Retry later with a fresh address: warp-cli registration delete; then run this script again"
  echo "   - Use a residential proxy: set YTDLP_PROXY=http://user:pass@host:port in .env.local, then pm2 restart gaane"
  echo "   - Or add data/youtube-cookies.txt"
  exit 1
fi
