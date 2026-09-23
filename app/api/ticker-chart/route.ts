export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/**
 * Chart data for the Vela ticker modal on the analysis result page.
 *
 * GET /api/ticker-chart?ticker=FSLR&timeframe=D&count=500&levels=1
 *  → { ticker, timeframe, bars: [{time, open, high, low, close, volume}], spot, expectedMoves }
 *
 * Bars come from Yahoo's chart endpoint via `yahoo-finance2` (v2 `quotes[]` shape,
 * ascending — same mapping the SaxoAITrader stack uses).
 *
 * `expectedMoves` mirrors SaxoAITrader's /charts overlay exactly:
 *   EM = 0.85 × (ATM call last + ATM put last) for the next 3 future Friday expiries,
 *   drawn as spot ± EM. The ATM strike is the one nearest spot in each chain.
 *
 * Public market data → no session required (the theme page is viewable while
 * signed out). Ticker input is validated and both layers are cached in-process.
 */

// ── timeframe → Yahoo interval / lookback ────────────────────────────────────
interface TfSpec {
  interval: string;
  days: number;
  /** Resample N native bars into one (Yahoo has no 4h interval). */
  resample?: number;
}

const TIMEFRAMES: Record<string, TfSpec> = {
  '1': { interval: '1m', days: 5 },
  '5': { interval: '5m', days: 30 },
  '15': { interval: '15m', days: 60 },
  '30': { interval: '30m', days: 60 },
  '60': { interval: '60m', days: 180 },
  '240': { interval: '60m', days: 365, resample: 4 },
  D: { interval: '1d', days: 730 },
  W: { interval: '1wk', days: 1825 },
  M: { interval: '1mo', days: 3650 },
};
// NOTE: route modules may only export HTTP handlers + Next config — keep this a
// plain const. The client's timeframe list lives in lib/vela-ticker.ts.
const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES);

export interface Bar {
  time: number; // epoch ms (bar open)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
/** Safety cap when the caller doesn't pass `count` (Vela always passes one). */
const HARD_BAR_CAP = 3000;

export interface ExpectedMove {
  expiry: string; // YYYY-MM-DD
  em: number;
  upper: number;
  lower: number;
}

async function getYF() {
  const YahooFinance = (await import('yahoo-finance2')).default as any;
  return new YahooFinance({ suppressNotices: ['yahooSurvey'] });
}

// ── bars ─────────────────────────────────────────────────────────────────────

async function fetchBars(ticker: string, spec: TfSpec): Promise<Bar[]> {
  const yf = await getYF();
  const now = new Date();
  const start = new Date(now.getTime() - spec.days * 24 * 60 * 60 * 1000);
  const res: any = await yf.chart(ticker, {
    period1: start,
    period2: now,
    interval: spec.interval,
  });

  const bars: Bar[] = [];
  for (const q of res?.quotes ?? []) {
    const t = q?.date instanceof Date ? q.date.getTime() : new Date(q?.date).getTime();
    if (!Number.isFinite(t)) continue;
    if (
      typeof q?.open !== 'number' ||
      typeof q?.high !== 'number' ||
      typeof q?.low !== 'number' ||
      typeof q?.close !== 'number'
    ) {
      continue;
    }
    if (![q.open, q.high, q.low, q.close].every((v: number) => Number.isFinite(v) && v > 0)) continue;
    bars.push({
      time: t,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: typeof q?.volume === 'number' ? q.volume : undefined,
    });
  }

  return spec.resample && spec.resample > 1 ? resample(bars, spec.resample) : bars;
}

/** Collapse every N consecutive bars into one (open first / close last / hi-lo extremes). */
function resample(bars: Bar[], n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += n) {
    const chunk = bars.slice(i, i + n);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + (b.volume ?? 0), 0) || undefined,
    });
  }
  return out;
}

// ── expected moves (EM = 0.85 × ATM straddle, next 3 future Fridays) ─────────

/** Nearest-to-spot ATM call + put premiums across a chain. */
function atmStraddle(calls: any[], puts: any[], spot: number): { callPx: number; putPx: number } {
  let atmCall: any = null;
  let atmPut: any = null;
  let minCall = Infinity;
  let minPut = Infinity;
  for (const c of calls) {
    const d = Math.abs((c?.strike ?? 0) - spot);
    if (d < minCall) {
      minCall = d;
      atmCall = c;
    }
  }
  for (const p of puts) {
    const d = Math.abs((p?.strike ?? 0) - spot);
    if (d < minPut) {
      minPut = d;
      atmPut = p;
    }
  }
  return {
    callPx: atmCall?.lastPrice ?? atmCall?.bid ?? 0,
    putPx: atmPut?.lastPrice ?? atmPut?.bid ?? 0,
  };
}

async function computeExpectedMoves(
  yf: any,
  ticker: string,
  spot: number
): Promise<ExpectedMove[]> {
  let dates: Date[] = [];
  try {
    const optData: any = await yf.options(ticker);
    dates = (optData?.expirationDates ?? [])
      .map((d: any) => new Date(d))
      .filter((d: Date) => !isNaN(d.getTime()) && d.getTime() > Date.now() && d.getUTCDay() === 5)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
  } catch {
    return [];
  }

  const out: ExpectedMove[] = [];
  for (const exp of dates.slice(0, 3)) {
    try {
      const chain: any = await yf.options(ticker, { date: exp });
      const calls = chain?.options?.[0]?.calls ?? [];
      const puts = chain?.options?.[0]?.puts ?? [];
      const { callPx, putPx } = atmStraddle(calls, puts, spot);
      const em = (callPx + putPx) * 0.85;
      if (em > 0) {
        out.push({
          expiry: exp.toISOString().split('T')[0],
          em,
          upper: spot + em,
          lower: spot - em,
        });
      }
    } catch {
      /* skip a bad/rate-limited expiry */
    }
  }
  return out;
}

// ── caches ───────────────────────────────────────────────────────────────────

const barCache = new Map<string, { at: number; bars: Bar[] }>();
const emCache = new Map<string, { at: number; moves: ExpectedMove[] }>();
const BAR_TTL = 60_000;
const EM_TTL = 5 * 60_000;

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ticker = (sp.get('ticker') ?? '').toUpperCase().trim();
  const timeframe = (sp.get('timeframe') ?? 'D').trim();
  const countRaw = parseInt(sp.get('count') ?? '0', 10);
  // 0 / missing / invalid = "no limit" — do NOT clamp up to 1 (that silently
  // truncated every chart to a single bar).
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(countRaw, 5000) : 0;
  const wantLevels = sp.get('levels') !== '0';

  if (!ticker || !TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }
  const spec = TIMEFRAMES[timeframe];
  if (!spec) {
    return NextResponse.json(
      { error: 'Unsupported timeframe', supported: TIMEFRAME_KEYS },
      { status: 400 }
    );
  }

  const key = `${ticker}|${timeframe}`;
  try {
    let entry = barCache.get(key);
    if (!entry || Date.now() - entry.at > BAR_TTL) {
      const bars = await fetchBars(ticker, spec);
      entry = { at: Date.now(), bars };
      barCache.set(key, entry);
    }
    let bars = entry.bars;
    if (!bars.length) {
      return NextResponse.json({ ticker, timeframe, bars: [], spot: null, expectedMoves: [] });
    }
    if (bars.length > (count > 0 ? count : HARD_BAR_CAP)) {
      bars = bars.slice(-(count > 0 ? count : HARD_BAR_CAP));
    }

    const spot = entry.bars[entry.bars.length - 1].close;

    let expectedMoves: ExpectedMove[] = [];
    if (wantLevels) {
      const cached = emCache.get(ticker);
      if (cached && Date.now() - cached.at < EM_TTL) {
        expectedMoves = cached.moves;
      } else {
        const yf = await getYF();
        expectedMoves = await computeExpectedMoves(yf, ticker, spot);
        emCache.set(ticker, { at: Date.now(), moves: expectedMoves });
      }
    }

    return NextResponse.json({ ticker, timeframe, bars, spot, expectedMoves });
  } catch (err: any) {
    console.warn('[ticker-chart]', ticker, timeframe, err?.message ?? err);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 502 });
  }
}
