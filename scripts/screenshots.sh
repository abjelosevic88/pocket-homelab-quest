#!/bin/sh
# README screenshots from a demo instance, with headless Chrome in Docker.
#
#   make build && DATA_DIR=/tmp/quest-demo DEMO_DATA=true AUTH_MODE=none HOST=127.0.0.1 PORT=18263 ./pocket-quest &
#   sh scripts/screenshots.sh            # → docs/screenshots/*.png
set -eu
BASE=${BASE:-http://127.0.0.1:18263}
OUT=$(cd "$(dirname "$0")/.." && pwd)/docs/screenshots
mkdir -p "$OUT"
shot() { # name path width height [dark]
  extra=""
  [ "${5:-}" = dark ] && extra="--force-dark-mode --blink-settings=preferredColorScheme=0"
  docker run --rm --network host -v "$OUT:/out" zenika/alpine-chrome --headless --no-sandbox --hide-scrollbars $extra \
    --virtual-time-budget=6000 --screenshot="/out/$1.png" --window-size="$3,$4" "$BASE$2" >/dev/null 2>&1
  echo "$1"
}
TOKEN=$(curl -fsS "$BASE/api/v1/campaigns" | sed -n 's/.*"share_token":"\([^"]*\)".*/\1/p' | head -1)
FIGHT=$(curl -fsS "$BASE/api/v1/home" | sed -n 's/.*"fight":{"id":\([0-9]*\).*/\1/p')
shot desktop-table / 1440 1000
shot desktop-sheet /characters/2 1440 1000
shot desktop-sheet-dark /characters/1 1440 1000 dark
shot desktop-fight "/encounters/$FIGHT" 1440 1000
shot desktop-campaign /campaigns/1 1440 1000
shot desktop-monster /compendium/monsters/srd%3Aadult-red-dragon 1440 1400
shot desktop-builder /characters/new 1440 900
shot desktop-encounter /encounters/1 1440 900
shot desktop-player "/p/$TOKEN" 1100 1200
shot phone-table / 390 844
shot phone-sheet /characters/3 390 844
shot phone-fight "/encounters/$FIGHT" 390 844
shot phone-dice /dice 390 844
