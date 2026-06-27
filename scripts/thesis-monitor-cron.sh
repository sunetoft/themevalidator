#!/bin/bash
cd /Users/Shared/Hermes/themevalidator
CRON_KEY=$(grep PAPER_TRADE_CRON_KEY .env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -s -X POST -H "Authorization: Bearer $CRON_KEY" http://localhost:3001/api/cron/thesis-monitor
