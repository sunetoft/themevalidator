/**
 * Live Quote Layer
 *
 * Server-side helper that fetches REAL, current market prices so that
 * LLM-generated content (trading strategies) and price columns are grounded in
 * actual market data instead of the model's training-cutoff memory.
 *
 * Why this exists:
 *   `app/api/theses/[id]/strategy/route.ts` used to ask the LLM for
 *   "approximate current prices" while passing ZERO price data in the prompt.
 *   GLM therefore invented prices from its training data — e.g. NVDA @ ~$135
 *   and PLTR @ ~$40 in Sept 2026, when the real prices were $228.87 and
 *   $184.99 (errors of -41% and -78%). Anything downstream of that text
 *   (position sizing, paper-trade entry/stop/take-profit bands) inherits the error.
 *
 * Design rules (learned from the GapTracker live price work):
 *   - Never fire an unbounded `Promise.all` — Yahoo rate-limits and returns
 *     garbage/null under parallel load. Use a concurrency-limited pool.
 *   - One retry pass for tickers that came back null.
 *   - Short in-process TTL cache (default 60s) so a page view + a generation
 *     don't hammer the API.
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

export interface LiveQuote {
  ticker: string
  /** Last traded / regular-market price. */
  price: number
  /** Previous session close, when the API provides it. */
  prevClose: number | null
  /** Day change in percent, derived when `prevClose` is available. */
  dayChangePct: number | null
  currency: string | null
  /** ISO timestamp of the quote, when reported. */
  asOf: string | null
}

interface CacheEntry {
  quotes: Map<string, LiveQuote>
  cachedAt: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

/** Hard ceiling so a runaway caller can't fan out to hundreds of tickers. */
const MAX_TICKERS = 60
const CONCURRENCY = 5

function cacheKey(tickers: string[]): string {
  return [...tickers].map((t) => t.toUpperCase()).sort().join(',')
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Fetch a single ticker's live quote from the Yahoo chart API. */
export async function getLiveQuote(ticker: string): Promise<LiveQuote | null> {
  const symbol = ticker.trim().toUpperCase()
  if (!symbol) return null

  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!resp.ok) {
      console.error(`[live-quotes] Yahoo HTTP ${resp.status} for ${symbol}`)
      return null
    }

    const data = await resp.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta ?? {}
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    // Prefer the live regular-market price; fall back to the newest non-null close.
    let price = num(meta.regularMarketPrice)
    if (price == null) {
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = num(closes[i])
        if (c != null) {
          price = c
          break
        }
      }
    }
    if (price == null || price <= 0) return null

    const prevClose =
      num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? null

    const marketTime = num(meta.regularMarketTime)

    return {
      ticker: symbol,
      price,
      prevClose,
      dayChangePct:
        prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null,
      currency: typeof meta.currency === 'string' ? meta.currency : null,
      asOf: marketTime ? new Date(marketTime * 1000).toISOString() : null,
    }
  } catch (error: any) {
    console.error(`[live-quotes] Failed to fetch ${symbol}:`, error?.message ?? error)
    return null
  }
}

/**
 * Fetch live quotes for many tickers.
 *
 * Concurrency-limited + one retry pass for misses. Results are cached for
 * `CACHE_TTL_MS`. Missing tickers are simply absent from the returned Map —
 * callers must handle absence rather than assuming a value.
 */
export async function getLiveQuotes(
  tickers: string[],
  opts: { bypassCache?: boolean } = {}
): Promise<Map<string, LiveQuote>> {
  const unique = Array.from(
    new Set(
      tickers
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim().toUpperCase())
    )
  ).slice(0, MAX_TICKERS)

  const out = new Map<string, LiveQuote>()
  if (unique.length === 0) return out

  const key = cacheKey(unique)
  if (!opts.bypassCache) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
      return new Map(hit.quotes)
    }
  }

  const first = await mapLimit(unique, CONCURRENCY, getLiveQuote)
  unique.forEach((t, i) => {
    const q = first[i]
    if (q) out.set(t, q)
  })

  // One retry pass — Yahoo intermittently returns null under load.
  const missed = unique.filter((t) => !out.has(t))
  if (missed.length > 0) {
    const retry = await mapLimit(missed, Math.min(CONCURRENCY, 2), getLiveQuote)
    missed.forEach((t, i) => {
      const q = retry[i]
      if (q) out.set(t, q)
    })
  }

  if (out.size > 0) {
    cache.set(key, { quotes: new Map(out), cachedAt: Date.now() })
  }
  return out
}

/** Invalidate the whole quote cache (used after an explicit refresh). */
export function clearLiveQuoteCache(): void {
  cache.clear()
}

/** Round to 2dp, dropping a trailing `.00` so `$498.00` reads as `$498`. */
export function fmtPrice(price: number): string {
  const rounded = Math.round(price * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2)
}

/**
 * Render the authoritative price table injected into the strategy prompt.
 * Tickers without a quote are listed as unavailable so the model knows it must
 * not guess for them.
 */
export function formatLivePriceTable(
  tickers: string[],
  quotes: Map<string, LiveQuote>,
  labelFor: (ticker: string) => string = (t) => t
): string {
  return tickers
    .map((t) => {
      const symbol = t.toUpperCase()
      const q = quotes.get(symbol)
      if (!q) {
        return `| ${symbol} | UNKNOWN — live quote unavailable | do NOT state a dollar price for this ticker |`
      }
      const change =
        q.dayChangePct != null
          ? ` (${q.dayChangePct >= 0 ? '+' : ''}${q.dayChangePct.toFixed(2)}% today)`
          : ''
      const prev =
        q.prevClose != null ? `, prev close $${fmtPrice(q.prevClose)}` : ''
      return `| ${symbol} — ${labelFor(symbol)} | $${fmtPrice(q.price)}${change}${prev} |`
    })
    .join('\n')
}

/** Human-readable "as of" stamp covering the freshest quote in the set. */
export function quotesAsOf(quotes: Map<string, LiveQuote>): string | null {
  let latest: number | null = null
  for (const q of quotes.values()) {
    if (!q.asOf) continue
    const t = Date.parse(q.asOf)
    if (Number.isFinite(t) && (latest == null || t > latest)) latest = t
  }
  return latest != null ? new Date(latest).toISOString() : null
}
