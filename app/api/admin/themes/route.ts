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

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// POST /api/admin/themes — create a new theme
export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, isPublic } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Theme name is required' }, { status: 400 })
  }

  let slug = slugify(name)
  let suffix = 1
  let baseSlug = slug
  while (await prisma.theme.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }

  const theme = await prisma.theme.create({
    data: {
      name,
      slug,
      description: description ?? '',
      isPublic: isPublic ?? false,
      publishedAt: isPublic ? new Date() : null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isPublic: true,
      createdAt: true,
    },
  })

  return NextResponse.json(theme)
}

// GET /api/admin/themes — list all themes (for dropdown/select)
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const themes = await prisma.theme.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isPublic: true,
      _count: { select: { theses: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(themes)
}
