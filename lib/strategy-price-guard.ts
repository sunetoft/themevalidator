/**
 * Strategy Price Guard
 *
 * Deterministic post-processor for LLM-generated trading strategies.
 *
 * GLM ignores prompt instructions often enough (~50% of analyse calls needed
 * repair, per the LLM-JSON post-mortem) that injecting live prices into the
 * prompt is NOT sufficient on its own. This module rewrites every *price-like*
 * dollar amount in a generated strategy so it matches real market data.
 *
 * Detection is deliberately CONTEXT-BASED, never value-based, because
 * allocation/tranche amounts and share prices overlap numerically. Only
 * numbers carrying an explicit price cue are touched:
 *
 *   ~25 shares @ ~$135          → cue "@"
 *   ~4 shares at ~$420/share    → cue "at ~$X" + "/share"
 *   limit order at ~$135        → cue "at ~$X"
 *   $240-260 range limit orders → cue "range"
 *   Price target ~$525          → cue "price target"
 *
 * Tranche amounts ("Place $600 immediately", "$500 tranches") carry no cue and
 * are left alone. The `**Allocation:**` line is always skipped. Anything in the
 * summary/header region (not attributable to a single ticker) is untouched.
 *
 * Position sizes are RECOMPUTED from the section's own allocation and the live
 * price, so `allocation ≈ shares × price` stays internally consistent.
 */

import type { LiveQuote } from './live-quotes'
import { fmtPrice } from './live-quotes'

export interface PriceCorrection {
  ticker: string
  kind: 'entry-price' | 'scaled-price' | 'shares' | 'range'
  from: string
  to: string
}

export interface SanitizeResult {
  text: string
  corrections: PriceCorrection[]
  /** Tickers whose section was rewritten because the claimed price was off. */
  affectedTickers: string[]
}

/** Only rewrite when the claimed price is off by more than this. */
const DRIFT_THRESHOLD = 0.15

/**
 * Precise, cue-anchored price patterns.
 *
 * Line-level cues are NOT safe: a line such as
 *   `Split into 4 equal $500 tranches ... below the current market price`
 * contains both the words "price" and "limit order", so a line-level test grabs
 * the $500 TRANCHE as if it were the share price. Every rule below therefore
 * captures the amount *immediately attached to* a price marker.
 *
 * Deliberately NOT matched (must be left exactly as the author wrote them):
 *   - `$600 immediately`, `4 equal $500 tranches`   → capital tranche amounts
 *   - `$3,400 (17%)`                                 → allocation
 *   - `$10,000 capital`, `$20,000 total`             → capital
 */
type CueKind = 'current' | 'scaled' | 'range'

interface CueRule {
  re: RegExp
  kind: CueKind
  note: string
}

const CUE_RULES: CueRule[] = [
  // `@ ~$135` / `@ $135`
  { re: /(@\s*~?\$)\s*(\d[\d,]*(?:\.\d+)?)/g, kind: 'current', note: 'at-sign price' },
  // `at ~$135` / `at ~$420/share`
  { re: /(\bat\s+~?\$)\s*(\d[\d,]*(?:\.\d+)?)(\s*\/?\s*share)?/gi, kind: 'current', note: 'at price' },
  // `$420/share` / `$420 per share` (no preceding "at")
  { re: /(\$\s*)(\d[\d,]*(?:\.\d+)?)(\s*\/\s*share)/gi, kind: 'current', note: 'per-share price' },
  // `Price target ~$525`
  { re: /(price\s+target\s*~?\$\s*)(\d[\d,]*(?:\.\d+)?)/gi, kind: 'scaled', note: 'price target' },
  // `$240-260 range`
  { re: /(\$\s*)(\d[\d,]*(?:\.\d+)?)(\s*[-–—]\s*)(\d[\d,]*(?:\.\d+)?)/g, kind: 'range', note: 'price range' },
]

/** Matches a ticker header such as `## 1. NVDA (NVIDIA) — Core Supplier`. */
const TICKER_HEADER = /^#{1,3}\s+\**\s*(?:\d+[.)]\s*)?([A-Z]{1,5})\b/

const SHARES_AMOUNT = /~?\s*(\d[\d,]*(?:\.\d+)?)\s*shares?\b/i

const ALLOCATION_AMOUNT = /allocation\s*:?\s*\**\s*\$\s*(\d[\d,]*(?:\.\d+)?)/i

/** Strip commas and parse; returns null for junk. */
function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Render a scaled number the way a human would in strategy prose. */
function fmtScaled(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US')
  // Whole dollars read better for strategy targets, matching the source prose.
  if (value >= 100) return String(Math.round(value))
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function roundShares(value: number): string {
  if (value >= 10) return String(Math.round(value))
  return String(Math.round(value * 10) / 10)
}

/**
 * Decide the replacement for a cue-matched amount.
 *
 * Amounts within 5% of the claimed price ARE the current price → snap to the
 * exact live price. Anything else (price targets, ranges) is a *derived* level,
 * so scale it by the live/claimed ratio to preserve the author's intent.
 *
 * The `live` comparison makes this IDEMPOTENT: overlapping cue rules would
 * otherwise re-scale their own output (`at ~$420/share` → `at ~$498/share` →
 * the bare `$498/share` rule scaling it again to `$590.49/share`).
 */
function resolveAmount(
  value: number,
  kind: CueKind,
  claimed: number,
  live: number
): number {
  const ratio = live / claimed
  const isCurrentPrice =
    kind === 'current' &&
    (Math.abs(value - claimed) / claimed <= 0.05 ||
      Math.abs(value - live) / live <= 0.05)
  return isCurrentPrice ? live : value * ratio
}

interface Section {
  ticker: string | null
  lines: string[]
}

/** Split markdown into per-ticker sections; `ticker: null` = preamble/summary. */
function splitSections(markdown: string): Section[] {
  const sections: Section[] = []
  let current: Section = { ticker: null, lines: [] }

  for (const line of markdown.split('\n')) {
    const m = line.match(TICKER_HEADER)
    if (m && line.startsWith('#')) {
      // A level-1/2 "Portfolio Summary"-style header is not a ticker section.
      const isSummary = /summary|overview|rebalanc|catalysts|drawdown|portfolio\s+summary/i.test(line)
      if (!isSummary) {
        sections.push(current)
        // Keep the header line itself inside the section so reconstruction
        // is lossless (dropping it would delete every `## N. TICKER` heading).
        current = { ticker: m[1].toUpperCase(), lines: [line] }
        continue
      }
      if (current.ticker) {
        sections.push(current)
        current = { ticker: null, lines: [] }
      }
    }
    current.lines.push(line)
  }
  sections.push(current)
  return sections
}

/** Find the first cue-matched price in a section (the "claimed" price). */
function findClaimedPrice(lines: string[]): number | null {
  for (const line of lines) {
    for (const rule of CUE_RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags.replace('g', ''))
      const m = line.match(re)
      if (!m) continue
      const v = parseAmount(m[2] ?? m[1])
      if (v != null && v > 0) return v
    }
  }
  return null
}

/**
 * Rewrite one ticker section against the live quote.
 * Returns the new lines plus any corrections made.
 */
function sanitizeSection(
  section: Section,
  quote: LiveQuote,
  corrections: PriceCorrection[]
): string[] {
  const ticker = section.ticker as string
  const lines = section.lines

  // ── 1. Find the claimed current price (first cue-matched amount) ──
  let claimed = findClaimedPrice(lines)

  // ── 2. Allocation (for recomputing share counts) ──
  let allocation: number | null = null
  for (const line of lines) {
    const m = line.match(ALLOCATION_AMOUNT)
    if (m) {
      allocation = parseAmount(m[1])
      if (allocation != null) break
    }
  }

  // Fall back to inferring the claimed price from allocation ÷ shares.
  if (claimed == null && allocation != null) {
    for (const line of lines) {
      const sm = line.match(SHARES_AMOUNT)
      if (sm) {
        const shares = parseAmount(sm[1])
        if (shares && shares > 0) {
          claimed = allocation / shares
          break
        }
      }
    }
  }

  if (claimed == null || claimed <= 0) return lines

  const live = quote.price
  const ratio = live / claimed
  if (Math.abs(ratio - 1) <= DRIFT_THRESHOLD) return lines // already accurate

  const out = lines.map((line) => {
    let updated = line

    // Rewrite only amounts that are ATTACHED to a price marker.
    for (const rule of CUE_RULES) {
      updated = updated.replace(rule.re, (...args) => {
        const groups = args.slice(0, -2).map((a) => (typeof a === 'string' ? a : ''))
        const whole = groups[0]
        const prefix = groups[1] ?? ''
        const raw = groups[2] ?? groups[1]
        const after = groups[3] ?? ''
        const dash = groups[3]
        const rawHi = groups[4]

        if (rule.kind === 'range') {
          const lo = parseAmount(raw)
          const hi = parseAmount(rawHi)
          if (lo == null || hi == null) return whole
          const replacement = `${prefix}${fmtScaled(resolveAmount(lo, 'range', claimed!, live))}${dash}${fmtScaled(resolveAmount(hi, 'range', claimed!, live))}`
          if (replacement === whole) return whole
          corrections.push({ ticker, kind: 'range', from: whole, to: replacement })
          return replacement
        }

        const value = parseAmount(raw)
        if (value == null || value <= 0) return whole
        // Guard: never touch amounts far outside per-share scale.
        if (value > live * 20) return whole

        const target = resolveAmount(value, rule.kind, claimed!, live)
        const rendered =
          Math.abs(target - live) / live < 0.01 ? fmtPrice(live) : fmtScaled(target)
        const replacement = `${prefix}${rendered}${after}`

        if (replacement === whole) return whole
        corrections.push({
          ticker,
          kind: rule.kind === 'current' ? 'entry-price' : 'scaled-price',
          from: whole,
          to: replacement,
        })
        return replacement
      })
    }

    // ── Share counts recomputed from allocation ÷ live price ──
    if (allocation != null && allocation > 0 && /position\s+siz/i.test(line)) {
      updated = updated.replace(
        new RegExp(SHARES_AMOUNT.source, 'i'),
        (whole, raw) => {
          const newShares = roundShares(allocation / live)
          corrections.push({
            ticker,
            kind: 'shares',
            from: whole.trim(),
            to: `~${newShares} shares`,
          })
          return `~${newShares} shares`
        }
      )
    }

    return updated
  })

  return out
}

/**
 * Rewrite every price-like amount in a generated strategy so it matches the
 * supplied live quotes. Tickers without a quote are left completely untouched —
 * never guess.
 */
export function sanitizeStrategyPrices(
  markdown: string,
  quotes: Map<string, LiveQuote>
): SanitizeResult {
  if (!markdown || quotes.size === 0) {
    return { text: markdown, corrections: [], affectedTickers: [] }
  }

  const corrections: PriceCorrection[] = []
  const affected = new Set<string>()

  const rebuilt = splitSections(markdown)
    .filter((section) => section.lines.length > 0) // drop empty preamble
    .map((section) => {
      const quote = section.ticker ? quotes.get(section.ticker) : undefined
      if (!quote) return section.lines.join('\n')
      const before = corrections.length
      const lines = sanitizeSection(section, quote, corrections)
      if (corrections.length > before) affected.add(section.ticker as string)
      return lines.join('\n')
    })
    .join('\n')

  return {
    text: rebuilt,
    corrections,
    affectedTickers: Array.from(affected),
  }
}
