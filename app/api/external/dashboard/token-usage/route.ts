export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/external/dashboard/token-usage
 *
 * Aggregated token usage dashboard for cross-site consumption.
 * Auth: Bearer token or x-api-key header matching CROSS_SITE_API_KEY.
 *
 * Groups usage by hour, app, model, and source.
 * Returns:
 * {
 *   entries: [{
 *     date: string,      // ISO hour bucket (e.g., "2026-08-04T14:00:00.000Z")
 *     app: string,
 *     model: string,
 *     source: string,
 *     tokensIn: number,
 *     tokensOut: number,
 *     tokensTotal: number,
 *     costUsd: number,
 *     nCalls: number
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  // Verify auth — accept Authorization: Bearer <key> or x-api-key header
  const authHeader = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')
  const internalKey = process.env.CROSS_SITE_API_KEY

  const providedKey =
    authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : xApiKey ?? ''

  if (!internalKey || providedKey !== internalKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Aggregate by hour + app + model + source
    const entries = await prisma.$queryRawUnsafe<
      Array<{
        date: string
        app: string
        model: string
        source: string
        tokensIn: bigint
        tokensOut: bigint
        tokensTotal: bigint
        costUsd: number
        nCalls: bigint
      }>
    >(`
      SELECT
        date_trunc('hour', "loggedAt") AS date,
        app,
        model,
        source,
        SUM("tokensIn")::bigint AS "tokensIn",
        SUM("tokensOut")::bigint AS "tokensOut",
        SUM("tokensTotal")::bigint AS "tokensTotal",
        SUM("costUsd")::float AS "costUsd",
        COUNT(*)::bigint AS "nCalls"
      FROM "TokenUsage"
      GROUP BY date_trunc('hour', "loggedAt"), app, model, source
      ORDER BY date DESC
      LIMIT 1000
    `)

    // Convert BigInts to Numbers for JSON serialization
    const serialized = entries.map((e) => ({
      date: e.date,
      app: e.app,
      model: e.model,
      source: e.source,
      tokensIn: Number(e.tokensIn),
      tokensOut: Number(e.tokensOut),
      tokensTotal: Number(e.tokensTotal),
      costUsd: Math.round(Number(e.costUsd) * 1_000_000) / 1_000_000,
      nCalls: Number(e.nCalls),
    }))

    return NextResponse.json({ entries: serialized })
  } catch (error: any) {
    console.error('[external/dashboard/token-usage] Error:', error?.message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
