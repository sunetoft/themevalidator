#!/usr/bin/env bash
# Smoke test themeinvestor /api/analyze end-to-end via credentials login.
# Usage: bash scripts/smoke-analyze.sh text|url
set -u
BASE="${BASE:-http://localhost:3001}"
MODE="${1:-text}"
EMAIL="${SMOKE_EMAIL:-smoketest@stdigital.dk}"
PASS="${SMOKE_PASS:-SmokeTest!2026}"
JAR=$(mktemp /tmp/ti-jar.XXXXXX)
OUT=/tmp/ti-analyze-$MODE.out

echo "== 1. csrf =="
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
echo "csrf=${CSRF:0:16}..."

echo "== 2. login =="
curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "  login HTTP %{http_code}\n" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "callbackUrl=$BASE/" \
  --data-urlencode "json=true"

echo "== 3. session =="
curl -s -b "$JAR" "$BASE/api/auth/session" | head -c 300; echo

if [ "$MODE" = "url" ]; then
  BODY='{"inputType":"url","url":"https://www.tradingview.com/news/cnbctv:8cbd8388e094b:0/"}'
else
  BODY='{"inputType":"text","text":"Permanent magnets bull case smoke test: NdFeB magnets are the critical input for EV motors and wind turbines. Structural supply squeeze as China controls rare earth refining. Basket: MP, ALB, LYSCF, VULNF."}'
fi

echo "== 4. POST /api/analyze ($MODE) =="
START=$(date +%s)
curl -s -N -b "$JAR" -X POST "$BASE/api/analyze" \
  -H "Content-Type: application/json" \
  -d "$BODY" -o "$OUT" -w "  HTTP %{http_code} bytes=%{size_download}\n"
echo "  elapsed $(( $(date +%s) - START ))s"

echo "== 5. SSE status lines =="
grep -o '"status":"[a-z]*"' "$OUT" | sort | uniq -c
echo "  --- last 3 events ---"
tail -c 1200 "$OUT"

echo
echo "== 6. DB latest 2 theses =="
psql "postgresql://sune@localhost/themevalidator" -c \
 "select id,\"inputType\",status,left(description,60) from \"Thesis\" order by \"createdAt\" desc limit 2;"
echo "raw stream saved: $OUT"
rm -f "$JAR"
