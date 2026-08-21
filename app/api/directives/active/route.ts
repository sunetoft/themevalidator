export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeDirective, sweepExpired } from '@/lib/directives'

// GET /api/directives/active — active directives with effective weights, for
// the agent (thesis-signal-collector) to bias its search mesh.
// Auth: Bearer token matching CROSS_SITE_API_KEY (shared secret).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const key = process.env.CROSS_SITE_API_KEY
  if (!key || authHeader !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await sweepExpired()
  const directives = await prisma.directive.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
  })
  const now = new Date()
  return NextResponse.json(directives.map((d) => serializeDirective(d, now)))
}
