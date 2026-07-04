export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { searchTweets } from '@/lib/x-api'
import { chatComplete, chatStream } from '@/lib/llm'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '@/lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '@/lib/financial-data'

const ANALYSIS_PROMPT = `You are an expert investment analyst specializing in emerging themes and early-stage thesis validation. Analyze the following investment thesis and provide a comprehensive analysis grounded in REAL financial data.

You will receive REAL-TIME FINANCIAL DATA for basket tickers (P/E, PEG, revenue growth, profit margins, earnings beat/miss history, RSI, moving averages, analyst targets). USE THESE REAL NUMBERS — do not invent or estimate metrics.

Respond in JSON format with the following structure:
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
  "ecosystem": {
    "score": 0-100,
    "summary": "Ecosystem completeness summary",
    "members": [
      {
        "companyName": "Company Name",
        "ticker": "TICK",
        "instrumentType": "stock",
        "role": "supplier|enabler|end-user|infrastructure|competitor",
        "competency": "What they bring to the thesis",
        "sector": "Technology|Healthcare|Energy|...",
        "moatRating": 1-10,
        "valuationStatus": "undervalued|fair|overvalued",
        "marketCap": "$XXB",
        "notes": "Brief investment note referencing REAL metrics"
      }
    ]
  },
  "financialHealth": {
    "score": 0-100,
    "summary": "Overall financial health assessment of the basket",
    "perStock": [
      {
        "ticker": "TICK",
        "earningsAssessment": "assess beat/miss history and guidance trend — reference actual EPS surprise data",
        "growthVsValuation": "Is the growth rate justified by P/E and PEG? Compare revenue growth % to P/E ratio. A PEG < 1 suggests undervalued relative to growth.",
        "marginAnalysis": "Profit margin trend and sustainability",
        "guidanceOutlook": "Next earnings date and what to watch for",
        "healthGrade": "A|B|C|D|F",
        "keyMetric": "P/E X.X | PEG X.X | Rev Growth X% | Margin X%"
      }
    ]
  },
  "technicalAnalysis": {
    "score": 0-100,
    "summary": "Overall technical picture for the basket",
    "perStock": [
      {
        "ticker": "TICK",
        "signal": "bullish|bearish|neutral",
        "trend": "Current trend from MA50/MA200 alignment",
        "rsiInterpretation": "Overbought (>70), Oversold (<30), or Neutral",
        "keyLevels": "Support $XX | Resistance $XX",
        "actionableNote": "What the technicals suggest for entry/exit timing"
      }
    ]
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
    "score": 0-100,
    "topPicks": [
      {
        "ticker": "TICK",
        "companyName": "Name",
        "moatStrength": "wide|narrow|none",
        "valuationGrade": "A|B|C|D|F",
        "catalysts": ["catalyst1", "catalyst2"],
        "risks": ["risk1", "risk2"]
      }
    ]
  },
  "overallScore": 0-100,
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"]
}

INSTRUCTIONS:
1. Provide at least 5-8 ecosystem members with real publicly traded companies. Set instrumentType to "stock" for individual companies and "etf" for ETFs.
2. For financialHealth, use the REAL earnings data provided — reference actual EPS surprise percentages and growth rates.
3. For technicalAnalysis, use the REAL RSI, MA50, MA200, and trend data provided. Don't make up technical readings.
4. For themeETFs, identify 3-6 real ETFs that cover this theme. Use actual ETF symbols and names.
5. Score each dimension 0-100 where higher is more favorable for investment.
6. The overallScore should be a weighted average favoring ecosystem completeness, moat strength, and financial health.
7. Be honest about valuations — if a stock's PEG is > 2 or P/E is > 40 with slowing growth, note it as overvalued.

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const userId = (session.user as any)?.id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID not found' }), { status: 401 })
  }

  let thesisText = ''
  let inputType = 'text'
  let sourceUrl = ''
  let pdfPath = ''
  let pdfIsPublic = false

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const text = formData.get('text') as string | null
    const url = formData.get('url') as string | null
    const type = formData.get('inputType') as string | null
    inputType = type ?? 'text'

    if (inputType === 'pdf' && file) {
      const base64Buffer = await file.arrayBuffer()
      const base64String = Buffer.from(base64Buffer).toString('base64')
      thesisText = `[PDF document uploaded: ${file.name}]`
      
      // We'll handle PDF via LLM with file content type
      const pdfMessages = [
        {
          role: 'user' as const,
          content: [
            { type: 'file', file: { filename: file.name, file_data: `data:application/pdf;base64,${base64String}` } },
            { type: 'text', text: 'Extract the complete text content from this PDF document. Return only the extracted text, no commentary.' }
          ]
        }
      ] as any[]

      try {
        const extractText = await chatComplete(pdfMessages, { maxTokens: 4000 })
        if (extractText) {
          thesisText = extractText
        }
      } catch (err: any) {
        console.error('PDF extraction error:', err?.message)
      }
    } else if (inputType === 'url' && url) {
      sourceUrl = url
      // Use Jina Reader for clean markdown extraction (replaces lossy regex HTML stripping)
      try {
        const jinaContent = await fetchUrlViaJina(url)
        if (jinaContent && jinaContent.length > 100) {
          thesisText = jinaContent
        } else {
          // Fallback: try direct fetch with basic cleanup if Jina returns nothing
          const pageRes = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThemeInvestorBot/1.0)' },
          })
          if (pageRes.ok) {
            const html = await pageRes.text()
            thesisText = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 12000)
          } else {
            thesisText = `Could not extract content from ${url}. URL provided for reference.`
          }
        }
      } catch (fetchErr: any) {
        console.error('URL fetch error:', fetchErr?.message)
        thesisText = `Unable to fetch URL content (${fetchErr?.message ?? 'unknown error'}). URL: ${url}`
      }
    } else if (text) {
      thesisText = text
    }
  } else {
    const body = await request.json()
    thesisText = body?.text ?? ''
    inputType = body?.inputType ?? 'text'
    sourceUrl = body?.url ?? ''
  }

  if (!thesisText && !sourceUrl) {
    return new Response(JSON.stringify({ error: 'No thesis content provided' }), { status: 400 })
  }

  // Create thesis record
  let thesis: any
  try {
    thesis = await prisma.thesis.create({
      data: {
        userId,
        title: 'Analyzing...',
        description: thesisText?.substring(0, 500) ?? '',
        inputType,
        sourceUrl: sourceUrl || null,
        sourceText: thesisText || null,
        pdfPath: pdfPath || null,
        pdfIsPublic,
        status: 'analyzing',
      },
    })
  } catch (err: any) {
    console.error('Thesis create error:', err?.message)
    return new Response(JSON.stringify({ error: 'Failed to create thesis record' }), { status: 500 })
  }

  // Extract search terms from thesis text (shared enrichment logic)
  const { tickers, keywords } = extractSearchTerms(thesisText)
  const tickerParts = [...tickers.map(t => `$${t}`), ...keywords.map(p => `"${p}"`)]
  if (tickerParts.length === 0) {
    const words = thesisText.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 4)
    tickerParts.push(...words)
  }
  tickerParts.push('(invest OR stock OR market OR thesis)')
  const searchQuery = tickerParts.join(' ').substring(0, 256)

  // Gather real-world signals in parallel: X/Twitter sentiment + RSS market headlines
  const [xResults, marketSignals] = await Promise.all([
    searchTweets(searchQuery, 20),
    fetchMarketSignals(keywords, tickers),
  ])

  // Fetch REAL financial data for identified tickers (P/E, PEG, growth, margins, earnings, RSI, MA)
  const financialData = tickers.length > 0
    ? await fetchFinancialData(tickers.slice(0, 12))
    : { stocks: {}, etfs: {}, errors: {} }
  const financialContext = formatFinancialDataForLLM(financialData)

  // Build analysis messages — feed thesis text + tweet sentiment + RSS headlines + REAL financial data to LLM
  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    {
      role: 'user' as const,
      content: `Investment Thesis to Analyze:\n\n${thesisText}\n\n${sourceUrl ? `Source URL: ${sourceUrl}` : ''}\n\n${financialContext}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify(xResults?.tweets?.slice(0, 10)?.map((t: any) => ({ text: t?.text, likes: t?.likeCount ?? 0, retweets: t?.retweetCount ?? 0 })) ?? [])}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals.headlines.length > 0 ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the REAL financial data, tweet sentiment, and market headlines as context. Ground your financialHealth and technicalAnalysis sections in the actual numbers provided. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        // Send initial status
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Searching social media sentiment...', thesisId: thesis.id })}\n\n`))

        let fullContent = ''
        let deltaCount = 0
        let reasoningCharCount = 0
        let lastHeartbeat = Date.now()

        const progressMessages = [
          'Analyzing investment thesis...',
          'Fetching real financial data...',
          'Mapping ecosystem members...',
          'Evaluating earnings & growth...',
          'Analyzing technical signals...',
          'Identifying theme ETFs...',
          'Assessing valuations and moats...',
          'Calculating scores...',
          'Finalizing analysis...',
        ]

        // Stream the LLM response
        // onReasoning: send SSE heartbeat every ~2s during GLM's reasoning phase
        // to prevent client/proxy timeout (reasoning takes 30-60s for complex theses)
        for await (const delta of chatStream(messages, {
          jsonMode: true,
          maxTokens: 16000,
          onReasoning: (reasoningDelta) => {
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

        // Parse and save the final result
        let finalResult: any = {}
        try {
          finalResult = JSON.parse(fullContent)
        } catch (e) {
          console.error('Failed to parse LLM JSON:', e, 'Content length:', fullContent.length, 'First 200 chars:', fullContent.substring(0, 200))
          finalResult = { error: 'Failed to parse analysis result', raw: fullContent?.substring(0, 500) }
        }

        // CRITICAL: Validate that the LLM actually returned usable content
        if (!finalResult?.ecosystem?.members?.length && !finalResult?.title) {
          console.error('LLM returned empty or unusable response. fullContent length:', fullContent.length, 'deltaCount:', deltaCount)
          await prisma.thesis.update({
            where: { id: thesis.id },
            data: {
              status: 'failed',
              description: 'LLM analysis returned empty response. Please retry.',
            },
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
          const members = finalResult?.ecosystem?.members ?? []
          const themeEtfSymbols = (finalResult?.themeETFs ?? []).map((e: any) => e?.symbol).filter(Boolean)

          // Enrich ETF data from yfinance (real AUM, YTD returns)
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

          // Find or create a Theme for this thesis
          let themeId: string | undefined
          const themeName = (finalResult?.themeName ?? finalResult?.title ?? 'Untitled Theme') as string
          const themeSlug = themeName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80)
          const existingTheme = await prisma.theme.findUnique({ where: { slug: themeSlug } })
          if (existingTheme) {
            themeId = existingTheme.id
          } else {
            const newTheme = await prisma.theme.create({
              data: {
                name: themeName,
                slug: themeSlug,
                description: finalResult?.description ?? '',
                isPublic: true,
                publishedAt: new Date(),
              },
            })
            themeId = newTheme.id
          }

          await prisma.thesis.update({
            where: { id: thesis.id },
            data: {
              title: finalResult?.title ?? 'Untitled Thesis',
              description: finalResult?.description ?? '',
              themeId,
              overallScore: finalResult?.overallScore ?? null,
              sentimentScore: finalResult?.sentiment?.score ?? null,
              ecosystemScore: finalResult?.ecosystem?.score ?? null,
              riskScore: finalResult?.externalFactors?.score ?? null,
              opportunityScore: finalResult?.bottlenecks?.score ?? null,
              moatScore: finalResult?.valuation?.score ?? null,
              sentimentData: { ...(finalResult?.sentiment ?? {}), tweets: xResults?.tweets ?? [] },
              ecosystemData: finalResult?.ecosystem ?? null,
              externalFactors: finalResult?.externalFactors ?? null,
              bottlenecks: finalResult?.bottlenecks ?? null,
              valuationData: finalResult?.valuation ?? null,
              financialData: {
                score: finalResult?.financialHealth?.score ?? null,
                summary: finalResult?.financialHealth?.summary ?? '',
                perStock: finalResult?.financialHealth?.perStock ?? [],
                metrics: financialMetrics,
              },
              technicalData: {
                score: finalResult?.technicalAnalysis?.score ?? null,
                summary: finalResult?.technicalAnalysis?.summary ?? '',
                perStock: finalResult?.technicalAnalysis?.perStock ?? [],
                indicators: technicalMetrics,
              },
              earningsData: earningsMetrics,
              themeEtfs: mergedEtfs,
              isPublic: true,
              publishedAt: new Date(),
              status: 'completed',
            },
          })

          // Create theme members (with instrumentType + sector)
          for (const member of members) {
            await prisma.basketMember.create({
              data: {
                thesisId: thesis.id,
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

        const finalData = JSON.stringify({
          status: 'completed',
          result: finalResult,
          thesisId: thesis.id,
        })
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err: any) {
        console.error('Stream error:', err)
        try {
          await prisma.thesis.update({ where: { id: thesis.id }, data: { status: 'failed' } })
        } catch (e: any) { /* ignore */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: err?.message ?? 'Analysis failed' })}\n\n`))
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
