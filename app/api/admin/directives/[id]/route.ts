export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  serializeDirective,
  sweepExpired,
  logEvent,
  transitionStatus,
} from '@/lib/directives'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } })
  if (!user || user.role !== 'admin') return null
  return user
}

// GET /api/admin/directives/[id] — show one + its audit trail
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  await sweepExpired()
  const d = await prisma.directive.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { createdAt: 'desc' } },
      themeRel: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!d) {
    return NextResponse.json({ error: 'Directive not found' }, { status: 404 })
  }
  return NextResponse.json(serializeDirective(d))
}

// PATCH /api/admin/directives/[id] — action (pause/resume/drop/extend) or field edits
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { action, days, reason, theme, themeId, tickers, tags, weight, window, decay, scope } = body

  // ---- lifecycle actions -------------------------------------------------
  if (action === 'pause' || action === 'resume' || action === 'drop') {
    const target =
      action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'archived'
    try {
      const d = await transitionStatus(params.id, target, {
        actor: admin.email,
        source: 'web',
        reason: reason || null,
      })
      if (!d) {
        return NextResponse.json({ error: 'Directive not found' }, { status: 404 })
      }
      return NextResponse.json(serializeDirective(d))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Transition failed' }, { status: 400 })
    }
  }

  if (action === 'extend') {
    const d = await prisma.directive.findUnique({ where: { id: params.id } })
    if (!d) {
      return NextResponse.json({ error: 'Directive not found' }, { status: 404 })
    }
    const add = typeof days === 'number' && days > 0 ? days : 0
    const newTtl = d.ttlDays + add
    const updated = await prisma.directive.update({
      where: { id: params.id },
      data: { ttlDays: newTtl },
    })
    await logEvent(params.id, 'extend', {
      field: 'ttlDays',
      oldValue: String(d.ttlDays),
      newValue: String(newTtl),
      actor: admin.email,
      source: 'web',
      reason: reason || null,
    })
    return NextResponse.json(serializeDirective(updated))
  }

  // ---- field edits ---------------------------------------------------------
  const d = await prisma.directive.findUnique({ where: { id: params.id } })
  if (!d) {
    return NextResponse.json({ error: 'Directive not found' }, { status: 404 })
  }

  const data: Record<string, any> = {}
  const changes: { field: string; old: string; next: string }[] = []

  const pushChange = (field: string, old: any, next: any, val: any) => {
    if (val !== undefined && old !== next) {
      data[field] = val
      changes.push({ field, old: String(old), next: String(next) })
    }
  }

  if (theme !== undefined) pushChange('theme', d.theme, String(theme).trim(), String(theme).trim())
  if (themeId !== undefined) pushChange('themeId', d.themeId ?? '', themeId ?? '', themeId || null)
  if (weight !== undefined) pushChange('nominalWeight', d.nominalWeight, Number(weight), Number(weight))
  if (window !== undefined) pushChange('ttlDays', d.ttlDays, Number(window), Number(window))
  if (decay !== undefined) {
    const v = decay === 'none' ? 'none' : 'linear'
    pushChange('decayFn', d.decayFn, v, v)
  }
  if (scope !== undefined) {
    const v = scope === 'collector' || scope === 'scanner' ? scope : 'both'
    pushChange('scope', d.scope, v, v)
  }
  if (reason !== undefined) pushChange('reason', d.reason ?? '', reason ?? '', reason || null)
  if (tickers !== undefined && Array.isArray(tickers)) {
    pushChange('tickers', JSON.stringify(d.tickers), JSON.stringify(tickers), tickers)
  }
  if (tags !== undefined && Array.isArray(tags)) {
    pushChange('tags', JSON.stringify(d.tags), JSON.stringify(tags), tags)
  }

  if (changes.length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const updated = await prisma.directive.update({
    where: { id: params.id },
    data,
  })
  for (const c of changes) {
    await logEvent(params.id, 'update', {
      field: c.field,
      oldValue: c.old,
      newValue: c.next,
      actor: admin.email,
      source: 'web',
      reason: reason || null,
    })
  }
  return NextResponse.json(serializeDirective(updated))
}

// DELETE /api/admin/directives/[id] — hard delete (events cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  await prisma.directive.delete({ where: { id: params.id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
