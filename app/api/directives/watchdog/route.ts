export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { effectiveWeight, remainingDays, sweepExpired } from '@/lib/directives'

const EXPIRING_DAYS = 3
const STALE_PAUSE_DAYS = 14

// GET /api/directives/watchdog — directives needing attention, for the daily
// cron watchdog (silent unless something needs action).
// Auth: Bearer token matching CROSS_SITE_API_KEY.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const key = process.env.CROSS_SITE_API_KEY
  if (!key || authHeader !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await sweepExpired()
  const now = new Date()

  // Active directives nearing expiry (decayed weight almost fully back to 1.0)
  const actives = await prisma.directive.findMany({ where: { status: 'active' } })
  const expiringSoon = actives
    .map((d) => ({
      id: d.id,
      theme: d.theme,
      effectiveWeight: Math.round(effectiveWeight(d, now) * 100) / 100,
      remainingDays: Math.round((remainingDays(d, now) ?? 0) * 10) / 10,
    }))
    .filter((d) => d.remainingDays <= EXPIRING_DAYS)

  // Paused directives left frozen for a long time (probably abandoned)
  const cutoff = new Date(now.getTime() - STALE_PAUSE_DAYS * 86400 * 1000)
  const paused = await prisma.directive.findMany({
    where: { status: 'paused', pausedAt: { lte: cutoff } },
  })
  const stalePaused = paused.map((d) => ({
    id: d.id,
    theme: d.theme,
    pausedDays: Math.round(((now.getTime() - d.pausedAt!.getTime()) / 86400000) * 10) / 10,
  }))

  return NextResponse.json({ expiringSoon, stalePaused })
}
