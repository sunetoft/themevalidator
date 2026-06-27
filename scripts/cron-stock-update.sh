#!/bin/bash
# Stock data refresh + order check cron for ThemeValidator
# Runs every 15 min via launchd. Called by com.stdigital.themevalidator.cron.plist

set -euo pipefail

# Load env vars (for CRON_KEY)
ENV_FILE="/Users/Shared/Hermes/themevalidator/.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep PAPER_TRADE_CRON_KEY | xargs)
fi

# Strip quotes from the key if present
CRON_KEY="${PAPER_TRADE_CRON_KEY//\"/}"
CRON_KEY="${CRON_KEY//\'/}"

ENDPOINT="http://localhost:3001/api/cron/stock-update"

# POST with auth header, 120s timeout
RESPONSE=$(curl -s -m 120 -X POST \
  -H "Authorization: Bearer ${CRON_KEY}" \
  -H "Content-Type: application/json" \
  "$ENDPOINT" 2>&1) || true

# Log to the themevalidator log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [stock-cron] ${RESPONSE}" >> /Users/sune/webserver/logs/themevalidator-cron.log
