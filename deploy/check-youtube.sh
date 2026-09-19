#!/usr/bin/env bash
# Diagnose YouTube downloads on the server (uses the same settings as the app):
#   bash deploy/check-youtube.sh [youtube-url]
cd "$(dirname "$0")/.."
URL="${1:-https://www.youtube.com/watch?v=jNQXAC9IVRw}"
YTDLP=./node_modules/youtube-dl-exec/bin/yt-dlp
COOKIES=data/youtube-cookies.txt
POT=.youtube/bgutil-ytdlp-pot-provider
PROXY=$(grep -s '^YTDLP_PROXY=' .env.local | cut -d= -f2-)

echo "python3:   $(command -v python3 || echo MISSING) $(python3 --version 2>/dev/null)"
echo "deno:      $(command -v deno || echo MISSING)"
echo "yt-dlp:    $($YTDLP --version 2>&1 || echo 'CANNOT RUN')"
echo "bot-check: $(cat $POT/.version 2>/dev/null || echo 'not installed (run deploy/update-youtube.sh)')"
echo "proxy:     $([ -n "$PROXY" ] && echo set || echo none)"
echo "cookies:   $([ -f "$COOKIES" ] && echo "$COOKIES" || echo none)"
echo "---- trying: $URL"

ARGS=(--simulate --no-playlist -f bestaudio/best --print "OK: %(title)s")
[ -f .youtube/plugins/bgutil-ytdlp-pot-provider.zip ] && ARGS+=(--plugin-dirs "$PWD/.youtube/plugins")
[ -f "$POT/server/build/generate_once.js" ] && ARGS+=(--extractor-args "youtubepot-bgutilscript:server_home=$PWD/$POT/server")
[ -n "$PROXY" ] && ARGS+=(--proxy "$PROXY")
if [ -f "$COOKIES" ]; then TMPC=$(mktemp); cp "$COOKIES" "$TMPC"; ARGS+=(--cookies "$TMPC"); fi
$YTDLP "${ARGS[@]}" "$URL" 2>&1 | grep -E '^(OK:|ERROR|WARNING)' | head -20
