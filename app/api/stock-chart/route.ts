export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCachedStockData, setCachedStockData } from '@/lib/stock-cache'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const refresh = searchParams.get('refresh') === 'true'

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
  }

  // Return cached data unless explicit refresh requested
  if (!refresh) {
    const cached = getCachedStockData(ticker)
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        _cached: true,
        _cachedAt: cached.cachedAt,
      })
    }
  }

  try {
    // Fetch 1Y daily data — covers both 1Y and 3M views in one call
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!resp.ok) {
      // If we have stale cached data, return it rather than failing
      const cached = getCachedStockData(ticker)
      if (cached) {
        return NextResponse.json({
          ...cached.data,
          _cached: true,
          _cachedAt: cached.cachedAt,
          _stale: true,
        })
      }
      return NextResponse.json({ error: 'Failed to fetch price data' }, { status: 502 })
    }

    const data = await resp.json()
    const result = data?.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 })
    }

    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    // Build daily close data points
    const dailyData = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        price: closes[i],
      }))
      .filter((d) => d.price != null)

    // Split into 1Y (all) and 3M (last ~63 trading days)
    const oneYear = dailyData
    const threeMonths = dailyData.slice(-63)

    // Current price and basic stats
    const currentPrice = dailyData.length > 0 ? dailyData[dailyData.length - 1].price : null
    const yearAgoPrice = dailyData.length > 0 ? dailyData[0].price : null
    const threeMonthsAgoPrice = threeMonths.length > 0 ? threeMonths[0].price : null

    const yearChange = currentPrice && yearAgoPrice
      ? ((currentPrice - yearAgoPrice) / yearAgoPrice) * 100
      : null
    const threeMonthChange = currentPrice && threeMonthsAgoPrice
      ? ((currentPrice - threeMonthsAgoPrice) / threeMonthsAgoPrice) * 100
      : null

    // 52-week high/low
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

    // Cache for future requests
    setCachedStockData(ticker, payload)

    return NextResponse.json({ ...payload, _cached: false })
  } catch (error: any) {
    console.error('[stock-chart] Error:', error?.message)
    // Return stale cache if available on error
    const cached = getCachedStockData(ticker)
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        _cached: true,
        _cachedAt: cached.cachedAt,
        _stale: true,
      })
    }
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 })
  }
}
