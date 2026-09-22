export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { searchTweets } from '@/lib/x-api'
import { chatComplete, chatStream } from '@/lib/llm'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '@/lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '@/lib/financial-data'
import { ANALYSIS_PROMPT } from '@/lib/prompt'
import { parseLLMJson, isUsableAnalysis } from '@/lib/llm-json'

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
        const extractText = await chatComplete(pdfMessages, { maxTokens: 4000, source: "web", endpoint: "analyze-pdf-extract" })
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

    // URL mode over the JSON transport: the client only sends a placeholder
    // string ("Analyze the investment thesis from this URL: …"), so we must
    // fetch the real article here — otherwise the LLM analyses the placeholder.
    if (inputType === 'url' && sourceUrl) {
      try {
        const jinaContent = await fetchUrlViaJina(sourceUrl)
        if (jinaContent && jinaContent.length > 100) {
          thesisText = jinaContent
        } else {
          const pageRes = await fetch(sourceUrl, {
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
          }
        }
      } catch (fetchErr: any) {
        console.error('URL fetch error (json transport):', fetchErr?.message)
      }
      if (!thesisText || thesisText.length < 100) {
        // Keep whatever the client sent (usually the placeholder) so the request
        // still produces something rather than a hard 400.
        thesisText = `Analyze the investment thesis from this URL: ${sourceUrl}`
      }
    }
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

      // If the client goes away (closed tab / aborted request) the analysis is
      // abandoned mid-flight; without this the row stays "analyzing" forever.
      // `settled` guards against stamping a thesis that already completed.
      let settled = false
      request.signal.addEventListener('abort', () => {
        if (settled) return
        settled = true
        prisma.thesis
          .update({
            where: { id: thesis.id },
            data: { status: 'failed', description: 'Analysis interrupted (page closed). Please retry.' },
          })
          .catch(() => { /* best effort */ })
      })

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
          'Evaluating basket companies...',
          'Assessing pricing power & products...',
          'Analyzing earnings & growth...',
          'Checking technical signals...',
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

        // Parse and save the final result.
        // GLM sometimes wraps the payload in {"answer": "..."} and/or emits raw
        // control chars / truncated JSON — parseLLMJson repairs all of those.
        const parsed = parseLLMJson(fullContent)
        let finalResult: any = parsed.data ?? {}
        if (!parsed.ok) {
          console.error(
            'Failed to parse LLM JSON:', parsed.reason, '| Content length:', fullContent.length,
            '| First 200 chars:', fullContent.substring(0, 200)
          )
        } else if (parsed.repaired) {
          console.warn(
            `Recovered LLM JSON (envelope=${parsed.envelope ?? 'none'}, repaired, ${fullContent.length} chars)`
          )
        }

        // CRITICAL: Validate that the LLM actually returned usable content.
        // If not, make up to TWO recovery attempts before giving up — GLM
        // occasionally answers with an envelope/refusal, or emits a syntax slip
        // our repair layer cannot fix. The second attempt asks for a COMPACT
        // analysis (fewer companies, terse fields) because long hand-written
        // JSON is what produces those slips in the first place.
        const RECOVERY_NUDGES = [
          'The previous response was not parseable. Answer again with ONE raw JSON object that starts with "{" and contains the top-level keys title, themeName, description, sentiment, stocks, ecosystem, financialHealth, technicalAnalysis, productEvaluator, themeETFs, externalFactors, bottlenecks, valuation, overallScore, keyTakeaways. No "answer" wrapper, no preface, no markdown.',
          'The previous two responses were not valid JSON. Respond with ONE compact raw JSON object only: keep the same schema and top-level keys, but include AT MOST 6 companies in "stocks" and keep every string value under 25 words. Emit valid JSON — no "answer" wrapper, no markdown, no commentary.',
        ]
        for (let attempt = 0; attempt < RECOVERY_NUDGES.length && !isUsableAnalysis(finalResult); attempt++) {
          if (attempt === 0) {
            console.error(
              'LLM returned empty or unusable response. fullContent length:', fullContent.length,
              'deltaCount:', deltaCount, 'parseReason:', parsed.reason ?? 'n/a', '— attempting recovery'
            )
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Re-running analysis (malformed response)...' })}\n\n`))
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Retrying with a shorter analysis...' })}\n\n`))
          }
          try {
            const recovery = await chatComplete(
              [...messages, { role: 'user' as const, content: RECOVERY_NUDGES[attempt] }],
              { jsonMode: true, maxTokens: 16000, source: 'web', endpoint: `analyze-recovery-${attempt + 1}` }
            )
            const recovered = parseLLMJson(recovery)
            if (isUsableAnalysis(recovered.data)) {
              console.warn(`Recovery attempt ${attempt + 1} succeeded (${recovery.length} chars, envelope=${recovered.envelope ?? 'none'})`)
              finalResult = recovered.data
            } else {
              console.error(`Recovery attempt ${attempt + 1} also unusable:`, recovered.reason, 'len:', recovery.length)
            }
          } catch (recErr: any) {
            console.error(`Recovery attempt ${attempt + 1} threw:`, recErr?.message)
          }
        }

        if (!isUsableAnalysis(finalResult)) {
          settled = true
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
          const stocks = finalResult?.stocks ?? finalResult?.ecosystem?.members ?? []
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

          // Map consolidated stocks[] back to backward-compatible per-section shapes for UI
          // (UI components read ecosystemData.members, financialData.perStock, etc.)
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

          // Find or create a Theme for this thesis
          let themeId: string | undefined
          const themeName = (finalResult?.themeName ?? finalResult?.title ?? 'Untitled Theme') as string
          const themeSlug = themeName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80)
          const existingTheme = await (prisma as any).theme.findUnique({ where: { slug: themeSlug } })
          if (existingTheme) {
            themeId = existingTheme.id
          } else {
            const newTheme = await (prisma as any).theme.create({
              data: {
                name: themeName,
                slug: themeSlug,
                description: finalResult?.description ?? '',
                isPublic: false,
                publishedAt: null,
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
              isPublic: false,
              publishedAt: null,
              status: 'completed',
            },
          })

          // Create theme members (with instrumentType + sector)
          for (const member of ecosystemMembers) {
            await (prisma as any).basketMember.create({
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
        settled = true
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err: any) {
        console.error('Stream error:', err)
        settled = true
        try {
          await prisma.thesis.update({ where: { id: thesis.id }, data: { status: 'failed' } })
        } catch (e: any) { /* ignore */ }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: err?.message ?? 'Analysis failed' })}\n\n`))
        } catch { /* client already gone — abort handler already stamped the row */ }
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Critical: tells nginx to NOT buffer SSE — without this, heartbeats never reach the client during GLM reasoning and the connection times out ("Failed to fetch")
    },
  })
}
