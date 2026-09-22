#!/usr/bin/env node
/**
 * End-to-end smoke test for /api/analyze on a running ThemeInvestor instance.
 *
 *   node scripts/smoke-e2e.mjs [--base http://localhost:3001] [--scenario text|url|both]
 *
 * Logs in with the throwaway smoke-test user, POSTs a realistic thesis via both
 * input modes, consumes the SSE progress stream, and reports PASS/FAIL per stage.
 * Exit code = number of failed scenarios.
 */
const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const BASE = arg('--base', 'http://localhost:3001')
const SCENARIO = arg('--scenario', 'both')
const EMAIL = 'smoketest@stdigital.dk'
const PASSWORD = 'SmokeTest!2026'
const TIMEOUT_MS = Number(arg('--timeout', '300')) * 1000

const TEXT_THESIS = `Uranium enrichment capacity is the real chokepoint of the nuclear renaissance, not mining.
Western enrichment is dominated by one Russian state supplier; HALEU for advanced SMRs is in structural
deficit through 2030 and the DOE is paying up for domestic capacity. Utilities that locked long-term
enrichment contracts at pre-2022 prices are insulated, while merchant enrichers with new centrifuge
capacity capture enormous pricing power. Basket: LEU, CCJ, SMR, OKLO, UEC, NXE, EU.
Key catalysts: DOE HALEU awards, Russian import ban enforcement, SMR NRC licensing milestones,
long-term utility contracting above $80/lb. Risks: demand destruction from gas, accident risk,
policy reversal on the import ban.`

const URL_THESIS = 'https://www.energy.gov/ne/articles/haleu-availability-accelerating-advanced-nuclear'

let cookie = ''

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie } })
  const setCookie = csrfRes.headers.getSetCookie?.() ?? []
  const { csrfToken } = await csrfRes.json()
  cookie = setCookie.map(c => c.split(';')[0]).join('; ')

  const body = new URLSearchParams({
    csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/dashboard`, json: 'true',
  })
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, 'X-Auth-Return-Redirect': '1' },
    body,
  })
  const more = res.headers.getSetCookie?.() ?? []
  for (const c of more) {
    const kv = c.split(';')[0]
    const name = kv.split('=')[0]
    cookie = cookie.split('; ').filter(x => !x.startsWith(name + '=')).concat(kv).join('; ')
  }
  const session = await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json()
  const ok = !!(session?.user?.email)
  console.log(`[login] ${ok ? 'OK' : 'FAILED'} as ${session?.user?.email ?? 'anonymous'} (cookie len ${cookie.length})`)
  return ok
}

async function runScenario(name, payload) {
  console.log(`\n===== SCENARIO: ${name} =====`)
  const t0 = Date.now()
  const events = []
  let thesisId = null
  let outcome = null
  let message = null

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(payload),
      signal: ac.signal,
    })
    console.log(`[${name}] HTTP ${res.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    if (!res.ok) {
      console.log(`[${name}] body:`, (await res.text()).slice(0, 300))
      outcome = `FAIL:http-${res.status}`
    } else {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let lastEvent = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') { events.push({ t: Date.now() - t0, kind: 'DONE' }); continue }
          let p
          try { p = JSON.parse(raw) } catch { continue }
          if (p.status !== lastEvent) {
            console.log(`[${name}] +${((Date.now() - t0) / 1000).toFixed(1)}s ${p.status}: ${String(p.message ?? '').slice(0, 70)}`)
            lastEvent = p.status
          }
          events.push({ t: Date.now() - t0, kind: p.status })
          if (p.thesisId) thesisId = p.thesisId
          if (p.status === 'completed') outcome = 'completed'
          if (p.status === 'error') { outcome = 'error'; message = p.message }
        }
      }
    }
  } catch (e) {
    console.log(`[${name}] EXCEPTION after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e?.name} ${e?.message}`)
    outcome = outcome ?? `FAIL:${e?.name}`
  } finally {
    clearTimeout(timer)
  }

  const secs = (Date.now() - t0) / 1000
  console.log(`[${name}] outcome=${outcome ?? 'stream-ended-without-completed'} thesisId=${thesisId} elapsed=${secs.toFixed(1)}s events=${events.length}`)
  if (message) console.log(`[${name}] error message: ${message}`)
  return { name, outcome, thesisId, secs }
}

const ok = await login()
if (!ok) process.exit(9)

const results = []
if (SCENARIO === 'text' || SCENARIO === 'both') {
  results.push(await runScenario('text', { inputType: 'text', text: TEXT_THESIS }))
}
if (SCENARIO === 'url' || SCENARIO === 'both') {
  results.push(await runScenario('url', { inputType: 'url', url: URL_THESIS, text: `Analyze the investment thesis from this URL: ${URL_THESIS}` }))
}

console.log('\n===== SUMMARY =====')
for (const r of results) {
  console.log(`${r.outcome === 'completed' ? '✅ PASS' : '❌ FAIL'}  ${r.name.padEnd(5)} ${r.outcome} (${r.secs.toFixed(1)}s) thesis=${r.thesisId}`)
}
process.exit(results.filter(r => r.outcome !== 'completed').length)
