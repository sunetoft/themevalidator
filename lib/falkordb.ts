/**
 * FalkorDB Graph Sync — pushes thesis analysis data from ThemeInvestor to FalkorDB.
 *
 * Uses raw Redis protocol instead of the falkordb npm module to avoid
 * build-time BigInt issues.
 *
 * Usage:
 *   import { syncThesisToGraph } from '@/lib/falkordb'
 *   await syncThesisToGraph(thesis)
 */

import { createClient, type RedisClientType } from 'redis'

// Connection config from env
const FALKORDB_HOST = process.env.FALKORDB_HOST || 'ferrit-falkordb.lab.bluestork.tech'
const FALKORDB_PORT = parseInt(process.env.FALKORDB_PORT || '6379')
const FALKORDB_PASSWORD = process.env.FALKORDB_PASSWORD || '!C7JaA08ww9'

let _client: RedisClientType | null = null

async function getClient(): Promise<RedisClientType> {
  if (!_client) {
    _client = createClient({
      url: `redis://:${encodeURIComponent(FALKORDB_PASSWORD)}@${FALKORDB_HOST}:${FALKORDB_PORT}`,
    }) as RedisClientType
    await _client.connect()
  }
  return _client
}

function themeNameToGraphId(themeName: string): string {
  return themeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 64)
}

function roleToTier(role: string): number {
  const r = (role || '').toLowerCase()
  if (r.includes('end-user') || r.includes('infrastructure')) return 1
  if (r.includes('supplier') || r.includes('enabler')) return 2
  if (r.includes('competitor')) return 3
  return 2
}

function cypherStr(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildSetClause(prefix: string, props: Record<string, any>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      const arr = value.map((v) => `'${cypherStr(String(v))}'`).join(', ')
      parts.push(`${prefix}.${key} = [${arr}]`)
    } else if (typeof value === 'boolean') {
      parts.push(`${prefix}.${key} = ${value}`)
    } else if (typeof value === 'number') {
      parts.push(`${prefix}.${key} = ${value}`)
    } else {
      parts.push(`${prefix}.${key} = '${cypherStr(String(value))}'`)
    }
  }
  return parts.length > 0 ? 'SET ' + parts.join(', ') : ''
}

async function runQuery(graphName: string, query: string): Promise<any[]> {
  const client = await getClient()
  const result: any = await client.sendCommand(['GRAPH.QUERY', graphName, query, '--compact'])
  if (!result || !result[1]) return []
  return result[1] as any[]
}

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
  theme?: { name: string; description: string }
}

export async function syncThesisToGraph(thesis: ThesisForGraph): Promise<{
  success: boolean
  graph: string
  companiesSynced: number
  productsSynced: number
  error?: string
}> {
  const result: {
    success: boolean
    graph: string
    companiesSynced: number
    productsSynced: number
    error?: string
  } = {
    success: false,
    graph: '',
    companiesSynced: 0,
    productsSynced: 0,
  }

  try {
    const ecosystem = thesis.ecosystemData || {}
    const sentiment = thesis.sentimentData || {}
    const bottlenecks = thesis.bottlenecks || {}
    const valuation = thesis.valuationData || {}
    const external = thesis.externalFactors || {}

    const themeName =
      ecosystem.themeName ||
      sentiment.themeName ||
      thesis.theme?.name ||
      thesis.title ||
      'Unknown Theme'
    const graphId = themeNameToGraphId(themeName)
    result.graph = graphId

    const members = ecosystem.members || ecosystem.ecosystem || []
    const topPicks = valuation.topPicks || []
    const bottleneckItems = bottlenecks.items || []
    const factors = external.factors || []

    const picksMap = new Map<string, { catalysts: string[]; risks: string[] }>()
    for (const pick of topPicks) {
      picksMap.set(pick.ticker?.toUpperCase(), {
        catalysts: pick.catalysts || [],
        risks: pick.risks || [],
      })
    }

    // 1. Create Theme node
    const catalysts = (sentiment.keySignals || []).slice(0, 10)
    const keyRisks = factors
      .filter((f: any) => f.impact === 'negative')
      .map((f: any) => f.name)
      .slice(0, 10)

    const themeSetClause = buildSetClause('t', {
      name: themeName,
      description: thesis.description?.substring(0, 500) || '',
      status: sentiment.overall === 'bullish' ? 'accelerating' : sentiment.overall === 'bearish' ? 'decelerating' : 'stable',
      thesis_summary: `${thesis.title}. ${sentiment.summary || ''}`.substring(0, 1000),
      key_catalysts: catalysts,
      key_risks: keyRisks,
      last_updated: new Date().toISOString().split('T')[0],
      source: 'themeinvestor',
      thesis_id: thesis.id,
    })

    await runQuery(graphId, `MERGE (t:Theme {id: '${cypherStr(graphId)}'}) ${themeSetClause}`)

    // 2. Create Company nodes from ecosystem members
    for (const member of members) {
      if (!member.companyName && !member.ticker) continue

      const ticker = (member.ticker || '').toUpperCase()
      const tier = roleToTier(member.role)

      const companyProps: Record<string, any> = {
        name: member.companyName || ticker,
        ticker,
        sector_gics: member.sector || '',
        description: member.competency || member.notes || '',
        source: 'themeinvestor',
        last_updated: new Date().toISOString().split('T')[0],
      }

      if (member.marketCap) {
        const mcStr = String(member.marketCap).replace(/[$,]/g, '')
        const mcNum = parseFloat(mcStr)
        if (!isNaN(mcNum)) {
          companyProps.market_cap_eur = mcStr.includes('B') ? mcNum * 1e9 : mcStr.includes('M') ? mcNum * 1e6 : mcNum
        }
      }

      const companySetClause = buildSetClause('c', companyProps)
      await runQuery(graphId, `MERGE (c:Company {name: '${cypherStr(companyProps.name)}'}) ${companySetClause}`)

      const expSetClause = buildSetClause('r', {
        tier,
        confidence: 'medium',
        rationale: member.competency || member.notes || '',
        source: 'themeinvestor',
        last_verified: new Date().toISOString().split('T')[0],
      })
      await runQuery(graphId, `MATCH (c:Company {name: '${cypherStr(companyProps.name)}'}), (t:Theme) MERGE (c)-[r:EXPOSED_TO]->(t) ${expSetClause}`)

      result.companiesSynced++
    }

    // 3. Create Product nodes from bottlenecks
    for (const item of bottleneckItems) {
      if (!item.name) continue

      const productId = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const productSetClause = buildSetClause('p', {
        id: productId,
        name: item.name,
        bottleneck_status: item.pricingPowerBenefit === 'high' ? 'severe' : item.pricingPowerBenefit === 'medium' ? 'moderate' : 'none',
        description: item.description || '',
        last_updated: new Date().toISOString().split('T')[0],
      })

      await runQuery(graphId, `MERGE (p:Product {id: '${cypherStr(productId)}'}) ${productSetClause}`)

      const affectedTickers = item.affectedCompanies || []
      for (const tick of affectedTickers) {
        const ticker = String(tick).toUpperCase().replace('$', '')
        try {
          await runQuery(graphId, `MATCH (c:Company {ticker: '${cypherStr(ticker)}'}), (p:Product {id: '${cypherStr(productId)}'}) MERGE (c)-[r:PRODUCES]->(p) SET r.is_primary = false, r.source = 'themeinvestor', r.last_verified = '${new Date().toISOString().split('T')[0]}'`)
        } catch {
          // Company may not exist with this ticker — skip
        }
      }

      result.productsSynced++
    }

    // 4. Create standard indexes (idempotent)
    const indexQueries = [
      'CREATE INDEX FOR (c:Company) ON (c.ticker)',
      'CREATE INDEX FOR (c:Company) ON (c.market_cap_eur)',
      'CREATE INDEX FOR (p:Product) ON (p.id)',
      'CREATE INDEX FOR (p:Product) ON (p.bottleneck_status)',
      'CREATE INDEX FOR (t:Theme) ON (t.id)',
    ]
    for (const q of indexQueries) {
      try {
        await runQuery(graphId, q)
      } catch {
        // Index may already exist
      }
    }

    result.success = true
    return result
  } catch (err: any) {
    result.error = err?.message || 'Unknown error'
    console.error('FalkorDB sync error:', result.error)
    return result
  }
}

export async function closeFalkorDB() {
  if (_client) {
    await _client.quit()
    _client = null
  }
}
