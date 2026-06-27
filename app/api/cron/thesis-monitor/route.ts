export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { runThesisMonitor } from '@/lib/thesis-monitor'

/**
 * Thesis monitor cron endpoint — called daily by launchd (9:00 AM).
 *
 * Checks all published themes for changes that could affect the investment
 * thesis narrative (earnings, price moves, technical signals, analyst changes,
 * valuation stretch) and creates ThesisAlert records.
 *
 * Auth: Bearer token (PAPER_TRADE_CRON_KEY) OR authenticated session —
 * same pattern as /api/cron/stock-update.
 */
export async function POST(request: NextRequest) {
  // Auth — Bearer token OR authenticated session
  const authHeader = request.headers.get('authorization')
  const internalKey = process.env.PAPER_TRADE_CRON_KEY

  if (internalKey && authHeader !== `Bearer ${internalKey}`) {
    try {
      const { getServerSession } = await import('next-auth')
      const { authOptions } = await import('@/lib/auth')
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } catch (_e: any) {
      // next-auth not configured / unavailable → fall back to token-only auth
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = Date.now()
  try {
    const summary = await runThesisMonitor()
    return NextResponse.json({
      success: true,
      ...summary,
    })
  } catch (e: any) {
    console.error('[thesis-monitor cron] Fatal error:', e?.message)
    return NextResponse.json(
      {
        success: false,
        error: e?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    )
  }
}

// Also allow GET for easy health-check / manual trigger from browser
export async function GET(request: NextRequest) {
  return POST(request)
}
