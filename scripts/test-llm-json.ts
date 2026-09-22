/**
 * Unit tests for lib/llm-json.ts — the GLM response repair layer.
 *
 *   node ./node_modules/.bin/tsx scripts/test-llm-json.ts
 *
 * Fixtures are modelled on REAL captured GLM failures (see /tmp/ti-raw-*.txt
 * produced by scripts/smoke-llm-trials.ts).
 */
import { readdirSync, readFileSync } from 'fs'
import { parseLLMJson, isUsableAnalysis } from '../lib/llm-json'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}

const BODY = `"title":"CPO Bottleneck","themeName":"AI Infrastructure","description":"Optics bottleneck.","stocks":[{"ticker":"COHR","companyName":"Coherent","catalysts":["a","b"],"risks":["c","d"]},{"ticker":"LITE","companyName":"Lumentum"}],"overallScore":78,"keyTakeaways":["x","y"]}`

console.log('llm-json parse tests')

// 1. clean response
{
  const r = parseLLMJson(`{${BODY}}`)
  check('clean JSON parses + validates', r.ok && isUsableAnalysis(r.data) && r.data.stocks.length === 2)
}

// 2. envelope wrapper — the exact production failure ("{"answer":"Note: I can provide…")
{
  const raw = `{"answer":"Note: I can provide this analysis, but I want to flag that I cannot verify the data.\\n\\n{${BODY.replace(/"/g, '\\"')}}"}`
  const r = parseLLMJson(raw)
  check('{"answer": "<escaped json>"} unwrapped', r.ok && r.envelope === 'answer' && isUsableAnalysis(r.data), r.reason ?? '')
}

// 3. envelope with RAW newlines inside the string (bad control character failure)
{
  // Real GLM shape: escaped inner quotes, but literal newlines/tabs inside the
  // outer string → `Bad control character in string literal`.
  const inner = '{' + BODY + '}'
  const raw = '{"answer":"Here is the analysis:\n\n' + inner.replace(/"/g, '\\"') + '\n\nLet me know if you need more detail."}'
  const r = parseLLMJson(raw)
  check('envelope + raw control chars recovered', r.ok && isUsableAnalysis(r.data), r.reason ?? '')
}

// 4. markdown fences
{
  const r = parseLLMJson('```json\n{' + BODY + '}\n```')
  check('fenced JSON recovered', r.ok && isUsableAnalysis(r.data))
}

// 5. prose preamble before the object
{
  const r = parseLLMJson('Sure! Here is the analysis:\n{' + BODY + '}')
  check('prose preamble stripped', r.ok && isUsableAnalysis(r.data))
}

// 6. truncated mid-object (max_tokens cut) — should salvage partial analysis
{
  const r = parseLLMJson('{"title":"Truncated One","themeName":"X","description":"d","stocks":[{"ticker":"AAA","companyName":"Aaa","catalysts":["c1"')
  check('truncated object repaired', r.ok && r.repaired === true && r.data.title === 'Truncated One', r.reason ?? '')
}

// 7. trailing commas
{
  const r = parseLLMJson('{"title":"T","themeName":"X","stocks":[{"ticker":"AAA"}],}')
  check('trailing comma dropped', r.ok && isUsableAnalysis(r.data))
}

// 8. genuinely empty
{
  const r = parseLLMJson('')
  check('empty response rejected', !r.ok && r.reason === 'empty response')
}

// 9. prose-only refusal (no JSON at all) must NOT be reported as usable
{
  const r = parseLLMJson('I cannot complete this analysis because the financial data looks unverified.')
  check('prose refusal rejected', !r.ok)
}

// 10. unrelated JSON object must not be mistaken for an analysis
{
  const r = parseLLMJson('{"error":"rate limited","code":429}')
  check('non-analysis JSON rejected', !r.ok)
}

// 11. DOUBLE-encoded envelope: value is itself an escaped JSON string
//     (real GLM sample /tmp/ti-raw-2.txt: {"answer":"\n{\n  \"title\": …"})
{
  const inner = JSON.stringify(JSON.parse('{' + BODY), null, 2) // pretty JSON text
  const doubleEncoded = JSON.stringify(inner).slice(1, -1)             // escaped as a string body
  const raw = '{"answer":"' + doubleEncoded + '"}'
  const r = parseLLMJson(raw)
  check('double-encoded envelope recovered', r.ok && r.envelope === 'answer' && isUsableAnalysis(r.data), r.reason ?? '')
}

// 12. replay any real captured raw samples
const dir = '/tmp'
const raws = readdirSync(dir).filter(f => /^ti-raw-\d+\.txt$/.test(f))
if (raws.length) {
  console.log(`replaying ${raws.length} captured raw sample(s) from ${dir}`)
  for (const f of raws) {
    const raw = readFileSync(`${dir}/${f}`, 'utf8')
    const r = parseLLMJson(raw)
    console.log(`  ${f}: ${raw.length} chars -> ${r.ok && isUsableAnalysis(r.data) ? 'usable' : 'NOT usable'} (envelope=${r.envelope ?? 'none'}${r.repaired ? ', repaired' : ''})${r.reason ? ' reason=' + r.reason : ''}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
