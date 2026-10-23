export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TimelineClient, { type TimelineRow } from './timeline-client'

/**
 * /timeline — when each thesis is expected to play out.
 *
 * Every completed thesis carries a `timelineData` ramp assessment written right
 * after analysis (see lib/timeline.ts). This page puts them on one calendar
 * axis so you can see what is ramping now and what is still quarters away.
 */
export default async function TimelinePage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const isAdmin = (session?.user as any)?.role === 'admin'

  const theses = await prisma.thesis.findMany({
    where: {
      status: 'completed',
      OR: [
        ...(userId ? [{ userId }] : []),
        { isPublic: true },
        { theme: { isPublic: true } },
      ],
    },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      overallScore: true,
      timelineData: true,
      timelineUpdatedAt: true,
      theme: { select: { id: true, name: true } },
      basketMembers: { select: { ticker: true, companyName: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 120,
  })

  const rows: TimelineRow[] = theses
    .filter((t) => t.timelineData && typeof t.timelineData === 'object')
    .map((t) => ({
      id: t.id,
      title: t.title,
      themeId: t.theme?.id ?? null,
      themeName: t.theme?.name ?? null,
      overallScore: t.overallScore,
      tickers: t.basketMembers.map((m) => m.ticker).filter(Boolean).slice(0, 10) as string[],
      timeline: t.timelineData as any,
      updatedAt: (t.timelineUpdatedAt ?? new Date()).toISOString(),
      canEdit: isAdmin || (userId ? t.userId === userId : false),
    }))

  return <TimelineClient rows={rows} signedIn={Boolean(session?.user)} />
}
