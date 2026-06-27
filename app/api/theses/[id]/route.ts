export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
      include: { themeMembers: true, thesisAlerts: { where: { resolved: false }, orderBy: { createdAt: 'desc' }, take: 20 } },
    })
    if (!thesis) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const serialized = JSON.parse(JSON.stringify(thesis, (key: string, value: any) =>
      typeof value === 'bigint' ? value.toString() : value
    ))
    return NextResponse.json(serialized)
  } catch (err: any) {
    console.error('Fetch thesis error:', err)
    return NextResponse.json({ error: 'Failed to fetch thesis' }, { status: 500 })
  }
}

export async function DELETE(
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
    })
    if (!thesis) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.thesis.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Delete thesis error:', err)
    return NextResponse.json({ error: 'Failed to delete thesis' }, { status: 500 })
  }
}
