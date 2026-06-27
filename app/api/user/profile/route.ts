export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/user/profile — authenticated user updates their own profile
// Currently supports: name
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id
  if (!userId) {
    return NextResponse.json({ error: 'No user ID in session' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { name } = body ?? {}

    const data: any = {}
    if (name !== undefined) {
      // Allow empty string (clears name) but trim whitespace
      data.name = typeof name === 'string' ? name.trim() || null : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true },
    })

    return NextResponse.json({ success: true, user: updated })
  } catch (err: any) {
    console.error('Profile update error:', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
