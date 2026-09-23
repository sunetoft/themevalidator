#!/usr/bin/env tsx
/**
 * Unit + replay test for lib/strategy-price-guard.ts
 *
 * 1. Synthetic fixtures covering every price shape seen in real GLM output.
 * 2. Replay of the REAL strategies stored in the DB (NVDA @ ~$135 etc.).
 *
 * Usage:
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/test-strategy-price-guard.ts
 *   ... -- --db     (also run the stored-strategy replay)
 */
import { execFileSync } from 'child_process'
import { sanitizeStrategyPrices } from '../lib/strategy-price-guard'
import { getLiveQuotes, type LiveQuote } from '../lib/live-quotes'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function quote(ticker: string, price: number): LiveQuote {
  return { ticker, price, prevClose: price, dayChangePct: 0, currency: 'USD', asOf: null }
}

// ─────────────────────────────────────────────────────────────
console.log('\n1. Synthetic fixtures\n')

// Case A — the exact bug: `@` price cue, no /share
{
  const md = [
    '## 1. NVDA (NVIDIA) — Core Supplier',
    '- **Allocation:** $3,400 (17%)',
    '- **Entry:** Lump sum at market; limit order at ~$135 if extended',
    '- **Position Size:** ~25 shares @ ~$135',
    '',
    '## 2. MSFT (Microsoft) — Core Infrastructure',
    '- **Allocation:** $3,000 (15%)',
    '- **Position Size:** ~8 shares @ ~$375',
  ].join('\n')

  const q = new Map([['NVDA', quote('NVDA', 228.87)], ['MSFT', quote('MSFT', 498)]])
  const r = sanitizeStrategyPrices(md, q)

  check('NVDA entry price corrected to live', r.text.includes('limit order at ~$228.87'), r.text)
  check('NVDA position sizing uses live price', r.text.includes('~$228.87'), r.text)
  check('NVDA shares recomputed (3400/228.87 ≈ 15)', /~15 shares/.test(r.text), r.text)
  check('NVDA allocation untouched', r.text.includes('$3,400 (17%)'), r.text)
  check('MSFT entry corrected', r.text.includes('~$498'), r.text)
  check('MSFT shares recomputed (3000/498 ≈ 6)', /~6 shares/.test(r.text), r.text)
  check('both tickers flagged', r.affectedTickers.sort().join() === 'MSFT,NVDA', r.affectedTickers.join())
}

// Case B — `/share` cue + price target + range, plus tranche amounts that must NOT move
{
  const md = [
    '### 1. MSFT (Microsoft) - Infrastructure',
    '*   **Allocation:** $1,750 (17.5%)',
    '*   **Entry Strategy:** 3-part DCA over 4 weeks. Place $600 immediately, $600 in two weeks, and the remainder in four weeks.',
    '*   **Position Sizing:** ~4 shares at ~$420/share.',
    '*   **Stop-Loss Level:** 12% below average cost (Hard stop).',
    '*   **Take-Profit Target:** 25% upside (Price target ~$525).',
  ].join('\n')

  const r = sanitizeStrategyPrices(md, new Map([['MSFT', quote('MSFT', 498)]]))
  check('entry price @ /share corrected', r.text.includes('~$498/share'), r.text)
  check('tranche $600 left untouched', (r.text.match(/\$600/g) || []).length === 2, r.text)
  check('allocation untouched', r.text.includes('$1,750'), r.text)
  check('price target scaled by live/claimed ratio', r.text.includes('Price target ~$623'), r.text)
  check('shares recomputed (1750/498 ≈ 3.5)', /~3\.5 shares/.test(r.text), r.text)
}

// Case C — range + "or use" form
{
  const md = [
    '## 5. AMZN (Amazon) — Value Infrastructure',
    '- **Allocation:** $2,400 (12%)',
    '- **Position Size:** ~10 shares @ ~$240 — *or use $240-260 range limit orders*',
  ].join('\n')
  const r = sanitizeStrategyPrices(md, new Map([['AMZN', quote('AMZN', 254.98)]]))
  check('AMZN already-accurate section left alone (drift < 15%)', r.corrections.length === 0, JSON.stringify(r.corrections))
}

// Case D — wild drift: PLTR ~$40 → $184.99
{
  const md = [
    '## 3. PLTR (Palantir)',
    '- **Allocation:** $2,800 (14%)',
    '- **Position Size:** ~70 shares @ ~$40',
    '- **Take-Profit:** Trim 25% of position at +100%; let remainder ride',
  ].join('\n')
  const r = sanitizeStrategyPrices(md, new Map([['PLTR', quote('PLTR', 184.99)]]))
  check('PLTR price corrected', r.text.includes('~$184.99'), r.text)
  check('PLTR shares recomputed (2800/184.99 ≈ 15)', /~15 shares/.test(r.text), r.text)
  check('percentages untouched', r.text.includes('Trim 25% of position at +100%'), r.text)
}

// Case E — unknown ticker must never be guessed at
{
  const md = ['## 1. ZZZZ (Unknown)', '- **Allocation:** $500 (5%)', '- **Position Size:** ~10 shares @ ~$50'].join('\n')
  const r = sanitizeStrategyPrices(md, new Map([['NVDA', quote('NVDA', 228.87)]]))
  check('ticker with no quote is untouched', r.text === md && r.corrections.length === 0, r.text)
}

// Case F — empty / no-quote guards
{
  check('empty markdown is a no-op', sanitizeStrategyPrices('', new Map()).text === '')
  const md = '## 1. NVDA (NVIDIA)\n- **Position Size:** ~25 shares @ ~$135'
  check('empty quote map is a no-op', sanitizeStrategyPrices(md, new Map()).text === md)
}

// Case G — losslessness: when nothing drifts, output must be byte-identical
{
  const md = [
    'Intro paragraph that must survive verbatim.',
    '',
    '## 1. NVDA (NVIDIA) — Core Supplier',
    '- **Allocation:** $3,400 (17%)',
    '- **Position Size:** ~15 shares @ ~$228.87',
    '',
    '## Portfolio Summary',
    '| NVDA | $3,400 | 17% | Supplier | Core |',
    '| MSFT | $3,000 | 15% | Infrastructure | Core |',
    '',
    '## Key Theme Catalysts',
    '- NVDA GTC announcements',
  ].join('\n')
  const q = new Map([['NVDA', quote('NVDA', 228.87)], ['MSFT', quote('MSFT', 498)]])
  const r = sanitizeStrategyPrices(md, q)
  check('already-accurate strategy is byte-identical', r.text === md, JSON.stringify(r.text.slice(0, 400)))
  check('summary region untouched', r.text.includes('| MSFT | $3,000 | 15% | Infrastructure | Core |'))
  check('no spurious corrections', r.corrections.length === 0, JSON.stringify(r.corrections))
}

// ─────────────────────────────────────────────────────────────
async function replayStoredStrategies() {
  console.log('\n2. Replay of stored strategies (live quotes)\n')

  const rows = execFileSync(
    'psql',
    ['postgresql://sune@localhost:5432/themevalidator', '-t', '-A',
      '-F', '\u0001', '-R', '\u0002', '-c',
      `SELECT id, strategy FROM "TradeStrategy" WHERE status='completed' AND strategy IS NOT NULL ORDER BY "createdAt" DESC LIMIT 5;`],
    { encoding: 'utf8' }
  ).split('\u0002').map((rec) => rec.trim()).filter(Boolean).map((rec) => {
    const idx = rec.indexOf('\u0001')
    return { id: rec.slice(0, idx).trim(), text: rec.slice(idx + 1) }
  })

  const tickers = Array.from(new Set(rows.flatMap((r) =>
    (r.text.match(/^#{1,3}\s+\**\s*(?:\d+[.)]\s*)?([A-Z]{1,5})\s*\(/gm) || [])
      .map((h) => (h.match(/([A-Z]{1,5})\s*\(/) || [, ''])[1])))).filter(Boolean)

  const quotes = await getLiveQuotes(tickers as string[])
  console.log(`  live quotes: ${[...quotes.entries()].map(([t, q]) => `${t}=$${q.price}`).join(' ')}\n`)

  for (const row of rows) {
    const r = sanitizeStrategyPrices(row.text, quotes)
    console.log(`  strategy ${row.id}: ${r.corrections.length} corrections across ${r.affectedTickers.join(', ') || 'none'}`)
    for (const c of r.corrections.slice(0, 6)) {
      console.log(`      ${c.ticker.padEnd(6)} ${c.kind.padEnd(12)} ${c.from} → ${c.to}`)
    }
    if (r.corrections.length > 6) console.log(`      … +${r.corrections.length - 6} more`)
    check(`  ${row.id} still has a live NVDA price if it mentions NVDA`,
      !/NVDA/.test(row.text) || !quotes.has('NVDA') || !/NVDA[\s\S]{0,300}?\$135/.test(r.text))
  }
}

async function main() {
  if (process.argv.includes('--db')) await replayStoredStrategies()
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
