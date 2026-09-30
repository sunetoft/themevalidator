/**
 * API Route: POST /api/theses/[id]/sync-graph
 *
 * Exports a completed thesis analysis as a *seed* for the value-chain-trade theme
 * graph (see lib/falkordb.ts). The seed is written to
 * `<VALUE_CHAIN_ROOT>/seed_incoming/<theme_id>/` and handed to the loader, which
 * merges it into the shared graph only when it passes the graph-writer checklist.
 * Incomplete drafts stay on disk with a VALIDATION.md instead of polluting the graph.
 *
 * Access: The thesis owner (user who created it) OR admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exportThesisToSeed, readSeedStatus, themeIdFor } from '@/lib/falkordb'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const userRole = (session.user as any)?.role

  try {
    // Fetch the thesis — user must own it OR be admin
    const thesis = await prisma.thesis.findFirst({
      where: userRole === 'admin' ? { id: params.id } : { id: params.id, userId },
      include: {
        theme: { select: { name: true, description: true, slug: true } },
      },
    })

    if (!thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
    }

    if (thesis.status !== 'completed') {
      return NextResponse.json(
        { error: `Thesis status is "${thesis.status}" — must be "completed" to export` },
        { status: 400 }
      )
    }

    const result = await exportThesisToSeed({
      id: thesis.id,
      title: thesis.title,
      description: thesis.description,
      themeId: thesis.themeId,
      sentimentData: thesis.sentimentData as any,
      ecosystemData: thesis.ecosystemData as any,
      externalFactors: thesis.externalFactors as any,
      bottlenecks: thesis.bottlenecks as any,
      valuationData: thesis.valuationData as any,
      financialData: thesis.financialData as any,
      theme: thesis.theme
        ? { name: thesis.theme.name, description: thesis.theme.description, slug: thesis.theme.slug }
        : undefined,
    })

    // Only stamp the thesis when the seed actually cleared the checklist and merged.
    if (result.status === 'loaded') {
      await prisma.thesis.update({
        where: { id: thesis.id },
        data: { graphSyncedAt: new Date() },
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Graph sync error:', error)
    return NextResponse.json(
      { error: error?.message || 'Sync failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/theses/[id]/sync-graph
 * Returns the current seed/export status for this thesis.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id

  try {
    const thesis = await prisma.thesis.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true,
        title: true,
        status: true,
        graphSyncedAt: true,
        ecosystemData: true,
        theme: { select: { name: true, slug: true } },
      },
    })

    if (!thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
    }

    const ecosystem = (thesis.ecosystemData as any) || {}
    const themeName = ecosystem.themeName || thesis.theme?.name || thesis.title
    const themeId = themeIdFor(thesis.theme?.slug || themeName)
    const graph = process.env.FALKORDB_GRAPH || 'grid'
    const draft = await readSeedStatus(themeId)

    return NextResponse.json({
      thesisId: thesis.id,
      title: thesis.title,
      status: thesis.status,
      themeName,
      themeId,
      graph,
      expectedGraphId: graph,
      memberCount: ecosystem.members?.length || 0,
      canSync: thesis.status === 'completed',
      graphSyncedAt: thesis.graphSyncedAt,
      isSynced: !!thesis.graphSyncedAt,
      draft,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to check status' },
      { status: 500 }
    )
  }
}
