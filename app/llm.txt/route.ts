export const dynamic = 'force-static'

export async function GET() {
  const body = `# ThemeInvestor

> Thesis-centric investment analysis platform. A thesis is the investment narrative — not a ticker list. Each thesis connects to a basket of stocks that benefit from that narrative. Features: AI-powered analysis, paper trading, thesis monitoring, cross-site sync, and FalkorDB graph database integration.

## Key Pages
- [Home](/) — landing page
- [Dashboard](/dashboard) — user dashboard with active theses
- [Themes](/themes) — public theme gallery with published analyses
- [Analyze](/analyze) — create new investment thesis analysis
- [Paper Trades](/paper-trades) — paper trading with limit/stop orders
- [Admin](/admin) — admin panel (publish, sync, manage users)
- [Pricing](/pricing) — subscription plans
- [Settings](/settings) — user settings
- [Strategies](/strategies) — trading strategies

## API
- [Analyze](/api/analyze) — AI-powered thesis analysis (auth required)
- [Paper Trade](/api/paper-trade) — paper trade management (auth required)
- [Cron Stock Update](/api/cron/stock-update) — scheduled stock data updates
- [Cron Thesis Monitor](/api/cron/thesis-monitor) — thesis alert evaluation
- [Stripe Webhooks](/api/stripe) — Stripe webhook endpoint
- [Cross-Site Sync](/api/tradescouter/sync) — sync with TradeScouter
- [Cross-Site Sync](/api/optionlookup/sync) — sync with OptionLookup

## Links
- [GitHub](https://github.com/sunetoft/themevalidator)
- [Family](https://bunnystocks.com) — Bunnystocks tools ecosystem
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
