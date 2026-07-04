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

// PATCH /api/admin/themes/[id] — toggle public visibility of a Theme
// Also accepts thesis IDs for backward compat — toggles the associated theme
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { isPublic } = body

  // Try to find as Theme first
  let theme = await prisma.theme.findUnique({ where: { id: params.id } })

  // Backward compat: if not a theme, check if it's a thesis ID with an associated theme
  if (!theme) {
    const thesis = await prisma.thesis.findUnique({
      where: { id: params.id },
      select: { themeId: true }
    })
    if (thesis?.themeId) {
      theme = await prisma.theme.findUnique({ where: { id: thesis.themeId } })
    }
  }

  if (!theme) {
    return NextResponse.json({ error: 'Theme not found' }, { status: 404 })
  }

  // Update the theme visibility
  const updated = await prisma.theme.update({
    where: { id: theme.id },
    data: {
      isPublic,
      publishedAt: isPublic ? new Date() : null,
    },
    select: { id: true, isPublic: true, publishedAt: true },
  })

  // Also sync child theses' isPublic for backward compat
  await prisma.thesis.updateMany({
    where: { themeId: theme.id },
    data: {
      isPublic,
      publishedAt: isPublic ? new Date() : null,
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/admin/themes/[id] — delete a theme (and optionally its theses)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Try theme first, then thesis (backward compat)
  const theme = await prisma.theme.findUnique({ where: { id: params.id } })
  if (theme) {
    // Unlink theses before deleting the theme
    await prisma.thesis.updateMany({
      where: { themeId: theme.id },
      data: { themeId: null },
    })
    await prisma.theme.delete({ where: { id: theme.id } })
    return NextResponse.json({ success: true })
  }

  // Backward compat: delete a thesis directly
  await prisma.thesis.delete({ where: { id: params.id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
