#!/usr/bin/env tsx
/**
 * Backfill: rewrite hallucinated share prices in ALREADY-STORED strategies.
 *
 * Strategies generated before the live-price layer shipped contain prices the
 * model recalled from its training data (e.g. NVDA "~$135" when the real price
 * was $228.87). This replays lib/strategy-price-guard over every completed
 * strategy and rewrites the amounts that drifted.
 *
 * Usage:
 *   node ./node_modules/.bin/tsx scripts/backfill-strategy-prices.ts          # dry run
 *   node ./node_modules/.bin/tsx scripts/backfill-strategy-prices.ts --apply  # write to DB
 */

import { sanitizeStrategyPrices } from '../lib/strategy-price-guard'
import { getLiveQuotes } from '../lib/live-quotes'
import { prisma } from '../lib/prisma'

const APPLY = process.argv.includes('--apply')

async function main() {
  const rows = (
    await prisma.tradeStrategy.findMany({
      where: { strategy: { not: null } },
      select: { id: true, strategy: true },
      orderBy: { createdAt: 'desc' },
    })
  )
    .filter((r) => (r.strategy?.length ?? 0) > 200)
    .map((r) => ({ id: r.id, text: r.strategy as string }))

  console.log(`\n${rows.length} stored strategies${APPLY ? ' (APPLY)' : ' (dry run)'}\n`)

  // One quote fetch for the whole fleet — tickers are heavily shared.
  const tickers = Array.from(new Set(rows.flatMap((r) =>
    (r.text.match(/^#{1,3}\s+\**\s*(?:\d+[.)]\s*)?([A-Z]{1,5})\s*\(/gm) || [])
      .map((h) => (h.match(/([A-Z]{1,5})\s*\(/) || [, ''])[1] as string)
  ))).filter(Boolean)

  const quotes = await getLiveQuotes(tickers)
  console.log(`live: ${[...quotes.entries()].map(([t, q]) => `${t}=$${q.price}`).join('  ')}\n`)

  let totalCorrections = 0
  let changed = 0

  for (const row of rows) {
    const r = sanitizeStrategyPrices(row.text, quotes)
    if (r.corrections.length === 0) {
      console.log(`  – ${row.id}: no changes`)
      continue
    }
    changed++
    totalCorrections += r.corrections.length
    console.log(`  ✓ ${row.id}: ${r.corrections.length} corrections across ${r.affectedTickers.join(', ')}`)
    for (const c of r.corrections) {
      console.log(`        ${c.ticker.padEnd(6)} ${c.kind.padEnd(12)} ${c.from} → ${c.to}`)
    }

    if (APPLY) {
      // Prisma handles quoting/escaping — raw SQL on multi-KB markdown is a trap.
      await prisma.tradeStrategy.update({
        where: { id: row.id },
        data: { strategy: r.text },
      })
    }
  }

  console.log(`\n${changed}/${rows.length} strategies affected, ${totalCorrections} corrections total`)
  if (!APPLY && changed > 0) console.log('Re-run with --apply to persist.\n')
  else console.log('')

  await prisma.$disconnect()
}

main()
