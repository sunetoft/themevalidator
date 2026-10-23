/**
 * Thesis Timeline — "when does this thesis play out?"
 *
 * The scoring dimensions answer "is this a good thesis?". The timeline answers
 * "when does it start to ramp?", and it must be grounded in forward-looking
 * numbers, not narrative:
 *
 *   - projected sales      → analyst consensus revenue estimates (0q, +1q, 0y, +1y)
 *   - margin improvement   → reported gross/operating margin, YoY in bps
 *
 * `scripts/fetch-guidance.py` supplies both from yfinance; the LLM reads them
 * together with the thesis and returns a quarter-anchored ramp window plus the
 * conditions that would confirm or break it.
 *
 * Written to `Thesis.timelineData` right after a thesis finishes analysing.
 */

import { execFile } from 'child_process'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { chatComplete } from '@/lib/llm'
import { parseLLMJson } from '@/lib/llm-json'

const PYTHON_BIN = process.env.PYTHON_BIN || '/Users/Shared/Hermes/venv/bin/python3'
const SCRIPT = path.join(process.cwd(), 'scripts', 'fetch-guidance.py')
const FETCH_TIMEOUT_MS = 90_000

// ── Guidance data ──

export interface EstimateRow {
  revenue?: number | null
  eps?: number | null
  growth?: number | null
  analysts?: number | null
}

export interface GuidanceQuarter {
  period: string
  revenue?: number | null
  grossMargin?: number | null
  operatingMargin?: number | null
  revenueYoY?: number | null
}

export interface GuidanceStock {
  nextEarningsDate?: string
  revenueEstimate?: Record<string, EstimateRow>
  epsEstimate?: Record<string, EstimateRow>
  quarters?: GuidanceQuarter[]
  marginTrend?: {
    grossMarginNow?: number | null
    grossMarginYearAgo?: number | null
    operatingMarginNow?: number | null
    operatingMarginYearAgo?: number | null
    grossBpsYoY?: number | null
    operatingBpsYoY?: number | null
    direction?: string
  }
}

export interface GuidanceResult {
  stocks: Record<string, GuidanceStock>
  errors: Record<string, string>
}

/** Run the yfinance forward-guidance script for a batch of tickers. */
export function fetchGuidance(tickers: string[]): Promise<GuidanceResult> {
  if (tickers.length === 0) return Promise.resolve({ stocks: {}, errors: {} })

  return new Promise((resolve) => {
    const child = execFile(
      PYTHON_BIN,
      [SCRIPT],
      { timeout: FETCH_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          console.error('[timeline] guidance script error:', error.message)
          resolve({ stocks: {}, errors: { _script: error.message } })
          return
        }
        try {
          resolve(JSON.parse(stdout) as GuidanceResult)
        } catch (err: any) {
          console.error('[timeline] guidance JSON parse error:', err?.message)
          resolve({ stocks: {}, errors: { _parse: err?.message } })
        }
      },
    )
    child.stdin?.write(JSON.stringify({ tickers: tickers.slice(0, 10) }))
    child.stdin?.end()
  })
}

const pct = (v?: number | null, decimals = 1) =>
  v === undefined || v === null ? null : `${(v * 100).toFixed(decimals)}%`

/** Render guidance data as a compact text block for the prompt. */
export function formatGuidanceForLLM(data: GuidanceResult): string {
  const lines: string[] = []
  const entries = Object.entries(data.stocks)

  if (entries.length === 0) return 'NO FORWARD GUIDANCE DATA AVAILABLE FOR THIS BASKET.'

  lines.push('=== FORWARD GUIDANCE DATA (Yahoo Finance consensus + reported statements) ===')
  lines.push('Source: analyst consensus estimates (not company-issued guidance) and reported quarterly margins.')
  lines.push('Growth figures are YoY. Margins in bps are latest reported quarter vs same quarter last year.\n')

  for (const [ticker, s] of entries) {
    lines.push(`--- ${ticker} ---`)
    if (s.nextEarningsDate) lines.push(`  Next earnings: ${s.nextEarningsDate}`)

    const rev = s.revenueEstimate ?? {}
    const rev0q = rev['0q']
    const rev1q = rev['+1q']
    const rev0y = rev['0y']
    const rev1y = rev['+1y']
    if (rev0q || rev0y) {
      lines.push(
        `  Projected sales: next Q ${pct(rev0q?.growth) ?? 'n/a'}` +
          ` | Q+2 ${pct(rev1q?.growth) ?? 'n/a'}` +
          ` | FY current ${pct(rev0y?.growth) ?? 'n/a'}` +
          ` | FY next ${pct(rev1y?.growth) ?? 'n/a'}` +
          ` (analysts: ${rev0y?.analysts ?? rev0q?.analysts ?? 'n/a'})`,
      )
    } else {
      lines.push('  Projected sales: unavailable')
    }

    const eps = s.epsEstimate ?? {}
    if (eps['0q'] || eps['0y']) {
      lines.push(
        `  Projected EPS growth: next Q ${pct(eps['0q']?.growth) ?? 'n/a'}` +
          ` | FY current ${pct(eps['0y']?.growth) ?? 'n/a'}` +
          ` | FY next ${pct(eps['+1y']?.growth) ?? 'n/a'}`,
      )
    }

    const mt = s.marginTrend
    if (mt && mt.direction && mt.direction !== 'unknown') {
      lines.push(
        `  Margin trend: ${mt.direction} — gross ${pct(mt.grossMarginNow)}` +
          ` (${mt.grossBpsYoY ?? 'n/a'} bps YoY), operating ${pct(mt.operatingMarginNow)}` +
          ` (${mt.operatingBpsYoY ?? 'n/a'} bps YoY)`,
      )
    }

    const quarters = (s.quarters ?? []).slice(0, 5)
    if (quarters.length > 0) {
      const trail = quarters
        .map(
          (q) =>
            `${q.period}: rev ${pct(q.revenueYoY) ?? 'n/a'} yoy, gross ${pct(q.grossMargin) ?? 'n/a'}, op ${pct(q.operatingMargin) ?? 'n/a'}`,
        )
        .join(' | ')
      lines.push(`  Reported quarters (newest first): ${trail}`)
    }
    lines.push('')
  }

  const missing = Object.keys(data.errors).filter((k) => !k.startsWith('_'))
  if (missing.length > 0) lines.push(`No data for: ${missing.join(', ')}`)

  return lines.join('\n')
}

// ── Prompt ──

const TIMELINE_PROMPT = `You are an investment analyst answering ONE question: **when will this thesis start to play out?**

"Thesis plays out" means the theme's demand shows up in the basket's reported numbers — revenue growth accelerating and margins expanding — not that the stock price has already moved.

You are given real forward-report data per basket ticker:
- Projected sales (analyst consensus revenue growth for next quarter, quarter after, current FY, next FY)
- Projected EPS growth
- Reported quarterly revenue growth and gross/operating margins, plus the YoY margin change in basis points
- The next earnings date

RULES (violating these breaks the feature):
1. Ground EVERY date and number in the data block. Quote the actual growth rates and bps you used. Never invent an estimate that is not in the data.
2. Anchor the ramp window to CALENDAR QUARTERS in the form "YYYY-QN" (e.g. "2027-Q2"). Today's date is given below — the window must be in the future.
3. Weight revenue guidance FIRST, margin trajectory SECOND. A thesis with strong projected sales but contracting margins is "stalled" — pricing power has not arrived.
4. If a ticker has no forward data, say so; do not fabricate. Lower confidence instead.
5. Consensus is not company guidance. When you state a company's own guidance number, it must be a number you can see in the data; otherwise describe the consensus and set "guidanceSource":"consensus".
6. Each string: at most 22 words. Be specific and quantitative.

Return ONE raw JSON object, no wrapper, no markdown:
{
  "rampWindowStart": "YYYY-QN",
  "rampQuarter": "YYYY-QN",
  "rampWindowEnd": "YYYY-QN",
  "verdict": "ramping" | "inflecting" | "early" | "stalled",
  "confidence": 0-100,
  "headline": "One sentence: when this thesis plays out and why",
  "guidanceRead": "What projected sales growth and the margin trend actually say, citing the numbers.",
  "guidanceSource": "consensus" | "company-guidance",
  "phases": [
    { "label": "short phase name", "window": "YYYY-QN", "trigger": "what must happen in reported numbers", "whatToWatch": "the specific metric to check" }
  ],
  "perTicker": [
    { "ticker": "TICK", "salesGrowthNextQ": "+41%", "salesGrowthNextFY": "+30%", "marginTrend": "expanding|flat|contracting|unknown", "marginBpsYoY": 255, "rampQuarter": "YYYY-QN", "signal": "accelerating|steady|decelerating", "note": "short" }
  ],
  "confirmations": ["2-4 signals that confirm the ramp has started"],
  "invalidations": ["2-4 signals that would break the timeline"],
  "dataGaps": ["tickers or metrics you could not assess"]
}

verdict meaning: "ramping" = already visible in reported numbers this or next quarter; "inflecting" = 2-3 quarters out; "early" = 4+ quarters out; "stalled" = guidance flat/margins contracting, no visible ramp.`

// ── Result type ──

export type TimelineVerdict = 'ramping' | 'inflecting' | 'early' | 'stalled'

export interface TimelinePhase {
  label: string
  window: string
  trigger?: string
  whatToWatch?: string
}

export interface TimelineTicker {
  ticker: string
  salesGrowthNextQ?: string
  salesGrowthNextFY?: string
  marginTrend?: string
  marginBpsYoY?: number | null
  rampQuarter?: string
  signal?: string
  note?: string
}

export interface TimelineData {
  rampWindowStart: string
  rampQuarter: string
  rampWindowEnd: string
  verdict: TimelineVerdict
  confidence: number
  headline: string
  guidanceRead: string
  guidanceSource?: string
  phases: TimelinePhase[]
  perTicker: TimelineTicker[]
  confirmations: string[]
  invalidations: string[]
  dataGaps: string[]
  // provenance
  generatedAt: string
  model?: string
  basis?: { tickers: string[]; tickersWithEstimates: number; tickersWithMargins: number }
}

const QUARTER_RE = /^\d{4}-Q[1-4]$/
const VERDICTS: TimelineVerdict[] = ['ramping', 'inflecting', 'early', 'stalled']

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.trim() : fallback

const asStringArray = (v: unknown, max = 6): string[] =>
  Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean).slice(0, max) : []

function currentQuarter(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

/** Coerce + validate whatever GLM returned into a renderable timeline, or null. */
export function normalizeTimeline(raw: any): Omit<TimelineData, 'generatedAt'> | null {
  if (!raw || typeof raw !== 'object') return null

  const verdict = VERDICTS.includes(raw.verdict) ? (raw.verdict as TimelineVerdict) : null
  const rampQuarter = asString(raw.rampQuarter)
  const headline = asString(raw.headline)
  if (!verdict || !QUARTER_RE.test(rampQuarter) || !headline) return null

  const fallbackWindow = rampQuarter
  let start = asString(raw.rampWindowStart, fallbackWindow)
  let end = asString(raw.rampWindowEnd, fallbackWindow)
  if (!QUARTER_RE.test(start)) start = fallbackWindow
  if (!QUARTER_RE.test(end)) end = fallbackWindow
  // A window that runs backwards is a model slip, not information.
  if (start > end) [start, end] = [end, start]

  const confidenceRaw = Number(raw.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : 50

  const perTicker: TimelineTicker[] = Array.isArray(raw.perTicker)
    ? raw.perTicker
        .filter((t: any) => t && typeof t.ticker === 'string')
        .slice(0, 10)
        .map((t: any) => ({
          ticker: asString(t.ticker).toUpperCase(),
          salesGrowthNextQ: asString(t.salesGrowthNextQ) || undefined,
          salesGrowthNextFY: asString(t.salesGrowthNextFY) || undefined,
          marginTrend: asString(t.marginTrend) || undefined,
          marginBpsYoY: Number.isFinite(Number(t.marginBpsYoY)) ? Number(t.marginBpsYoY) : null,
          rampQuarter: QUARTER_RE.test(asString(t.rampQuarter)) ? asString(t.rampQuarter) : undefined,
          signal: asString(t.signal) || undefined,
          note: asString(t.note) || undefined,
        }))
    : []

  const phases: TimelinePhase[] = Array.isArray(raw.phases)
    ? raw.phases
        .filter((p: any) => p && (typeof p.label === 'string' || typeof p.window === 'string'))
        .slice(0, 5)
        .map((p: any) => ({
          label: asString(p.label, 'Phase'),
          window: QUARTER_RE.test(asString(p.window)) ? asString(p.window) : rampQuarter,
          trigger: asString(p.trigger) || undefined,
          whatToWatch: asString(p.whatToWatch) || undefined,
        }))
    : []

  return {
    rampWindowStart: start,
    rampQuarter,
    rampWindowEnd: end,
    verdict,
    confidence,
    headline,
    guidanceRead: asString(raw.guidanceRead),
    guidanceSource: asString(raw.guidanceSource) || 'consensus',
    phases,
    perTicker,
    confirmations: asStringArray(raw.confirmations),
    invalidations: asStringArray(raw.invalidations),
    dataGaps: asStringArray(raw.dataGaps),
  }
}

// ── Generation ──

function thesisContext(thesis: any): string {
  const stocks = Array.isArray(thesis.stocksData) ? thesis.stocksData : []
  const basket = stocks
    .map((s: any) => {
      const bits = [s?.companyName, s?.ticker, s?.role, s?.competency].filter(Boolean)
      return bits.length ? `- ${bits.join(' | ')}` : null
    })
    .filter(Boolean)
    .slice(0, 10)

  const members =
    basket.length > 0
      ? basket
      : (thesis.basketMembers ?? []).map(
          (m: any) => `- ${m.companyName} | ${m.ticker ?? 'n/a'} | ${m.role ?? ''} | ${m.competency ?? ''}`,
        )

  return [
    `Thesis: ${thesis.title}`,
    `Description: ${thesis.description}`,
    thesis.theme?.name ? `Theme: ${thesis.theme.name}` : '',
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Basket:',
    ...members,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Tickers we should pull forward guidance for. */
function thesisTickers(thesis: any): string[] {
  const fromStocks = Array.isArray(thesis.stocksData)
    ? thesis.stocksData
        .filter((s: any) => (s?.instrumentType ?? 'stock') === 'stock')
        .map((s: any) => s?.ticker)
    : []
  const fromMembers = (thesis.basketMembers ?? [])
    .filter((m: any) => (m.instrumentType ?? 'stock') === 'stock')
    .map((m: any) => m.ticker)

  return [...new Set([...fromStocks, ...fromMembers].filter(Boolean).map((t: string) => String(t).toUpperCase()))].slice(
    0,
    10,
  ) as string[]
}

/**
 * Generate + persist the timeline assessment for one thesis.
 * Safe to call fire-and-forget: never throws, records failure in timelineData.
 */
export async function generateTimelineForThesis(thesisId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id: thesisId },
      include: { basketMembers: true, theme: { select: { name: true } } },
    })
    if (!thesis) return { ok: false, error: 'Thesis not found' }

    const tickers = thesisTickers(thesis)
    const guidance = await fetchGuidance(tickers)
    const guidanceBlock = formatGuidanceForLLM(guidance)

    const messages = [
      { role: 'system' as const, content: TIMELINE_PROMPT },
      {
        role: 'user' as const,
        content: `${thesisContext(thesis)}\n\n${guidanceBlock}\n\nAssess when this thesis plays out. Answer with ONE raw JSON object.\nCurrent quarter is ${currentQuarter()} — every window must be ${currentQuarter()} or later.`,
      },
    ]

    const NUDGE =
      'Your previous answer was not valid timeline JSON. Reply again with ONE raw JSON object with keys rampWindowStart, rampQuarter, rampWindowEnd, verdict, confidence, headline, guidanceRead, guidanceSource, phases, perTicker, confirmations, invalidations, dataGaps. Quarters must look like "2027-Q2". No wrapper, no markdown.'

    let normalized: ReturnType<typeof normalizeTimeline> = null
    let model = ''
    for (let attempt = 0; attempt < 2 && !normalized; attempt++) {
      const raw = await chatComplete(
        attempt === 0 ? messages : [...messages, { role: 'user' as const, content: NUDGE }],
        {
          jsonMode: true,
          maxTokens: 4000,
          temperature: 0.3,
          source: 'web',
          endpoint: 'thesis-timeline',
        },
      )
      const parsed = parseLLMJson(raw)
      normalized = normalizeTimeline(parsed.data)
      if (!normalized) {
        console.error(
          `[timeline] attempt ${attempt + 1} unusable (${parsed.reason ?? 'shape'}), len=${raw?.length ?? 0}`,
        )
      }
    }

    if (!normalized) {
      await prisma.thesis.update({
        where: { id: thesisId },
        data: {
          timelineData: {
            error: 'Timeline assessment returned no usable result — try regenerating.',
            generatedAt: new Date().toISOString(),
          },
        },
      })
      return { ok: false, error: 'unusable LLM response' }
    }

    const withEstimates = Object.values(guidance.stocks).filter(
      (s) => Object.keys(s.revenueEstimate ?? {}).length > 0,
    ).length
    const withMargins = Object.values(guidance.stocks).filter(
      (s) => s.marginTrend?.direction && s.marginTrend.direction !== 'unknown',
    ).length

    const timelineData: TimelineData = {
      ...normalized,
      generatedAt: new Date().toISOString(),
      model: model || process.env.LLM_MODEL || 'glm-5.1',
      basis: { tickers, tickersWithEstimates: withEstimates, tickersWithMargins: withMargins },
    }

    await prisma.thesis.update({
      where: { id: thesisId },
      // JSON round-trip strips `undefined` — Prisma rejects undefined inside a
      // Json payload ("Unable to serialize value").
      data: { timelineData: JSON.parse(JSON.stringify(timelineData)), timelineUpdatedAt: new Date() },
    })

    return { ok: true }
  } catch (err: any) {
    console.error('[timeline] generation failed:', err?.message)
    try {
      await prisma.thesis.update({
        where: { id: thesisId },
        data: {
          timelineData: {
            error: `Timeline generation failed: ${err?.message ?? 'unknown error'}`,
            generatedAt: new Date().toISOString(),
          },
        },
      })
    } catch {
      /* best effort */
    }
    return { ok: false, error: err?.message ?? 'unknown error' }
  }
}
