export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateTimelineForThesis } from '@/lib/timeline'

/**
 * GET  /api/theses/[id]/timeline — the stored ramp assessment
 * POST /api/theses/[id]/timeline — (re)generate it
 *
 * Visibility follows the thesis page: owner, admin, or anyone when the thesis
 * (or its parent theme) is published.
 */
async function loadThesis(id: string) {
  return prisma.thesis.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      status: true,
      timelineData: true,
      timelineUpdatedAt: true,
      theme: { select: { isPublic: true } },
    },
  })
}

function canView(thesis: Awaited<ReturnType<typeof loadThesis>>, userId?: string, isAdmin?: boolean) {
  if (!thesis) return false
  if (isAdmin) return true
  if (userId && thesis.userId === userId) return true
  return thesis.isPublic || thesis.theme?.isPublic === true
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const isAdmin = (session?.user as any)?.role === 'admin'

  const thesis = await loadThesis(params.id)
  if (!canView(thesis, userId, isAdmin)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    thesisId: thesis!.id,
    timeline: thesis!.timelineData,
    updatedAt: thesis!.timelineUpdatedAt,
  })
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any)?.id as string | undefined
  const isAdmin = (session.user as any)?.role === 'admin'

  const thesis = await loadThesis(params.id)
  if (!canView(thesis, userId, isAdmin)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (thesis!.status !== 'completed') {
    return NextResponse.json({ error: 'Thesis analysis is not complete yet' }, { status: 409 })
  }

  const result = await generateTimelineForThesis(params.id)
  const updated = await loadThesis(params.id)

  return NextResponse.json(
    {
      ok: result.ok,
      error: result.error,
      timeline: updated?.timelineData ?? null,
      updatedAt: updated?.timelineUpdatedAt ?? null,
    },
    { status: result.ok ? 200 : 502 },
  )
}
