#!/usr/bin/env bash
# Keeps YouTube downloads working without manual fixes:
#  - updates yt-dlp to the latest release
#  - installs/updates the bgutil PO-token add-on (passes YouTube's bot check
#    without cookies). It runs in "script" mode: nothing stays running, it only
#    starts for a few seconds when a YouTube download needs a token.
# Runs daily from cron (installed by setup.sh); safe to run by hand any time.
set -uo pipefail
cd "$(dirname "$0")/.."

YT_DIR=.youtube
POT_DIR="$YT_DIR/bgutil-ytdlp-pot-provider"
PLUGIN_DIR="$YT_DIR/plugins"
mkdir -p "$PLUGIN_DIR"

echo "==> Updating yt-dlp"
./node_modules/youtube-dl-exec/bin/yt-dlp -U 2>&1 | tail -1

latest=$(curl -fsSL https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/releases/latest \
  | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
installed=$(cat "$POT_DIR/.version" 2>/dev/null || true)

if [ -z "$latest" ]; then
  echo "==> Couldn't check for bot-check add-on updates (GitHub unreachable); keeping ${installed:-none}"
  exit 0
fi

if [ "$latest" = "$installed" ] && [ -f "$POT_DIR/server/build/generate_once.js" ]; then
  echo "==> Bot-check add-on is up to date ($installed)"
  exit 0
fi

echo "==> Installing bot-check add-on $latest"
tmp=$(mktemp -d)
if git clone -q --depth 1 --branch "$latest" https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$tmp/pot" \
  && (cd "$tmp/pot/server" && npm ci --no-audit --no-fund --loglevel=error && npx tsc) \
  && curl -fsSL -o "$tmp/plugin.zip" \
       "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/$latest/bgutil-ytdlp-pot-provider.zip"
then
  echo "$latest" > "$tmp/pot/.version"
  rm -rf "$POT_DIR"
  mv "$tmp/pot" "$POT_DIR"
  mv "$tmp/plugin.zip" "$PLUGIN_DIR/bgutil-ytdlp-pot-provider.zip"
  echo "==> Bot-check add-on $latest ready"
else
  echo "==> Add-on install failed; keeping the previous version (${installed:-none})"
fi
rm -rf "$tmp"
