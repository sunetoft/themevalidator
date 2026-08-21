export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDirective, sweepExpired, logEvent } from '@/lib/directives'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } })
  if (!user || user.role !== 'admin') return null
  return user
}

// GET /api/admin/directives — list all directives (decay-aware, auto-expires overdue)
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  await sweepExpired()
  const directives = await prisma.directive.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      themeRel: { select: { id: true, name: true, slug: true } },
      _count: { select: { events: true } },
    },
  })
  const now = new Date()
  return NextResponse.json(
    directives.map((d) => serializeDirective(d, now))
  )
}

// POST /api/admin/directives — create a directive
export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { theme, themeId, tickers, tags, weight, window, decay, scope, reason } = body

  if (!theme || typeof theme !== 'string' || !theme.trim()) {
    return NextResponse.json({ error: 'Theme is required' }, { status: 400 })
  }

  // Duplicate guard: reject a second active/paused directive with the same theme
  // (case-insensitive). Few rows, so compare in JS to avoid Prisma mode quirks.
  const active = await prisma.directive.findMany({
    where: { status: { in: ['active', 'paused'] } },
  })
  const dup = active.find(
    (d) => d.theme.toLowerCase() === theme.trim().toLowerCase()
  )
  if (dup) {
    return NextResponse.json(
      { error: `Active directive '${dup.theme}' already exists`, id: dup.id },
      { status: 409 }
    )
  }

  const nominalWeight = typeof weight === 'number' && weight > 0 ? weight : 1.5
  const ttlDays = typeof window === 'number' && window > 0 ? window : 30
  const directive = await prisma.directive.create({
    data: {
      theme: theme.trim(),
      themeId: themeId || null,
      tickers: Array.isArray(tickers) ? tickers : [],
      tags: Array.isArray(tags) ? tags : [],
      nominalWeight,
      ttlDays,
      decayFn: decay === 'none' ? 'none' : 'linear',
      scope: scope === 'collector' || scope === 'scanner' ? scope : 'both',
      reason: reason || null,
      addedBy: admin.email,
      source: 'web',
    },
  })
  await logEvent(directive.id, 'create', {
    newValue: directive.theme,
    actor: admin.email,
    source: 'web',
    reason: reason || null,
  })

  return NextResponse.json(serializeDirective(directive))
}
