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

// PATCH /api/admin/theses/[id] — reassign thesis to a different theme
// Body: { themeId: string | null }
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { themeId } = body

  // If themeId is null, unlink the thesis from any theme
  // If themeId is a string, verify it exists
  if (themeId !== null) {
    const theme = await prisma.theme.findUnique({ where: { id: themeId } })
    if (!theme) {
      return NextResponse.json({ error: 'Theme not found' }, { status: 404 })
    }
  }

  const updated = await prisma.thesis.update({
    where: { id: params.id },
    data: { themeId },
    select: {
      id: true,
      title: true,
      themeId: true,
      theme: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/admin/theses/[id] — delete a thesis (admin override)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  await prisma.thesis.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
