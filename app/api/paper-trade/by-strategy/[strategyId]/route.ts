export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET paper trades for a specific strategy
export async function GET(
  request: NextRequest,
  { params }: { params: { strategyId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const strategyId = params.strategyId

  const paperTrades = await prisma.paperTrade.findMany({
    where: { strategyId, userId },
    include: {
      orders: { orderBy: { createdAt: 'asc' } },
      positions: { orderBy: { ticker: 'asc' } },
      tradeLog: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(paperTrades)
}
