export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeTradeSharpe, computeAllTickerSharpes } from '@/lib/sharpe'

// GET all paper trades grouped by thesis for the current user
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id

  const theses = await prisma.thesis.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      overallScore: true,
      status: true,
      paperTrades: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          initialCapital: true,
          currentCash: true,
          totalValue: true,
          pnl: true,
          pnlPercent: true,
          status: true,
          lastCheckedAt: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          strategy: {
            select: { riskProfile: true, amount: true },
          },
          positions: {
            select: { ticker: true, quantity: true, avgCostBasis: true, currentPrice: true, marketValue: true, unrealizedPnl: true },
            orderBy: { ticker: 'asc' },
          },
          orders: {
            where: { status: 'pending' },
            select: { id: true, ticker: true, side: true, orderType: true, targetPrice: true, quantity: true },
            orderBy: [{ ticker: 'asc' }, { orderType: 'asc' }],
          },
          _count: { select: { orders: true, positions: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const withTrades = theses.filter((t) => t.paperTrades.length > 0)

  // Fetch snapshots for all trades and compute Sharpe ratios
  const tradeIds = withTrades.flatMap((t) => t.paperTrades.map((pt) => pt.id))
  if (tradeIds.length > 0) {
    const snapshots = await prisma.paperTradeSnapshot.findMany({
      where: { paperTradeId: { in: tradeIds } },
      orderBy: { createdAt: 'asc' },
      select: { paperTradeId: true, totalValue: true, positions: true, createdAt: true },
    })

    // Group snapshots by trade
    const snapshotsByTrade = new Map<string, typeof snapshots>()
    for (const snap of snapshots) {
      const arr = snapshotsByTrade.get(snap.paperTradeId) || []
      arr.push(snap)
      snapshotsByTrade.set(snap.paperTradeId, arr)
    }

    // Compute and attach Sharpe ratios
    for (const thesis of withTrades) {
      for (const trade of thesis.paperTrades as any[]) {
        const tradeSnaps = snapshotsByTrade.get(trade.id) || []
        trade.sharpeRatio = computeTradeSharpe(tradeSnaps)
        trade.tickerSharpe = computeAllTickerSharpes(tradeSnaps)
      }
    }
  }

  return NextResponse.json(withTrades)
}

// DELETE a paper trade by ID
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const { searchParams } = new URL(request.url)
  const paperTradeId = searchParams.get('id')

  if (!paperTradeId) {
    return NextResponse.json({ error: 'Paper trade ID is required' }, { status: 400 })
  }

  const paperTrade = await prisma.paperTrade.findFirst({
    where: { id: paperTradeId, userId },
  })

  if (!paperTrade) {
    return NextResponse.json({ error: 'Paper trade not found' }, { status: 404 })
  }

  await prisma.paperTrade.delete({ where: { id: paperTradeId } })

  return NextResponse.json({ success: true })
}
