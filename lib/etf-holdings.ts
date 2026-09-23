/**
 * Cross-app reverse lookup against the ETF Positivlisten app (etf.stdigital.dk).
 *
 * Given a thesis basket of stock tickers, the ETF app returns the funds on the
 * Danish tax "positivliste" that actually hold those stocks, ranked by how much
 * of the basket each fund covers. Powers the "Positivliste ETF exposure" card on
 * the theme detail page.
 *
 * The ETF app owns the holdings data — we never read its DB directly. We call
 * its `GET /api/external/holdings-by-tickers` endpoint with the shared ecosystem
 * secret (`CROSS_SITE_API_KEY`) over localhost (`ETF_INTERNAL_URL`).
 *
 * Results are cached in-process for 15 minutes: holdings only change when the
 * ETF app's weekly refresh cron runs, and the theme detail API is called on
 * every page view.
 */

const TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_TICKERS = 40;
const DEFAULT_LIMIT = 12;

export interface PositivlisteHolding {
  ticker: string;
  weight: number;
  rank: number;
  companyName: string | null;
}

export interface PositivlisteFund {
  id: string;
  isin: string | null;
  name: string;
  ticker: string | null;
  fundType: string | null;
  currency: string | null;
  domicile: string | null;
  ter: number | null;
  matchCount: number;
  totalWeight: number;
  holdings: PositivlisteHolding[];
}

export interface PositivlisteCoverage {
  ticker: string;
  fundCount: number;
  maxWeight: number;
  found: boolean;
}

export interface PositivlisteExposure {
  tickers: string[];
  coverage: PositivlisteCoverage[];
  /** Ranked by breadth (thesis stocks held), then combined weight. */
  funds: PositivlisteFund[];
  /** Same fund pool, ranked purely by combined weight in the thesis stocks. */
  fundsByExposure: PositivlisteFund[];
  /** Total funds matching ANY ticker, before the `limit` slice. */
  fundCount: number;
  generatedAt: string;
}

interface CacheEntry {
  at: number;
  data: PositivlisteExposure | null;
}

const cache = new Map<string, CacheEntry>();

function baseUrl(): string {
  return process.env.ETF_INTERNAL_URL || 'http://localhost:3018';
}

/** Same normalization the ETF app's Holding index uses (uppercase, no exchange suffix). */
export function normalizeTicker(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toUpperCase()
    .trim()
    .replace(/^\$/, '')
    .split(/[\s:]/)[0]
    .replace(/\.(US|O|N|LN|DE|PA|AS|SW|OL|ST|CO|HK|TO|AX|SS|SZ|MI|VI|HE|F|TG)$/, '');
}

/**
 * Reverse-lookup the funds on the positivliste holding any of `tickers`.
 * Returns null when the ETF app is unreachable or misconfigured — callers
 * should simply render no card rather than fail the page.
 */
export async function getPositivlisteExposure(
  tickers: string[],
  opts: { limit?: number; fundType?: string } = {}
): Promise<PositivlisteExposure | null> {
  const clean = Array.from(
    new Set(tickers.map(normalizeTicker).filter((t) => /^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(t)))
  ).slice(0, MAX_TICKERS);

  if (clean.length === 0) return null;

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cacheKey = `${clean.slice().sort().join(',')}|${limit}|${opts.fundType ?? ''}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const apiKey = process.env.CROSS_SITE_API_KEY;
  if (!apiKey) {
    console.warn('[etf-holdings] CROSS_SITE_API_KEY not set — skipping positivliste card');
    cache.set(cacheKey, { at: Date.now(), data: null });
    return null;
  }

  const url = new URL('/api/external/holdings-by-tickers', baseUrl());
  url.searchParams.set('tickers', clean.join(','));
  url.searchParams.set('limit', String(limit));
  if (opts.fundType) url.searchParams.set('fundType', opts.fundType);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[etf-holdings] ETF app responded ${res.status} for ${clean.length} tickers`);
      cache.set(cacheKey, { at: Date.now() - (TTL_MS - FAILURE_TTL_MS), data: null });
      return null;
    }
    const data = (await res.json()) as PositivlisteExposure;
    const result: PositivlisteExposure = {
      tickers: data.tickers ?? clean,
      coverage: data.coverage ?? [],
      funds: data.funds ?? [],
      fundsByExposure: data.fundsByExposure ?? data.funds ?? [],
      fundCount: data.fundCount ?? 0,
      generatedAt: data.generatedAt ?? new Date().toISOString(),
    };
    cache.set(cacheKey, { at: Date.now(), data: result });
    return result;
  } catch (err) {
    console.warn('[etf-holdings] positivliste lookup failed:', (err as Error)?.message ?? err);
    // Cache the failure only briefly — long enough that a down ETF app doesn't add
    // its timeout to every page view, short enough to recover from a restart.
    cache.set(cacheKey, { at: Date.now() - (TTL_MS - FAILURE_TTL_MS), data: null });
    return null;
  }
}

/** Deep-link a fund to its page on the ETF app. */
export function etfFundUrl(id: string): string {
  return `https://etf.stdigital.dk/fond/${id}`;
}

/** Deep-link a reverse-lookup search for one ticker on the ETF app. */
export function etfTickerSearchUrl(ticker: string): string {
  return `https://etf.stdigital.dk/find-etf?mode=holdings&q=${encodeURIComponent(ticker)}`;
}
