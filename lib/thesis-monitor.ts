/**
 * Thesis Monitoring Engine
 *
 * Daily cron job that checks all PUBLISHED themes (status='completed',
 * isPublic=true) for changes that could affect the investment thesis
 * narrative. Compares fresh yfinance data against the baseline snapshot
 * stored on the thesis when it was published, and creates ThesisAlert
 * records when meaningful drift is detected.
 *
 * Alert conditions (per ticker):
 *   - Earnings        : nextEarningsDate passed (new results) or a recent miss (>5% below estimate)
 *   - Price surge/drop: price moved >5% from the published baseline
 *   - Technical       : RSI < 30 (oversold / breakdown) or RSI > 70 (breakout),
 *                       or trend flipped bullish↔bearish
 *   - Analyst         : recommendationKey changed materially (e.g. buy → sell)
 *   - Valuation       : trailing P/E stretched >20% from the published baseline
 *
 * Baseline semantics:
 *   - Earnings / price / technical / valuation are compared against the ORIGINAL
 *     published snapshot (thesis.financialData / technicalData / earningsData),
 *     which is never mutated. This detects drift from the original thesis.
 *   - Analyst recommendation is NOT captured at publish time, so a rolling
 *     baseline is maintained in thesis.financialData.lastAnalyst. The first run
 *     establishes the baseline silently; subsequent runs detect changes.
 *
 * Dedup: the same alert type for the same ticker is not recreated within 24h.
 */

import { prisma } from '@/lib/prisma'
import {
  fetchFinancialData,
  type StockMetrics,
  type TechnicalData,
  type EarningsRecord,
  type AnalystData,
  type FinancialDataResult,
} from '@/lib/financial-data'

// ── Tunable thresholds ────────────────────────────────────────────────
const PRICE_MOVE_PCT = 5 // |Δ price| that warrants a surge/drop alert
const EARNINGS_MISS_PCT = -5 // surprise % below which an earnings miss is flagged
const EARNINGS_BEAT_PCT = 5 // surprise % above which an earnings beat is flagged
const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const VALUATION_STRETCH_PCT = 20 // P/E increase from baseline
const DEDUP_WINDOW_HOURS = 24
const ANALYST_RANK_DELTA = 2 // minimum |Δ rank| for a "significant" analyst change

// ── Stored baseline shapes (the JSON columns on Thesis) ───────────────
interface StoredFinancialBaseline {
  metrics?: Record<string, StockMetrics>
  lastAnalyst?: Record<string, string>
  [key: string]: unknown
}
interface StoredTechnicalBaseline {
  indicators?: Record<string, TechnicalData>
  [key: string]: unknown
}
type StoredEarningsBaseline = Record<
  string,
  { earnings?: EarningsRecord[]; nextEarningsDate?: string }
>

// ── Output ────────────────────────────────────────────────────────────
export interface ThesisMonitorError {
  thesisId: string
  title: string
  error: string
}
export interface ThesisMonitorSummary {
  themesChecked: number
  alertsCreated: number
  errors: ThesisMonitorError[]
  durationMs: number
  timestamp: string
}

// ── Trend ranking (bullish → positive, bearish → negative) ────────────
function trendRank(
  trend?: string | null,
): number | null {
  switch (trend) {
    case 'strong_bullish':
      return 2
    case 'bullish':
      return 1
    case 'neutral':
      return 0
    case 'bearish':
      return -1
    case 'strong_bearish':
      return -2
    default:
      return null
  }
}
function isBullish(rank: number | null): boolean {
  return rank !== null && rank >= 1
}
function isBearish(rank: number | null): boolean {
  return rank !== null && rank <= -1
}

// ── Analyst recommendation ranking ───────────────────────────────────
function recommendationRank(key?: string | null): number | null {
  if (!key) return null
  const k = key.toLowerCase().replace(/[-\s]/g, '_')
  switch (k) {
    case 'strong_buy':
    case 'strong_buy_list':
      return 2
    case 'buy':
    case 'outperform':
    case 'overweight':
    case 'long':
    case 'sector_outperform':
    case 'positive':
    case 'add':
    case 'accumulate':
      return 1
    case 'hold':
    case 'neutral':
    case 'market_perform':
    case 'perform':
    case 'equal_weight':
    case 'equal_weight_mean':
    case 'in_line':
    case 'sector_weight':
      return 0
    case 'sell':
    case 'underperform':
    case 'underweight':
    case 'reduce':
    case 'negative':
      return -1
    case 'strong_sell':
      return -2
    default:
      return null
  }
}

// ── Numeric helpers (defensive against undefined/null) ────────────────
function safeDiv(a: number | undefined | null, b: number | undefined | null): number | null {
  if (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0) return null
  return a / b
}
function pctChange(current: number, baseline: number): number | null {
  if (baseline == null || !isFinite(baseline) || baseline === 0) return null
  if (current == null || !isFinite(current)) return null
  return ((current - baseline) / Math.abs(baseline)) * 100
}

// ── Alert payload type ────────────────────────────────────────────────
interface PendingAlert {
  type: string
  severity: string
  ticker: string
  title: string
  description: string
  data: Record<string, unknown>
}

// ── Main entry point ──────────────────────────────────────────────────
export async function runThesisMonitor(): Promise<ThesisMonitorSummary> {
  const startedAt = Date.now()
  const errors: ThesisMonitorError[] = []
  let themesChecked = 0
  let alertsCreated = 0

  console.log('[thesis-monitor] Starting daily thesis monitor run...')

  // Published themes = completed + public, with their members.
  const theses = await prisma.thesis.findMany({
    where: { status: 'completed', isPublic: true },
    select: {
      id: true,
      title: true,
      financialData: true,
      technicalData: true,
      earningsData: true,
      themeMembers: {
        select: { ticker: true, instrumentType: true },
      },
    },
  })

  console.log(`[thesis-monitor] Found ${theses.length} published theme(s) to monitor.`)

  for (const thesis of theses) {
    themesChecked++
    try {
      const created = await monitorThesis(thesis)
      alertsCreated += created
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error(`[thesis-monitor] Error monitoring thesis ${thesis.id} (${thesis.title}):`, msg)
      errors.push({ thesisId: thesis.id, title: thesis.title, error: msg })
    }
  }

  const summary: ThesisMonitorSummary = {
    themesChecked,
    alertsCreated,
    errors,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }
  console.log(
    `[thesis-monitor] Done. themesChecked=${themesChecked} alertsCreated=${alertsCreated} errors=${errors.length} (${summary.durationMs}ms)`,
  )
  return summary
}

// ── Per-thesis monitoring ─────────────────────────────────────────────
interface ThesisForMonitor {
  id: string
  title: string
  financialData: unknown
  technicalData: unknown
  earningsData: unknown
  themeMembers: { ticker: string | null; instrumentType: string | null }[]
}

async function monitorThesis(thesis: ThesisForMonitor): Promise<number> {
  // 1. Collect tickers from members.
  const stockTickers: string[] = []
  const etfTickers: string[] = []
  for (const m of thesis.themeMembers) {
    if (!m.ticker) continue
    if (m.instrumentType === 'etf') etfTickers.push(m.ticker)
    else stockTickers.push(m.ticker)
  }

  if (stockTickers.length === 0 && etfTickers.length === 0) {
    // Nothing to monitor for this theme.
    return 0
  }

  // 2. Fetch fresh financial data.
  const fresh: FinancialDataResult = await fetchFinancialData(stockTickers, etfTickers)

  // 3. Load stored baselines (defensive casts).
  const finBase = (thesis.financialData ?? {}) as StoredFinancialBaseline
  const techBase = (thesis.technicalData ?? {}) as StoredTechnicalBaseline
  const earnBase = (thesis.earningsData ?? {}) as StoredEarningsBaseline
  const storedMetrics = finBase.metrics ?? {}
  const storedTechnical = techBase.indicators ?? {}
  const storedAnalyst = finBase.lastAnalyst ?? {}

  // 4. Dedup: fetch this thesis's alerts from the last 24h for O(1) lookup.
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000)
  const recent = await prisma.thesisAlert.findMany({
    where: { thesisId: thesis.id, createdAt: { gt: since } },
    select: { type: true, ticker: true },
  })
  const recentKeys = new Set(
    recent.map((a: { type: string; ticker: string | null }) => `${a.type}:${a.ticker ?? '_'}`),
  )
  const exists = (type: string, ticker: string) =>
    recentKeys.has(`${type}:${ticker ?? '_'}`)

  // 5. Evaluate each stock ticker.
  const pending: PendingAlert[] = []
  const newAnalystBaseline: Record<string, string> = { ...storedAnalyst }

  for (const ticker of stockTickers) {
    const freshStock = fresh.stocks[ticker]
    if (!freshStock) continue // fetch failed for this ticker — skip silently

    const baseMetrics = storedMetrics[ticker]
    const baseTech = storedTechnical[ticker]
    const baseEarn = earnBase[ticker]

    // Track latest analyst recommendation for the rolling baseline.
    if (freshStock.analyst?.recommendationKey) {
      newAnalystBaseline[ticker] = freshStock.analyst.recommendationKey
    }

    // ── Earnings ──
    const earningsAlerts = checkEarnings(ticker, freshStock, baseEarn)
    for (const a of earningsAlerts) {
      if (!exists(a.type, ticker)) pending.push(a)
    }

    // ── Price surge / drop ──
    const priceAlert = checkPriceMove(ticker, freshStock, baseTech)
    if (priceAlert && !exists(priceAlert.type, ticker)) pending.push(priceAlert)

    // ── Technical breakdown / breakout ──
    const techAlerts = checkTechnical(ticker, freshStock, baseTech)
    for (const a of techAlerts) {
      if (!exists(a.type, ticker)) pending.push(a)
    }

    // ── Valuation stretch ──
    const valAlert = checkValuationStretch(ticker, freshStock, baseMetrics)
    if (valAlert && !exists(valAlert.type, ticker)) pending.push(valAlert)

    // ── Analyst change ──
    const analystAlert = checkAnalystChange(ticker, freshStock, storedAnalyst[ticker])
    if (analystAlert && !exists(analystAlert.type, ticker)) pending.push(analystAlert)
  }

  // 6. Persist alerts.
  if (pending.length > 0) {
    await prisma.thesisAlert.createMany({
      data: pending.map((a) => ({
        thesisId: thesis.id,
        type: a.type,
        severity: a.severity,
        ticker: a.ticker,
        title: a.title,
        description: a.description,
        data: a.data as any,
      })),
    })
    console.log(
      `[thesis-monitor] Thesis "${thesis.title}" (${thesis.id}): created ${pending.length} alert(s).`,
    )
  }

  // 7. Persist the rolling analyst baseline (non-critical, best-effort).
  try {
    const baselineChanged =
      JSON.stringify(newAnalystBaseline) !== JSON.stringify(storedAnalyst)
    if (baselineChanged && Object.keys(newAnalystBaseline).length > 0) {
      await prisma.thesis.update({
        where: { id: thesis.id },
        data: {
          financialData: {
            ...finBase,
            lastAnalyst: newAnalystBaseline,
          } as any,
        },
      })
    }
  } catch (e: any) {
    // Baseline persistence is best-effort — never fail the run over it.
    console.warn(
      `[thesis-monitor] Could not persist analyst baseline for thesis ${thesis.id}:`,
      e?.message,
    )
  }

  return pending.length
}

// ── Condition checkers ────────────────────────────────────────────────

interface FreshStock {
  metrics: StockMetrics
  earnings: EarningsRecord[]
  nextEarningsDate?: string
  technical: TechnicalData
  analyst: AnalystData
}

/**
 * Earnings: detect new reported results (stored nextEarningsDate in the past)
 * and recent misses/beats (>5% from estimate).
 */
function checkEarnings(
  ticker: string,
  fresh: FreshStock,
  base: { earnings?: EarningsRecord[]; nextEarningsDate?: string } | undefined,
): PendingAlert[] {
  const out: PendingAlert[] = []
  const now = Date.now()
  const recent = fresh.earnings?.[0] // most recent quarter

  // Case 1: stored nextEarningsDate has passed → results should be in.
  if (base?.nextEarningsDate) {
    const storedNext = new Date(base.nextEarningsDate).getTime()
    if (isFinite(storedNext) && now > storedNext) {
      // New results available?
      if (recent?.actual != null && recent?.estimate != null) {
        const surprise = recent.surprisePercent ?? pctChange(recent.actual, recent.estimate)
        if (surprise != null && surprise >= EARNINGS_BEAT_PCT) {
          out.push({
            type: 'earnings_beat',
            severity: 'positive',
            ticker,
            title: `${ticker}: Earnings beat after results`,
            description: `${ticker} reported EPS ${recent.actual} vs estimate ${recent.estimate} (${surprise >= 0 ? '+' : ''}${surprise.toFixed(1)}% surprise) after the ${base.nextEarningsDate} report date.`,
            data: {
              actual: recent.actual,
              estimate: recent.estimate,
              surprisePercent: surprise,
              period: recent.period ?? null,
              priorNextEarningsDate: base.nextEarningsDate,
              freshNextEarningsDate: fresh.nextEarningsDate ?? null,
            },
          })
        } else if (surprise != null && surprise <= EARNINGS_MISS_PCT) {
          out.push({
            type: 'earnings_miss',
            severity: surprise <= -20 ? 'critical' : 'warning',
            ticker,
            title: `${ticker}: Earnings miss after results`,
            description: `${ticker} reported EPS ${recent.actual} vs estimate ${recent.estimate} (${surprise.toFixed(1)}% surprise) — a miss of more than ${Math.abs(EARNINGS_MISS_PCT)}%.`,
            data: {
              actual: recent.actual,
              estimate: recent.estimate,
              surprisePercent: surprise,
              period: recent.period ?? null,
              priorNextEarningsDate: base.nextEarningsDate,
              freshNextEarningsDate: fresh.nextEarningsDate ?? null,
            },
          })
        }
      }
    }
  } else {
    // No stored next-earnings baseline — still flag a clear recent miss/beat
    // on the freshest quarter so the thesis is kept honest.
    if (recent?.actual != null && recent?.estimate != null) {
      const surprise = recent.surprisePercent ?? pctChange(recent.actual, recent.estimate)
      if (surprise != null && surprise <= EARNINGS_MISS_PCT) {
        out.push({
          type: 'earnings_miss',
          severity: surprise <= -20 ? 'critical' : 'warning',
          ticker,
          title: `${ticker}: Recent earnings miss`,
          description: `${ticker} last reported EPS ${recent.actual} vs estimate ${recent.estimate} (${surprise.toFixed(1)}% surprise).`,
          data: {
            actual: recent.actual,
            estimate: recent.estimate,
            surprisePercent: surprise,
            period: recent.period ?? null,
          },
        })
      }
    }
  }

  return out
}

/**
 * Price surge/drop: |Δ price| from the published baseline > PRICE_MOVE_PCT.
 */
function checkPriceMove(
  ticker: string,
  fresh: FreshStock,
  baseTech: TechnicalData | undefined,
): PendingAlert | null {
  const freshPrice = fresh.technical?.currentPrice ?? fresh.metrics?.currentPrice
  const basePrice = baseTech?.currentPrice
  if (freshPrice == null || basePrice == null) return null

  const change = pctChange(freshPrice, basePrice)
  if (change == null || Math.abs(change) < PRICE_MOVE_PCT) return null

  const up = change > 0
  return {
    type: up ? 'price_surge' : 'price_drop',
    severity: up ? 'positive' : change <= -15 ? 'critical' : 'warning',
    ticker,
    title: up
      ? `${ticker}: Price surged ${change.toFixed(1)}%`
      : `${ticker}: Price dropped ${change.toFixed(1)}%`,
    description: `${ticker} is now $${freshPrice} vs $${basePrice} baseline (${change >= 0 ? '+' : ''}${change.toFixed(1)}%) — beyond the ${PRICE_MOVE_PCT}% monitoring threshold.`,
    data: {
      baselinePrice: basePrice,
      currentPrice: freshPrice,
      changePct: change,
      freshYtdReturn: fresh.technical?.ytdReturn ?? null,
      fresh3mReturn: fresh.technical?.threeMonthReturn ?? null,
    },
  }
}

/**
 * Technical breakdown/breakout: RSI extremes and bullish↔bearish trend flips.
 */
function checkTechnical(
  ticker: string,
  fresh: FreshStock,
  baseTech: TechnicalData | undefined,
): PendingAlert[] {
  const out: PendingAlert[] = []
  const freshRSI = fresh.technical?.rsi14
  const freshTrendRank = trendRank(fresh.technical?.trend)
  const baseTrendRank = trendRank(baseTech?.trend)

  // ── Breakdown signals ──
  const oversold = freshRSI != null && freshRSI < RSI_OVERSOLD
  const trendBrokeDown = isBullish(baseTrendRank) && isBearish(freshTrendRank)
  if (oversold || trendBrokeDown) {
    out.push({
      type: 'technical_breakdown',
      severity: (freshRSI != null && freshRSI < 20) || freshTrendRank === -2 ? 'critical' : 'warning',
      ticker,
      title: `${ticker}: Technical breakdown`,
      description: oversold
        ? `${ticker} RSI fell to ${freshRSI!.toFixed(1)} (oversold, below ${RSI_OVERSOLD}).`
        : `${ticker} trend shifted from ${baseTech?.trend ?? 'bullish'} to ${fresh.technical?.trend ?? 'bearish'}.`,
      data: {
        rsi: freshRSI ?? null,
        baselineTrend: baseTech?.trend ?? null,
        currentTrend: fresh.technical?.trend ?? null,
        oversold,
        trendFlip: trendBrokeDown,
        currentPrice: fresh.technical?.currentPrice ?? null,
        ma50: fresh.technical?.ma50 ?? null,
        ma200: fresh.technical?.ma200 ?? null,
      },
    })
  }

  // ── Breakout signals ──
  const overbought = freshRSI != null && freshRSI > RSI_OVERBOUGHT
  const trendBrokeOut = isBearish(baseTrendRank) && isBullish(freshTrendRank)
  if (overbought || trendBrokeOut) {
    out.push({
      type: 'technical_breakout',
      severity: 'positive',
      ticker,
      title: `${ticker}: Technical breakout`,
      description: overbought
        ? `${ticker} RSI rose to ${freshRSI!.toFixed(1)} (above ${RSI_OVERBOUGHT}).`
        : `${ticker} trend improved from ${baseTech?.trend ?? 'bearish'} to ${fresh.technical?.trend ?? 'bullish'}.`,
      data: {
        rsi: freshRSI ?? null,
        baselineTrend: baseTech?.trend ?? null,
        currentTrend: fresh.technical?.trend ?? null,
        overbought,
        trendFlip: trendBrokeOut,
        currentPrice: fresh.technical?.currentPrice ?? null,
        ma50: fresh.technical?.ma50 ?? null,
        ma200: fresh.technical?.ma200 ?? null,
      },
    })
  }

  return out
}

/**
 * Analyst change: recommendationKey rank moved by ≥ ANALYST_RANK_DELTA.
 * `priorKey` comes from the rolling baseline (thesis.financialData.lastAnalyst).
 */
function checkAnalystChange(
  ticker: string,
  fresh: FreshStock,
  priorKey?: string,
): PendingAlert | null {
  const currentKey = fresh.analyst?.recommendationKey
  if (!currentKey) return null

  // No prior baseline yet — this run will establish it (no alert on first sight).
  if (!priorKey) return null

  const priorRank = recommendationRank(priorKey)
  const currentRank = recommendationRank(currentKey)
  if (priorRank == null || currentRank == null) return null

  const delta = currentRank - priorRank
  if (Math.abs(delta) < ANALYST_RANK_DELTA) return null

  const upgrade = delta > 0
  return {
    type: upgrade ? 'analyst_upgrade' : 'analyst_downgrade',
    severity: upgrade ? 'positive' : 'warning',
    ticker,
    title: upgrade
      ? `${ticker}: Analyst upgrade (${priorKey} → ${currentKey})`
      : `${ticker}: Analyst downgrade (${priorKey} → ${currentKey})`,
    description: `Analyst consensus for ${ticker} moved from "${priorKey}" to "${currentKey}". Target price: ${fresh.analyst?.targetMeanPrice ?? 'n/a'} (${fresh.analyst?.numberOfAnalysts ?? '?'} analysts).`,
    data: {
      priorRecommendation: priorKey,
      currentRecommendation: currentKey,
      priorRank,
      currentRank,
      delta,
      targetMeanPrice: fresh.analyst?.targetMeanPrice ?? null,
      upsideToTarget: fresh.analyst?.upsideToTarget ?? null,
      numberOfAnalysts: fresh.analyst?.numberOfAnalysts ?? null,
    },
  }
}

/**
 * Valuation stretch: trailing P/E increased > VALUATION_STRETCH_PCT from baseline.
 */
function checkValuationStretch(
  ticker: string,
  fresh: FreshStock,
  baseMetrics: StockMetrics | undefined,
): PendingAlert | null {
  const freshPE = fresh.metrics?.trailingPE
  const basePE = baseMetrics?.trailingPE
  if (freshPE == null || basePE == null) return null
  // P/E should be positive & finite to be meaningful.
  if (freshPE <= 0 || basePE <= 0 || !isFinite(freshPE) || !isFinite(basePE)) return null

  const change = pctChange(freshPE, basePE)
  if (change == null || change <= VALUATION_STRETCH_PCT) return null

  return {
    type: 'valuation_stretch',
    severity: 'warning',
    ticker,
    title: `${ticker}: Valuation stretched (+${change.toFixed(1)}% P/E)`,
    description: `${ticker} trailing P/E rose from ${basePE.toFixed(1)} to ${freshPE.toFixed(1)} (+${change.toFixed(1)}%) — above the ${VALUATION_STRETCH_PCT}% stretch threshold. The stock may be priced ahead of fundamentals.`,
    data: {
      baselinePE: basePE,
      currentPE: freshPE,
      changePct: change,
      baselineForwardPE: baseMetrics?.forwardPE ?? null,
      currentForwardPE: fresh.metrics?.forwardPE ?? null,
      pegRatio: fresh.metrics?.pegRatio ?? null,
      currentPrice: fresh.metrics?.currentPrice ?? null,
    },
  }
}
