import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { searchTweets } from '@/lib/x-api'
import { chatComplete, chatStream } from '@/lib/llm'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '@/lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '@/lib/financial-data'

export const dynamic = 'force-dynamic'

// Shared prompt — kept in sync with app/api/analyze/route.ts
const ANALYSIS_PROMPT = `You are an expert investment analyst specializing in emerging themes and early-stage thesis validation. Analyze the following investment thesis and provide a comprehensive analysis grounded in REAL financial data.

You will receive REAL-TIME FINANCIAL DATA for basket tickers (P/E, PEG, revenue growth, profit margins, earnings beat/miss history, RSI, moving averages, analyst targets). USE THESE REAL NUMBERS — do not invent or estimate metrics.

Respond in JSON format with the following structure. The "stocks" array is the CORE of the analysis — every basket company gets ONE consolidated entry containing ALL analytical dimensions. Do NOT create separate per-stock arrays elsewhere.

{
  "title": "Short thesis title (max 8 words)",
  "themeName": "Macro theme this thesis belongs to (e.g., 'AI Infrastructure', 'Nuclear Energy', 'Rare Earth Minerals', 'Defense Tech'). Keep it short (2-4 words). This groups related theses together.",
  "description": "2-3 sentence summary of the thesis",
  "sentiment": {
    "overall": "bullish|bearish|neutral",
    "score": 0-100,
    "summary": "Brief sentiment summary",
    "keySignals": ["signal1", "signal2", "signal3"]
  },
  "stocks": [
    {
      "companyName": "Company Name",
      "ticker": "TICK",
      "instrumentType": "stock",
      "sector": "Technology|Healthcare|Energy|...",
      "role": "supplier|enabler|end-user|infrastructure|competitor",
      "competency": "What they bring to the thesis",
      "marketCap": "$XXB",
      "moatRating": 1-10,
      "valuationStatus": "undervalued|fair|overvalued",
      "notes": "Brief investment note referencing REAL metrics",

      "earningsAssessment": "assess beat/miss history and guidance trend — reference actual EPS surprise data",
      "growthVsValuation": "Is the growth rate justified by P/E and PEG? A PEG < 1 suggests undervalued.",
      "marginAnalysis": "Profit margin trend and sustainability",
      "guidanceOutlook": "Next earnings date and what to watch for",
      "healthGrade": "A|B|C|D|F",
      "keyMetric": "P/E X.X | PEG X.X | Rev Growth X% | Margin X%",

      "signal": "bullish|bearish|neutral",
      "trend": "Current trend from MA50/MA200 alignment",
      "rsiInterpretation": "Overbought (>70), Oversold (<30), or Neutral",
      "keyLevels": "Support $XX | Resistance $XX",
      "actionableNote": "What the technicals suggest for entry/exit timing",

      "flagshipProducts": ["product 1", "product 2"],
      "pricingPower": "strong|moderate|weak",
      "pricingPowerEvidence": "Specific evidence from latest earnings — e.g. 'Raised ASP 12% QoQ while maintaining volume; gross margin expanded 340bps'. Reference actual margin data if available.",
      "segmentGrowthHighlights": ["Data center revenue +87% YoY", "Automotive backlog at record $4.2B"],
      "recentPartnerships": ["5-year supply agreement with Meta (May 2026)", "Joint development with TSMC"],
      "competitivePosition": "monopoly|dominant|challenger|commodity",
      "productMoat": "patents|switching costs|network effects|scale advantage|regulatory|none",

      "moatStrength": "wide|narrow|none",
      "valuationGrade": "A|B|C|D|F",
      "catalysts": ["specific catalyst for this stock", "another catalyst"],
      "risks": ["specific risk for this stock", "another risk"]
    }
  ],
  "ecosystem": {
    "score": 0-100,
    "summary": "Ecosystem completeness summary"
  },
  "financialHealth": {
    "score": 0-100,
    "summary": "Overall financial health assessment of the basket"
  },
  "technicalAnalysis": {
    "score": 0-100,
    "summary": "Overall technical picture for the basket"
  },
  "productEvaluator": {
    "score": 0-100,
    "summary": "1-2 sentence assessment of pricing power and product differentiation across the basket. Do companies have unique products that give them pricing power, or are they commodity players?"
  },
  "themeETFs": [
    {
      "symbol": "ETFSYM",
      "name": "ETF Name",
      "provider": "iShares|VanEck|Invesco|...",
      "focus": "What the ETF covers and why it fits this theme",
      "aum": "$XXB",
      "ytdReturn": "X.X%",
      "overlap": "Which basket stocks are in this ETF",
      "expenseRatio": "X.XX%"
    }
  ],
  "externalFactors": {
    "score": 0-100,
    "factors": [
      {
        "name": "Factor name",
        "impact": "positive|negative|neutral",
        "severity": "high|medium|low",
        "description": "Brief description"
      }
    ]
  },
  "bottlenecks": {
    "score": 0-100,
    "items": [
      {
        "name": "Bottleneck name",
        "pricingPowerBenefit": "high|medium|low",
        "affectedCompanies": ["TICK1", "TICK2"],
        "description": "Brief description"
      }
    ]
  },
  "valuation": {
    "score": 0-100
  },
  "overallScore": 0-100,
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"]
}

INSTRUCTIONS:
1. Provide at least 5-8 companies in the "stocks" array with real publicly traded companies. Set instrumentType to "stock" for individual companies and "etf" for ETFs.
2. The "stocks" array is the SINGLE source of truth for per-company data. Every company gets ONE entry with ALL dimensions filled in — do not leave fields empty or omit them.
3. For financial fields (earningsAssessment, healthGrade, keyMetric, etc.), use the REAL earnings data provided — reference actual EPS surprise percentages and growth rates.
4. For technical fields (signal, trend, rsiInterpretation, keyLevels), use the REAL RSI, MA50, MA200, and trend data provided. Don't make up technical readings.
5. For themeETFs, identify 3-6 real ETFs that cover this theme. Use actual ETF symbols and names.
6. Score each dimension 0-100 where higher is more favorable for investment.
7. The overallScore should be a weighted average favoring ecosystem completeness, moat strength, financial health, and product differentiation.
8. Be honest about valuations — if a stock's PEG is > 2 or P/E is > 40 with slowing growth, note it as overvalued.
9. CRITICAL: EVERY stock in the "stocks" array MUST have at least 2 specific catalysts and 2 specific risks — not generic boilerplate.
10. PRODUCT EVALUATOR: For each stock, identify flagship products and assess whether the company has genuine pricing power. Look for evidence in earnings data (margin expansion, ASP increases), segment growth highlights, and recent partnerships. A company with unique products in a bottlenecked market has STRONG pricing power. A commodity player in the same market has WEAK pricing power. Be specific — cite actual margin trends, revenue growth in key segments, and named partnerships.
11. The productEvaluator.score reflects the AVERAGE pricing power strength across the basket. High score = most companies have unique products with demonstrated pricing power. Low score = mostly commodity players.

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const userId = (session.user as any)?.id
  const thesisId = params.id

  // Fetch the existing thesis
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } })
  if (!thesis) {
    return new Response(JSON.stringify({ error: 'Thesis not found' }), { status: 404 })
  }
  if (thesis.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const thesisText = thesis.sourceText ?? thesis.description ?? ''
  if (!thesisText) {
    return new Response(JSON.stringify({ error: 'No source text to retry with' }), { status: 400 })
  }

  // Set status back to analyzing
  await prisma.thesis.update({ where: { id: thesisId }, data: { status: 'analyzing' } })

  // Clean up old theme members
  await (prisma as any).basketMember.deleteMany({ where: { thesisId } })

  // Extract search terms (shared enrichment logic)
  const { tickers, keywords } = extractSearchTerms(thesisText)
  const tickerParts = [...tickers.map(t => `$${t}`), ...keywords.map(p => `"${p}"`)]
  if (tickerParts.length === 0) {
    const words = thesisText.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 4)
    tickerParts.push(...words)
  }
  tickerParts.push('(invest OR stock OR market OR thesis)')
  const searchQuery = tickerParts.join(' ').substring(0, 256)

  // If the thesis originally came from a URL, re-fetch it via Jina Reader for clean content
  let enrichedReaderContent = ''
  if (thesis.sourceUrl) {
    enrichedReaderContent = await fetchUrlViaJina(thesis.sourceUrl)
  }

  // Gather signals in parallel
  const [xResults, marketSignals] = await Promise.all([
    searchTweets(searchQuery, 20),
    fetchMarketSignals(keywords, tickers),
  ])

  // Fetch REAL financial data for identified tickers
  const financialData = tickers.length > 0
    ? await fetchFinancialData(tickers.slice(0, 12))
    : { stocks: {}, etfs: {}, errors: {} }
  const financialContext = formatFinancialDataForLLM(financialData)

  // Build analysis messages — feed thesis text + tweet sentiment + RSS headlines + REAL financial data to LLM
  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    {
      role: 'user' as const,
      content: `Investment Thesis to Analyze:\n\n${enrichedReaderContent && enrichedReaderContent.length > 200 ? enrichedReaderContent : thesisText}\n\n${thesis.sourceUrl ? `Source URL: ${thesis.sourceUrl}` : ''}\n\n${financialContext}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify(xResults?.tweets?.slice(0, 10)?.map((t: any) => ({ text: t?.text, likes: t?.likeCount ?? 0, retweets: t?.retweetCount ?? 0 })) ?? [])}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals.headlines.length > 0 ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the REAL financial data, tweet sentiment, and market headlines as context. Ground your analysis in the actual numbers provided. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`,
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Retrying analysis...', thesisId })}\n\n`))

        let fullContent = ''
        let deltaCount = 0
        let reasoningCharCount = 0
        let lastHeartbeat = Date.now()

        const progressMessages = [
          'Analyzing investment thesis...',
          'Fetching real financial data...',
          'Evaluating basket companies...',
          'Assessing pricing power & products...',
          'Analyzing earnings & growth...',
          'Checking technical signals...',
          'Identifying theme ETFs...',
          'Assessing valuations and moats...',
          'Calculating scores...',
          'Finalizing analysis...',
        ]

        for await (const delta of chatStream(messages, {
          jsonMode: true,
          maxTokens: 16000,
          onReasoning: (reasoningDelta: string) => {
            reasoningCharCount += reasoningDelta.length
            const now = Date.now()
            if (now - lastHeartbeat > 2000) {
              lastHeartbeat = now
              const heartbeat = JSON.stringify({
                status: 'reasoning',
                message: `AI is thinking... (${Math.round(reasoningCharCount / 1000)}K chars analyzed)`,
              })
              try {
                controller.enqueue(encoder.encode(`data: ${heartbeat}\n\n`))
              } catch { /* client may have disconnected */ }
            }
          },
        })) {
          fullContent += delta
          deltaCount++

          if (deltaCount % 15 === 0) {
            const msgIdx = Math.min(Math.floor(deltaCount / 15), progressMessages.length - 1)
            const progressData = JSON.stringify({
              status: 'processing',
              message: progressMessages[msgIdx] ?? 'Processing...',
            })
            controller.enqueue(encoder.encode(`data: ${progressData}\n\n`))
          }
        }

        let finalResult: any = {}
        try {
          finalResult = JSON.parse(fullContent)
        } catch (e) {
          console.error('Retry: Failed to parse LLM JSON:', e, 'Content length:', fullContent.length, 'First 200 chars:', fullContent.substring(0, 200))
          finalResult = { error: 'Failed to parse analysis result', raw: fullContent?.substring(0, 500) }
        }

        // CRITICAL: Validate that the LLM actually returned usable content
        if (!(finalResult?.stocks?.length || finalResult?.ecosystem?.members?.length) && !finalResult?.title) {
          console.error('Retry: LLM returned empty or unusable response. fullContent length:', fullContent.length)
          await prisma.thesis.update({
            where: { id: thesisId },
            data: { status: 'failed', description: 'LLM analysis returned empty response. Please retry.' },
          })
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: 'Analysis produced no results — LLM returned empty response. Please retry.' })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          return
        }

        // Add X sentiment data to result
        finalResult.xSentiment = {
          tweets: xResults?.tweets ?? [],
          tweetCount: xResults?.tweetCount ?? 0,
          query: xResults?.query ?? '',
          error: xResults?.error ?? null,
        }

        // Save to database
        try {
          const stocks = finalResult?.stocks ?? finalResult?.ecosystem?.members ?? []
          const themeEtfSymbols = (finalResult?.themeETFs ?? []).map((e: any) => e?.symbol).filter(Boolean)

          // Enrich ETF data from yfinance
          let enrichedEtfData: any = {}
          if (themeEtfSymbols.length > 0) {
            try {
              const etfFetch = await fetchFinancialData([], themeEtfSymbols.slice(0, 6))
              enrichedEtfData = etfFetch.etfs
            } catch (_e: any) { /* non-critical */ }
          }

          // Merge real ETF data into LLM's themeETFs
          const mergedEtfs = (finalResult?.themeETFs ?? []).map((e: any) => {
            const real = enrichedEtfData?.[e?.symbol] ?? {}
            return {
              ...e,
              ...(real.aumDisplay ? { aum: real.aumDisplay, totalAssets: real.totalAssets } : {}),
              ...(real.ytdReturn !== undefined ? { ytdReturn: real.ytdReturn + '%', ytdValue: real.ytdReturn } : {}),
              ...(real.annualReportExpenseRatio !== undefined ? { expenseRatio: (real.annualReportExpenseRatio * 100).toFixed(2) + '%' } : {}),
              ...(real.name ? { name: real.name } : {}),
              ...(real.category ? { category: real.category } : {}),
            }
          })

          // Build structured financial/technical/earnings data for storage
          const financialMetrics: Record<string, any> = {}
          const technicalMetrics: Record<string, any> = {}
          const earningsMetrics: Record<string, any> = {}
          for (const [ticker, data] of Object.entries(financialData.stocks ?? {})) {
            const d = data as any
            financialMetrics[ticker] = d.metrics
            technicalMetrics[ticker] = d.technical
            earningsMetrics[ticker] = { earnings: d.earnings, nextEarningsDate: d.nextEarningsDate }
          }

          // Map consolidated stocks[] back to backward-compatible per-section shapes for UI
          const ecosystemMembers = stocks.map((s: any) => ({
            companyName: s?.companyName ?? 'Unknown',
            ticker: s?.ticker ?? null,
            instrumentType: s?.instrumentType ?? 'stock',
            role: s?.role ?? null,
            competency: s?.competency ?? null,
            sector: s?.sector ?? null,
            moatRating: s?.moatRating ?? null,
            valuationStatus: s?.valuationStatus ?? null,
            marketCap: s?.marketCap ?? null,
            notes: s?.notes ?? null,
          }))

          const finHealthPerStock = stocks.map((s: any) => ({
            ticker: s?.ticker,
            earningsAssessment: s?.earningsAssessment ?? '',
            growthVsValuation: s?.growthVsValuation ?? '',
            marginAnalysis: s?.marginAnalysis ?? '',
            guidanceOutlook: s?.guidanceOutlook ?? '',
            healthGrade: s?.healthGrade ?? '',
            keyMetric: s?.keyMetric ?? '',
          }))

          const techPerStock = stocks.map((s: any) => ({
            ticker: s?.ticker,
            signal: s?.signal ?? '',
            trend: s?.trend ?? '',
            rsiInterpretation: s?.rsiInterpretation ?? '',
            keyLevels: s?.keyLevels ?? '',
            actionableNote: s?.actionableNote ?? '',
          }))

          const topPicks = stocks.map((s: any) => ({
            ticker: s?.ticker,
            companyName: s?.companyName,
            moatStrength: s?.moatStrength ?? '',
            valuationGrade: s?.valuationGrade ?? '',
            catalysts: s?.catalysts ?? [],
            risks: s?.risks ?? [],
          }))

          const productEvalPerStock = stocks.map((s: any) => ({
            ticker: s?.ticker,
            companyName: s?.companyName,
            flagshipProducts: s?.flagshipProducts ?? [],
            pricingPower: s?.pricingPower ?? '',
            pricingPowerEvidence: s?.pricingPowerEvidence ?? '',
            segmentGrowthHighlights: s?.segmentGrowthHighlights ?? [],
            recentPartnerships: s?.recentPartnerships ?? [],
            competitivePosition: s?.competitivePosition ?? '',
            productMoat: s?.productMoat ?? '',
          }))

          await prisma.thesis.update({
            where: { id: thesisId },
            data: {
              title: finalResult?.title ?? 'Untitled Thesis',
              description: finalResult?.description ?? '',
              overallScore: finalResult?.overallScore ?? null,
              sentimentScore: finalResult?.sentiment?.score ?? null,
              ecosystemScore: finalResult?.ecosystem?.score ?? null,
              riskScore: finalResult?.externalFactors?.score ?? null,
              opportunityScore: finalResult?.bottlenecks?.score ?? null,
              moatScore: finalResult?.valuation?.score ?? null,
              sentimentData: { ...(finalResult?.sentiment ?? {}), tweets: xResults?.tweets ?? [] },
              ecosystemData: {
                score: finalResult?.ecosystem?.score ?? null,
                summary: finalResult?.ecosystem?.summary ?? '',
                members: ecosystemMembers,
              },
              externalFactors: finalResult?.externalFactors ?? null,
              bottlenecks: finalResult?.bottlenecks ?? null,
              valuationData: {
                score: finalResult?.valuation?.score ?? null,
                topPicks,
              },
              financialData: {
                score: finalResult?.financialHealth?.score ?? null,
                summary: finalResult?.financialHealth?.summary ?? '',
                perStock: finHealthPerStock,
                metrics: financialMetrics,
              },
              technicalData: {
                score: finalResult?.technicalAnalysis?.score ?? null,
                summary: finalResult?.technicalAnalysis?.summary ?? '',
                perStock: techPerStock,
                indicators: technicalMetrics,
              },
              earningsData: earningsMetrics,
              themeEtfs: mergedEtfs,
              productEvaluator: {
                score: finalResult?.productEvaluator?.score ?? null,
                summary: finalResult?.productEvaluator?.summary ?? '',
                perStock: productEvalPerStock,
              },
              stocksData: stocks,
              status: 'completed',
            },
          })

          // Create theme members
          for (const member of ecosystemMembers) {
            await (prisma as any).basketMember.create({
              data: {
                thesisId,
                ticker: member?.ticker ?? null,
                companyName: member?.companyName ?? 'Unknown',
                role: member?.role ?? null,
                competency: member?.competency ?? null,
                moatRating: member?.moatRating ?? null,
                valuationStatus: member?.valuationStatus ?? null,
                marketCap: member?.marketCap ?? null,
                instrumentType: member?.instrumentType ?? 'stock',
                sector: member?.sector ?? null,
                notes: member?.notes ?? null,
              },
            })
          }
        } catch (dbErr: any) {
          console.error('DB save error:', dbErr?.message)
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'completed', result: finalResult, thesisId })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err: any) {
        console.error('Retry stream error:', err)
        try {
          await prisma.thesis.update({ where: { id: thesisId }, data: { status: 'failed' } })
        } catch (e: any) { /* ignore */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: err?.message ?? 'Retry failed' })}\n\n`))
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
