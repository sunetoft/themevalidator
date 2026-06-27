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

// PATCH /api/admin/themes/[id]/publish — toggle public visibility
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

  const thesis = await prisma.thesis.update({
    where: { id: params.id },
    data: {
      isPublic,
      publishedAt: isPublic ? new Date() : null,
    },
    select: { id: true, isPublic: true, publishedAt: true },
  })

  return NextResponse.json(thesis)
}

// DELETE /api/admin/themes/[id] — delete any thesis (admin override)
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
