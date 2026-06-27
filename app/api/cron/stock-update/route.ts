export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { setCachedStockData, getCachedTickers, setLastCronRefresh } from '@/lib/stock-cache'
import { checkAndExecuteOrders, isNYSEOpen } from '@/lib/paper-trader'

/**
 * Combined cron endpoint — called every 15 min by launchd.
 *
 * Does two things:
 * 1. Pre-fetches Yahoo Finance chart data for all tickers in the system
 *    (paper trade orders/positions + theme members) → updates the in-memory
 *    stock cache so charts load instantly for users.
 * 2. Runs order execution check (stop-loss / take-profit / limit fills).
 *
 * Auth: Bearer token (PAPER_TRADE_CRON_KEY) OR authenticated user.
 */

interface YahooResult {
  ticker: string
  success: boolean
  cached: boolean
  error?: string
}

async function fetchAndCacheStockData(ticker: string): Promise<YahooResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    })

    if (!resp.ok) {
      return { ticker, success: false, cached: false, error: `HTTP ${resp.status}` }
    }

    const data = await resp.json()
    const result = data?.chart?.result?.[0]
    if (!result) {
      return { ticker, success: false, cached: false, error: 'No data' }
    }

    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    const dailyData = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        price: closes[i],
      }))
      .filter((d) => d.price != null)

    const oneYear = dailyData
    const threeMonths = dailyData.slice(-63)
    const currentPrice = dailyData.length > 0 ? dailyData[dailyData.length - 1].price : null
    const yearAgoPrice = dailyData.length > 0 ? dailyData[0].price : null
    const threeMonthsAgoPrice = threeMonths.length > 0 ? threeMonths[0].price : null

    const yearChange = currentPrice && yearAgoPrice
      ? ((currentPrice - yearAgoPrice) / yearAgoPrice) * 100
      : null
    const threeMonthChange = currentPrice && threeMonthsAgoPrice
      ? ((currentPrice - threeMonthsAgoPrice) / threeMonthsAgoPrice) * 100
      : null

    const allPrices = dailyData.map((d) => d.price as number)
    const yearHigh = allPrices.length > 0 ? Math.max(...allPrices) : null
    const yearLow = allPrices.length > 0 ? Math.min(...allPrices) : null

    const payload = {
      ticker,
      currentPrice,
      yearChange,
      threeMonthChange,
      yearHigh,
      yearLow,
      oneYear,
      threeMonths,
    }

    setCachedStockData(ticker, payload)
    return { ticker, success: true, cached: true }
  } catch (error: any) {
    return { ticker, success: false, cached: false, error: error?.message || 'Unknown error' }
  }
}

export async function POST(request: NextRequest) {
  // Auth — Bearer token OR authenticated session
  const authHeader = request.headers.get('authorization')
  const internalKey = process.env.PAPER_TRADE_CRON_KEY

  if (internalKey && authHeader !== `Bearer ${internalKey}`) {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const nyseOpen = isNYSEOpen()
  const startedAt = Date.now()

  // ── 1. Collect all unique tickers from the system ──────────────────
  const tickerSet = new Set<string>()

  // Active paper trades: pending orders + positions
  const activeTrades = await prisma.paperTrade.findMany({
    where: { status: 'active' },
    select: {
      orders: { select: { ticker: true, status: true } },
      positions: { select: { ticker: true } },
    },
  })
  for (const trade of activeTrades) {
    for (const order of trade.orders) {
      if (order.status === 'pending') tickerSet.add(order.ticker)
    }
    for (const pos of trade.positions) {
      tickerSet.add(pos.ticker)
    }
  }

  // Theme members (so charts are fresh when browsing themes)
  const members = await prisma.themeMember.findMany({
    where: { ticker: { not: null } },
    select: { ticker: true },
    distinct: ['ticker'],
  })
  for (const m of members) {
    if (m.ticker) tickerSet.add(m.ticker)
  }

  const allTickers = Array.from(tickerSet).sort()

  // ── 2. Pre-fetch stock data → update cache ─────────────────────────
  // Fetch in parallel batches of 5 to avoid rate limiting
  const stockResults: YahooResult[] = []
  const batchSize = 5
  for (let i = 0; i < allTickers.length; i += batchSize) {
    const batch = allTickers.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fetchAndCacheStockData))
    stockResults.push(...batchResults)
  }

  const stocksUpdated = stockResults.filter((r) => r.success).length
  const stockErrors = stockResults.filter((r) => !r.success)

  setLastCronRefresh()

  // ── 3. Check & execute paper trade orders (alerts) ─────────────────
  const orderResult = await checkAndExecuteOrders()

  // ── 4. Summary ─────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    nyseOpen,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    stockData: {
      tickersTotal: allTickers.length,
      updated: stocksUpdated,
      errors: stockErrors.length,
      errorDetails: stockErrors.length > 0 ? stockErrors.slice(0, 10) : undefined,
      previouslyCached: getCachedTickers().length,
    },
    orderCheck: orderResult,
  })
}

// Also allow GET for easy health-check / manual trigger from browser
export async function GET(request: NextRequest) {
  return POST(request)
}
