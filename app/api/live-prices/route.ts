export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLiveQuotes, fmtPrice, quotesAsOf } from '@/lib/live-quotes'

/**
 * GET /api/live-prices?tickers=NVDA,MSFT,PLTR&ttl=60
 *
 * Server-side live quotes for arbitrary tickers, so pages render prices from
 * market data instead of whatever the LLM echoed into a generated document.
 * Cached in-process (60s) inside lib/live-quotes.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('tickers') ?? ''
  const tickers = raw
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t))
    .slice(0, 60)

  if (tickers.length === 0) {
    return NextResponse.json({ prices: {}, asOf: null })
  }

  const quotes = await getLiveQuotes(tickers)

  const prices: Record<string, { price: number; display: string; prevClose: number | null; dayChangePct: number | null; asOf: string | null }> = {}
  for (const [ticker, q] of quotes) {
    prices[ticker] = {
      price: q.price,
      display: `$${fmtPrice(q.price)}`,
      prevClose: q.prevClose,
      dayChangePct: q.dayChangePct,
      asOf: q.asOf,
    }
  }

  return NextResponse.json({
    prices,
    missing: tickers.filter((t) => !quotes.has(t)),
    asOf: quotesAsOf(quotes),
  })
}
