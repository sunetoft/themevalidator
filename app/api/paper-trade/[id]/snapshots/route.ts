import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tradeId = params.id
  const trade = await prisma.paperTrade.findUnique({ where: { id: tradeId } })

  if (!trade) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const snapshots = await prisma.paperTradeSnapshot.findMany({
    where: { paperTradeId: tradeId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      totalValue: true,
      pnl: true,
      pnlPercent: true,
      createdAt: true,
      positions: true,
    },
  })

  return NextResponse.json({
    tradeId,
    initialCapital: trade.initialCapital,
    snapshots: snapshots.map(s => ({
      id: s.id,
      totalValue: s.totalValue,
      pnl: s.pnl,
      pnlPercent: s.pnlPercent,
      createdAt: s.createdAt,
    })),
  })
}
