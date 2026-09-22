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
- **Graph DB:** FalkorDB for thesis graph analysis (companies, supply chains, bottlenecks)
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
| `SSO_PROVIDER_URL` | `https://dashboard.bunnystocks.com` — BunnyStocks IdP URL |
| `SSO_CLIENT_ID` | `themeinvestor` — This app's SSO client ID |
| `SSO_CLIENT_SECRET` | Same value as `CROSS_SITE_API_KEY` — SSO shared secret |
| `FALKORDB_HOST` | FalkorDB graph database host |
| `FALKORDB_PORT` | FalkorDB port (6379) |
| `FALKORDB_PASSWORD` | FalkorDB auth password |

> ⚠️ **GLM is a reasoning model — MUST disable `thinking` or responses come back
> empty.** `glm-5.1` is silently aliased to `glm-5.3` by Z.AI. Reasoning models emit
> `reasoning_content` BEFORE `content`, and that reasoning consumes the SAME
> `max_tokens` budget. On the large analyze prompt the reasoning can exceed
> 16k tokens, so `content` comes back empty (`fullContent length: 0`, thesis stuck
> in `status: analyzing` → `failed`). **Fix:** `lib/llm.ts` passes
> `thinking: { type: "disabled" }` on every call (matching AudienceExperts). If you
> ever remove that, analysis silently breaks. Raising `max_tokens` alone is NOT a
> reliable fix.

## GLM Response Repair Layer (`lib/llm-json.ts`)

`glm-5.x` frequently does NOT honour the requested JSON shape even with
`response_format: { type: "json_object" }`. Measured on the analyze prompt:
**~50% of responses needed repair or were unusable** (Sept 2026), which surfaced
to users as *"Analysis produced no results — LLM returned empty response"*.
Observed shapes (real samples saved in `/tmp/ti-raw-*.txt` by the trials script):

| Shape | Example | Handled by |
|-------|---------|-----------|
| Envelope wrapper | `{"answer":"<analysis as JSON string>"}` | `parseLLMJson` unwraps `answer/result/response/…` |
| Double-encoded envelope | `{"answer":"\n{\n  \"title\": …"}` | extra unescape round (`unescapeDoubleEncoded`) |
| Preface / disclaimer inside the envelope | `"answer":"Note: I cannot verify the REAL-TIME FINANCIAL DATA…"` | prompt rules 12–14 + unwrap |
| Raw control chars in strings | `Bad control character in string literal` | `escapeControlCharsInStrings` |
| Truncated object | cut mid-array (max_tokens) | `balancedObject` + `closeTruncated` |
| Duplicated colon | `"pricingPowerBenefit":": "medium"` | `fuzzyRepair` |
| Duplicated block opener | `"},\n  {\n    {\n  "name": …` | `fuzzyRepair` |
| Structural `\n` escapes | literal `\n` outside strings | `normalizeStructuralEscapes` |
| Content-free refusal | `{"answer":"…I must end with a code block."}` | route-level recovery retry |

**Rules:**
- ALWAYS parse LLM output with `parseLLMJson()` / validate with `isUsableAnalysis()`.
  Never call bare `JSON.parse()` on an LLM response in this repo.
- Call sites: `app/api/analyze/route.ts`, `app/api/theses/[id]/retry/route.ts`,
  `app/api/theses/[id]/add-ticker/route.ts`, `lib/reanalyze.ts`.
- `/api/analyze` makes up to **TWO** recovery attempts when the streamed response is
  unusable: attempt 1 re-asks for the schema, attempt 2 asks for a *compact* analysis
  (max 6 companies, values < 25 words) because long hand-written JSON is what produces
  the slips. Only if all three fail does the thesis go `failed`. Keep this.
- The main prompt caps the basket at 8 companies and string values at ~40 words for the
  same reason — do not remove those limits without re-measuring the usable rate.
- A client disconnect (closed tab) during analysis stamps the thesis
  `failed — "Analysis interrupted (page closed)"` via `request.signal` + a `settled`
  guard, so no row is left stuck in `analyzing` forever.
- Diagnose any new shape with `explainLLMJsonParse(raw)` (returns a per-variant trace)
  and add the raw capture as a new `scripts/fixtures/glm/NN-*.txt` fixture.

## Smoke Tests

```bash
npm run test:llm-json      # 11 parser fixtures + replay of any /tmp/ti-raw-*.txt
npm run smoke:analyze      # end-to-end SSE test of /api/analyze (text + url), needs the app running
npm run smoke:llm          # single streaming LLM call through the real pipeline
npm run smoke:trials       # N repeated real LLM calls, saves raw output + failure-rate summary
```

`npm run smoke:analyze` logs in as the throwaway user `smoketest@stdigital.dk`
(password `SmokeTest!2026`, id `smoketest-user-001`) via the credentials provider
and asserts the SSE stream reaches `status: completed`. Exit code = number of
failed scenarios. **Analysis takes 100–140 s per run** — that is normal.

## FalkorDB Graph Integration

Completed thesis analyses can be synced to FalkorDB as queryable property graphs.

**How it works:**
- `lib/falkordb.ts` — `syncThesisToGraph(thesis)` maps LLM analysis JSON to graph nodes:
  - `ecosystem.members` → Company nodes with EXPOSED_TO (tier 1-3) relationships
  - `bottlenecks.items` → Product nodes with bottleneck_status
  - `valuation.topPicks` → Per-stock catalysts/risks
  - `themeName` → Theme node with thesis summary
- `POST /api/theses/[id]/sync-graph` — Admin-only API endpoint to trigger sync
- `GET /api/theses/[id]/sync-graph` — Check sync status

**Graph naming:** Theme name → slug (e.g., "AI Infrastructure" → `ai_infrastructure`).
Each theme gets its own FalkorDB graph, queryable via Cypher.

**Usage from admin:**
```bash
# Sync a single thesis
curl -X POST http://localhost:3001/api/theses/<thesis-id>/sync-graph \
  -H "Cookie: next-auth.session-token=<token>"

# Check status
curl http://localhost:3001/api/theses/<thesis-id>/sync-graph \
  -H "Cookie: next-auth.session-token=<token>"
```

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
- `BasketMember` = basket stocks on a specific Thesis (DB table still `ThemeMember` via @@map)
- `Theme.themes` → one-to-many → `Thesis`
- `Thesis.themeId` → nullable FK → `Theme`
- Public gallery at `/themes` shows published `Theme` cards with aggregated scores
- Theme detail at `/themes/[id]` shows theme overview + expandable thesis analysis cards
- `/thesis/[id]` redirects to `/themes/[themeId]` (merged July 2026 — single unified page)
- The theme detail page is the single entry point for viewing thesis analysis AND taking actions
- Analyze route auto-assigns theses to themes via LLM-suggested `themeName` (find-or-create by slug)
- **Publish flow:** New themes/theses created during analysis default to `isPublic: false`.
  Only admin can publish via the admin UI (PATCH `/api/admin/themes/[id]` sets `isPublic: true`
  on the theme and syncs all child theses). Non-logged-in users see ONLY admin-published themes.
- **View access (fixed Aug 2026):** `/themes/[id]` (page) and `GET /api/themes/[id]` render a theme
  if it is public OR the requester owns a thesis in it OR is admin. Non-public themes show only the
  owner's theses to non-admin owners (admins see all). This is what lets a user see their own
  just-created (non-public) analysis — the post-analysis redirect `/thesis/[id]` → `/themes/[themeId]`
  must NOT 404 for the owner. Anonymous visitors still get 404 on non-public themes.

### Action Button Visibility Rules (Theme Detail Page)

| Action | Visible To |
|--------|-----------|
| Sync to GraphDB | Admin only (`role === 'admin'` + thesis `status === 'completed'`) |
| Create Trading Strategy | Paying users (`hasSubscription === true`) + Admin |
| Add Ticker | Admin only (`role === 'admin'`) |

### LLM Analysis Schema (Consolidated — July 2026)

The LLM generates a **single `stocks[]` array** where each company object contains ALL
analytical dimensions (ecosystem role, financial health, technicals, product evaluator,
valuation/moat). The analyze and retry routes map this consolidated array back into the
separate DB JSON fields (`ecosystemData`, `financialData`, `technicalData`,
`valuationData`, `productEvaluator`) for backward compatibility with existing UI components.

**New Thesis fields (July 2026):**
- `productEvaluator` (Json) — `{ score, summary, perStock: [{ticker, flagshipProducts, pricingPower, pricingPowerEvidence, segmentGrowthHighlights, recentPartnerships, competitivePosition, productMoat}] }`
- `stocksData` (Json) — The raw consolidated `stocks[]` array from the LLM (all dimensions per stock)

**Product Evaluator** assesses whether companies have unique products that give them
pricing power. For each stock: flagship products, pricing power (strong/moderate/weak),
evidence from earnings (margin expansion, ASP increases), segment growth highlights,
recent partnerships, competitive position (monopoly/dominant/challenger/commodity),
and product moat type (patents/switching costs/network effects/scale/regulatory/none).

⚠️ The retry route (`app/api/theses/[id]/retry/route.ts`) is kept in sync with the analyze
route's prompt and enrichment pipeline. If you change the prompt in one, update both.

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
  compare/              Theme comparison view (select 2-3 themes, side-by-side)
  themes/               Public theme gallery + theme detail pages
components/             React components (Radix UI based)
hooks/                  Custom React hooks
lib/                    Shared utilities (auth, db, email, LLM, etc.)
prisma/                 Prisma schema + migrations
scripts/                Cron/maintenance scripts
```

## Theme Comparison View (`/compare`)

Public page (no auth required) where users select 2–3 published themes and view them
side-by-side. Data served by `GET /api/themes/compare?ids=id1,id2,id3`.

**Sections:**
1. **Thesis Score Comparison** — Radar chart overlay (all themes' 6-dimension scores on one
   chart) + numeric score table with 🏆 trophy icons marking the winner per dimension.
2. **Basket Composition** — Stock tickers per theme in colored columns + shared holdings
   overlap analysis (tickers appearing in multiple themes highlighted).
3. **Paper Trade Performance** — Active trade count, total value, avg/best/worst P&L %.
4. **Sentiment & Social Signals** — Bar chart comparing sentiment scores + tweet counts.
5. **At a Glance** — Summary table of winners across all dimensions + best P&L + largest basket.

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
