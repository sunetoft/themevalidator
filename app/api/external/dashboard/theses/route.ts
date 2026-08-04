export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/external/dashboard/theses — public published themes with thesis counts and avg scores.
// Auth: Bearer token matching CROSS_SITE_API_KEY (shared secret for inter-app API calls).
export async function GET(request: NextRequest) {
  // Verify Bearer token
  const authHeader = request.headers.get('authorization')
  const internalKey = process.env.CROSS_SITE_API_KEY

  if (!internalKey || authHeader !== `Bearer ${internalKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const themes = await prisma.theme.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        slug: true,
        publishedAt: true,
        theses: {
          select: {
            id: true,
            financialData: true,
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    })

    const result = {
      themes: themes.map((theme) => {
        const theses = theme.theses || []
        const thesisCount = theses.length

        let avgScore: number | null = null
        if (thesisCount > 0) {
          const scores = theses
            .map((t) => (t.financialData as Record<string, any> | null)?.overallScore)
            .filter((s): s is number => typeof s === 'number')

          if (scores.length > 0) {
            avgScore = Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100
          }
        }

        return {
          id: theme.id,
          name: theme.name,
          thesisCount,
          avgScore,
        }
      }),
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[external/dashboard/theses] Error:', error?.message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
