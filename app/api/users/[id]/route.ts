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

// DELETE /api/users/[id] — hard delete user + all cascaded data (admin only)
// This completely removes the user and ALL related records (theses, strategies,
// paper trades, orders, positions, snapshots, logs, sessions, accounts).
// The email becomes immediately available for re-registration.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  // Prevent self-deletion
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    // Hard delete — Prisma onDelete: Cascade on all relations ensures everything is removed:
    // - Thesis (→ BasketMember, TradeStrategy, PaperTrade → PaperOrder, PaperPosition, PaperTradeSnapshot, PaperTradeLog)
    // - TradeStrategy
    // - PaperTrade (→ all child records)
    // - Session
    // - Account
    // No soft-delete. The email is immediately freed for re-use.
    await prisma.user.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      deletedUser: { id: target.id, email: target.email, name: target.name },
    })
  } catch (err: any) {
    console.error('Delete user error:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}

// PATCH /api/users/[id] — update user (e.g., change role) (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { role, name } = body ?? {}

    const data: any = {}
    if (role === 'admin' || role === 'user') data.role = role
    if (name !== undefined) data.name = name

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true },
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    console.error('Update user error:', err)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
