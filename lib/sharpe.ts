/**
 * Sharpe Ratio computation utilities.
 *
 * Uses daily-close methodology: snapshots are grouped by calendar day,
 * the last value of each day is used as the daily close, and daily
 * returns are annualised with sqrt(252).
 *
 * Risk-free rate defaults to 4.5 %/yr (short-term T-bill proxy).
 */

export const RISK_FREE_RATE_ANNUAL = 0.045;
export const TRADING_DAYS = 252;

interface SnapshotLike {
  totalValue: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positions?: any;
  createdAt: Date | string;
}

/**
 * Group a time series by UTC date and return the last value per day.
 */
function dailyCloses(
  snapshots: SnapshotLike[],
  getValue: (s: SnapshotLike) => number
): number[] {
  const byDay = new Map<string, number>();
  for (const snap of snapshots) {
    const dayKey = new Date(snap.createdAt).toISOString().slice(0, 10);
    byDay.set(dayKey, getValue(snap)); // last write wins → closing value
  }
  // Sort chronologically by date key then return values
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

/**
 * Compute annualised Sharpe ratio from a list of closing values.
 * Returns null when there isn't enough data (< 2 closes or 0 variance).
 */
function sharpeFromCloses(closes: number[]): number | null {
  if (closes.length < 2) return null;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }

  if (returns.length < 1) return null;

  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / n;
  const std = Math.sqrt(variance);

  if (std === 0) return null;

  const rfDaily = RISK_FREE_RATE_ANNUAL / TRADING_DAYS;
  return ((mean - rfDaily) / std) * Math.sqrt(TRADING_DAYS);
}

/**
 * Compute the Sharpe ratio for a paper trade (whole basket).
 */
export function computeTradeSharpe(snapshots: SnapshotLike[]): number | null {
  return sharpeFromCloses(dailyCloses(snapshots, (s) => s.totalValue));
}

/**
 * Compute the Sharpe ratio for a single ticker within a paper trade.
 */
export function computeTickerSharpe(
  snapshots: SnapshotLike[],
  ticker: string
): number | null {
  const filtered = snapshots.filter(
    (s) => s.positions && s.positions[ticker] != null
  );
  return sharpeFromCloses(
    dailyCloses(filtered, (s) => s.positions[ticker].marketValue as number)
  );
}

/**
 * Compute Sharpe ratios for all tickers in a paper trade.
 * Returns a map of ticker → sharpe (or null).
 */
export function computeAllTickerSharpes(
  snapshots: SnapshotLike[]
): Record<string, number | null> {
  const tickers = new Set<string>();
  for (const s of snapshots) {
    if (s.positions) {
      for (const t of Object.keys(s.positions)) tickers.add(t);
    }
  }

  const result: Record<string, number | null> = {};
  for (const t of tickers) {
    result[t] = computeTickerSharpe(snapshots, t);
  }
  return result;
}

/**
 * Return a CSS colour class based on the Sharpe ratio thresholds:
 *  - < 1  → red
 *  - > 2  → green
 *  - else → neutral
 */
export function sharpeColorClass(sharpe: number | null): string {
  if (sharpe === null) return "text-muted-foreground";
  if (sharpe < 1) return "text-red-400";
  if (sharpe > 2) return "text-primary";
  return "text-yellow-400";
}
