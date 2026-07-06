export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chatComplete } from '@/lib/llm'
import { reanalyzeThesis } from '@/lib/reanalyze'

const TICKER_ANALYSIS_PROMPT = `You are an expert investment analyst. You are given an existing investment thesis and a new stock ticker to evaluate for inclusion in the theme.

Analyze the ticker in the context of the thesis and respond in JSON:
{
  "companyName": "Full company name",
  "ticker": "TICK",
  "role": "supplier|enabler|end-user|infrastructure|competitor",
  "competency": "What they bring to this specific thesis (2-3 sentences)",
  "moatRating": 1-10,
  "valuationStatus": "undervalued|fair|overvalued",
  "marketCap": "$XXB or $XXM",
  "notes": "Brief investment note in context of the thesis",
  "relevanceScore": 1-10,
  "reasoning": "Why this company is or isn't relevant to the thesis (2-3 sentences)"
}

Be accurate with company data. If the ticker is invalid or you cannot identify it, set relevanceScore to 0 and explain in reasoning.
Respond with raw JSON only. No code blocks or markdown.`

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const userRole = (session.user as any)?.role
  const thesisId = params.id

  // Verify thesis belongs to user (admin can access any thesis)
  const thesis = await prisma.thesis.findFirst({
    where: userRole === 'admin' ? { id: thesisId } : { id: thesisId, userId },
    include: { basketMembers: true },
  })

  if (!thesis) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
  }

  const body = await request.json()
  const ticker = (body?.ticker ?? '').toUpperCase().trim()

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
  }

  // Check if ticker already exists in theme
  const existing = thesis.basketMembers.find(
    (m) => m.ticker?.toUpperCase() === ticker
  )
  if (existing) {
    return NextResponse.json({ error: `${ticker} is already in this theme` }, { status: 400 })
  }

  // Build context about the thesis for the LLM
  const thesisContext = `Thesis: ${thesis.title}\nDescription: ${thesis.description}\nExisting members: ${thesis.basketMembers.map((m) => `${m.ticker} (${m.companyName} - ${m.role})`).join(', ')}`

  try {
    const messages = [
      { role: 'system' as const, content: TICKER_ANALYSIS_PROMPT },
      {
        role: 'user' as const,
        content: `${thesisContext}\n\nNew ticker to analyze for this theme: ${ticker}`,
      },
    ]

    const content = await chatComplete(messages, { jsonMode: true, maxTokens: 2000 })

    let analysis: any
    try {
      analysis = JSON.parse(content)
    } catch {
      return NextResponse.json({ error: 'Failed to parse analysis' }, { status: 500 })
    }

    if ((analysis?.relevanceScore ?? 0) < 2) {
      return NextResponse.json({
        error: `${ticker} does not appear relevant to this theme`,
        reasoning: analysis?.reasoning ?? 'No reasoning provided',
      }, { status: 400 })
    }

    // Create the new BasketMember
    const newMember = await prisma.basketMember.create({
      data: {
        thesisId,
        ticker: analysis?.ticker ?? ticker,
        companyName: analysis?.companyName ?? ticker,
        role: analysis?.role ?? null,
        competency: analysis?.competency ?? null,
        moatRating: analysis?.moatRating ?? null,
        valuationStatus: analysis?.valuationStatus ?? null,
        marketCap: analysis?.marketCap ?? null,
        notes: analysis?.notes ?? null,
      },
    })

    // Re-analyze thesis sections to incorporate the new stock
    // (bottlenecks, ecosystem, valuation, external factors, scores)
    const reanalyzeResult = await reanalyzeThesis(thesisId, {
      ticker: newMember.ticker ?? ticker,
      companyName: newMember.companyName,
      role: newMember.role,
      competency: newMember.competency,
      notes: newMember.notes,
    })

    return NextResponse.json({
      success: true,
      member: newMember,
      analysis,
      reanalyzed: reanalyzeResult.success,
      reanalyzeError: reanalyzeResult.error,
    })
  } catch (err: any) {
    console.error('Add ticker error:', err?.message)
    return NextResponse.json({ error: 'Failed to analyze ticker' }, { status: 500 })
  }
}
