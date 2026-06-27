#!/bin/bash
# ThemeInvestor Stripe Setup Script
# Run this after adding STRIPE_SECRET_KEY to .env
# Usage: source .env && bash scripts/setup-stripe.sh

set -e

STRIPE_KEY="${STRIPE_SECRET_KEY}"
if [[ -z "$STRIPE_KEY" ]] || [[ "$STRIPE_KEY" == '""' ]]; then
  echo "❌ STRIPE_SECRET_KEY not set. Add it to .env first."
  exit 1
fi

export STRIPE_API_KEY="$STRIPE_KEY"

# Change price here when you decide on the final amount
PRICE_CENTS=${1:-2500}  # Default: $25.00/month

echo "🔧 Creating Stripe product and monthly price (\$$(echo "scale=2; $PRICE_CENTS/100" | bc)/month)..."

# Create product
PRODUCT=$(stripe products create \
  --name="ThemeInvestor Pro" \
  --description="Create trading strategies and up to 20 paper trades on investment themes" \
  2>/dev/null)
PRODUCT_ID=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Product: $PRODUCT_ID"

# Create single monthly recurring price
PRICE=$(stripe prices create \
  --product="$PRODUCT_ID" \
  --unit-amount="$PRICE_CENTS" \
  --currency=usd \
  --recurring-interval=month \
  --recurring-interval-count=1 \
  --nickname="themeinvestor-monthly" \
  2>/dev/null)
PRICE_ID=$(echo "$PRICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Price: $PRICE_ID"

echo ""
echo "✅ Done!"
echo ""
echo "📋 Add to your .env:"
echo "STRIPE_PRICE_ID=\"${PRICE_ID}\""
echo ""
echo "Next: Set up webhook with:"
echo "  stripe listen --forward-to localhost:3001/api/stripe/webhook"
echo "  # Copy the webhook signing secret (whsec_...) to STRIPE_WEBHOOK_SECRET"
