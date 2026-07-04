# AGENTS.md — ThemeValidator (ThemeInvestor)

> **Product name:** ThemeInvestor
> **Domain:** `themeinvestor.bunnystocks.com`
> **GitHub:** `sunetoft/themevalidator` (private)
> **Local path:** `/Users/sune/projects/themevalidator`

## What This App Does

Thesis-centric investment analysis platform. A **thesis** is the investment
narrative (e.g. "Supply bottleneck in photonics CPO manufacturing") — NOT a
ticker list. The thesis connects to a BASKET of stocks that benefit.
Scoring/UI/LLM must be thesis-centric, with the basket as supporting evidence.

Features: AI-powered thesis analysis, paper trading with limit/stop orders,
thesis monitoring alerts, cross-site sync with TradeScouter and OptionLookup.

## Tech Stack

- **Framework:** Next.js 14+ App Router, TypeScript, Tailwind CSS
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** NextAuth.js (Google OAuth + credentials)
- **Payments:** Stripe subscriptions
- **LLM:** Z.AI GLM via `/api/coding/paas/v4` endpoint
- **UI:** Radix UI primitives, Lucide icons, next-themes (dark mode)

## Environment Variables

Copy `.env` (not committed) and fill in:

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ZAI_API_KEY` | Z.AI API key for LLM calls |
| `ZAI_BASE_URL` | Must be `https://api.z.ai/api/coding/paas/v4` |
| `LLM_MODEL` | GLM model name |
| `NEXTAUTH_SECRET` | NextAuth session secret |
| `NEXTAUTH_URL` | `https://themeinvestor.bunnystocks.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Stripe payments |
| `PAPER_TRADE_CRON_KEY` | Auth token for price-check cron endpoint |
| `X_API_BEARER_TOKEN` | X/Twitter API for sentiment data |
| `ADMIN_EMAIL` | Admin user email |
| `BREVO_API_KEY` | Brevo transactional email |
| `CROSS_SITE_API_KEY` | Shared secret for inter-app API calls |
| `TRADESCOUTER_INTERNAL_URL` | `http://localhost:3013` |
| `OPTIONLOOKUP_INTERNAL_URL` | `http://localhost:3011` |

> ⚠️ GLM is a reasoning model — set `max_tokens` to 2000+ or responses come
> back empty (reasoning tokens consume the budget).

## Database

```bash
npx prisma generate      # generate client
npx prisma db push       # sync schema to DB
npx prisma migrate dev   # create migration
npx prisma studio        # GUI browser
```

**Models:** User, Account, Session, VerificationToken, **Theme**, Thesis, TradeStrategy,
PaperTrade, PaperOrder, PaperPosition, PaperTradeLog, PaperTradeSnapshot,
ThemeMember (basket stocks on a Thesis), PasswordReset, Subscription, ThesisAlert

**Theme vs Thesis architecture:**
- `Theme` = macro investment category (e.g., "AI Infrastructure Buildout") — the parent
- `Thesis` = specific investment narrative within a theme (e.g., "CPO supply bottleneck")
- `ThemeMember` = basket stocks on a specific Thesis (not on Theme directly)
- `Theme.themes` → one-to-many → `Thesis`
- `Thesis.themeId` → nullable FK → `Theme`
- Public gallery at `/themes` shows published `Theme` cards with aggregated scores
- Theme detail at `/themes/[id]` shows theme overview + expandable thesis analysis cards
- `/thesis/[id]` remains the user's private authenticated thesis detail view
- Analyze route auto-assigns theses to themes via LLM-suggested `themeName` (find-or-create by slug)

## Build & Deploy

```bash
cd /Users/sune/projects/themevalidator
npm install
npm run build            # runs prisma generate + next build
```

**Port:** 3001

### Production Deploy (macOS launchd)

```bash
# 1. Build
cd /Users/sune/projects/themevalidator && npm run build

# 2. Restart launchd service (CRITICAL — stale chunks = 404)
launchctl unload ~/Library/LaunchAgents/com.stdigital.themevalidator.plist
launchctl load ~/Library/LaunchAgents/com.stdigital.themevalidator.plist

# 3. Verify
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
curl -s -o /dev/null -w "%{http_code}" "https://themeinvestor.bunnystocks.com/?nocache=$(date +%s)"
```

> **#1 Gotcha:** After `npm run build`, you MUST restart the launchd service.
> Old HTML references stale webpack JS chunk hashes → 404 → page looks broken.

### Cloudflare Cache

Cannot purge CF cache via API. Always use `?nocache=TIMESTAMP` for verification.

## Directory Structure

```
app/                    Next.js App Router
  api/                  API routes (analyze, paper-trade, auth, stripe, etc.)
  thesis/[id]/          Thesis detail pages
  paper-trades/         Paper trade dashboard
  dashboard/            Main user dashboard
  admin/                Admin panel
  settings/             User settings
  pricing/              Stripe pricing page
components/             React components (Radix UI based)
hooks/                  Custom React hooks
lib/                    Shared utilities (auth, db, email, LLM, etc.)
prisma/                 Prisma schema + migrations
scripts/                Cron/maintenance scripts
```

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `com.stdigital.themevalidator.cron` | Daily | Stock data update |
| `com.stdigital.themevalidator.thesis-monitor.cron` | Daily | Thesis alert monitoring |
| Paper trade price checker (Hermes cron) | Every 15 min | Checks pending limit orders against live prices during NYSE hours |

## Cross-App Dependencies

- **TradeScouter** (`localhost:3013`): Syncs trader data, checks status
- **OptionLookup** (`localhost:3011`): Syncs option analysis data
- All cross-site calls authenticated via `CROSS_SITE_API_KEY` shared secret

## Design Requirements

Paper-trade detail pages (`/thesis/[id]/paper-trade/[tradeId]`) must **always
display ALL pending orders** — buy limits + sell exits (stop-loss/take-profit).
This is a standing requirement.
