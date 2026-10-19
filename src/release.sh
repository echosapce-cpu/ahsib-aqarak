#!/usr/bin/env bash
# Build the public page into the repo root. Usage: bash src/release.sh
set -euo pipefail
cd "$(dirname "$0")"
API="$(cat ../backend/API_URL 2>/dev/null || true)"
node tests/parity.js >/dev/null
python3 tests/test_calc.py >/dev/null
python3 web/build.py https://echosapce-cpu.github.io/ahsib-aqarak/ "$API" --standalone
python3 tests/e2e_api.py "$PWD/web/dist/index.html" /tmp/e2e.png >/dev/null || { [ -z "$API" ] || exit 1; }
cp web/dist/index.html ../index.html
cp scripts/fees.json ../fees.json
cp backend/Code.gs ../backend/Code.gs
echo "release ok (api: ${API:-none})"
