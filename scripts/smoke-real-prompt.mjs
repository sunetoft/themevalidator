// Reproduce the real /api/analyze LLM call with the REAL analysis prompt.
// Usage: node --env-file=.env scripts/smoke-real-prompt.mjs
import OpenAI from 'openai'
import fs from 'fs'

// load ANALYSIS_PROMPT from lib/prompt.ts (strip TS export syntax)
const src = fs.readFileSync(new URL('../lib/prompt.ts', import.meta.url), 'utf8')
const m = src.match(/ANALYSIS_PROMPT\s*=\s*`([\s\S]*?)`/)
if (!m) { console.error('could not extract ANALYSIS_PROMPT'); process.exit(1) }
const PROMPT = m[1]
console.log('ANALYSIS_PROMPT chars:', PROMPT.length, '~tokens:', Math.round(PROMPT.length / 4))

const client = new OpenAI({ apiKey: process.env.ZAI_API_KEY, baseURL: process.env.ZAI_BASE_URL })

const userText = `Investment Thesis to Analyze:

The positive investment case (bull case) for permanent magnets is built on a structural, inevitable global transition where demand is expected to significantly outstrip supply over the coming decade. NdFeB permanent magnets are the critical input for EV traction motors, wind turbine generators, robotics, drones and defense systems. China controls the vast majority of rare-earth refining and magnet manufacturing, creating a strategic choke point. Western reshoring, defense procurement mandates and EV supply-chain localization create a multi-year tailwind for non-China magnet capacity. Basket: MP, ALB, LYSCF, VULNF.

Source URL: https://example.com/permanent-magnets-thesis

FINANCIAL DATA:
Ticker: MP | P/E 41.2 | Rev growth 23% | Gross margin 38% | RSI 58
Ticker: ALB | P/E 28.4 | Rev growth 12% | Gross margin 31% | RSI 61

Please provide a comprehensive analysis following the JSON schema exactly.`

const t0 = Date.now()
const res = await client.chat.completions.create({
  model: process.env.LLM_MODEL,
  messages: [
    { role: 'system', content: PROMPT },
    { role: 'user', content: userText },
  ],
  max_tokens: 16000,
  temperature: 0.7,
  response_format: { type: 'json_object' },
  thinking: { type: 'disabled' },
})
const content = res.choices?.[0]?.message?.content ?? ''
console.log(`\nelapsed ${((Date.now() - t0) / 1000).toFixed(1)}s  content=${content.length}c  finish=${res.choices?.[0]?.finish_reason}`)
console.log('usage:', JSON.stringify(res.usage))
console.log('\n--- first 300 chars ---\n' + content.slice(0, 300))
console.log('\n--- last 200 chars ---\n' + content.slice(-200))
fs.writeFileSync('/tmp/ti-real-prompt.out', content)

// sanity: does it unwrap / validate like the route does?
try {
  const parsed = JSON.parse(content)
  const keys = Object.keys(parsed)
  console.log('\nTOP-LEVEL KEYS:', keys.join(', '))
  console.log('has title?', !!parsed.title, '| stocks:', parsed.stocks?.length ?? 'n/a', '| ecosystem.members:', parsed.ecosystem?.members?.length ?? 'n/a')
  if (keys.length === 1 && typeof parsed[keys[0]] === 'string') {
    console.log('⚠️  WRAPPED RESPONSE — single string key:', keys[0])
    try {
      const inner = JSON.parse(parsed[keys[0]])
      console.log('   inner parses OK. inner keys:', Object.keys(inner).join(', '))
    } catch (e) { console.log('   inner NOT valid JSON:', e.message) }
  }
  console.log('\nROUTE VALIDATION:', (parsed?.stocks?.length || parsed?.ecosystem?.members?.length) || parsed?.title ? 'PASS (would complete)' : 'FAIL (route marks thesis failed)')
} catch (e) {
  console.log('\nJSON.parse FAILED:', e.message)
}
