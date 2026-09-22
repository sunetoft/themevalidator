// Smoke test: replicate the /api/analyze LLM call shape and report what comes back.
// Usage: node --env-file=.env scripts/smoke-llm.mjs [--big]
import OpenAI from 'openai'

const base = process.env.ZAI_BASE_URL
const model = process.env.LLM_MODEL
const key = process.env.ZAI_API_KEY || process.env.GLM_API_KEY
console.log('baseURL =', base)
console.log('model   =', model)
console.log('keyLen  =', (key || '').length)

const client = new OpenAI({ apiKey: key, baseURL: base })

const small = 'Return JSON {"ok":true,"note":"hello"}. Nothing else.'

const big = `Investment Thesis to Analyze:

Supply bottleneck in photonics CPO manufacturing. As AI bandwidth demands exceed 51.2T and approach 102T, co-packaged optics (CPO) become the only viable path. Silicon photonics players with vertical integration in laser and packaging capture outsized margins. Basket: COHR, LITE, MRVL, AVGO, POET, CRDO.

Source URL: https://example.com/cpo-thesis

FINANCIAL DATA:
Ticker: COHR | P/E 41.2 | Rev growth 23% | Gross margin 38% | RSI 58
Ticker: LITE | P/E 28.4 | Rev growth 12% | Gross margin 31% | RSI 61
Ticker: MRVL | P/E 55.1 | Rev growth 40% | Gross margin 60% | RSI 66

Please provide a comprehensive analysis following the JSON schema exactly.`

for (const [label, prompt, maxTokens] of [['SMALL', small, 512], ['LARGE', big, 16000]]) {
  for (const thinking of ['disabled', 'enabled']) {
    const t0 = Date.now()
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a JSON-only assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        thinking: { type: thinking },
      })
      const msg = res.choices?.[0]?.message
      const content = msg?.content ?? ''
      const reasoning = msg?.reasoning_content ?? ''
      console.log(
        `${label} thinking=${thinking}: ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
        `content=${content.length}c reasoning=${reasoning.length}c ` +
        `finish=${res.choices?.[0]?.finish_reason} usage=${JSON.stringify(res.usage)}`
      )
      if (content.length === 0) console.log('   ⚠️  EMPTY CONTENT')
    } catch (e) {
      console.log(`${label} thinking=${thinking}: ERROR ${e?.status ?? ''} ${e?.message?.slice(0, 300)}`)
    }
  }
}
