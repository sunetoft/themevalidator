#!/usr/bin/env bash
# Monitor whether port 3001 stays accepting while an /api/analyze request streams.
JAR=$(mktemp /tmp/ti-jar2.XXXXXX)
BASE=http://localhost:3001
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=smoketest@stdigital.dk" \
  --data-urlencode "password=SmokeTest!2026" --data-urlencode "callbackUrl=$BASE/"

echo "pid before: $(launchctl list | awk '$3=="com.stdigital.themevalidator"{print $1}')"

# start analyze in background
curl -s -N -b "$JAR" -X POST "$BASE/api/analyze" -H "Content-Type: application/json" \
  -d '{"inputType":"text","text":"Port watchdog probe thesis: rare earth magnet supply squeeze. Basket: MP, ALB."}' \
  -o /tmp/ti-probe.out &
CURL_PID=$!

# probe the port every 2s for 90s
for i in $(seq 1 45); do
  TS=$(date +%H:%M:%S)
  if nc -z -G 2 127.0.0.1 3001 2>/dev/null; then PORT=UP; else PORT=DOWN; fi
  PID=$(launchctl list | awk '$3=="com.stdigital.themevalidator"{print $1}')
  if curl -s -m 3 -o /dev/null -w "%{http_code}" "$BASE/api/auth/session" >/dev/null 2>&1; then HTTP=ok; else HTTP=FAIL; fi
  echo "$TS port=$PORT http=$HTTP pid=$PID bytes=$(wc -c < /tmp/ti-probe.out 2>/dev/null)"
  kill -0 $CURL_PID 2>/dev/null || { echo "  (curl finished)"; break; }
  sleep 2
done
wait $CURL_PID 2>/dev/null
echo "analyze stream bytes: $(wc -c < /tmp/ti-probe.out)"
echo "pid after: $(launchctl list | awk '$3=="com.stdigital.themevalidator"{print $1}')"
rm -f "$JAR"
