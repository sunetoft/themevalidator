/**
 * Repeat the real analyze LLM call N times and record the SHAPE of each response.
 * Saves raw output to /tmp/ti-raw-<i>.json.txt so we can build parser fixtures.
 *
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/smoke-llm-trials.ts --n 5 --mode text
 */
import { writeFileSync } from 'fs'
import { chatStream, LLM_MODEL } from '../lib/llm'
import { ANALYSIS_PROMPT } from '../lib/prompt'
import { fetchUrlViaJina, fetchMarketSignals, extractSearchTerms } from '../lib/enrichment'
import { fetchFinancialData, formatFinancialDataForLLM } from '../lib/financial-data'
import { searchTweets } from '../lib/x-api'
import { parseLLMJson } from '../lib/llm-json'

const args = process.argv.slice(2)
const arg = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const N = Number(arg('--n', '5'))
const MODE = arg('--mode', 'text')

const TEXT = `Uranium enrichment capacity is the real chokepoint of the nuclear renaissance, not mining.
Western enrichment is dominated by one Russian state supplier; HALEU for advanced SMRs is in structural
deficit through 2030 and the DOE is paying up for domestic capacity. Utilities that locked long-term
enrichment contracts at pre-2022 prices are insulated, while merchant enrichers with new centrifuge
capacity capture enormous pricing power. Basket: LEU, CCJ, SMR, OKLO, UEC, NXE, EU.
Key catalysts: DOE HALEU awards, Russian import ban enforcement, SMR NRC licensing milestones,
long-term utility contracting above $80/lb. Risks: demand destruction from gas, accident risk,
policy reversal on the import ban.`
const URL = 'https://www.energy.gov/ne/articles/haleu-availability-accelerating-advanced-nuclear'

async function main() {
  console.log(`model=${LLM_MODEL} mode=${MODE} trials=${N}`)

  let thesisText = TEXT
  let sourceUrl = ''
  if (MODE === 'url') {
    sourceUrl = URL
    thesisText = `Analyze the investment thesis from this URL: ${URL}` // what the client actually sends
  }

  const { tickers, keywords } = extractSearchTerms(thesisText)
  const q = [...tickers.map(t => `$${t}`), ...keywords.map(k => `"${k}"`), '(invest OR stock OR market OR thesis)'].join(' ').slice(0, 256)
  const [xResults, marketSignals] = await Promise.all([
    searchTweets(q, 20).catch(() => null),
    fetchMarketSignals(keywords, tickers).catch(() => ({ headlines: [] as any[] })),
  ])
  const financialData = tickers.length ? await fetchFinancialData(tickers.slice(0, 12)).catch(() => ({ stocks: {}, etfs: {}, errors: {} } as any)) : { stocks: {}, etfs: {}, errors: {} }
  const financialContext = formatFinancialDataForLLM(financialData)
  console.log(`tickers=${tickers.length} financialStocks=${Object.keys(financialData.stocks ?? {}).length} ctxChars=${financialContext.length}`)

  const userContent = `Investment Thesis to Analyze:\n\n${thesisText}\n\n${sourceUrl ? `Source URL: ${sourceUrl}` : ''}\n\n${financialContext}\n\nRecent social media sentiment data (from X/Twitter):\n${JSON.stringify([])}\nTotal tweets found: ${xResults?.tweetCount ?? 0}\n\nRecent market headlines (RSS — Seeking Alpha):\n${marketSignals.headlines.length ? JSON.stringify(marketSignals.headlines, null, 2) : 'No direct headline matches found.'}\n\nUse the REAL financial data, tweet sentiment, and market headlines as context. Ground your financialHealth and technicalAnalysis sections in the actual numbers provided. If headlines contradict the thesis, note it in externalFactors. Please provide a comprehensive analysis following the JSON schema exactly.`
  const messages = [
    { role: 'system' as const, content: ANALYSIS_PROMPT },
    { role: 'user' as const, content: userContent },
  ]

  const rows: any[] = []
  for (let i = 1; i <= N; i++) {
    const t0 = Date.now()
    let raw = ''
    let reasoning = 0
    let err = ''
    try {
      for await (const d of chatStream(messages, { jsonMode: true, maxTokens: 16000, onReasoning: x => { reasoning += x.length } })) raw += d
    } catch (e: any) { err = `${e?.name}:${e?.message?.slice(0, 120)}` }
    const secs = (Date.now() - t0) / 1000
    writeFileSync(`/tmp/ti-raw-${i}.txt`, raw)
    const parsed = parseLLMJson(raw)
    const shape = raw.slice(0, 60).replace(/\n/g, '\\n')
    const okValidate = !!(parsed.data?.stocks?.length && parsed.data?.title)
    console.log(
      `trial ${i}: ${secs.toFixed(0)}s chars=${raw.length} reasoning=${reasoning} ` +
      `parse=${parsed.ok ? 'ok' : 'FAIL'}${parsed.repaired ? '(repaired)' : ''} validate=${okValidate ? 'ok' : 'FAIL'} ` +
      `envelope=${parsed.envelope ?? 'none'} ${err} | head="${shape}"`
    )
    if (parsed.reason) console.log(`        reason: ${parsed.reason}`)
    rows.push({ i, secs, chars: raw.length, ok: okValidate })
    await new Promise(r => setTimeout(r, 3000))
  }
  const pass = rows.filter(r => r.ok).length
  console.log(`\nRESULT: ${pass}/${N} usable (${((pass / N) * 100).toFixed(0)}%)`)
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })
