# CONTEXT.md — ThemeInvestor Domain Language

> **Product:** ThemeInvestor (a BunnyStocks webapp)
> **Domain:** `themeinvestor.bunnystocks.com`
> **Repo:** `themevalidator`
>
> This document defines the **ubiquitous language** — the core concepts of the
> ThemeInvestor domain, what each IS and IS NOT, and how they relate. It is
> conceptual, complementing `AGENTS.md` which is operational.

---

## 1. The Central Mental Model

ThemeInvestor is **thesis-centric**, not ticker-centric. The flow is:

```
THESIS  ──validated──▶  BASKET  ──strategy──▶  TRADE STRATEGY  ──paper-run──▶  PAPER TRADE
   │                       │                                                          │
   └──published──▶  THEME (public)  ◀──monitored──▶  THESIS ALERTS  ◀──drift───┘
```

A user articulates an **investment narrative** (the *thesis*). The system
**validates** it by mapping the narrative onto a **basket** of real equities,
**scoring** each dimension, optionally producing a **trade strategy**, and
letting the user **paper-trade** that strategy with simulated limit/stop orders.
Published theses become public **themes** that are continuously **monitored**
for drift via **thesis alerts**.

---

## 2. Core Entities

### Thesis
- **IS:** The investment narrative itself — a propositional claim about a market
  trend, e.g. *"Supply bottleneck in photonics CPO manufacturing."* Stored as a
  `Thesis` record with a title, description, source (text/URL/PDF), analysis
  JSON, and scores.
- **IS NOT:** A ticker list, a watchlist, or a portfolio. The tickers are
  *supporting evidence* for the narrative, not the thesis itself.
- **Lifecycle:** `pending` → `analyzing` → `completed` (or `failed`).
- **Owned by** a single `User` (`userId`). Cannot be edited by others.

### Basket
- **IS:** The set of stocks/ETFs that the analysis determines benefit from the
  thesis narrative. Physically stored as `ThemeMember` rows attached to the
  thesis. Equal-weight capital allocation is the default (`capital /
  memberCount`).
- **IS NOT:** A separate database table. "Basket" is the conceptual name for
  *the collection of theme members backing a thesis*.
- Related to, but distinct from, a **Theme ETF** (see §5): the basket is
  ThemeInvestor's own curated set; a theme ETF is a third-party fund covering a
  similar space.

### Theme (a.k.a. "published thesis")
- **IS:** A `Thesis` with `status = 'completed'` AND `isPublic = true`. Once
  published, it is readable by anyone (the `/api/themes/[id]` route requires no
  auth) and becomes eligible for the daily **thesis monitor**.
- **IS NOT:** A distinct entity type. Publication is a state transition
  (`isPublic` flips to true at `publishedAt`), not a separate model.
- A user may build **trade strategies** and **paper trades** on any theme
  (their own or public).

### ThemeMember / Ecosystem Member
- **IS:** One instrument within a basket. Carries `companyName`, optional
  `ticker`, `instrumentType` (`"stock"` | `"etf"`), `sector`, `role`,
  `competency`, `moatRating` (1–10), `valuationStatus`
  (`undervalued` | `fair` | `overvalued`), `marketCap`, `peRatio`, `notes`.
- **`role` values:** `supplier` | `enabler` | `end-user` | `infrastructure` |
  `competitor` — the member's function within the thesis ecosystem.
- **IS NOT:** The same as a `PaperPosition`. A theme member is *analytical*
  (part of the validated basket); a paper position is *simulated holdings* that
  only exist once a paper trade fills an order.

### TradeStrategy
- **IS:** An LLM-generated, markdown-formatted trading plan for a basket, tied
  to one thesis. Holds the user's `amount` (capital), `riskProfile`
  (`High` | `Medium` | `Low`), structured `answers` (risk questionnaire), the
  `generatedPrompt`, and the resulting `strategy` text.
- **IS NOT:** A trade itself. It is a *recipe*. Running it produces a
  `PaperTrade`.
- **Lifecycle:** `pending` → `generating` → `completed` (or `failed`).
- **Gated** behind an active subscription (or admin role).

### PaperTrade
- **IS:** A simulated, non-brokerage run of a trade strategy. Starts with
  `initialCapital` as `currentCash`, then fills orders, builds positions, and
  tracks `totalValue`, `pnl`, `pnlPercent`. Snapshoted over time for risk
  metrics.
- **IS NOT:** Real money, a brokerage order, or live execution. Prices come
  from Yahoo Finance / yfinance. No funds, no settlement, no tax lots.
- **Lifecycle:** `active` (or `pending`) → `completed`.
- Linked 1:1 to its parent `TradeStrategy` and `Thesis`.
- **Limit:** `PAPER_TRADE_LIMIT = 20` active paper trades per subscriber.

### PaperOrder
- **IS:** A single simulated order inside a paper trade. Three order types are
  generated per basket ticker:
  - **limit** (`side: buy`) — entry; fills when `currentPrice <= targetPrice`.
  - **stop-loss** (`side: sell`) — protective exit; fills when
    `currentPrice <= targetPrice`.
  - **take-profit** (`side: sell`) — exit; fills when
    `currentPrice >= targetPrice`.
- Fields: `targetPrice` (the trigger), `quantity`, `filledPrice`,
  `filledAt`, `status` (`pending` → `filled`).
- **IS NOT:** A market order. Only conditional (limit/stop) orders exist; there
  is no "fill at next available price" type.
- **Standing requirement:** paper-trade detail pages must always render *all*
  pending orders (buy limits + both sell exits).

### PaperPosition
- **IS:** The current simulated holding of one ticker in one paper trade:
  `quantity`, `avgCostBasis`, `currentPrice`, `marketValue`,
  `unrealizedPnl`. Unique per `(paperTradeId, ticker)`.

### PaperTradeSnapshot
- **IS:** A point-in-time capture of a paper trade's `totalValue`, `pnl`,
  `pnlPercent`, and per-ticker `{ marketValue, unrealizedPnl, quantity }`.
  Written every price check. Source data for **Sharpe ratio** computation.

### PaperTradeLog
- **IS:** An append-only audit trail of events on a paper trade:
  `trade_started`, `price_check` (records NYSE open/closed state),
  `order_filled` (with `priceAtAction`).

### ThesisAlert
- **IS:** A drift notification generated by the **thesis monitor** when a
  published theme's fresh data diverges from its **baseline**. Carries `type`,
  `severity` (`critical` | `warning` | `info` | `positive`), `ticker`,
  `title`, `description`, and a structured `data` payload of the triggering
  metrics.
- **IS NOT:** A user-configured price alert. Alerts are system-generated from
  rule thresholds against the publish-time snapshot.
- **Deduplicated** within a 24h window per `(type, ticker)`.

---

## 3. Validation & Scoring

"Validation" is the process of taking raw thesis input and producing a grounded,
multi-dimensional analysis with numeric scores.

### Score dimensions (each 0–100, higher = more favorable)
| DB field | Analysis section | Concept measured |
|---|---|---|
| `overallScore` | — | Weighted aggregate favoring ecosystem completeness, moat strength, and financial health |
| `sentimentScore` | `sentiment` | Social/news tone (bullish/bearish/neutral) from X/Twitter + RSS |
| `ecosystemScore` | `ecosystem` | Completeness & quality of the mapped basket |
| `riskScore` | `externalFactors` | External risk exposure (regulatory, macro, competitive) |
| `opportunityScore` | `bottlenecks` | Supply-side bottlenecks that confer pricing power |
| `moatScore` | `valuation` | Competitive-moat strength of top picks |

Financial-health and technical scores live inside `financialData`/`technicalData`
JSON (not as top-level columns).

### Score tiers (used everywhere for color/copy)
- **strong** — 70–100 (green / emerald)
- **moderate** — 50–69 (amber / yellow)
- **weak** — 0–49 (red)
- `null` / undefined — unscored (gray)

### Analysis sections (the LLM JSON contract)
- **sentiment** — `overall` (bullish/bearish/neutral), `score`, `summary`,
  `keySignals`, plus attached `xSentiment` tweets.
- **ecosystem** — `members[]` (the basket; see §2).
- **financialHealth** — per-stock `earningsAssessment`, `growthVsValuation`,
  `marginAnalysis`, `guidanceOutlook`, `healthGrade` (A–F), `keyMetric`.
- **technicalAnalysis** — per-stock `signal`, `trend`, `rsiInterpretation`,
  `keyLevels` (support/resistance), `actionableNote`.
- **themeETFs** — 3–6 real ETFs covering the theme (see §5).
- **externalFactors** — risk factors with `impact` and `severity`.
- **bottlenecks** — supply constraints with `pricingPowerBenefit` and
  `affectedCompanies`.
- **valuation** — `topPicks` with `moatStrength` (wide/narrow/none),
  `valuationGrade` (A–F), `catalysts`, `risks`.
- **keyTakeaways** — 3 summary bullets.

### Re-analysis
Adding a ticker to an existing thesis triggers **incremental re-analysis**
(`reanalyzeThesis`): the LLM merges the new member into the existing
ecosystem/bottleneck/valuation/external-factor sections and recalculates the
overall score — without a full re-run.

---

## 4. Financial & Technical Metrics (grounding data)

All analysis must be grounded in **real** yfinance data, never invented.

### Metrics (`StockMetrics`) — fundamentals
`marketCap`, `trailingPE`, `forwardPE`, **`pegRatio`** (PEG < 1 ⇒ growth
underpriced; PEG > 2 with slowing growth ⇒ overvalued), `priceToSales`,
`priceToBook`, `profitMargins`, `operatingMargins`, `revenueGrowth`,
`earningsGrowth`, `returnOnEquity`, `debtToEquity`, `currentRatio`,
`quickRatio`, `beta`, `dividendYield`, `enterpriseToRevenue`,
`enterpriseToEbitda`, 52-week high/low, `currentPrice`, `sharesOutstanding`.

### Earnings (`EarningsRecord[]`)
Last 4 quarters: `period`, `actual`, `estimate`, `surprise`,
`surprisePercent`, plus `nextEarningsDate`. **Beat/miss** is judged by
`surprisePercent` (monitor flags ≤ −5% as a miss, ≥ +5% as a beat).

### Technical (`TechnicalData`)
`rsi14` (overbought > 70, oversold < 30), `ma50`/`ma200`, `trend`
(`strong_bullish` | `bullish` | `neutral` | `bearish` | `strong_bearish`),
`aboveMA50`/`aboveMA200`, `pctFrom52wHigh`/`pctFrom52wLow`, `ytdReturn`,
`threeMonthReturn`, `recentSupport`, `recentResistance`, `avgVolume`.

### Analyst (`AnalystData`)
`targetMeanPrice`, `targetHighPrice`, `targetLowPrice`, `recommendationKey`
(mapped to a numeric rank: strong_buy 2 … strong_sell −2), `numberOfAnalysts`,
`upsideToTarget`.

### Risk-adjusted performance
- **Sharpe ratio** — annualized, daily-close methodology, `√252` scaling,
  risk-free rate 4.5%/yr (T-bill proxy). Computed both per-trade (whole basket)
  and per-ticker from `PaperTradeSnapshot`s. Color: < 1 red, 1–2 amber, > 2
  green.

---

## 5. Theme ETFs
- **IS:** Real, third-party ETFs (iShares, VanEck, Invesco…) that the analysis
  identifies as covering the thesis theme, with `symbol`, `name`, `provider`,
  `focus`, `aum`, `ytdReturn`, `overlap` (which basket stocks it holds), and
  `expenseRatio`. Real AUM/YTD/expense data is merged in from yfinance.
- **IS NOT:** A basket member. Theme ETFs are reference instruments; they can
  appear as a `ThemeMember` with `instrumentType: "etf"`, but conceptually they
  describe the *space* rather than being part of the curated basket thesis.

---

## 6. Monitoring & Drift Detection

The **thesis monitor** (daily cron) keeps published themes honest against the
market.

- **Baseline** — the metrics snapshot frozen at publish time
  (`Thesis.financialData.metrics`, `technicalData.indicators`,
  `earningsData`). Never mutated for drift comparison. The only rolling
  baseline is `financialData.lastAnalyst` (analyst recommendation isn't
  captured at publish, so the first run seeds it silently).
- **Expected move / price threshold** — a `±5%` (`PRICE_MOVE_PCT`) move from
  the published baseline price triggers a `price_surge` / `price_drop` alert.
  Other thresholds: earnings surprise ±5%, RSI 30/70, P/E stretch +20% from
  baseline, analyst-rank change ≥ 2.
- **Alert types:** `earnings_beat`, `earnings_miss`, `guidance_cut`,
  `price_surge`, `price_drop`, `technical_breakdown`, `technical_breakout`,
  `news_positive`, `news_negative`, `valuation_stretch`, `analyst_upgrade`,
  `analyst_downgrade`, `thesis_confirmation`.

---

## 7. Accounts, Access & Commerce

### User
- **role:** `"user"` (default) | `"admin"`. Admins bypass all subscription
  gates and paper-trade limits.
- Auth via NextAuth (Google OAuth or email/password credentials).

### Subscription
- **IS:** A Stripe-backed membership. Single plan tier (`"single"`), status
  `active` | `canceled` | `past_due` | `trialing`, with `currentPeriodStart`/
  `currentPeriodEnd` and `cancelAtPeriodEnd`.
- **Gates:** Creating trade strategies and paper trades (and exceeding 20
  active trades) require an active subscription — unless the user is admin.

### Cross-site context
ThemeInvestor is one app in a small suite authenticated to each other via a
shared `CROSS_SITE_API_KEY`:
- **TradeScouter** (`localhost:3013`) — trader data sync/status.
- **OptionLookup** (`localhost:3011`) — option-analysis data sync.

---

## 8. Glossary — IS / IS-NOT Quick Reference

| Term | IS | IS NOT |
|---|---|---|
| **Thesis** | The investment narrative/claim | A ticker list or watchlist |
| **Basket** | The collection of theme members backing a thesis | A DB table or a portfolio |
| **Theme** | A published (public) thesis | A separate entity from Thesis |
| **ThemeMember** | Analytical instrument in a basket | A simulated holding |
| **TradeStrategy** | LLM-generated trading recipe (markdown) | An executed trade |
| **PaperTrade** | A simulated run of a strategy | Real/brokerage money |
| **PaperOrder** | A conditional order (limit/stop) | A market order |
| **PaperPosition** | Simulated holding of one ticker | A theme member |
| **ThesisAlert** | System-generated drift notification | A user price alert |
| **Baseline** | Publish-time metric snapshot | Mutated by monitoring |
| **Validation** | Grounding the narrative in real data + scores | Approving/rejecting a thesis |
| **Score** | 0–100 favorability per dimension | A grade or recommendation |
| **Moat** | Competitive advantage of a basket pick | A generic buzzword |
| **Bottleneck** | Supply constraint conferring pricing power | A generic obstacle |
