#!/usr/bin/env tsx
/**
 * Dry-run preview: show the price-corrected text of a stored strategy.
 * Usage: node ./node_modules/.bin/tsx scripts/preview-strategy-prices.ts <strategyId>
 */
import { execFileSync } from 'child_process'
import { sanitizeStrategyPrices } from '../lib/strategy-price-guard'
import { getLiveQuotes } from '../lib/live-quotes'

const id = process.argv[2]

async function main() {
  const raw = execFileSync(
    'psql',
    ['postgresql://sune@localhost:5432/themevalidator', '-t', '-A', '-c',
      `SELECT strategy FROM "TradeStrategy" WHERE id='${id}';`],
    { encoding: 'utf8' }
  )

  const tickers = Array.from(new Set(
    (raw.match(/^#{1,3}\s+\**\s*(?:\d+[.)]\s*)?([A-Z]{1,5})\s*\(/gm) || [])
      .map((h) => (h.match(/([A-Z]{1,5})\s*\(/) || [, ''])[1] as string)
  )).filter(Boolean)

  const quotes = await getLiveQuotes(tickers)
  const r = sanitizeStrategyPrices(raw, quotes)

  console.log(`\nlive: ${[...quotes.entries()].map(([t, q]) => `${t}=$${q.price}`).join('  ')}`)
  console.log(`corrections: ${r.corrections.length} across ${r.affectedTickers.join(', ')}\n`)

  const lines = r.text.split('\n')
  for (const t of r.affectedTickers) {
    // Word-boundary match — a bare `.includes('NOW')` also matches `SNOW`.
    const headerRe = new RegExp(`^#{1,3}\\s+\\**\\s*(?:\\d+[.)]\\s*)?${t}\\b`)
    const start = lines.findIndex((l) => headerRe.test(l))
    if (start < 0) continue
    const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l))
    console.log(lines.slice(start, end < 0 ? lines.length : end).join('\n'))
    console.log('─'.repeat(70))
  }
}

main()
