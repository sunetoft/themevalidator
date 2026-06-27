export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } })
  if (!user || user.role !== 'admin') return null
  return user
}

// GET /api/admin/overview — all strategies + paper trades with creator emails
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // All theses (for theme management)
  const theses = await prisma.thesis.findMany({
    select: {
      id: true,
      title: true,
      overallScore: true,
      status: true,
      isPublic: true,
      publishedAt: true,
      createdAt: true,
      userId: true,
      _count: {
        select: {
          paperTrades: { where: { status: 'active' } },
          tradeStrategies: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // All strategies with creator info
  const strategies = await prisma.tradeStrategy.findMany({
    select: {
      id: true,
      amount: true,
      riskProfile: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      thesis: { select: { id: true, title: true } },
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { paperTrades: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // All paper trades with creator info
  const paperTrades = await prisma.paperTrade.findMany({
    select: {
      id: true,
      initialCapital: true,
      totalValue: true,
      pnl: true,
      pnlPercent: true,
      status: true,
      startedAt: true,
      lastCheckedAt: true,
      strategy: { select: { id: true, riskProfile: true, amount: true } },
      thesis: { select: { id: true, title: true } },
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { positions: true, orders: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // All users with subscription info
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          tier: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
      _count: {
        select: {
          theses: true,
          paperTrades: true,
          tradeStrategies: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    theses: JSON.parse(JSON.stringify(theses)),
    strategies: JSON.parse(JSON.stringify(strategies)),
    paperTrades: JSON.parse(JSON.stringify(paperTrades)),
    users: JSON.parse(JSON.stringify(users)),
  })
}
