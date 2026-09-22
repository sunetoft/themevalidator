/**
 * Smoke test — replicates the /api/analyze pipeline WITHOUT auth/DB,
 * so we can see exactly which stage breaks.
 *
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/smoke-analyze.ts [--mode text|url] [--big]
 */
import { chatStream, chatComplete, LLM_MODEL } from '../lib/llm'
import { ANALYSIS_PROMPT } from '../lib/prompt'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '../lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '../lib/financial-data'
import { searchTweets } from '../lib/x-api'

const args = process.argv.slice(2)
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'text'
const big = args.includes('--big')

const THESIS_TEXT = `Supply bottleneck in photonics CPO manufacturing. As AI bandwidth demands exceed 51.2T and approach 102T, co-packaged optics (CPO) become the only viable path for switch fabric. Silicon photonics players with vertical integration in laser and packaging capture outsized margins, while pure-play optical module assemblers face commoditization. Basket: COHR, LITE, MRVL, AVGO, POET, CRDO, FN.`
const THESIS_URL = 'https://www.fool.com/investing/2026/09/15/the-cpo-bottleneck/'

const t = (label: string) => console.log(`\n=== ${label}`)

async function main() {
  console.log('model =', LLM_MODEL, '| mode =', mode, '| big prompt =', big)

  let thesisText = THESIS_TEXT
  let sourceUrl = ''
  if (mode === 'url') {
    sourceUrl = THESIS_URL
    t('STAGE 1: Jina URL extraction')
    try {
      const jina = await fetchUrlViaJina(THESIS_URL)
      console.log('jina length =', jina?.length ?? 0)
      if (jina && jina.length > 100) thesisText = jina
      else console.log('!! jina returned too little, would fall back to raw fetch')
    } catch (e: any) {
      console.log('!! JINA THREW:', e?.message)
    }
  }

  const { tickers, keywords } = extractSearchTerms(thesisText)
  console.log('tickers =', tickers, '\nkeywords =', keywords.slice(0, 8))

  t('STAGE 2: enrichment (X sentiment + RSS headlines)')
  const tickerParts = [...tickers.map(x => `$${x}`), ...keywords.map(p => `"${p}"`)]
  tickerParts.push('(invest OR stock OR market OR thesis)')
  const searchQuery = tickerParts.join(' ').substring(0, 256)
  const t0 = Date.now()
  const [xResults, marketSignals] = await Promise.all([
    searchTweets(searchQuery, 20).catch((e: any) => { console.log('!! searchTweets threw:', e?.message); return null }),
    fetchMarketSignals(keywords, tickers).catch((e: any) => { console.log('!! fetchMarketSignals threw:', e?.message); return { headlines: [] } }),
  ])
  console.log(`enrichment took ${((Date.now() - t0) / 1000).toFixed(1)}s | tweets=${xResults?.tweetCount ?? 0} err=${xResults?.error ?? 'none'} | headlines=${marketSignals?.headlines?.length ?? 0}`)

  t('STAGE 3: financial data')
  const t1 = Date.now()
  const financialData = tickers.length > 0
    ? await fetchFinancialData(tickers.slice(0, 12)).catch((e: any) => { console.log('!! fetchFinancialData threw:', e?.message); return { stocks: {}, etfs: {}, errors: {} } as any })
    : { stocks: {}, etfs: {}, errors: {} }
  const financialContext = formatFinancialDataForLLM(financialData)
  console.log(`financials took ${((Date.now() - t1) / 1000).toFixed(1)}s | stocks=${Object.keys(financialData.stocks ?? {}).length} | contextChars=${financialContext.length}`)

  t('STAGE 4: prompt assembly')
  const userContent = `Investment Thesis to Analyze:\n\n${thesisText}\n\n${sourceUrl ? `Source URL: ${sourceUrl}` : ''}\n\n${financialContext}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify((xResults?.tweets ?? []).slice(0, 10).map((x: any) => ({ text: x?.text, likes: x?.likeCount ?? 0, retweets: x?.retweetCount ?? 0 })))}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals?.headlines?.length ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the REAL financial data, tweet sentiment, and market headlines as context. Ground your financialHealth and technicalAnalysis sections in the actual numbers provided. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`
  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    { role: 'user' as const, content: userContent },
  ]
  const approxTokens = Math.round((ANALYSIS_PROMPT.length + userContent.length) / 4)
  console.log(`system=${ANALYSIS_PROMPT.length}c user=${userContent.length}c  ≈${approxTokens} input tokens`)

  t('STAGE 5: STREAMING LLM call (what /api/analyze does)')
  let full = ''
  let deltas = 0
  let reasoning = 0
  let finish: any = null
  const t2 = Date.now()
  try {
    for await (const delta of chatStream(messages, { jsonMode: true, maxTokens: big ? 32000 : 16000, onReasoning: d => { reasoning += d.length } })) {
      full += delta
      deltas++
      if (deltas === 1) console.log(`first delta after ${((Date.now() - t2) / 1000).toFixed(1)}s`)
    }
    console.log(`stream done in ${((Date.now() - t2) / 1000).toFixed(1)}s | deltas=${deltas} reasoningChars=${reasoning} contentChars=${full.length}`)
  } catch (e: any) {
    console.log('!! STREAM THREW:', e?.status, e?.message?.slice(0, 300))
  }

  t('STAGE 6: JSON parse + validation (same checks as route.ts:220-242)')
  let parsed: any = null
  try {
    parsed = JSON.parse(full)
    console.log('JSON parsed OK. keys =', Object.keys(parsed).join(','))
    console.log('stocks =', parsed?.stocks?.length ?? 0, '| ecosystem.members =', parsed?.ecosystem?.members?.length ?? 0, '| title =', JSON.stringify(parsed?.title))
  } catch (e: any) {
    console.log('!! JSON PARSE FAILED:', e?.message)
    console.log('   tail 200 chars:', JSON.stringify(full.slice(-200)))
  }
  const usable = (parsed?.stocks?.length || parsed?.ecosystem?.members?.length) && parsed?.title
  console.log(usable ? '\n✅ RESULT: analysis would COMPLETE' : '\n❌ RESULT: analysis would FAIL ("LLM analysis returned empty response")')

  t('STAGE 6b: non-streaming call with same prompt (control)')
  try {
    const t3 = Date.now()
    const out = await chatComplete(messages, { jsonMode: true, maxTokens: 16000, endpoint: 'smoke' })
    console.log(`non-stream done in ${((Date.now() - t3) / 1000).toFixed(1)}s len=${out.length}`)
    try { JSON.parse(out); console.log('non-stream JSON parsed OK') } catch (e: any) { console.log('!! non-stream JSON parse failed:', e?.message) }
  } catch (e: any) {
    console.log('!! NON-STREAM THREW:', e?.status, e?.message?.slice(0, 300))
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })
