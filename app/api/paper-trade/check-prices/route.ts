export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkAndExecuteOrders, isNYSEOpen } from '@/lib/paper-trader'

/**
 * This endpoint is called by the scheduled task to check prices
 * and execute paper trade orders during NYSE hours.
 * It can also be triggered manually.
 */
export async function POST(request: NextRequest) {
  // Verify internal API key for scheduled task authentication (Bearer only)
  const authHeader = request.headers.get('authorization')
  const internalKey = process.env.PAPER_TRADE_CRON_KEY

  if (!internalKey || authHeader !== `Bearer ${internalKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nyseOpen = isNYSEOpen()

  // Allow manual trigger even outside NYSE hours, but log it
  const result = await checkAndExecuteOrders()

  return NextResponse.json({
    success: true,
    nyseOpen,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
