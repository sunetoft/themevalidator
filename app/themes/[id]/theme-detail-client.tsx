'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import ScoreBadge from '@/components/score-badge'
import ScoreRadarChart from '@/components/score-radar-chart'
import SentimentChart from '@/components/sentiment-chart'
import ThesisAlertsBanner from '@/components/thesis-alerts-banner'
import ThemeETFsCard from '@/components/theme-etfs-card'
import FinancialTechnicalSection from '@/components/financial-technical-section'
import ProductEvaluatorSection from '@/components/product-evaluator-section'
import {
  ArrowLeft, ArrowRight, Crown, BarChart3, Target,
  Building2, MessageSquare, AlertTriangle, Lock, ShieldCheck,
  ChevronUp, ChevronDown, TrendingUp, TrendingDown, Minus,
  Zap, Layers, FileText
} from 'lucide-react'
import { getScoreHex } from '@/lib/scores'

interface ThemeMeta {
  id: string
  name: string
  slug: string
  description: string
  publishedAt: string | null
  avgScore: number | null
  theses: Array<{
    id: string
    title: string
    description: string
    overallScore: number | null
    sentimentScore: number | null
    ecosystemScore: number | null
    riskScore: number | null
    opportunityScore: number | null
    moatScore: number | null
    createdAt: string
  }>
}

interface ThesisDetail {
  id: string
  title: string
  description: string
  overallScore: number | null
  sentimentScore: number | null
  ecosystemScore: number | null
  riskScore: number | null
  opportunityScore: number | null
  moatScore: number | null
  sentimentData: any
  ecosystemData: any
  externalFactors: any
  bottlenecks: any
  valuationData: any
  financialData: any
  technicalData: any
  earningsData: any
  productEvaluator: any
  themeEtfs: any[] | null
  publishedAt: string | null
  basketMembers: Array<{
    id: string
    ticker: string | null
    companyName: string
    role: string | null
    competency: string | null
    moatRating: number | null
    valuationStatus: string | null
    marketCap: string | null
    peRatio: string | null
    instrumentType: string | null
    sector: string | null
    notes: string | null
  }>
  thesisAlerts: Array<{
    id: string
    type: string
    severity: string
    ticker: string | null
    title: string
    description: string
    data: any
    createdAt: string
  }>
  aggregate: {
    totalTrades: number
    avgPnl: number
    avgPnlPercent: number
    bestTrade: number
    worstTrade: number
    tickerPerformance: Array<{
      ticker: string
      totalValue: number
      avgUnrealized: number
      appearances: number
    }>
  } | null
}

interface ThemeApiResponse {
  id: string
  name: string
  theses: ThesisDetail[]
  mergedEtfs: any[]
  themeScores: Record<string, number | null>
}

/* ── helpers ── */

function getImpactIcon(impact: string) {
  if (impact === 'positive') return <TrendingUp className="w-4 h-4 text-primary" />
  if (impact === 'negative') return <TrendingDown className="w-4 h-4 text-red-500" />
  return <Minus className="w-4 h-4 text-muted-foreground" />
}

function getSeverityColor(severity: string) {
  if (severity === 'high') return 'bg-red-500/10 text-red-500'
  if (severity === 'medium') return 'bg-amber-500/10 text-amber-500'
  return 'bg-primary/10 text-primary'
}

function getMoatColor(strength: string) {
  if (strength === 'wide') return 'text-primary bg-primary/10'
  if (strength === 'narrow') return 'text-amber-500 bg-amber-500/10'
  return 'text-red-500 bg-red-500/10'
}

function getGradeColor(grade: string) {
  if (grade === 'A') return 'text-primary'
  if (grade === 'B') return 'text-blue-500'
  if (grade === 'C') return 'text-amber-500'
  return 'text-red-500'
}

/* ── expandable thesis analysis section ── */

function ThesisAnalysisSection({ thesis }: { thesis: ThesisDetail }) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sentiment: true,
    factors: true,
    bottlenecks: true,
    valuation: true,
    ecosystem: true,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const sentiment = thesis.sentimentData ?? {}
  const factors = thesis.externalFactors ?? {}
  const bottlenecks = thesis.bottlenecks ?? {}
  const valuation = thesis.valuationData ?? {}
  const productEvaluator = thesis.productEvaluator ?? null

  return (
    <div className="space-y-4 mt-4">
      {/* Financial Health & Technical Analysis */}
      <FinancialTechnicalSection
        financialHealth={thesis.financialData ?? null}
        technicalAnalysis={thesis.technicalData ?? null}
      />

      {/* Product Evaluator */}
      <ProductEvaluatorSection
        data={productEvaluator}
        expanded={expandedSections.productEvaluator ?? true}
        onToggle={() => toggleSection('productEvaluator')}
      />

      {/* Analysis sections grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sentiment */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('sentiment')}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-sm">Sentiment Analysis</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                sentiment?.overall === 'bullish' ? 'bg-primary/10 text-primary' :
                sentiment?.overall === 'bearish' ? 'bg-red-500/10 text-red-500' :
                'bg-muted text-muted-foreground'
              }`}>{sentiment?.overall ?? 'N/A'}</span>
            </div>
            {expandedSections.sentiment ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.sentiment && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">{sentiment?.summary ?? 'No sentiment data'}</p>
              {(sentiment?.keySignals?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  {(sentiment?.keySignals ?? []).map((signal: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Zap className="w-3 h-3 text-primary mt-1 flex-shrink-0" />
                      <span>{signal}</span>
                    </div>
                  ))}
                </div>
              )}
              <SentimentChart tweets={sentiment?.tweets ?? []} />
            </div>
          )}
        </div>

        {/* External Factors */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('factors')}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-sm">External Factors</h2>
            </div>
            {expandedSections.factors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.factors && (
            <div className="px-4 pb-4 space-y-2">
              {(factors?.factors ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No external factors identified</p>
              ) : (
                (factors?.factors ?? []).map((factor: any, i: number) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {getImpactIcon(factor?.impact)}
                      <span className="font-medium text-sm">{factor?.name ?? ''}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${getSeverityColor(factor?.severity)}`}>
                        {factor?.severity ?? ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">{factor?.description ?? ''}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottleneck Analysis */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('bottlenecks')}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-purple-500" />
              <h2 className="font-semibold text-sm">Bottleneck Analysis</h2>
            </div>
            {expandedSections.bottlenecks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.bottlenecks && (
            <div className="px-4 pb-4 space-y-2">
              {(bottlenecks?.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No bottlenecks identified</p>
              ) : (
                (bottlenecks?.items ?? []).map((item: any, i: number) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{item?.name ?? ''}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        item?.pricingPowerBenefit === 'high' ? 'bg-primary/10 text-primary' :
                        item?.pricingPowerBenefit === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-muted text-muted-foreground'
                      }`}>Pricing Power: {item?.pricingPowerBenefit ?? 'N/A'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item?.description ?? ''}</p>
                    {(item?.affectedCompanies?.length ?? 0) > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {(item?.affectedCompanies ?? []).map((ticker: string, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded font-mono">{ticker}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Valuation & Moat */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('valuation')}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-sm">Valuation & Moat</h2>
            </div>
            {expandedSections.valuation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.valuation && (
            <div className="px-4 pb-4 space-y-2">
              {(() => {
                const allMembers = thesis.basketMembers ?? []
                const topPicks = valuation?.topPicks ?? []
                if (allMembers.length === 0 && topPicks.length === 0) {
                  return <p className="text-sm text-muted-foreground">No valuation data</p>
                }
                const picksMap = new Map<string, any>()
                topPicks.forEach((p: any) => picksMap.set(p?.ticker?.toUpperCase(), p))
                const memberTickers = new Set(allMembers.map((m: any) => m.ticker?.toUpperCase()))
                const extraPicks = topPicks.filter((p: any) => !memberTickers.has(p?.ticker?.toUpperCase()))
                const allEntries = [
                  ...allMembers.map((m: any) => ({
                    ticker: m.ticker ?? '',
                    companyName: m.companyName ?? '',
                    moatStrength: (m.moatRating ?? 0) >= 7 ? 'wide' : (m.moatRating ?? 0) >= 4 ? 'narrow' : 'none',
                    moatRating: m.moatRating ?? null,
                    valuationStatus: m.valuationStatus ?? null,
                    valuationGrade: picksMap.get(m.ticker?.toUpperCase())?.valuationGrade ?? null,
                    catalysts: picksMap.get(m.ticker?.toUpperCase())?.catalysts ?? [],
                    risks: picksMap.get(m.ticker?.toUpperCase())?.risks ?? [],
                    role: m.role ?? '',
                  })),
                  ...extraPicks.map((p: any) => ({
                    ticker: p.ticker ?? '',
                    companyName: p.companyName ?? '',
                    moatStrength: p.moatStrength ?? 'none',
                    moatRating: null,
                    valuationStatus: null,
                    valuationGrade: p.valuationGrade ?? null,
                    catalysts: p.catalysts ?? [],
                    risks: p.risks ?? [],
                    role: '',
                  })),
                ]
                return allEntries.map((pick, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{pick.ticker}</span>
                        <span className="text-sm text-muted-foreground">{pick.companyName}</span>
                        {pick.role && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{pick.role}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {pick.valuationStatus && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            pick.valuationStatus === 'undervalued' ? 'bg-primary/10 text-primary'
                            : pick.valuationStatus === 'overvalued' ? 'bg-red-500/10 text-red-500'
                            : 'bg-amber-500/10 text-amber-500'
                          }`}>{pick.valuationStatus}</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${getMoatColor(pick.moatStrength)}`}>
                          {pick.moatStrength} moat{pick.moatRating ? ` (${pick.moatRating}/10)` : ''}
                        </span>
                        {pick.valuationGrade && (
                          <span className={`font-mono font-bold text-lg ${getGradeColor(pick.valuationGrade)}`}>
                            {pick.valuationGrade}
                          </span>
                        )}
                      </div>
                    </div>
                    {pick.catalysts.length > 0 ? (
                      <div className="mb-1">
                        <span className="text-xs text-muted-foreground">Catalysts: </span>
                        <span className="text-xs text-primary">{pick.catalysts.join(', ')}</span>
                      </div>
                    ) : (
                      <div className="mb-1">
                        <span className="text-xs text-muted-foreground">Catalysts: </span>
                        <span className="text-xs text-muted-foreground/60 italic">Awaiting analysis</span>
                      </div>
                    )}
                    {pick.risks.length > 0 ? (
                      <div>
                        <span className="text-xs text-muted-foreground">Risks: </span>
                        <span className="text-xs text-red-400">{pick.risks.join(', ')}</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs text-muted-foreground">Risks: </span>
                        <span className="text-xs text-muted-foreground/60 italic">Awaiting analysis</span>
                      </div>
                    )}
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Ecosystem Stocks table */}
      {thesis.basketMembers && thesis.basketMembers.length > 0 && (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('ecosystem')}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-sm">Ecosystem Stocks</h2>
              <span className="text-xs text-muted-foreground">
                ({thesis.basketMembers.filter(m => m.instrumentType !== 'etf').length} stocks)
              </span>
            </div>
            {expandedSections.ecosystem ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.ecosystem && (
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Company</th>
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-left py-2 pr-4">Role</th>
                    <th className="text-left py-2 pr-4">Sector</th>
                    <th className="text-left py-2 pr-4">Competency</th>
                    <th className="text-center py-2 pr-4">Moat</th>
                    <th className="text-left py-2">Valuation</th>
                  </tr>
                </thead>
                <tbody>
                  {thesis.basketMembers.filter(m => m.instrumentType !== 'etf').map((member, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{member.companyName ?? ''}</td>
                      <td className="py-2.5 pr-4 font-mono text-primary">{member.ticker ?? '-'}</td>
                      <td className="py-2.5 pr-4">
                        <span className="px-1.5 py-0.5 bg-muted rounded text-xs capitalize">{member.role ?? ''}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground text-xs">{member.sector ?? '-'}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground text-xs max-w-[200px] truncate">{member.competency ?? ''}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className={`font-mono font-bold ${
                          (member.moatRating ?? 0) >= 7 ? 'text-primary' :
                          (member.moatRating ?? 0) >= 5 ? 'text-amber-500' : 'text-red-500'
                        }`}>{member.moatRating ?? '-'}</span>
                      </td>
                      <td className="py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          member.valuationStatus === 'undervalued' ? 'bg-primary/10 text-primary' :
                          member.valuationStatus === 'overvalued' ? 'bg-red-500/10 text-red-500' :
                          'bg-muted text-muted-foreground'
                        }`}>{member.valuationStatus ?? '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Paper trade aggregate for this thesis */}
      {thesis.aggregate && (
        <div className="bg-background border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Paper Trade Results</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Active Trades</p>
              <p className="text-xl font-bold">{thesis.aggregate.totalTrades}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Avg P&L %</p>
              <p className={`text-xl font-bold ${thesis.aggregate.avgPnlPercent >= 0 ? 'text-primary' : 'text-red-500'}`}>
                {thesis.aggregate.avgPnlPercent >= 0 ? '+' : ''}{thesis.aggregate.avgPnlPercent}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Best Trade</p>
              <p className="text-xl font-bold text-primary">+{thesis.aggregate.bestTrade}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Worst Trade</p>
              <p className="text-xl font-bold text-red-500">{thesis.aggregate.worstTrade}%</p>
            </div>
          </div>
          {thesis.aggregate.tickerPerformance.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Top Tickers by Allocation</p>
              <div className="space-y-1.5">
                {thesis.aggregate.tickerPerformance.slice(0, 6).map((t) => (
                  <div key={t.ticker} className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium w-16">{t.ticker}</span>
                    <div className="flex-1 h-5 bg-muted rounded flex items-center justify-between px-2">
                      <span className="text-xs text-muted-foreground">{t.appearances} trade{t.appearances !== 1 ? 's' : ''}</span>
                      <span className={`text-xs font-mono font-bold ${t.avgUnrealized >= 0 ? 'text-primary' : 'text-red-500'}`}>
                        {t.avgUnrealized >= 0 ? '+' : ''}${t.avgUnrealized}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── main component ── */

export default function ThemeDetailClient({
  themeId,
  theme,
}: {
  themeId: string
  theme: ThemeMeta
}) {
  const { data: session } = useSession()
  const [detail, setDetail] = useState<ThemeApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedThesis, setExpandedThesis] = useState<string | null>(null)

  const hasSub = (session?.user as any)?.hasSubscription
  const isAdmin = (session?.user as any)?.role === 'admin'

  useEffect(() => {
    fetch(`/api/themes/${themeId}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [themeId])

  // Auto-expand the top thesis
  useEffect(() => {
    if (!loading && detail?.theses?.length && !expandedThesis) {
      setExpandedThesis(detail.theses[0].id)
    }
  }, [loading, detail, expandedThesis])

  const themeScores = detail?.themeScores ?? {}

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        {/* Back link */}
        <Link href="/themes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Browse all themes
        </Link>

        {/* Theme Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <ScoreBadge score={theme.avgScore} size="lg" label="Theme Score" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-6 h-6 text-primary" />
                <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{theme.name}</h1>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed mb-4">{theme.description}</p>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md font-medium">
                  {theme.theses.length} thesis{theme.theses.length !== 1 ? 'es' : ''}
                </span>
                {theme.publishedAt && (
                  <span className="text-xs text-muted-foreground">
                    Published {new Date(theme.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                )}
              </div>
              {/* Sub-scores from aggregated thesis scores */}
              <div className="flex flex-wrap gap-4">
                {themeScores.sentimentScore !== null && themeScores.sentimentScore !== undefined && (
                  <ScoreBadge score={themeScores.sentimentScore} size="sm" label="Sentiment" />
                )}
                {themeScores.ecosystemScore !== null && themeScores.ecosystemScore !== undefined && (
                  <ScoreBadge score={themeScores.ecosystemScore} size="sm" label="Ecosystem" />
                )}
                {themeScores.riskScore !== null && themeScores.riskScore !== undefined && (
                  <ScoreBadge score={themeScores.riskScore} size="sm" label="Risk Mgmt" />
                )}
                {themeScores.opportunityScore !== null && themeScores.opportunityScore !== undefined && (
                  <ScoreBadge score={themeScores.opportunityScore} size="sm" label="Opportunity" />
                )}
                {themeScores.moatScore !== null && themeScores.moatScore !== undefined && (
                  <ScoreBadge score={themeScores.moatScore} size="sm" label="Moat" />
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Radar chart with aggregated scores */}
        {theme.avgScore !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-border rounded-xl p-6 mb-6"
          >
            <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Theme Score Breakdown
            </h2>
            <ScoreRadarChart
              scores={{
                sentiment: themeScores.sentimentScore ?? 0,
                ecosystem: themeScores.ecosystemScore ?? 0,
                risk: themeScores.riskScore ?? 0,
                opportunity: themeScores.opportunityScore ?? 0,
                moat: themeScores.moatScore ?? 0,
              }}
            />
          </motion.div>
        )}

        {/* Theme-level ETFs */}
        {!loading && detail?.mergedEtfs && detail.mergedEtfs.length > 0 && (
          <div className="mb-6">
            <ThemeETFsCard etfs={detail.mergedEtfs} />
          </div>
        )}

        {/* Thesis list */}
        {!loading && detail?.theses && (
          <div className="space-y-4 mb-6">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Investment Theses
            </h2>

            {detail.theses.map((thesis, i) => {
              const isExpanded = expandedThesis === thesis.id
              return (
                <motion.div
                  key={thesis.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Thesis card header (click to expand) */}
                  <button
                    onClick={() => setExpandedThesis(isExpanded ? null : thesis.id)}
                    className="w-full p-5 flex items-start justify-between hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {thesis.overallScore !== null && (
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold"
                            style={{
                              borderColor: getScoreHex(thesis.overallScore),
                              color: getScoreHex(thesis.overallScore)
                            }}
                          >
                            {thesis.overallScore}
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors mb-1">
                          {thesis.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{thesis.description}</p>
                        {/* Mini score badges */}
                        <div className="flex flex-wrap gap-3 mt-3">
                          {thesis.sentimentScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              Sentiment: <span className="font-bold" style={{ color: getScoreHex(thesis.sentimentScore) }}>{thesis.sentimentScore}</span>
                            </span>
                          )}
                          {thesis.ecosystemScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              Ecosystem: <span className="font-bold" style={{ color: getScoreHex(thesis.ecosystemScore) }}>{thesis.ecosystemScore}</span>
                            </span>
                          )}
                          {thesis.riskScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              Risk: <span className="font-bold" style={{ color: getScoreHex(thesis.riskScore) }}>{thesis.riskScore}</span>
                            </span>
                          )}
                          {thesis.moatScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              Moat: <span className="font-bold" style={{ color: getScoreHex(thesis.moatScore) }}>{thesis.moatScore}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 flex-shrink-0 mt-1" /> : <ChevronDown className="w-5 h-5 flex-shrink-0 mt-1" />}
                  </button>

                  {/* Expanded thesis analysis */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 border-t border-border/40">
                          {/* Thesis alerts */}
                          {thesis.thesisAlerts && thesis.thesisAlerts.length > 0 && (
                            <div className="mt-4">
                              <ThesisAlertsBanner alerts={thesis.thesisAlerts} />
                            </div>
                          )}

                          {/* Full analysis sections */}
                          <ThesisAnalysisSection thesis={thesis} />

                          {/* CTA: create strategy on this thesis */}
                          <div className="mt-4 pt-4 border-t border-border/40">
                            {(hasSub || isAdmin) && session ? (
                              <Link
                                href={`/thesis/${thesis.id}/strategy`}
                                className="flex items-center justify-between group"
                              >
                                <div className="flex items-center gap-3">
                                  <Target className="w-5 h-5 text-primary" />
                                  <div>
                                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                                      Create a Trading Strategy on This Thesis
                                    </h3>
                                    <p className="text-xs text-muted-foreground">Generate AI-powered strategy and start paper trading</p>
                                  </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:gap-2 transition-all" />
                              </Link>
                            ) : (
                              <div className="flex items-start gap-4">
                                <div className="rounded-xl bg-primary p-3">
                                  <Crown className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                  <h3 className="font-semibold text-sm mb-1">Want to trade this thesis?</h3>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    Subscribe to create AI-powered strategies and paper trades on this thesis.
                                  </p>
                                  <Link
                                    href={session ? '/pricing' : '/auth?callbackUrl=/pricing'}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary transition-colors"
                                  >
                                    {session ? 'Upgrade to Pro' : 'Sign Up to Get Started'}
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  )
}
