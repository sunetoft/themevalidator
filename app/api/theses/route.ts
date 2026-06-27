export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as any)?.id

  try {
    const theses = await prisma.thesis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { themeMembers: true },
    })
    // Convert any BigInt values
    const serialized = JSON.parse(JSON.stringify(theses, (key: string, value: any) =>
      typeof value === 'bigint' ? value.toString() : value
    ))
    return NextResponse.json(serialized)
  } catch (err: any) {
    console.error('Fetch theses error:', err)
    return NextResponse.json({ error: 'Failed to fetch theses' }, { status: 500 })
  }
}
