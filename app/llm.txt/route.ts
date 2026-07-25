export const dynamic = 'force-static'

export async function GET() {
  const body = `# ThemeInvestor

> Thesis-centric investment analysis platform (ThemeInvestor/ThemeValidator). A **thesis** is the investment narrative — not a ticker list. Each thesis connects to a basket of stocks that benefit from that narrative. Features: AI-powered analysis, paper trading with limit/stop orders, thesis monitoring alerts, cross-site sync with TradeScouter and OptionLookup, and FalkorDB graph database integration. Tech stack: Next.js 14+ App Router, TypeScript, Tailwind CSS, PostgreSQL/Prisma, NextAuth.js (Google OAuth + credentials), Stripe subscriptions, Z.AI GLM LLM, FalkorDB graph DB.

## Architecture Notes
- **Theme vs Thesis:** \`Theme\` = macro investment category (e.g., "AI Infrastructure Buildout"). \`Thesis\` = specific investment narrative within a theme (e.g., "CPO supply bottleneck"). Themes have one-to-many theses.
- **Page merge (July 2026):** \`/thesis/[id]\` now redirects to \`/themes/[themeId]\`. The theme detail page is the single entry point for viewing thesis analysis and taking actions (trading strategies, paper trading, admin operations).
- **Publish flow:** New themes/theses default to \`isPublic: false\`. Only admin can publish via the admin UI. Non-logged-in users see ONLY admin-published themes in the public gallery.
- **Auth:** NextAuth.js with Google OAuth + credentials. Most API routes require auth via \`getServerSession(authOptions)\`.

## Public Pages (16 routes)
- [Home](/) — landing page with hero, features, and CTA
- [Dashboard](/dashboard) — user dashboard with active theses, stats, recent activity
- [Themes](/themes) — public theme gallery with published analyses, search/filter
- [Themes Detail](/themes/[id]) — theme overview + expandable thesis analysis cards (merged page; action buttons for sync-graph, create strategy, add ticker)
- [Analyze](/analyze) — create new investment thesis analysis; enter thesis description + stock tickers
- [Paper Trades](/paper-trades) — paper trading dashboard; list all active/completed trades
- [Admin](/admin) — admin panel (publish themes, sync to FalkorDB, manage users/strategies/paper trades)
- [Pricing](/pricing) — subscription plans (Stripe integration)
- [Settings](/settings) — user settings (profile, password, subscription)
- [Strategies](/strategies) — trading strategies overview/marketplace
- [Users](/users) — registered users directory (public profiles)
- [Login](/auth) — sign in (Google OAuth + credentials form)
- [Reset Password](/reset-password) — password reset form (with token from email)
- [Thesis Redirect](/thesis/[id]) — redirects to \`/themes/[themeId]\` (merged July 2026; falls back to \`/themes\`)
- [Create Strategy](/thesis/[id]/strategy) — interactive questionnaire → LLM-generated trading strategy with streaming; includes stock selection, risk profile, DCA/entry preferences; can start paper trade from generated strategy
- [Paper Trade Detail](/thesis/[id]/paper-trade/[tradeId]) — live paper trade dashboard: portfolio summary, positions table, pending limit/stop orders, filled order history, activity log, manual price check

## API Routes (42 endpoints)

### Auth
- [NextAuth](/api/auth/[...nextauth]) — NextAuth.js handler (GET/POST; Google OAuth + credentials)
- [Forgot Password](/api/auth/forgot-password) — POST; sends password reset email via Brevo
- [Reset Password](/api/auth/reset-password) — POST; resets password with token
- [Sign Up](/api/signup) — POST; create new user account (credentials)

### Analysis & Theses
- [Analyze](/api/analyze) — POST (auth); AI-powered thesis analysis via Z.AI GLM; creates Theme/Thesis + basket members; returns streaming SSE response
- [Theses List](/api/theses) — GET (auth); list user's theses; POST (auth); create new thesis
- [Thesis CRUD](/api/theses/[id]) — GET (auth); get thesis detail; PATCH (auth); update thesis; DELETE (auth); delete thesis
- [Retry Analysis](/api/theses/[id]/retry) — POST (auth); re-run LLM analysis on a thesis (kept in sync with /api/analyze prompt)
- [Thesis Strategy](/api/theses/[id]/strategy) — GET (auth); list strategies for thesis; POST (auth); generate prompt or strategy (streaming SSE when \`generateNow: true\`)
- [Thesis Trade Strategy](/api/theses/[id]/trade-strategy) — GET (auth); get trade strategy for thesis
- [Add Ticker](/api/theses/[id]/add-ticker) — POST (admin); add ticker to thesis basket
- [Sync to GraphDB](/api/theses/[id]/sync-graph) — POST (admin); sync thesis analysis to FalkorDB graph; GET; check sync status

### Themes
- [Theme CRUD](/api/themes/[id]) — GET (public); get theme detail with theses; PATCH (auth); update theme metadata

### Paper Trading
- [Paper Trades List](/api/paper-trades) — GET (auth); list user's paper trades; POST (auth); create paper trade
- [Start Paper Trade](/api/paper-trade/start) — POST (auth); start paper trade from strategy with selected tickers
- [Paper Trade CRUD](/api/paper-trade/[id]) — GET (auth); get paper trade detail; PATCH (auth); pause/resume/complete
- [Paper Trade Snapshots](/api/paper-trade/[id]/snapshots) — GET (auth); get snapshot history for charting
- [Check Prices](/api/paper-trade/check-prices) — POST (auth/cron key); evaluate limit/stop orders against current prices
- [Paper Trade by Strategy](/api/paper-trade/by-strategy/[strategyId]) — GET (auth); get paper trade for a given strategy

### Strategies
- [Strategies](/api/strategies) — GET (auth); list user's strategies; POST (auth); create strategy

### Users
- [Users List](/api/users) — GET; list registered users (public profiles)
- [User Detail](/api/users/[id]) — GET; get user profile; PATCH (auth); update own profile
- [User Profile](/api/user/profile) — GET (auth); get current user's profile; PATCH (auth); update profile

### Admin
- [Admin Overview](/api/admin/overview) — GET (admin); dashboard stats: user count, thesis count, subscription metrics
- [Admin Themes](/api/admin/themes) — GET (admin); list all themes for management
- [Admin Theme](/api/admin/themes/[id]) — PATCH (admin); publish theme + sync child theses; DELETE (admin); delete theme
- [Admin Thesis](/api/admin/theses/[id]) — PATCH (admin); update thesis; DELETE (admin); delete thesis
- [Admin Strategy](/api/admin/strategies/[id]) — GET/PATCH/DELETE (admin); manage trading strategies
- [Admin Paper Trade](/api/admin/paper-trades/[id]) — GET/PATCH/DELETE (admin); manage paper trades

### Stripe Payments
- [Stripe Webhook](/api/stripe/webhook) — POST (stripe signature); handle Stripe events (checkout.session.completed, customer.subscription.*)
- [Stripe Portal](/api/stripe/portal) — POST (auth); create Stripe customer portal session
- [Stripe Checkout](/api/stripe/checkout) — POST (auth); create Stripe checkout session for subscription
- [Stripe Pricing](/api/stripe/pricing) — GET; get pricing plans from Stripe

### Cross-Site Sync
- [TradeScouter Sync](/api/tradescouter/sync) — POST (api key); sync data to/from TradeScouter
- [TradeScouter Status](/api/tradescouter/status) — GET; check TradeScouter connection health
- [OptionLookup Sync](/api/optionlookup/sync) — POST (api key); sync data to/from OptionLookup
- [OptionLookup Status](/api/optionlookup/status) — GET; check OptionLookup connection health

### Cron Jobs
- [Cron Stock Update](/api/cron/stock-update) — POST (cron key); update cached stock prices for paper trades
- [Cron Thesis Monitor](/api/cron/thesis-monitor) — POST (cron key); evaluate thesis alerts + send notifications

### Other
- [Stock Chart](/api/stock-chart) — GET (auth); fetch OHLCV chart data for a ticker (\`?ticker=AAPL\`)
- [Subscription](/api/subscription) — GET (auth); get user subscription status; POST (auth); manage subscription
- [Upload Presigned](/api/upload/presigned) — POST (auth); generate presigned S3 upload URL

## Links
- [GitHub](https://github.com/sunetoft/themevalidator)
- [Bunnystocks](https://bunnystocks.com) — Bunnystocks tools ecosystem
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
