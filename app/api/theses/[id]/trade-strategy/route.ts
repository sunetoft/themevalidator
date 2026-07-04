export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chatStream } from '@/lib/llm'
import { canCreateStrategy, isAdmin } from '@/lib/subscription'

// POST - Generate trade strategy via LLM
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const userId = (session.user as any)?.id
  const admin = await isAdmin(userId)

  // Subscription gate: must be paying member or admin to create strategies
  if (!admin) {
    const check = await canCreateStrategy(userId)
    if (!check.allowed) {
      return new Response(JSON.stringify({ error: check.reason, requiresUpgrade: true }), { status: 403 })
    }
  }

  const body = await request.json()
  const { prompt, amount, riskProfile, answers, strategyId } = body ?? {}

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 })
  }

  // Fetch thesis — user can create strategies on their own theses OR public themes
  const thesis = await prisma.thesis.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        { isPublic: true },
      ],
    },
    include: { basketMembers: true },
  })

  if (!thesis) {
    return new Response(JSON.stringify({ error: 'Thesis not found' }), { status: 404 })
  }

  // Create or update strategy record
  let strategy: any
  if (strategyId) {
    strategy = await prisma.tradeStrategy.update({
      where: { id: strategyId },
      data: { status: 'generating', generatedPrompt: prompt },
    })
  } else {
    strategy = await prisma.tradeStrategy.create({
      data: {
        thesisId: thesis.id,
        userId,
        amount: amount ?? 10000,
        riskProfile: riskProfile ?? 'Medium',
        answers: answers ?? {},
        generatedPrompt: prompt,
        status: 'generating',
      },
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Generating trade strategy...', strategyId: strategy.id })}\n\n`))

        const streamMessages = [
          {
            role: 'system' as const,
            content: `You are an expert portfolio strategist and trading advisor. You create detailed, actionable trading strategies for stock baskets based on investment themes. You provide specific entry points, position sizing, stop-losses, take-profits, and timeline recommendations for each stock. Format your response using clear markdown with headers, tables, and bullet points for readability. Be specific with dollar amounts and percentages.`,
          },
          { role: 'user' as const, content: prompt },
        ]

        let fullContent = ''
        let chunkCount = 0
        let lastHeartbeat = Date.now()

        for await (const delta of chatStream(streamMessages, {
          maxTokens: 6000,
          onReasoning: () => {
            const now = Date.now()
            if (now - lastHeartbeat > 2000) {
              lastHeartbeat = now
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'reasoning', message: 'AI is reasoning...' })}\n\n`))
              } catch { /* client disconnected */ }
            }
          },
        })) {
          fullContent += delta
          chunkCount++

          // Stream content chunks to client
          if (chunkCount % 3 === 0 || delta.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'streaming', delta, content: fullContent })}\n\n`))
          }
        }

        // Save to DB
        await prisma.tradeStrategy.update({
          where: { id: strategy.id },
          data: { strategy: fullContent, status: 'completed' },
        })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'completed', content: fullContent, strategyId: strategy.id })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err: any) {
        console.error('Trade strategy error:', err)
        try {
          await prisma.tradeStrategy.update({ where: { id: strategy.id }, data: { status: 'failed' } })
        } catch { /* ignore */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: err?.message ?? 'Failed' })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// GET - Fetch existing strategies for a thesis
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as any)?.id

  const strategies = await prisma.tradeStrategy.findMany({
    where: { thesisId: params.id, userId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(strategies)
}
