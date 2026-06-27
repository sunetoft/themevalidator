/**
 * Retry analysis for thesis cmqw5gpkg06y113650cqsszxk
 * Uses same lib functions as the analyze route but runs standalone.
 */
import { prisma } from '../lib/prisma'
import { chatStream } from '../lib/llm'
import { searchTweets } from '../lib/x-api'
import { fetchMarketSignals, extractSearchTerms } from '../lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '../lib/financial-data'
import { ThemeMember } from '@prisma/client'

const THESIS_ID = 'cmqw5gpkg06y113650cqsszxk'

const ANALYSIS_PROMPT = `You are an expert investment analyst specializing in emerging themes and early-stage thesis validation. Analyze the following investment thesis and provide a comprehensive analysis grounded in REAL financial data.

You will receive REAL-TIME FINANCIAL DATA for basket tickers (P/E, PEG, revenue growth, profit margins, earnings beat/miss history, RSI, moving averages, analyst targets). USE THESE REAL NUMBERS — do not invent or estimate metrics.

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
        "earningsAssessment": "assess beat/miss history and guidance trend",
        "growthVsValuation": "Is the growth rate justified by P/E and PEG?",
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

async function main() {
  console.log('=== Thesis Retry Analysis ===')

  // 1. Get thesis
  const thesis = await prisma.thesis.findUnique({ where: { id: THESIS_ID } })
  if (!thesis) {
    console.error('Thesis not found!')
    process.exit(1)
  }
  console.log(`Thesis: ${thesis.id}`)
  console.log(`Current title: ${thesis.title}`)
  console.log(`Source text length: ${thesis.sourceText?.length ?? 0}`)

  const thesisText = thesis.sourceText ?? ''

  // 2. Extract search terms
  const { tickers, keywords } = extractSearchTerms(thesisText)
  console.log(`Extracted tickers: ${tickers.join(', ')}`)
  console.log(`Extracted keywords: ${keywords.join(', ')}`)

  const tickerParts = [...tickers.map(t => `$${t}`), ...keywords.map(p => `"${p}"`)]
  if (tickerParts.length === 0) {
    const words = thesisText.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 4)
    tickerParts.push(...words)
  }
  tickerParts.push('(invest OR stock OR market OR thesis)')
  const searchQuery = tickerParts.join(' ').substring(0, 256)

  // 3. Gather signals in parallel
  console.log('Fetching X/Twitter + RSS signals...')
  const [xResults, marketSignals] = await Promise.all([
    searchTweets(searchQuery, 20),
    fetchMarketSignals(keywords, tickers),
  ])
  console.log(`X results: ${xResults?.tweetCount ?? 0} tweets, error: ${xResults?.error ?? 'none'}`)
  console.log(`RSS headlines: ${marketSignals.headlines.length}`)

  // 4. Fetch financial data
  console.log(`Fetching financial data for ${tickers.length} tickers...`)
  const financialData = tickers.length > 0
    ? await fetchFinancialData(tickers.slice(0, 12))
    : { stocks: {}, etfs: {}, errors: {} }
  console.log(`Financial data: ${Object.keys(financialData.stocks || {}).length} stocks, errors: ${JSON.stringify(financialData.errors || {})}`)
  const financialContext = formatFinancialDataForLLM(financialData)

  // 5. Build messages
  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    {
      role: 'user' as const,
      content: `Investment Thesis to Analyze:\n\n${thesisText}\n\n${thesis.sourceUrl ? `Source URL: ${thesis.sourceUrl}` : ''}\n\n${financialContext}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify(xResults?.tweets?.slice(0, 10)?.map((t: any) => ({ text: t?.text, likes: t?.likeCount ?? 0, retweets: t?.retweetCount ?? 0 })) ?? [])}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals.headlines.length > 0 ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the REAL financial data, tweet sentiment, and market headlines as context. Ground your financialHealth and technicalAnalysis sections in the actual numbers provided. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`
    },
  ]

  console.log(`Prompt user message length: ${messages[1].content.length} chars`)

  // 6. Stream LLM response
  console.log('Starting LLM stream...')
  let fullContent = ''
  let deltaCount = 0
  const startTime = Date.now()

  try {
    for await (const delta of chatStream(messages, { jsonMode: true, maxTokens: 8000 })) {
      fullContent += delta
      deltaCount++
      if (deltaCount % 500 === 0) {
        console.log(`  ...streaming: ${deltaCount} chunks, ${fullContent.length} chars`)
      }
    }
  } catch (streamErr: any) {
    console.error('STREAM ERROR:', streamErr?.message)
    console.error('Stack:', streamErr?.stack)
    process.exit(1)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`Stream completed: ${deltaCount} chunks, ${fullContent.length} chars in ${elapsed}s`)

  // 7. Parse
  let finalResult: any = {}
  try {
    finalResult = JSON.parse(fullContent)
    console.log(`JSON parse SUCCESS`)
  } catch (e: any) {
    console.error(`JSON parse FAILED: ${e.message}`)
    console.error(`Content length: ${fullContent.length}`)
    console.error(`First 300 chars: ${fullContent.substring(0, 300)}`)
    console.error(`Last 300 chars: ${fullContent.substring(fullContent.length - 300)}`)
    process.exit(1)
  }

  console.log(`Title: ${finalResult.title}`)
  console.log(`Overall score: ${finalResult.overallScore}`)
  console.log(`Ecosystem members: ${finalResult.ecosystem?.members?.length}`)

  // 8. Save to DB
  console.log('Saving to database...')

  // Delete old theme members
  await prisma.themeMember.deleteMany({ where: { thesisId: THESIS_ID } })

  const members = finalResult?.ecosystem?.members ?? []

  // Build financial/technical metrics from fetched data
  const financialMetrics: Record<string, any> = {}
  const technicalMetrics: Record<string, any> = {}
  const earningsMetrics: Record<string, any> = {}
  for (const [ticker, data] of Object.entries(financialData.stocks ?? {})) {
    const d = data as any
    financialMetrics[ticker] = d.metrics
    technicalMetrics[ticker] = d.technical
    earningsMetrics[ticker] = { earnings: d.earnings, nextEarningsDate: d.nextEarningsDate }
  }

  await prisma.thesis.update({
    where: { id: THESIS_ID },
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
      themeEtfs: finalResult?.themeETFs ?? [],
      status: 'completed',
    },
  })

  // Create theme members
  for (const member of members) {
    await prisma.themeMember.create({
      data: {
        thesisId: THESIS_ID,
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

  console.log(`Created ${members.length} theme members`)
  console.log('=== DONE ===')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
