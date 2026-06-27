export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET all strategies grouped by thesis for the current user
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
      tradeStrategies: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          amount: true,
          riskProfile: true,
          status: true,
          strategy: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { paperTrades: true } },
          paperTrades: {
            select: {
              _count: {
                select: { orders: { where: { side: 'buy' } } },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Only return theses that have strategies
  const withStrategies = theses
    .filter((t) => t.tradeStrategies.length > 0)
    .map((t) => ({
      ...t,
      tradeStrategies: t.tradeStrategies.map((s) => {
        const entryTrades = s.paperTrades.reduce(
          (sum, pt) => sum + pt._count.orders,
          0
        )
        const { paperTrades, ...rest } = s
        return { ...rest, entryTrades }
      }),
    }))

  return NextResponse.json(withStrategies)
}

// DELETE a strategy by ID
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const { searchParams } = new URL(request.url)
  const strategyId = searchParams.get('id')

  if (!strategyId) {
    return NextResponse.json({ error: 'Strategy ID is required' }, { status: 400 })
  }

  const strategy = await prisma.tradeStrategy.findFirst({
    where: { id: strategyId, userId },
  })

  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })
  }

  await prisma.tradeStrategy.delete({ where: { id: strategyId } })

  return NextResponse.json({ success: true })
}
