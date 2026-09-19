#!/usr/bin/env bash
# Build and (re)start Gaane on port 7005. Run after every update:
#   bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d .git ]; then
  echo "==> Pulling latest code"
  git pull --ff-only
fi

echo "==> Installing dependencies"
# Fresh install on the server so ffmpeg and yt-dlp are the Linux builds,
# never binaries copied over from Windows.
npm ci --no-audit --no-fund

# npm ci reinstalls the bundled yt-dlp, so bring it (and the bot-check add-on) up to date.
bash deploy/update-youtube.sh || echo "   (YouTube update step failed, continuing)"
command -v deno >/dev/null || echo "   WARNING: Deno is not installed; YouTube downloads may fail. Run deploy/setup.sh."

echo "==> Building"
npm run build

echo "==> Starting on 127.0.0.1:7005"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

sleep 2
curl -fsS -o /dev/null http://127.0.0.1:7005 && echo "==> Gaane is up on port 7005"
