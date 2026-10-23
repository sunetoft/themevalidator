/**
 * Backfill Thesis.timelineData for existing theses.
 *
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/backfill-timelines.ts --limit 5
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/backfill-timelines.ts --all
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/backfill-timelines.ts --ids id1,id2
 *
 * New theses get their timeline automatically; this is only for the backlog.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { generateTimelineForThesis } from '../lib/timeline'

async function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const limitArg = args.find((a) => a.startsWith('--limit'))
  const idsArg = args.find((a) => a.startsWith('--ids'))
  const limit = limitArg ? Number(limitArg.split('=')[1] ?? args[args.indexOf(limitArg) + 1]) : 5

  let theses: Array<{ id: string; title: string }> = []

  if (idsArg) {
    const ids = (idsArg.split('=')[1] ?? args[args.indexOf(idsArg) + 1] ?? '').split(',').filter(Boolean)
    theses = await prisma.thesis.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
    })
  } else {
    theses = await prisma.thesis.findMany({
      where: {
        status: 'completed',
        ...(all ? {} : { timelineData: { equals: Prisma.DbNull } }),
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: all ? 200 : limit,
    })
  }

  console.log(`Backfilling ${theses.length} thesis timeline(s)…`)

  let ok = 0
  for (const [i, t] of theses.entries()) {
    const started = Date.now()
    const res = await generateTimelineForThesis(t.id)
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (res.ok) ok++
    console.log(`[${i + 1}/${theses.length}] ${res.ok ? 'OK ' : 'FAIL'} ${secs}s  ${t.id}  ${t.title}${res.error ? ` — ${res.error}` : ''}`)
  }

  console.log(`Done: ${ok}/${theses.length} succeeded`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
