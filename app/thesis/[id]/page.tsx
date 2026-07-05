'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import ScoreBadge from '@/components/score-badge'
import ScoreRadarChart from '@/components/score-radar-chart'
import SentimentChart from '@/components/sentiment-chart'
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, Building2,
  ShieldCheck, AlertTriangle, Zap, MessageSquare, ExternalLink,
  ChevronDown, ChevronUp, Target, Layers, Lock, BarChart3,
  Plus, Loader2, FileText, Link2, Share2, CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface ThesisData {
  id: string
  title: string
  description: string
  overallScore: number | null
  sentimentScore: number | null
  ecosystemScore: number | null
  riskScore: number | null
  opportunityScore: number | null
  moatScore: number | null
  status: string
  createdAt: string
  inputType: string
  sourceUrl: string | null
  sourceText: string | null
  pdfPath: string | null
  pdfIsPublic: boolean
  sentimentData: any
  ecosystemData: any
  externalFactors: any
  bottlenecks: any
  valuationData: any
  basketMembers: Array<any>
  graphSyncedAt: string | null
}

export default function ThesisDetailPage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const params = useParams()
  const [thesis, setThesis] = useState<ThesisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sentiment: true,
    ecosystem: true,
    factors: true,
    bottlenecks: true,
    valuation: true,
  })
  const [showSource, setShowSource] = useState(false)
  const [tickerInput, setTickerInput] = useState('')
  const [addingTicker, setAddingTicker] = useState(false)
  const [tickerProgress, setTickerProgress] = useState('')
  const [graphSyncing, setGraphSyncing] = useState(false)

  const thesisId = params?.id as string

  useEffect(() => {
    if (thesisId) fetchThesis()
  }, [thesisId])

  const fetchThesis = async () => {
    try {
      const res = await fetch(`/api/theses/${thesisId}`)
      if (res.ok) {
        const data = await res.json()
        setThesis(data)
      } else {
        router.push('/dashboard')
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...(prev ?? {}), [key]: !(prev ?? {})[key] }))
  }

  const syncToGraph = async () => {
    if (!thesis?.id) return
    setGraphSyncing(true)
    try {
      const res = await fetch(`/api/theses/${thesis.id}/sync-graph`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Synced ${data.companiesSynced} companies & ${data.productsSynced} products to GraphDB`)
        setThesis(prev => prev ? { ...prev, graphSyncedAt: new Date().toISOString() } : prev)
      } else {
        toast.error(data.error || 'Failed to sync to GraphDB')
      }
    } catch (err: any) {
      toast.error('Failed to sync to GraphDB')
    } finally {
      setGraphSyncing(false)
    }
  }

  const getImpactIcon = (impact: string) => {
    if (impact === 'positive') return <TrendingUp className="w-4 h-4 text-primary" />
    if (impact === 'negative') return <TrendingDown className="w-4 h-4 text-red-500" />
    return <Minus className="w-4 h-4 text-muted-foreground" />
  }

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return 'bg-red-500/10 text-red-500'
    if (severity === 'medium') return 'bg-amber-500/10 text-amber-500'
    return 'bg-primary/10 text-primary'
  }

  const getMoatColor = (strength: string) => {
    if (strength === 'wide') return 'text-primary bg-primary/10'
    if (strength === 'narrow') return 'text-amber-500 bg-amber-500/10'
    return 'text-red-500 bg-red-500/10'
  }

  const getGradeColor = (grade: string) => {
    if (grade === 'A') return 'text-primary'
    if (grade === 'B') return 'text-blue-500'
    if (grade === 'C') return 'text-amber-500'
    return 'text-red-500'
  }

  const handleAddTicker = async () => {
    const ticker = tickerInput.trim().toUpperCase()
    if (!ticker) {
      toast.error('Please enter a stock ticker')
      return
    }
    setAddingTicker(true)
    setTickerProgress(`Analyzing ${ticker}...`)

    try {
      const res = await fetch(`/api/theses/${thesisId}/add-ticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to add ticker')
        if (data?.reasoning) {
          toast.info(data.reasoning, { duration: 6000 })
        }
        return
      }

      if (data.reanalyzed) {
        toast.success(`${ticker} added — analysis updated!`)
      } else {
        toast.success(`${ticker} added to theme`)
        if (data?.reanalyzeError) {
          toast.warning(`Analysis update failed: ${data.reanalyzeError}`, { duration: 5000 })
        }
      }
      setTickerInput('')
      await fetchThesis()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to add ticker')
    } finally {
      setAddingTicker(false)
      setTickerProgress('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
                <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!thesis) {
    return (
      <div className="min-h-screen bg-background">
                <div className="text-center py-32">
          <p className="text-muted-foreground">Thesis not found</p>
        </div>
      </div>
    )
  }

  const sentiment = thesis?.sentimentData ?? {}
  const ecosystem = thesis?.ecosystemData ?? {}
  const factors = thesis?.externalFactors ?? {}
  const bottlenecks = thesis?.bottlenecks ?? {}
  const valuation = thesis?.valuationData ?? {}
  const keyTakeaways = (thesis as any)?.sentimentData?.keySignals ?? []

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1200px] mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <ScoreBadge score={thesis?.overallScore} size="lg" label="Overall Score" />
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2">{thesis?.title ?? 'Untitled'}</h1>
              <p className="text-muted-foreground mb-4">{thesis?.description ?? ''}</p>

              {/* Discreet Show More for original source */}
              {thesis && (thesis.sourceText || thesis.sourceUrl) && (
                <div className="mb-3">
                  <button
                    onClick={() => setShowSource((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    {thesis.inputType === 'url' ? (
                      <Link2 className="w-3.5 h-3.5" />
                    ) : thesis.inputType === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    {showSource ? 'Hide source' : 'Show source'}
                  </button>

                  <AnimatePresence>
                    {showSource && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 bg-muted/30 border border-border/50 rounded-lg p-4">
                          {/* Source URL */}
                          {thesis.sourceUrl && (
                            <div className="mb-3 flex items-center gap-2">
                              <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <a
                                href={thesis.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-400 hover:text-blue-300 hover:underline truncate"
                              >
                                {thesis.sourceUrl}
                              </a>
                              <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            </div>
                          )}

                          {/* Source label */}
                          {thesis.sourceText && (
                            <>
                              <p className="text-xs text-muted-foreground/60 mb-2 font-medium">
                                {thesis.inputType === 'pdf'
                                  ? 'Extracted PDF content'
                                  : thesis.inputType === 'url'
                                    ? 'Source text'
                                    : 'Original thesis text'}
                              </p>
                              <div className="max-h-80 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 font-light">
                                {thesis.sourceText}
                              </div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Sync to GraphDB button — only for completed theses */}
              {thesis?.status === 'completed' && (
                <div className="mb-3">
                  <button
                    onClick={syncToGraph}
                    disabled={graphSyncing}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                      thesis?.graphSyncedAt
                        ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {graphSyncing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Syncing…
                      </>
                    ) : thesis?.graphSyncedAt ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        In GraphDB — synced {new Date(thesis.graphSyncedAt).toLocaleDateString()}
                        <span className="text-muted-foreground/60 mx-1">·</span>
                        <Share2 className="w-3 h-3" />
                        Re-sync
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        Sync to GraphDB
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <ScoreBadge score={thesis?.sentimentScore} size="sm" label="Sentiment" />
                <ScoreBadge score={thesis?.ecosystemScore} size="sm" label="Ecosystem" />
                <ScoreBadge score={thesis?.riskScore} size="sm" label="Risk Mgmt" />
                <ScoreBadge score={thesis?.opportunityScore} size="sm" label="Opportunity" />
                <ScoreBadge score={thesis?.moatScore} size="sm" label="Moat" />
              </div>
            </div>
          </div>
        </div>

        {/* Radar chart */}
        <div
          className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in-d1"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Score Breakdown
          </h2>
          <ScoreRadarChart
            scores={{
              sentiment: thesis?.sentimentScore ?? 0,
              ecosystem: thesis?.ecosystemScore ?? 0,
              risk: thesis?.riskScore ?? 0,
              opportunity: thesis?.opportunityScore ?? 0,
              moat: thesis?.moatScore ?? 0,
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sentiment Analysis */}
          <div
            className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d2"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <button
              onClick={() => toggleSection('sentiment')}
              className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <h2 className="font-display font-semibold">Sentiment Analysis</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  sentiment?.overall === 'bullish' ? 'bg-primary/10 text-primary' :
                  sentiment?.overall === 'bearish' ? 'bg-red-500/10 text-red-500' :
                  'bg-muted text-muted-foreground'
                }`}>{sentiment?.overall ?? 'N/A'}</span>
              </div>
              {expandedSections?.sentiment ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections?.sentiment && (
              <div className="px-5 pb-5 space-y-4">
                <p className="text-sm text-muted-foreground">{sentiment?.summary ?? 'No sentiment data'}</p>
                {(sentiment?.keySignals?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">KEY SIGNALS</p>
                    <div className="space-y-1.5">
                      {(sentiment?.keySignals ?? []).map((signal: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Zap className="w-3 h-3 text-primary mt-1 flex-shrink-0" />
                          <span>{signal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <SentimentChart tweets={(thesis as any)?.sentimentData?.tweets ?? []} />
              </div>
            )}
          </div>

          {/* External Factors */}
          <div
            className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d2"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <button
              onClick={() => toggleSection('factors')}
              className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h2 className="font-display font-semibold">External Factors</h2>
              </div>
              {expandedSections?.factors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections?.factors && (
              <div className="px-5 pb-5 space-y-3">
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
          <div
            className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d3"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <button
              onClick={() => toggleSection('bottlenecks')}
              className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-500" />
                <h2 className="font-display font-semibold">Bottleneck Analysis</h2>
              </div>
              {expandedSections?.bottlenecks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections?.bottlenecks && (
              <div className="px-5 pb-5 space-y-3">
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
                        <div className="flex gap-1 mt-2">
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
          <div
            className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d4"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <button
              onClick={() => toggleSection('valuation')}
              className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="font-display font-semibold">Valuation & Moat</h2>
              </div>
              {expandedSections?.valuation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections?.valuation && (
              <div className="px-5 pb-5 space-y-3">
                {/* Merge basketMembers with valuation.topPicks data */}
                {(() => {
                  const allMembers = thesis?.basketMembers ?? [];
                  const topPicks = valuation?.topPicks ?? [];
                  if (allMembers.length === 0 && topPicks.length === 0) {
                    return <p className="text-sm text-muted-foreground">No valuation data</p>;
                  }
                  // Build a map of topPicks by ticker for enrichment
                  const picksMap = new Map<string, any>();
                  topPicks.forEach((p: any) => picksMap.set(p?.ticker?.toUpperCase(), p));
                  // Render all theme members; also include any topPicks not in members
                  const memberTickers = new Set(allMembers.map((m: any) => m.ticker?.toUpperCase()));
                  const extraPicks = topPicks.filter((p: any) => !memberTickers.has(p?.ticker?.toUpperCase()));
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
                  ];
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
                            }`}>
                              {pick.valuationStatus}
                            </span>
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
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Action Bar: Add Ticker + Create Strategy */}
        <div
          className="mt-6 bg-card border border-border rounded-xl p-5 animate-fade-in-d4"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex flex-col md:flex-row gap-4">
            {/* Add Ticker */}
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Add Stock to Theme</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !addingTicker) handleAddTicker() }}
                  placeholder="e.g. NVDA"
                  disabled={addingTicker}
                  className="flex-1 px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all disabled:opacity-50 uppercase placeholder:normal-case"
                />
                <button
                  onClick={handleAddTicker}
                  disabled={addingTicker || !tickerInput.trim()}
                  className="px-4 py-2.5 bg-primary hover:bg-primary text-white font-medium text-sm rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/20"
                >
                  {addingTicker ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Add stock ticker</>
                  )}
                </button>
              </div>
              {tickerProgress && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {tickerProgress}
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px bg-border" />

            {/* Trade Strategy */}
            <div className="flex-shrink-0 flex flex-col justify-end">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Portfolio Strategy</h3>
              <button
                onClick={() => router.push(`/thesis/${thesisId}/strategy`)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-all flex items-center gap-2 shadow-sm shadow-blue-600/20"
              >
                <BarChart3 className="w-4 h-4" />
                Create trade strategy
              </button>
            </div>
          </div>
        </div>

        {/* Ecosystem Members Table */}
        <div
          className="mt-6 bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d4"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <button
            onClick={() => toggleSection('ecosystem')}
            className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold">Ecosystem Members</h2>
              <span className="text-xs text-muted-foreground">({thesis?.basketMembers?.length ?? 0} companies)</span>
            </div>
            {expandedSections?.ecosystem ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections?.ecosystem && (
            <div className="px-5 pb-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Company</th>
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-left py-2 pr-4">Role</th>
                    <th className="text-left py-2 pr-4">Competency</th>
                    <th className="text-center py-2 pr-4">Moat</th>
                    <th className="text-left py-2">Valuation</th>
                  </tr>
                </thead>
                <tbody>
                  {(thesis?.basketMembers ?? []).map((member: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{member?.companyName ?? ''}</td>
                      <td className="py-2.5 pr-4 font-mono text-primary">{member?.ticker ?? '-'}</td>
                      <td className="py-2.5 pr-4">
                        <span className="px-1.5 py-0.5 bg-muted rounded text-xs capitalize">{member?.role ?? ''}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground text-xs max-w-[200px] truncate">{member?.competency ?? ''}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className={`font-mono font-bold ${
                          (member?.moatRating ?? 0) >= 7 ? 'text-primary' :
                          (member?.moatRating ?? 0) >= 5 ? 'text-amber-500' : 'text-red-500'
                        }`}>{member?.moatRating ?? '-'}</span>
                      </td>
                      <td className="py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          member?.valuationStatus === 'undervalued' ? 'bg-primary/10 text-primary' :
                          member?.valuationStatus === 'overvalued' ? 'bg-red-500/10 text-red-500' :
                          'bg-muted text-muted-foreground'
                        }`}>{member?.valuationStatus ?? '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
