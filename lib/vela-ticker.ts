'use client';

import type { DataProvider, OHLCV, SymbolDescriptor, ProviderInfo, BarRange } from '@luxalgo/vela';

/**
 * Vela chart plumbing for the ThemeInvestor ticker modal.
 *
 * Data comes from our own `/api/ticker-chart` route (Yahoo), exposed to Vela as a
 * `DataProvider` — the same shape SaxoAITrader uses for its `saxo:` provider.
 * Everything here is client-only: never static-import `@luxalgo/vela`.
 */

export const TICKER_TIMEFRAMES = ['15', '60', '240', 'D', 'W', 'M'] as const;
export type TickerTimeframe = (typeof TICKER_TIMEFRAMES)[number];

export const TIMEFRAME_LABELS: Record<string, string> = {
  '15': '15m',
  '60': '1H',
  '240': '4H',
  D: '1D',
  W: '1W',
  M: '1M',
};

/** EMA stack requested for this modal: 9 / 21 / 50 / 130 (same colours as /charts). */
export const EMA_SET = [9, 21, 50, 130];
export const EMA_COLORS = ['#FFD700', '#FF9800', '#F23645', '#40E0D0']; // yellow, orange, red, turquoise

export interface Providers { [name: string]: DataProvider }

async function fetchBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
  const params = new URLSearchParams({ ticker, timeframe, levels: '0' });
  if (range?.limit) params.set('count', String(range.limit));
  const res = await fetch(`/api/ticker-chart?${params.toString()}`);
  if (!res.ok) throw new Error(`chart fetch ${res.status}`);
  const json = (await res.json()) as { bars?: OHLCV[] };
  return json.bars ?? [];
}

export function createTickerProvider(): DataProvider {
  return {
    getBars: (ticker, timeframe, range) => fetchBars(ticker, timeframe, range),
    async listSymbols(): Promise<SymbolDescriptor[]> {
      return [];
    },
    info(): ProviderInfo {
      return {
        name: 'yahoo',
        displayName: 'Yahoo Finance',
        capabilities: { enumerate: false, stream: false, symbolInfo: false },
        supportedTimeframes: [...TICKER_TIMEFRAMES],
      };
    },
  };
}

// ── indicators ───────────────────────────────────────────────────────────────

export interface DefaultIndicators {
  emas: any[];
}

/**
 * Add the EMA 9/21/50/130 stack. Must be called AFTER `await chart.ready()`.
 * Colors are positional, so each length keeps its legend colour.
 */
export function addEmaStack(chart: any, lengths: number[] = EMA_SET): DefaultIndicators {
  const emas = lengths.map((len, i) =>
    chart.addNativeIndicator('ema', { inputs: { length: len, color: EMA_COLORS[i % EMA_COLORS.length] } })
  );
  return { emas };
}

// ── expected-move / price overlay lines ──────────────────────────────────────

export interface ExpectedMove {
  expiry: string;
  em: number;
  upper: number;
  lower: number;
}

const SPOT_COLOR = '#9ca3af';
const EM_GREYS = ['#9ca3af', '#6b7280', '#4b5563']; // nearest → furthest Friday

function addHline(
  chart: any,
  price: number,
  opts: { color: string; width: number; lineStyle: 'solid' | 'dashed' | 'dotted'; label: string }
): void {
  try {
    chart?.drawings?.add?.('hline', {
      paneId: 'price',
      anchors: [{ time: Date.now(), price }],
      style: { lineColor: opts.color, lineWidth: opts.width, lineStyle: opts.lineStyle },
      text: { value: opts.label, size: 'small', hAlign: 'left', vAlign: 'top' },
    });
  } catch {
    /* ignore */
  }
}

/** True if a serialized drawing is one of OUR overlay lines (by label shape). */
function isOverlayLine(d: any): boolean {
  if (d?.type !== 'hline') return false;
  const v = String(d?.text?.value ?? '');
  return v.startsWith('Spot') || /^\d{2}-\d{2}\s/.test(v); // EM lines: "09-11 +5.18"
}

/** Remove every overlay line this modal owns (never touches user drawings). */
export function clearOverlayLines(chart: any): void {
  const drawings = chart?.drawings;
  if (!drawings?.toJSON) return;
  let doc: any;
  try {
    doc = drawings.toJSON();
  } catch {
    return;
  }
  for (const d of doc?.drawings ?? []) {
    if (!isOverlayLine(d)) continue;
    try {
      drawings.remove(d.id);
    } catch {
      /* ignore */
    }
  }
}

/** Draw spot ± EM for each of the 3 future expiries. */
export function drawExpectedMoves(chart: any, spot: number | null, moves: ExpectedMove[]): void {
  if (!chart?.drawings?.add) return;
  if (spot != null) {
    addHline(chart, spot, { color: SPOT_COLOR, width: 1, lineStyle: 'dashed', label: `Spot ${spot.toFixed(2)}` });
  }
  moves.forEach((m, i) => {
    const color = EM_GREYS[i % EM_GREYS.length];
    const mmdd = m.expiry.slice(5); // MM-DD
    addHline(chart, m.upper, { color, width: 1, lineStyle: 'dotted', label: `${mmdd} +${m.em.toFixed(2)}` });
    addHline(chart, m.lower, { color, width: 1, lineStyle: 'dotted', label: `${mmdd} −${m.em.toFixed(2)}` });
  });
}

export async function fetchChartPayload(ticker: string, timeframe: string): Promise<{
  bars: OHLCV[];
  spot: number | null;
  expectedMoves: ExpectedMove[];
}> {
  const res = await fetch(
    // count=1: this call only needs the latest bar (spot) + the option-derived
    // expected moves — Vela fetches its own bars through the provider.
    `/api/ticker-chart?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}&levels=1&count=1`
  );
  if (!res.ok) throw new Error(`chart fetch ${res.status}`);
  const json = (await res.json()) as { bars?: OHLCV[]; spot?: number | null; expectedMoves?: ExpectedMove[] };
  return { bars: json.bars ?? [], spot: json.spot ?? null, expectedMoves: json.expectedMoves ?? [] };
}
