/**
 * API Route: POST /api/theses/[id]/sync-graph
 *
 * Pushes a completed thesis analysis from PostgreSQL to FalkorDB.
 * Creates/updates the graph with company nodes, products, and relationships.
 *
 * Access: The thesis owner (user who created it) OR admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncThesisToGraph } from '@/lib/falkordb'

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
        theme: { select: { name: true, description: true } },
      },
    })

    if (!thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
    }

    if (thesis.status !== 'completed') {
      return NextResponse.json(
        { error: `Thesis status is "${thesis.status}" — must be "completed" to sync` },
        { status: 400 }
      )
    }

    const result = await syncThesisToGraph({
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
        ? { name: thesis.theme.name, description: thesis.theme.description }
        : undefined,
    })

    // On success, record the sync timestamp
    if (result.success) {
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
 * Returns the current sync status for this thesis in FalkorDB.
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
        theme: { select: { name: true } },
      },
    })

    if (!thesis) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
    }

    const ecosystem = (thesis.ecosystemData as any) || {}
    const themeName = ecosystem.themeName || thesis.theme?.name || thesis.title
    const graphId = themeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 64)

    return NextResponse.json({
      thesisId: thesis.id,
      title: thesis.title,
      status: thesis.status,
      themeName,
      expectedGraphId: graphId,
      memberCount: ecosystem.members?.length || 0,
      canSync: thesis.status === 'completed',
      graphSyncedAt: thesis.graphSyncedAt,
      isSynced: !!thesis.graphSyncedAt,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to check status' },
      { status: 500 }
    )
  }
}
