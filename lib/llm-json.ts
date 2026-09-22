/**
 * Robust parsing of LLM (GLM / Z.AI) analysis responses.
 *
 * Why this exists
 * ---------------
 * `glm-5.x` on Z.AI's OpenAI-compatible endpoints is not reliable about the
 * requested JSON shape when `response_format: { type: "json_object" }` is set.
 * Observed failure modes on the /api/analyze prompt (all of which previously
 * produced "LLM analysis returned empty response"):
 *
 *   1. Envelope wrapper — the model answers with the whole analysis as a STRING
 *      inside a single key: `{"answer": "Note: I cannot verify the 'REAL-TIME
 *      FINANCIAL DATA'… {\"title\":\"…\"}"}`. A plain JSON.parse() succeeds, but
 *      the route's validator (`stocks.length || ecosystem.members.length` and
 *      `title`) then fails because the real payload is one level deeper.
 *   2. Raw control characters — the inner JSON contains literal newlines/tabs
 *      inside string literals → `Bad control character in string literal`.
 *   3. Truncation — output stops mid-object → `Unexpected end of JSON input` or
 *      `Expected ',' or '}' after property value`.
 *   4. Markdown fences / prose preamble around the JSON object.
 *
 * Used by: app/api/analyze/route.ts, app/api/theses/[id]/retry/route.ts,
 * app/api/theses/[id]/add-ticker/route.ts, lib/reanalyze.ts.
 */

/** Keys the model has been observed using to wrap the real payload. */
const ENVELOPE_KEYS = [
  'answer', 'result', 'response', 'output', 'text', 'content',
  'data', 'analysis', 'json', 'payload', 'message', 'final',
]

export interface ParseResult {
  /** True when we produced a usable object. */
  ok: boolean
  /** Best-effort parsed object (never null when ok === true). */
  data: any
  /** Envelope key that had to be unwrapped, e.g. "answer". */
  envelope?: string
  /** True when sanitizing/repair (not just JSON.parse) was required. */
  repaired?: boolean
  /** Human-readable reason when ok === false. */
  reason?: string
  /** Raw content length, for logging. */
  length: number
}

/** Strip ```json fences and any prose before the first `{`. */
function stripFences(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) s = fence[1].trim()
  // Drop a leading preamble line that is not JSON (e.g. "Here is the analysis:")
  const firstBrace = s.indexOf('{')
  if (firstBrace > 0) {
    const head = s.slice(0, firstBrace)
    // only drop it if it does not look like it is inside a JSON string
    if (!/[{["]/.test(head)) s = s.slice(firstBrace)
  }
  return s
}

/**
 * Escape raw control characters that appear INSIDE JSON string literals while
 * leaving the document structure untouched. This is the fix for
 * "Bad control character in string literal in JSON at position N".
 */
function escapeControlCharsInStrings(s: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString && ch.charCodeAt(0) < 0x20) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
      continue
    }
    out += ch
  }
  return out
}

/**
 * Normalise escape sequences that GLM leaves in *structural* positions —
 * outside of string literals — when it double-encodes part of its output
 * (e.g. `"medium",\n        "affectedCompanies"` where `\n` is a literal
 * backslash-n rather than whitespace). Legit escapes INSIDE strings are kept.
 */
function normalizeStructuralEscapes(s: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      out += ch
      if (ch === '\\' && i + 1 < s.length) { out += s[i + 1]; i++; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '\\' && i + 1 < s.length) {
      const next = s[i + 1]
      if (next === 'n') { out += '\n'; i++; continue }
      if (next === 't') { out += '\t'; i++; continue }
      if (next === 'r') { out += '\r'; i++; continue }
      if (next === '"') { out += '"'; i++; continue }
      if (next === '\\') { out += '\\'; i++; continue }
      out += ch
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    out += ch
  }
  return out
}

/** Remove trailing commas before } or ]. */
function dropTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Repair the small syntax slips GLM makes when it writes long JSON by hand.
 * Only ever applied AFTER a normal JSON.parse has already failed.
 *
 * Observed in production (/tmp/ti-raw-2.txt):
 *   "pricingPowerBenefit":"": "medium"   ← stray empty key + colon
 */
function fuzzyRepair(s: string): string {
  return s
    // Duplicated colon after a key — GLM emits `"key":"": value` or `"key":": value`
    // or `"key":\"": value`. All are the same slip → collapse to `"key": value`.
    .replace(/"([^"\\\n]{0,80})"\s*:\s*(?:\\?"\s*){1,2}:\s*/g, '"$1": ')
    // "key":,           →  "key": null,
    .replace(/"([^"\\\n]{0,80})"\s*:\s*,/g, '"$1": null,')
    // "key":} / "key":] →  "key": null} / "key": null]
    .replace(/"([^"\\\n]{0,80})"\s*:\s*(?=[}\]])/g, '"$1": null')
    // missing comma between properties:  "a": 1\n  "b": 2  →  "a": 1,\n  "b": 2
    .replace(/(["}\]0-9]|true|false|null)[ \t]*\n[ \t]*"/g, '$1,\n"')
    // duplicated block opener on its own line:  "},\n  {\n    {\n  "name": …  → drop one
    // (line-anchored so strings containing "{ {" are left alone)
    .replace(/(^|\n)([ \t]*)\{\s*\n([ \t]*)\{/g, '$1$2{')
    .replace(/(^|\n)([ \t]*)\[\s*\n([ \t]*)\[/g, '$1$2[')
}

/**
 * Extract the first balanced {...} block, tracking string/escape state.
 * Returns the substring and whether the block was closed.
 */
function balancedObject(s: string): { text: string; closed: boolean } | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { text: s.slice(start, i + 1), closed: true }
    }
  }
  return { text: s.slice(start), closed: false }
}

/** Close unterminated strings/objects/arrays after a truncated generation. */
function closeTruncated(s: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = s.replace(/[,\s]+$/, '')
  if (inString) out += '"'
  // A truncated key/value pair ("…, "foo": ") needs a placeholder value.
  if (/:\s*$/.test(out)) out += 'null'
  out = out.replace(/,\s*$/, '')
  // Close in reverse order of opening (stack top first).
  while (stack.length) out += stack.pop()
  return out
}

function looksLikeAnalysis(o: any): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  if (o.title && (o.stocks?.length || o.ecosystem || o.description)) return true
  if (o.stocks?.length || o.ecosystem?.members?.length) return true
  return false
}

/** One full repair pass: structural escapes → control chars → trailing commas → fuzzy. */
function fullRepair(s: string): string {
  return fuzzyRepair(dropTrailingCommas(escapeControlCharsInStrings(normalizeStructuralEscapes(s))))
}

/** Try to parse, applying progressively more aggressive repair. */
function attemptParse(s: string, trace?: string[]): { value?: any; variant?: string; error?: string } {
  // Repair passes are applied repeatedly: a later pass sees the string state
  // that an earlier pass fixed (e.g. a stray quote re-aligns string boundaries,
  // which lets the next pass normalise structural `\n` sequences).
  const passes = [s, fullRepair(s), fullRepair(fullRepair(s)), fullRepair(fullRepair(fullRepair(s)))]
  const variants: Array<[string, string]> = [
    ['as-is', passes[0]],
    ['control-chars-escaped', escapeControlCharsInStrings(passes[0])],
    ['trailing-commas-dropped', dropTrailingCommas(escapeControlCharsInStrings(passes[0]))],
    ['full-repair-1', passes[1]],
    ['full-repair-2', passes[2]],
    ['full-repair-3', passes[3]],
  ]
  let lastError = 'no attempt made'
  for (const [name, v] of variants) {
    try {
      const parsed = JSON.parse(v)
      trace?.push(`${name}: OK`)
      return { value: parsed, variant: name }
    } catch (e: any) {
      lastError = e?.message ?? String(e)
      trace?.push(`${name}: ${lastError}`)
    }
  }
  const bal = balancedObject(s)
  if (bal) {
    const fixed = closeTruncated(fullRepair(bal.text))
    try {
      const parsed = JSON.parse(fixed)
      trace?.push('truncation-repaired: OK')
      return { value: parsed, variant: 'truncation-repaired' }
    } catch (e: any) {
      lastError = e?.message ?? String(e)
      trace?.push(`truncation-repaired (${fixed.length} chars): ${lastError}`)
    }
  }
  return { error: lastError }
}

/**
 * Diagnostic helper: human-readable list of every parse/repair attempt and why
 * each failed. Used by scripts/test-llm-json.ts and for ops debugging.
 */
export function explainLLMJsonParse(raw: string): string[] {
  const trace: string[] = []
  const cleaned = stripFences(raw)
  const { value } = attemptParse(cleaned, trace)
  if (value && typeof value === 'object' && !Array.isArray(value) && !looksLikeAnalysis(value)) {
    trace.push(`outer JSON keys: ${Object.keys(value).slice(0, 8).join(',')}`)
    for (const key of Object.keys(value)) {
      const inner = (value as any)[key]
      if (typeof inner === 'string' && inner.length >= 40 && inner.includes('{')) {
        trace.push(`-- envelope "${key}" (${inner.length} chars)`)
        attemptParse(stripFences(inner), trace)
        const un = unescapeDoubleEncoded(inner)
        if (un && un !== inner) {
          trace.push(`-- envelope "${key}" double-unescaped (${un.length} chars)`)
          attemptParse(stripFences(un), trace)
        }
      }
    }
  }
  return trace
}

/**
 * GLM sometimes double-encodes: the envelope value is an *escaped* JSON string
 * (`\n{\n  \"title\": …`), so it needs one extra unescape round before parsing.
 * Returns null when the value is not double-encoded.
 */
function unescapeDoubleEncoded(inner: string): string | null {
  try {
    const wrapped = '"' + inner
      .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"'
    const out = JSON.parse(wrapped)
    return typeof out === 'string' ? out : null
  } catch {
    return null
  }
}

/**
 * Parse an LLM response into the analysis object.
 * Handles envelopes, control chars, truncation and markdown fences.
 */
export function parseLLMJson(raw: string): ParseResult {
  const length = raw?.length ?? 0
  if (!raw || !raw.trim()) return { ok: false, data: null, reason: 'empty response', length }

  const cleaned = stripFences(raw)
  const { value, variant, error } = attemptParse(cleaned)
  const neededWork = variant !== undefined && variant !== 'as-is'

  if (value && looksLikeAnalysis(value)) {
    return { ok: true, data: value, repaired: neededWork || cleaned !== raw.trim(), length }
  }

  // --- envelope unwrap: {"answer": "<json | escaped json | prose+json>"} ------
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      const inner = (value as any)[key]
      if (typeof inner !== 'string' || inner.length < 40 || !inner.includes('{')) continue

      const candidates: string[] = [inner]
      const unescaped = unescapeDoubleEncoded(inner)
      if (unescaped && unescaped !== inner) candidates.push(unescaped)

      for (const text of candidates) {
        const ast = attemptParse(stripFences(text))
        if (ast.value && looksLikeAnalysis(ast.value)) {
          return { ok: true, data: ast.value, envelope: key, repaired: true, length }
        }
        // The candidate may itself be truncated mid-object — salvage it.
        const bal = balancedObject(text)
        if (bal) {
          const fixed = closeTruncated(dropTrailingCommas(escapeControlCharsInStrings(bal.text)))
          try {
            const v = JSON.parse(fixed)
            if (looksLikeAnalysis(v)) return { ok: true, data: v, envelope: key, repaired: true, length }
          } catch { /* try next candidate */ }
        }
      }
    }
    // Parsed fine but is not an analysis — surface what we did get so the
    // caller can log/return a meaningful error instead of "empty response".
    const keys = Object.keys(value).slice(0, 6).join(',')
    return {
      ok: false,
      data: value,
      reason: ENVELOPE_KEYS.some(k => k in (value as any))
        ? `unwrapped envelope keys [${keys}] but no analysis payload inside`
        : `JSON parsed but missing analysis fields (keys: ${keys})`,
      length,
    }
  }

  // Last resort: scrape the first balanced object out of the raw text.
  const bal = balancedObject(cleaned)
  if (bal) {
    const fixed = closeTruncated(dropTrailingCommas(escapeControlCharsInStrings(bal.text)))
    try {
      const v = JSON.parse(fixed)
      if (looksLikeAnalysis(v)) return { ok: true, data: v, repaired: true, length }
    } catch { /* ignore */ }
  }

  return { ok: false, data: null, reason: error ?? 'unparseable JSON', repaired: true, length }
}

/** Convenience wrapper: does this parsed result carry a usable analysis? */
export function isUsableAnalysis(d: any): boolean {
  return !!(d && typeof d === 'object' && (d.stocks?.length || d.ecosystem?.members?.length) && d.title)
}
