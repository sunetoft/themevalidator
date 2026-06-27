export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { startPaperTrade } from '@/lib/paper-trader'
import { canCreatePaperTrade, isAdmin } from '@/lib/subscription'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const admin = await isAdmin(userId)

  // Subscription gate + 20 paper trade quota
  if (!admin) {
    const check = await canCreatePaperTrade(userId)
    if (!check.allowed) {
      return NextResponse.json({
        error: !check.limit
          ? 'Active membership required to create paper trades'
          : `Paper trade limit reached (${check.activeCount}/${check.limit})`,
        requiresUpgrade: !check.limit,
        currentCount: check.activeCount,
        max: check.limit,
      }, { status: 403 })
    }
  }

  const body = await request.json()
  const { strategyId, selectedTickers, name } = body ?? {}

  if (!strategyId) {
    return NextResponse.json({ error: 'Strategy ID is required' }, { status: 400 })
  }

  try {
    const result = await startPaperTrade(strategyId, userId, selectedTickers, name)

    return NextResponse.json({
      success: true,
      paperTradeId: result.paperTradeId,
      message: 'Paper trade started successfully',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to start paper trade' }, { status: 400 })
  }
}
