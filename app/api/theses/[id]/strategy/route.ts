export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chatStream } from '@/lib/llm'

const STRATEGY_QUESTIONS = [
  {
    id: 'entryLumpSum',
    category: 'Entry Strategy',
    title: 'Lump Sum',
    question: 'Do you prefer to invest the full intended amount for this high-growth basket all at once (lump sum) when conditions look good?',
    why: 'Clarifies whether the investor wants immediate full exposure or is more cautious about timing.',
    llmHandlingYes: 'Use lump-sum entry with clear technical/fundamental triggers. Deploy the full capital in one go when conditions are favorable.',
    llmHandlingNo: 'Default to gradual entry or combine with the DCA preference. Do NOT deploy all capital at once.',
  },
  {
    id: 'entryDca',
    category: 'Entry Strategy',
    title: 'DCA',
    question: 'Would you rather use Dollar-Cost-Averaging (DCA) to enter gradually over several weeks or months?',
    why: 'Determines the preferred method to reduce timing risk in volatile high-growth stocks.',
    llmHandlingYes: 'Build a phased DCA schedule (e.g., over 3–6 months). Specify exact tranches, dates/weeks, and dollar amounts per tranche.',
    llmHandlingNo: 'Do NOT use DCA. If lump sum is also No, use a hybrid approach and explain the rationale.',
  },
  {
    id: 'opportunisticBuying',
    category: 'Entry Strategy',
    title: 'Opportunistic Buying',
    question: 'If prices drop significantly, do you want to make additional opportunistic buys (extra DCA) into the basket?',
    why: 'Tests appetite for buying the dip and deploying more capital during drawdowns.',
    llmHandlingYes: 'Add rules for extra purchases on 15-30% drawdowns. Specify trigger levels and reserve capital allocation for opportunistic buying.',
    llmHandlingNo: 'Stick strictly to the original entry plan. No additional capital deployment beyond the initial schedule.',
  },
  {
    id: 'stopLosses',
    category: 'Risk Management',
    title: 'Stop Losses',
    question: 'Do you want to use stop-loss or trailing stop orders on individual stocks to limit losses?',
    why: 'Reveals risk tolerance and willingness to automate loss protection in a volatile theme.',
    llmHandlingYes: 'Implement tight (8-15%) or wide (20%+) stops/trailing rules. Specify exact stop-loss levels for each stock.',
    llmHandlingNo: 'Do NOT use automated stop-losses. Rely on discretionary signals, technical levels, or wider risk buffers instead.',
  },
  {
    id: 'exitRules',
    category: 'Risk Management',
    title: 'Exit Rules',
    question: 'Should we set clear, predefined exit rules (e.g. profit targets, maximum loss thresholds, or time-based exits) for stocks in the basket?',
    why: 'Shows if the investor wants structured selling rules or more flexible/discretionary exits.',
    llmHandlingYes: 'Define specific take-profit levels, max loss thresholds, and/or time-based exits for each stock.',
    llmHandlingNo: 'Do NOT use rigid exit rules. Use trend-following, rebalancing-based, or discretionary exit logic.',
  },
  {
    id: 'portfolioAllocation',
    category: 'Portfolio Construction',
    title: 'Portfolio Allocation Size',
    question: 'Should this high-growth basket represent a large portion of your overall portfolio (15-30%+)?',
    why: 'Defines overall conviction and risk budget for the theme.',
    llmHandlingYes: 'Allocate 15-35% of total portfolio to the basket. Size individual positions accordingly.',
    llmHandlingNo: 'Cap the basket at 5-15% of total portfolio. Keep individual position sizes conservative.',
  },
  {
    id: 'weighting',
    category: 'Portfolio Construction',
    title: 'Weighting Method',
    question: 'Do you want equal weighting across all stocks in the basket?',
    why: 'Clarifies preference between simple equal allocation vs conviction/market-cap weighted.',
    llmHandlingYes: 'Use equal weighting (e.g., 10 stocks = 10% each of basket capital). Split capital evenly.',
    llmHandlingNo: 'Apply conviction-based, market-cap, or risk-parity weighting. Justify why certain stocks get larger/smaller allocations.',
  },
  {
    id: 'rebalancing',
    category: 'Portfolio Construction',
    title: 'Rebalancing',
    question: 'Should the basket be rebalanced periodically (e.g. every 3–6 months) to maintain target weights?',
    why: 'Determines how much the portfolio should be actively adjusted over time.',
    llmHandlingYes: 'Include scheduled rebalancing rules (quarterly or semi-annual). Specify the rebalancing process and thresholds.',
    llmHandlingNo: 'Do NOT rebalance on a schedule. Use buy-and-hold or threshold-based rebalancing only (e.g., only if a position drifts >50%).',
  },
  {
    id: 'timeHorizon',
    category: 'Time Horizon & Monitoring',
    title: 'Time Horizon',
    question: 'Is your intended holding period long-term (5+ years), rather than short-to-medium term?',
    why: 'Sets expectations for strategy horizon and turnover level.',
    llmHandlingYes: 'Long-term buy-and-hold bias with wide stops and less frequent trading. Optimize for multi-year growth.',
    llmHandlingNo: 'Medium-term focus with more frequent profit-taking and tighter position management.',
  },
  {
    id: 'monitoring',
    category: 'Time Horizon & Monitoring',
    title: 'Monitoring Style',
    question: 'Do you prefer active monthly monitoring and adjustments rather than a passive approach?',
    why: "Reveals the investor's desired level of involvement and ability to react to volatility.",
    llmHandlingYes: 'Design more dynamic rules, frequent review triggers, and alert recommendations. Include monthly check-in protocols.',
    llmHandlingNo: 'Prioritize simple, rules-based, low-maintenance strategy with minimal intervention required.',
  },
]

function buildStrategyPrompt(
  thesis: any,
  members: any[],
  amount: number,
  riskProfile: string,
  answers: Record<string, boolean>
): string {
  const eligibleMembers = members.filter((m) => m.ticker)

  const riskGuidance =
    riskProfile === 'High'
      ? 'Favor stocks with higher risk vs. reward potential. Include more speculative, high-growth names with smaller market caps. Accept higher volatility for potential outsized returns.'
      : riskProfile === 'Low'
      ? 'Favor solid, established stocks with strong fundamentals, wider moats, and lower volatility. Prioritize capital preservation and steady returns.'
      : 'Balance between solid blue-chip names and select higher-growth opportunities. Moderate risk tolerance.'

  const answersSummary = STRATEGY_QUESTIONS.map((q) => {
    const isYes = answers[q.id]
    const directive = isYes ? q.llmHandlingYes : q.llmHandlingNo
    return `- **${q.category} — ${q.title}**
  Q: ${q.question}
  A: ${isYes ? 'Yes' : 'No'}
  → ${directive}`
  }).join('\n')

  const stockList = eligibleMembers
    .map(
      (m) =>
        `${m.ticker} (${m.companyName}) - Role: ${m.role ?? 'N/A'}, Moat: ${m.moatRating ?? 'N/A'}/10, Valuation: ${m.valuationStatus ?? 'N/A'}, Market Cap: ${m.marketCap ?? 'N/A'}`
    )
    .join('\n')

  return `You are a professional portfolio strategist. Create a detailed trading strategy for the following investment theme basket.

## Theme: ${thesis.title}
${thesis.description}

## Stock Basket:
${stockList}

## Investment Parameters:
- Total Capital: $${amount.toLocaleString()}
- Risk Profile: ${riskProfile}
- ${riskGuidance}

## Investor Preferences & Strategy Directives:
IMPORTANT: Each preference below shows the question asked, the investor's answer, and a specific directive you MUST follow. If any directives conflict, resolve them sensibly and explain your reasoning.

${answersSummary}

## Instructions:
For EACH stock in the basket, provide:
1. **Allocation** - Dollar amount and percentage of total capital
2. **Entry Strategy** - Specific entry plan (lump sum, DCA schedule, limit orders, etc.)
3. **Position Sizing** - Number of shares (use approximate current prices)
4. **Stop-Loss Level** - Specific % or price level if applicable
5. **Take-Profit Target** - Price target or % gain target
6. **Monitoring Cadence** - How often to review this position
7. **Exit Triggers** - Specific conditions for selling
8. **Risk Notes** - Key risks specific to this stock in the theme

Also provide:
- **Portfolio Summary** - Overall allocation breakdown
- **Rebalancing Schedule** - When and how to rebalance
- **Key Theme Catalysts** - Events or milestones to watch
- **Maximum Portfolio Drawdown Tolerance** - Based on risk profile

Format the response in clear markdown with headers for each stock.`
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const thesisId = params.id

  const thesis = await prisma.thesis.findFirst({
    where: { id: thesisId, userId },
    include: { basketMembers: true },
  })

  if (!thesis) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 })
  }

  const body = await request.json()
  const { amount, riskProfile, answers, name, strategyId: existingStrategyId, selectedTickers } = body ?? {}

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
  }
  if (!['High', 'Medium', 'Low'].includes(riskProfile)) {
    return NextResponse.json({ error: 'Valid risk profile is required' }, { status: 400 })
  }

  // Filter basket members to only the user-selected tickers
  const allMembers = thesis.basketMembers || []
  const basketMembers = Array.isArray(selectedTickers) && selectedTickers.length > 0
    ? allMembers.filter((m: any) => m.ticker && selectedTickers.includes(m.ticker))
    : allMembers.filter((m: any) => m.ticker)

  if (basketMembers.length === 0) {
    return NextResponse.json({ error: 'No stocks selected. Please select at least one ticker.' }, { status: 400 })
  }

  const prompt = buildStrategyPrompt(
    thesis,
    basketMembers,
    amount,
    riskProfile,
    answers ?? {}
  )

  // Save or update the strategy record
  let strategy: any
  try {
    if (existingStrategyId) {
      // Reuse existing strategy record (from the review step)
      strategy = await prisma.tradeStrategy.findFirst({
        where: { id: existingStrategyId, userId, thesisId },
      })
      if (strategy) {
        strategy = await prisma.tradeStrategy.update({
          where: { id: existingStrategyId },
          data: {
            name: name || null,
            amount: parseFloat(String(amount)),
            riskProfile,
            answers: answers ?? {},
            generatedPrompt: prompt,
            status: 'pending',
          },
        })
      }
    }
    if (!strategy) {
      strategy = await prisma.tradeStrategy.create({
        data: {
          thesisId,
          userId,
          name: name || null,
          amount: parseFloat(String(amount)),
          riskProfile,
          answers: answers ?? {},
          generatedPrompt: prompt,
          status: 'pending',
        },
      })
    }
  } catch (err: any) {
    console.error('Create strategy error:', err?.message)
    return NextResponse.json({ error: 'Failed to create strategy record' }, { status: 500 })
  }

  // Return the strategy ID and prompt for client to review
  // If generateNow flag is set, stream the LLM response
  if (body?.generateNow) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          await prisma.tradeStrategy.update({
            where: { id: strategy.id },
            data: { status: 'generating' },
          })

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: 'processing', message: 'Generating trading strategy...' })}\n\n`
            )
          )

          const streamMessages = [{ role: 'user' as const, content: prompt }]

          let fullContent = ''
          let chunkCount = 0
          let lastHeartbeat = Date.now()

          for await (const delta of chatStream(streamMessages, {
            maxTokens: 8000,
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
            if (chunkCount % 3 === 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: 'streaming',
                    delta,
                    content: fullContent,
                  })}\n\n`
                )
              )
            }
          }

          // Save final strategy
          await prisma.tradeStrategy.update({
            where: { id: strategy.id },
            data: {
              strategy: fullContent,
              status: 'completed',
            },
          })

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                status: 'completed',
                strategyId: strategy.id,
                content: fullContent,
              })}\n\n`
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (err: any) {
          console.error('Strategy stream error:', err)
          try {
            await prisma.tradeStrategy.update({
              where: { id: strategy.id },
              data: { status: 'failed' },
            })
          } catch { /* ignore */ }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                status: 'error',
                message: err?.message ?? 'Strategy generation failed',
              })}\n\n`
            )
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Return prompt for review
  return NextResponse.json({
    strategyId: strategy.id,
    prompt,
    eligibleStocks: basketMembers
      .filter((m: any) => m.ticker)
      .map((m: any) => ({ ticker: m.ticker, companyName: m.companyName, valuationStatus: m.valuationStatus })),
    excludedStocks: [],
  })
}

// GET - fetch existing strategies for a thesis
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any)?.id
  const thesisId = params.id

  const strategies = await prisma.tradeStrategy.findMany({
    where: { thesisId, userId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(strategies)
}
