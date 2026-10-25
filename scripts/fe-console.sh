#!/usr/bin/env bash
# Dev helper (docs/05 §9): start the CAP mock (profile opa), load a page of the Fiori Elements app in headless Chrome,
# print browser console errors (with JS stacks when loaded via test/debug.html), a DOM summary and a screenshot.
#
#   scripts/fe-console.sh [path-with-hash] [budget-ms]
#   scripts/fe-console.sh "test/debug.html#/Requests(ID=a1b2c3d4-0000-4000-8000-000000000020,IsActiveEntity=true)" 40000
#
# Needs a free port 4004 (run outside the Bash sandbox). Output files: $OUT/console.txt, $OUT/dom.html, $OUT/shot.png
set -u
PAGE="${1:-test/debug.html}"
BUDGET="${2:-40000}"
APP_URL="http://localhost:4004/monitor-fe/${PAGE}"
OUT="${TMPDIR:-/tmp}/fe-console"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$OUT"

cd "$ROOT" || exit 1
if ! curl -sf -o /dev/null "http://localhost:4004/odata/v4/monitor/\$metadata"; then
	(npx cds-serve --profile opa --port 4004 > "$OUT/cds.log" 2>&1 &)
	STARTED=1
	for _ in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:4004/odata/v4/monitor/\$metadata" && break; sleep 1; done
fi

"$CHROME" --headless=new --disable-gpu --no-sandbox --enable-logging=stderr --v=0 --virtual-time-budget="$BUDGET" \
	--window-size=1600,1000 --dump-dom "$APP_URL" 2> "$OUT/chrome.err" > "$OUT/dom.html"
"$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget="$BUDGET" --window-size=1600,1000 \
	--hide-scrollbars --screenshot="$OUT/shot.png" "$APP_URL" > /dev/null 2>&1

grep -E "CONSOLE" "$OUT/chrome.err" | sed -E 's/^.*CONSOLE[:(][0-9]+[])]*[]]? //' | grep -vE "Device API logging" > "$OUT/console.txt"
echo "=== console (errors) ==="
grep -vE "^\"STACK" "$OUT/console.txt" | cut -c1-400
echo "=== stacks ==="
grep -E "^\"STACK" "$OUT/console.txt" | cut -c1-600
echo "=== DOM summary ==="
grep -oE "sapMListTblRow|sapUiLocalBusyIndicator|sapMIllustratedMessage|sapUxAPObjectPageSection |sapMDialog |sapMMessageStrip" "$OUT/dom.html" | sort | uniq -c
echo "screenshot: $OUT/shot.png"

if [ "${STARTED:-0}" = "1" ]; then pkill -f "cds-serve --profile opa" ; fi
