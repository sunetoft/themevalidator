export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - fetch paper trade details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const paperTradeId = params.id

  const paperTrade = await prisma.paperTrade.findFirst({
    where: { id: paperTradeId, userId },
    include: {
      orders: { orderBy: { createdAt: 'asc' } },
      positions: { orderBy: { ticker: 'asc' } },
      tradeLog: { orderBy: { createdAt: 'desc' }, take: 50 },
      strategy: {
        select: { amount: true, riskProfile: true, status: true, name: true },
      },
    },
  })

  if (!paperTrade) {
    return NextResponse.json({ error: 'Paper trade not found' }, { status: 404 })
  }

  return NextResponse.json(paperTrade)
}

// PATCH - pause/resume/complete paper trade
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const paperTradeId = params.id
  const body = await request.json()
  const { action } = body ?? {}

  const paperTrade = await prisma.paperTrade.findFirst({
    where: { id: paperTradeId, userId },
  })

  if (!paperTrade) {
    return NextResponse.json({ error: 'Paper trade not found' }, { status: 404 })
  }

  if (action === 'pause' && paperTrade.status === 'active') {
    await prisma.paperTrade.update({
      where: { id: paperTradeId },
      data: { status: 'paused' },
    })
    await prisma.paperTradeLog.create({
      data: {
        paperTradeId,
        action: 'trade_paused',
        details: 'Paper trade paused by user.',
      },
    })
    return NextResponse.json({ success: true, status: 'paused' })
  }

  if (action === 'resume' && paperTrade.status === 'paused') {
    await prisma.paperTrade.update({
      where: { id: paperTradeId },
      data: { status: 'active' },
    })
    await prisma.paperTradeLog.create({
      data: {
        paperTradeId,
        action: 'trade_resumed',
        details: 'Paper trade resumed by user.',
      },
    })
    return NextResponse.json({ success: true, status: 'active' })
  }

  if (action === 'complete') {
    // Cancel all pending orders
    await prisma.paperOrder.updateMany({
      where: { paperTradeId, status: 'pending' },
      data: { status: 'cancelled' },
    })
    await prisma.paperTrade.update({
      where: { id: paperTradeId },
      data: { status: 'completed', completedAt: new Date() },
    })
    await prisma.paperTradeLog.create({
      data: {
        paperTradeId,
        action: 'trade_completed',
        details: `Paper trade completed. Final P&L: $${paperTrade.pnl.toFixed(2)} (${paperTrade.pnlPercent.toFixed(2)}%)`,
      },
    })
    return NextResponse.json({ success: true, status: 'completed' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
