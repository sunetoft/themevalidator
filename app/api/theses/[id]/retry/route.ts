import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { searchTweets } from '@/lib/x-api'
import { chatComplete, chatStream } from '@/lib/llm'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '@/lib/enrichment'

export const dynamic = 'force-dynamic'

// Reuses the same prompt logic as the main analyze route
const ANALYSIS_PROMPT = `You are an expert investment analyst specializing in emerging themes and early-stage thesis validation. Analyze the following investment thesis and provide a comprehensive analysis.

Respond in JSON format with the following structure:
{
  "title": "Short thesis title (max 8 words)",
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
        "role": "supplier|enabler|end-user|infrastructure|competitor",
        "competency": "What they bring to the thesis",
        "moatRating": 1-10,
        "valuationStatus": "undervalued|fair|overvalued",
        "marketCap": "$XXB",
        "notes": "Brief investment note"
      }
    ]
  },
  "externalFactors": {
    "score": 0-100,
    "factors": [
      { "name": "Factor name", "impact": "positive|negative|neutral", "severity": "high|medium|low", "description": "Brief description" }
    ]
  },
  "bottlenecks": {
    "score": 0-100,
    "items": [
      { "name": "Bottleneck name", "pricingPowerBenefit": "high|medium|low", "affectedCompanies": ["TICK1", "TICK2"], "description": "Brief description" }
    ]
  },
  "valuation": {
    "score": 0-100,
    "topPicks": [
      { "ticker": "TICK", "companyName": "Name", "moatStrength": "wide|narrow|none", "valuationGrade": "A|B|C|D|F", "catalysts": ["catalyst1"], "risks": ["risk1"] }
    ]
  },
  "overallScore": 0-100,
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"]
}

Provide at least 5-8 ecosystem members with real publicly traded companies when possible. Score each dimension 0-100 where higher is more favorable for investment. Respond with raw JSON only.`

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
  await prisma.basketMember.deleteMany({ where: { thesisId } })

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

  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    {
      role: 'user' as const,
      content: `Investment Thesis to Analyze:\n\n${enrichedReaderContent && enrichedReaderContent.length > 200 ? enrichedReaderContent : thesisText}\n\n${thesis.sourceUrl ? `Source URL: ${thesis.sourceUrl}` : ''}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify(xResults?.tweets?.slice(0, 10)?.map((t: any) => ({ text: t?.text, likes: t?.likeCount ?? 0, retweets: t?.retweetCount ?? 0 })) ?? [])}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals.headlines.length > 0 ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the tweet sentiment and market headlines as real-world context. Weigh them alongside the thesis content. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`,
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'processing', message: 'Retrying analysis...', thesisId })}\n\n`))

        let fullContent = ''
        let lastHeartbeat = Date.now()
        for await (const delta of chatStream(messages, {
          jsonMode: true,
          maxTokens: 16000,
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
        }

        let finalResult: any = {}
        try {
          finalResult = JSON.parse(fullContent)
        } catch (e) {
          console.error('Retry: Failed to parse LLM JSON:', e, 'Content length:', fullContent.length, 'First 200 chars:', fullContent.substring(0, 200))
          finalResult = { error: 'Failed to parse analysis result', raw: fullContent?.substring(0, 500) }
        }

        // CRITICAL: Validate that the LLM actually returned usable content
        if (!finalResult?.ecosystem?.members?.length && !finalResult?.title) {
          console.error('Retry: LLM returned empty or unusable response. fullContent length:', fullContent.length)
          await prisma.thesis.update({
            where: { id: thesisId },
            data: { status: 'failed', description: 'LLM analysis returned empty response. Please retry.' },
          })
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: 'Analysis produced no results — LLM returned empty response. Please retry.' })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          return
        }

        finalResult.xSentiment = {
          tweets: xResults?.tweets ?? [],
          tweetCount: xResults?.tweetCount ?? 0,
          query: xResults?.query ?? '',
          error: xResults?.error ?? null,
        }

        try {
          const members = finalResult?.ecosystem?.members ?? []
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
              ecosystemData: finalResult?.ecosystem ?? null,
              externalFactors: finalResult?.externalFactors ?? null,
              bottlenecks: finalResult?.bottlenecks ?? null,
              valuationData: finalResult?.valuation ?? null,
              status: 'completed',
            },
          })

          for (const member of members) {
            await prisma.basketMember.create({
              data: {
                thesisId,
                ticker: member?.ticker ?? null,
                companyName: member?.companyName ?? 'Unknown',
                role: member?.role ?? null,
                competency: member?.competency ?? null,
                moatRating: member?.moatRating ?? null,
                valuationStatus: member?.valuationStatus ?? null,
                marketCap: member?.marketCap ?? null,
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
