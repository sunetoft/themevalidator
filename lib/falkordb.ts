/**
 * Theme graph export — ThemeInvestor → value-chain-trade *seed*.
 *
 * This module no longer writes Cypher to FalkorDB.
 *
 * A thesis analysis is not a graph-authoring artefact. It has no supplier→customer
 * relationships, no country, and its "bottlenecks" are market conditions rather than
 * sellable products. Writing it straight into FalkorDB is what produced the graphs
 * reviewed in the value-chain-trade guide: **no `SUPPLIES_TO` edges**, no `country` on
 * any Company, `''` instead of null, `confidence: medium` on every edge, and nonsense
 * like `CEG -[:PRODUCES]-> Nuclear Workforce Shortage`.
 *
 * Instead we emit a **seed** in the schema the value-chain-trade loader validates:
 *
 *   <VALUE_CHAIN_ROOT>/seed_incoming/<theme_id>/{themes,products,companies,edges}.yaml
 *
 * …and hand it to `scripts/load_seed.py --strict`, which merges it into the shared
 * theme graph **only** if it satisfies the guide's checklist. Anything incomplete stays
 * on disk as a draft, with `VALIDATION.md` stating exactly what a curator must add.
 * The value here is the honest gap report, not a silent write.
 *
 * Usage:
 *   import { exportThesisToSeed } from '@/lib/falkordb'
 *   const result = await exportThesisToSeed(thesis)
 */

import { execFile } from 'child_process'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const VALUE_CHAIN_ROOT =
  process.env.VALUE_CHAIN_ROOT || '/Users/sune/projects/value-chain-trade'
const PYTHON_BIN = process.env.PYTHON_BIN || '/Users/Shared/Hermes/venv/bin/python3'
// Themes that share a supply base live in the SAME graph so company nodes are shared
// and cross-theme queries work. Never create a graph per theme — that is the bug.
const TARGET_GRAPH = process.env.FALKORDB_GRAPH || 'grid'
const SEED_SOURCE = 'themeinvestor/thesis-analysis (LLM-derived, unverified)'

export interface ThesisForGraph {
  id: string
  title: string
  description: string
  themeId?: string | null
  sentimentData?: any
  ecosystemData?: any
  externalFactors?: any
  bottlenecks?: any
  valuationData?: any
  financialData?: any
  theme?: { name: string; description: string; slug?: string | null }
}

export interface SeedExportResult {
  success: boolean
  status: 'loaded' | 'draft' | 'error'
  graph: string
  themeId: string
  seedDir: string
  counts: { companies: number; exposedTo: number; products: number; suppliesTo: number }
  /** why the seed is still a draft — empty when it loaded */
  problems: string[]
  /** structural gaps in the source analysis, independent of the gate */
  notes: string[]
  error?: string
}

/* ── helpers ───────────────────────────────────────────────────────────── */

/** Collapse whitespace: keeps single-quoted YAML scalars on one line. */
function clean(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

export function themeIdFor(themeName: string): string {
  return themeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 64)
}

/**
 * Tier is *position in the chain*, not conviction (guide: "Tiers mean position in the
 * chain, not conviction"). A competitor is not in the chain at all, so it gets no tier
 * — the old code mapped `competitor` to tier 3, which is meaningless.
 */
export function roleToTier(role: string | null | undefined): 1 | 2 | 3 | null {
  const r = clean(role).toLowerCase()
  if (!r) return null
  if (/(end.?user|end.?system|integrator|operator|hyperscaler|oem|infrastructure provider|platform)/.test(r)) return 1
  if (/(supplier|component|enabler|subsystem|equipment|semiconductor|device)/.test(r)) return 2
  if (/(raw material|materials|\bminer|mining|refin|smelt|upstream)/.test(r)) return 3
  // competitor / customer / beneficiary / unclear → not a position in the chain
  return null
}

/** Whether a *curated* seed already owns this theme — never clobber it. */
async function curatedSeedExists(graph: string, themeId: string): Promise<boolean> {
  try {
    const p = path.join(VALUE_CHAIN_ROOT, `seed_${graph}`, 'themes.yaml')
    const body = await readFile(p, 'utf8')
    return new RegExp(`^\\s*-?\\s*id:\\s*['"]?${themeId}['"]?\\s*$`, 'm').test(body)
  } catch {
    return false
  }
}

/** yfinance-backed: country / currency / whole-EUR market cap for the schema. */
async function resolveTickers(
  tickers: string[]
): Promise<Record<string, any>> {
  if (!tickers.length) return {}
  const script = path.join(VALUE_CHAIN_ROOT, 'scripts', 'resolve_tickers.py')
  const { stdout } = await execFileAsync(PYTHON_BIN, [script, ...tickers], {
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(stdout.trim() || '{}')
}

/** State of a previously exported draft (written by exportThesisToSeed). */
export async function readSeedStatus(
  themeId: string
): Promise<{ exists: boolean; status?: string; problems: number; problemList: string[] }> {
  try {
    const p = path.join(VALUE_CHAIN_ROOT, 'seed_incoming', themeId, 'VALIDATION.md')
    const md = await readFile(p, 'utf8')
    const status = /- \*\*Status:\*\*\s*([A-Z]+)/.exec(md)?.[1]
    const section = /## Blocking problems\n([\s\S]*?)(?=\n## |$)/.exec(md)?.[1] || ''
    const problemList = section
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
    return { exists: true, status, problems: problemList.length, problemList }
  } catch {
    return { exists: false, problems: 0, problemList: [] }
  }
}

/* ── dependency-free YAML emitter ──────────────────────────────────────── */

function yQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

function yKey(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : yQuote(k)
}

function yValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return yQuote(clean(v))
}

/** Serialise a list of flat records as a top-level YAML sequence. */
export function toYaml(rows: Record<string, unknown>[]): string {
  const lines: string[] = []
  for (const row of rows) {
    let first = true
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined || v === '') continue
      const prefix = first ? '- ' : '  '
      if (Array.isArray(v)) {
        if (!v.length) continue
        lines.push(`${prefix}${yKey(k)}:`)
        for (const item of v) lines.push(`${prefix === '- ' ? '  ' : '    '}- ${yValue(item)}`)
      } else {
        lines.push(`${prefix}${yKey(k)}: ${yValue(v)}`)
      }
      first = false
    }
  }
  return lines.join('\n') + '\n'
}

export function toYamlSections(sections: Record<string, Record<string, unknown>[]>): string {
  const out: string[] = []
  for (const [name, rows] of Object.entries(sections)) {
    if (!rows.length) {
      out.push(`${name}: []`)
      continue
    }
    out.push(`${name}:`)
    out.push(toYaml(rows))
  }
  return out.join('\n')
}

/* ── mapping ───────────────────────────────────────────────────────────── */

export interface SeedDraft {
  status: 'emerging' | 'accelerating' | 'mature' | 'declining'
  themes: Record<string, unknown>[]
  products: Record<string, unknown>[]
  companies: Record<string, unknown>[]
  edges: Record<string, Record<string, unknown>[]>
  notes: string[]
}

const TODAY = () => new Date().toISOString().split('T')[0]

function mapStatus(sentiment: any): SeedDraft['status'] {
  const overall = clean(sentiment?.overall).toLowerCase()
  if (overall === 'bullish') return 'accelerating'
  if (overall === 'bearish' || overall === 'declining') return 'declining'
  // the contract has no "stable" — a thesis under analysis is not yet mature
  return 'emerging'
}

export function buildSeed(thesis: ThesisForGraph, resolved: Record<string, any>): SeedDraft {
  const ecosystem = thesis.ecosystemData || {}
  const sentiment = thesis.sentimentData || {}
  const external = thesis.externalFactors || {}
  const bottlenecks = thesis.bottlenecks || {}

  const themeName =
    ecosystem.themeName || sentiment.themeName || thesis.theme?.name || thesis.title || 'Unknown Theme'
  const themeId = themeIdFor(thesis.theme?.slug || themeName)

  const members: any[] = ecosystem.members || ecosystem.ecosystem || []
  const bottleItems: any[] = bottlenecks.items || []
  const factors: any[] = external.factors || []

  const notes: string[] = []
  const problemsSeen: string[] = []

  /* ── companies + EXPOSED_TO ── */
  const companies: Record<string, unknown>[] = []
  const exposedTo: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const member of members) {
    const ticker = clean(member?.ticker).toUpperCase().replace('$', '')
    if (!ticker) {
      problemsSeen.push(`skipped a member with no ticker (${clean(member?.companyName) || 'unnamed'})`)
      continue
    }
    if (seen.has(ticker)) continue
    seen.add(ticker)

    const tier = roleToTier(member?.role)
    if (tier === null) {
      problemsSeen.push(
        `skipped ${ticker}: role ${JSON.stringify(clean(member?.role))} is not a position in the supply chain (competitor/customer/unclear)`
      )
      continue
    }

    // Country is REQUIRED by the schema and the LLM never supplies it.
    const r = resolved[ticker] || {}
    if (r.error || !r.country) {
      problemsSeen.push(
        `skipped ${ticker}: could not resolve a country (${clean(r.error) || 'no data'}) — Company nodes require a real ISO-2 country, never an empty string`
      )
      continue
    }

    const description = clean(member?.competency || member?.notes)
    const company: Record<string, unknown> = {
      ticker,
      name: clean(r.name || member?.companyName) || ticker,
      country: r.country,
      is_listed: true,
      last_updated: TODAY(),
      source: SEED_SOURCE,
    }
    if (r.exchange) company.exchange = clean(r.exchange)
    if (r.currency) company.currency = clean(r.currency)
    if (r.sector_gics) company.sector_gics = clean(r.sector_gics)
    if (r.industry_gics) company.industry_gics = clean(r.industry_gics)
    if (typeof r.market_cap_eur === 'number') company.market_cap_eur = r.market_cap_eur
    if (description) company.description = description
    companies.push(company)

    exposedTo.push({
      company: ticker,
      theme: themeId,
      tier,
      growth_alignment: 'positive',
      // `low` is the honest value: this is an LLM inference with no cited evidence.
      confidence: 'low',
      rationale:
        description ||
        `Listed in the thesis ecosystem analysis with role ${JSON.stringify(clean(member?.role))}; no supporting evidence recorded.`,
      source: `ThemeInvestor thesis "${clean(thesis.title)}" (LLM-generated, unverified)`,
      last_verified: TODAY(),
    })
  }

  /* ── products ── */
  const products: Record<string, unknown>[] = []
  if (bottleItems.length) {
    notes.push(
      `${bottleItems.length} bottleneck item(s) were folded into Theme.key_risks instead of becoming Product nodes — ` +
        `they describe market conditions ("workforce shortage", "licensing backlog"), and a Product must be something a company can invoice for.`
    )
  }

  /* ── theme ── */
  const keyRisks = [
    ...factors.filter((f) => clean(f?.impact).toLowerCase() === 'negative').map((f) => clean(f?.name)),
    ...bottleItems.map((b) =>
      clean(b?.description) ? `${clean(b?.name)} — ${clean(b?.description)}` : clean(b?.name)
    ),
  ].filter(Boolean).slice(0, 12)

  const theme: Record<string, unknown> = {
    id: themeId,
    name: clean(themeName),
    status: mapStatus(sentiment),
    description: clean(thesis.description || thesis.theme?.description),
    thesis_summary: clean(`${thesis.title}. ${sentiment.summary || ''}`).substring(0, 1000),
    key_catalysts: (sentiment.keySignals || []).map(clean).filter(Boolean).slice(0, 10),
    key_risks: keyRisks,
    last_updated: TODAY(),
  }

  notes.push(
    'no SUPPLIES_TO edges: a thesis analysis contains no supplier→customer relationships, so the supply chain has to be researched before this theme can load.'
  )
  notes.push(
    'every EXPOSED_TO carries confidence "low" and a rationale from the LLM analysis — replace with cited evidence (filings, named-customer press releases) during curation.'
  )
  if (problemsSeen.length) notes.push(...problemsSeen.map((p) => `member dropped: ${p}`))

  return {
    status: mapStatus(sentiment),
    themes: [theme],
    products,
    companies,
    edges: { exposed_to: exposedTo, supplies_to: [], produces: [], owns: [] },
    notes,
  }
}

/* ── export ────────────────────────────────────────────────────────────── */

export async function exportThesisToSeed(thesis: ThesisForGraph): Promise<SeedExportResult> {
  const themeName =
    thesis.ecosystemData?.themeName ||
    thesis.sentimentData?.themeName ||
    thesis.theme?.name ||
    thesis.title ||
    'unknown_theme'
  const themeId = themeIdFor(thesis.theme?.slug || themeName)
  const graph = TARGET_GRAPH

  const result: SeedExportResult = {
    success: false,
    status: 'error',
    graph,
    themeId,
    seedDir: '',
    counts: { companies: 0, exposedTo: 0, products: 0, suppliesTo: 0 },
    problems: [],
    notes: [],
  }

  try {
    if (await curatedSeedExists(graph, themeId)) {
      result.status = 'draft'
      result.problems = [
        `theme '${themeId}' is already owned by a curated seed (seed_${graph}/) — refusing to overwrite it. ` +
          'Add curated facts there by hand instead.',
      ]
      return result
    }

    const members: any[] = thesis.ecosystemData?.members || []
    const tickers = members.map((m) => clean(m?.ticker).toUpperCase().replace('$', '')).filter(Boolean)
    let resolved: Record<string, any> = {}
    let resolveError: string | undefined
    try {
      resolved = await resolveTickers([...new Set(tickers)])
    } catch (e: any) {
      resolveError = e?.message || String(e)
    }

    const draft = buildSeed(thesis, resolved)
    result.notes = draft.notes
    if (resolveError) {
      result.notes.push(`ticker resolution failed (${clean(resolveError)}) — country/market cap omitted`)
    }

    const seedDir = path.join(VALUE_CHAIN_ROOT, 'seed_incoming', themeId)
    await mkdir(seedDir, { recursive: true })
    await writeFile(path.join(seedDir, 'themes.yaml'), toYaml(draft.themes), 'utf8')
    await writeFile(path.join(seedDir, 'products.yaml'), toYaml(draft.products), 'utf8')
    await writeFile(path.join(seedDir, 'companies.yaml'), toYaml(draft.companies), 'utf8')
    await writeFile(path.join(seedDir, 'edges.yaml'), toYamlSections(draft.edges), 'utf8')

    result.seedDir = seedDir
    result.counts = {
      companies: draft.companies.length,
      exposedTo: draft.edges.exposed_to.length,
      products: draft.products.length,
      suppliesTo: draft.edges.supplies_to.length,
    }

    // The loader is the gate: it validates the schema, checks references and only
    // writes when the guide's checklist passes (--strict).
    const loader = path.join(VALUE_CHAIN_ROOT, 'scripts', 'load_seed.py')
    let loaderOut = ''
    let loaderOk = false
    try {
      const { stdout } = await execFileAsync(
        PYTHON_BIN,
        [loader, '--graph', graph, '--seed-dir', seedDir, '--strict', '--preserve-existing', '--json'],
        { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 }
      )
      loaderOut = stdout
      loaderOk = true
    } catch (e: any) {
      loaderOut = e?.stdout || ''
      loaderOk = false
      if (!loaderOut && (e?.stderr || e?.message)) {
        loaderOut = JSON.stringify({ ok: false, problems: [clean(e?.stderr || e?.message)] })
      }
    }

    let parsed: any = {}
    try {
      parsed = JSON.parse(String(loaderOut).trim().split('\n').pop() || '{}')
    } catch {
      parsed = { ok: false, problems: ['loader produced no parsable output'] }
    }

    result.problems = parsed.problems || []
    result.status = loaderOk && parsed.ok ? 'loaded' : 'draft'
    result.success = result.status === 'loaded'

    await writeFile(
      path.join(seedDir, 'VALIDATION.md'),
      validationReport(thesis, graph, themeId, result, parsed),
      'utf8'
    )
    return result
  } catch (err: any) {
    result.status = 'error'
    result.error = err?.message || 'Unknown error'
    console.error('Theme seed export error:', result.error)
    return result
  }
}

function validationReport(
  thesis: ThesisForGraph,
  graph: string,
  themeId: string,
  result: SeedExportResult,
  parsed: any
): string {
  const lines = [
    `# Seed validation — ${themeId}`,
    '',
    `- **Thesis:** ${clean(thesis.title)} (\`${thesis.id}\`)`,
    `- **Target graph:** \`${graph}\``,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Status:** ${result.status.toUpperCase()}${result.success ? ' — merged into the graph' : ' — not written'}`,
    `- **Loader stage:** ${parsed.stage || 'n/a'}`,
    '',
    '## Counts',
    '',
    `| themes | companies | products | EXPOSED_TO | SUPPLIES_TO |`,
    `|---|---|---|---|---|`,
    `| 1 | ${result.counts.companies} | ${result.counts.products} | ${result.counts.exposedTo} | ${result.counts.suppliesTo} |`,
    '',
  ]

  if (result.problems.length) {
    lines.push('## Blocking problems', '', ...result.problems.map((p) => `- ${p}`), '')
  } else {
    lines.push('## Blocking problems', '', '_none — the checklist passed._', '')
  }

  if (result.notes.length) {
    lines.push('## Notes on the source analysis', '', ...result.notes.map((n) => `- ${n}`), '')
  }

  lines.push(
    '## To finish this theme',
    '',
    '1. Add the sellable **Products** this chain needs (something a company can invoice for),',
    '   each with a `category` and a `bottleneck_status`.',
    '2. Add **`supplies_to`** edges (`supplier` → `customer` → `product`) with a concrete',
    '   `source` and a discriminating `confidence`. Every tier-2/3 company needs at least one.',
    '3. Re-check the walk and load it:',
    '',
    '```bash',
    `cd ${VALUE_CHAIN_ROOT}`,
    `/Users/Shared/Hermes/venv/bin/python3 scripts/load_seed.py --graph ${graph} --seed-dir seed_incoming/${themeId} --strict`,
    `/Users/Shared/Hermes/venv/bin/python3 scripts/verify_theme.py --graph ${graph} --theme ${themeId}`,
    '```',
    '',
    'See `docs/graph_writer_guide.md`.',
    ''
  )
  return lines.join('\n')
}
