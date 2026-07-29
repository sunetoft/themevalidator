'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell,
} from 'recharts'
import {
  GitCompare, Search, X, TrendingUp, Users, Sparkles,
  Trophy, AlertTriangle, ArrowRight, Layers, PieChart,
} from 'lucide-react'
import { getScoreHex, getScoreBadgeClass, getScoreTextClass } from '@/lib/scores'
import { cn } from '@/lib/utils'

// --- Types ---

interface ThemeOption {
  id: string
  name: string
  description: string
  avgScore: number | null
  basketCount: number
  thesisCount: number
}

interface ThemeComparison {
  id: string
  name: string
  slug: string
  description: string
  thesisCount: number
  themeScores: Record<string, number | null>
  basketSize: number
  basketMembers: { ticker: string | null; companyName: string; role: string | null; competency: string | null; moatRating: string | null; valuationStatus: string | null }[]
  topThesis: { title: string; overallScore: number | null } | null
  paperTradeStats: { count: number; avgPnlPercent: number; totalValue: number; bestTrade: number; worstTrade: number } | null
  sentiment: { score: number | null; tweetCount: number }
  publishedAt: string | null
}

// --- Constants ---

const THEME_COLORS = [
  { stroke: 'hsl(142 60% 45%)', fill: 'hsl(142 60% 45% 0.15)', name: 'Emerald' },
  { stroke: 'hsl(217 91% 60%)', fill: 'hsl(217 91% 60% 0.15)', name: 'Blue' },
  { stroke: 'hsl(38 80% 50%)', fill: 'hsl(38 80% 50% 0.15)', name: 'Amber' },
]

const SCORE_AXES = [
  { key: 'sentimentScore', label: 'Sentiment' },
  { key: 'ecosystemScore', label: 'Ecosystem' },
  { key: 'riskScore', label: 'Risk' },
  { key: 'opportunityScore', label: 'Opportunity' },
  { key: 'moatScore', label: 'Moat' },
  { key: 'overallScore', label: 'Overall' },
]

// --- Component ---

export default function CompareClient({ themes }: { themes: ThemeOption[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [data, setData] = useState<ThemeComparison[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-select first 3 themes with data on mount
  useEffect(() => {
    const withData = themes.filter((t) => t.avgScore !== null)
    if (withData.length >= 2) {
      const defaults = withData.slice(0, Math.min(3, withData.length)).map((t) => t.id)
      setSelected(defaults)
    }
  }, [themes])

  const toggleTheme = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return [...prev.slice(1), id] // replace oldest
      return [...prev, id]
    })
  }, [])

  // Fetch comparison data when selection changes
  useEffect(() => {
    if (selected.length < 2) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/themes/compare?ids=${selected.join(',')}`)
        if (!res.ok) throw new Error('Failed to load comparison data')
        const json = await res.json()
        if (!cancelled) {
          setData(json.themes)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selected])

  const filteredThemes = themes.filter((t) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="pt-12 pb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-3 text-sm text-primary">
            <GitCompare className="w-4 h-4" />
            Side-by-Side Analysis
          </div>
          <h1 className="text-4xl font-bold mb-3">Compare Investment Themes</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Select 2–3 themes to compare thesis scores, basket composition, paper trade performance,
            and sentiment — all in one view.
          </p>
        </div>

        {/* Theme Selector */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Select Themes ({selected.length}/3)
            </h2>
            {selected.length >= 2 && (
              <button
                onClick={() => setSelected([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Selected pills */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selected.map((id, idx) => {
                const theme = themes.find((t) => t.id === id)
                if (!theme) return null
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: THEME_COLORS[idx].stroke }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: THEME_COLORS[idx].stroke }}
                    />
                    <span className="font-medium">{theme.name}</span>
                    <button
                      onClick={() => toggleTheme(id)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search themes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Theme cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredThemes.map((theme) => {
              const isSelected = selected.includes(theme.id)
              const colorIdx = selected.indexOf(theme.id)
              return (
                <button
                  key={theme.id}
                  onClick={() => toggleTheme(theme.id)}
                  className={cn(
                    'text-left rounded-xl border p-4 transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isSelected && (
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: THEME_COLORS[colorIdx].stroke }}
                          />
                        )}
                        <h3 className="text-sm font-semibold line-clamp-2">{theme.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{theme.description}</p>
                    </div>
                    {theme.avgScore !== null && (
                      <div
                        className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                        style={{ borderColor: getScoreHex(theme.avgScore), color: getScoreHex(theme.avgScore) }}
                      >
                        {theme.avgScore}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{theme.thesisCount} thesis{theme.thesisCount !== 1 ? 'es' : ''}</span>
                    <span>{theme.basketCount} stocks</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Comparison View */}
        {selected.length < 2 ? (
          <div className="text-center py-16 text-muted-foreground">
            <GitCompare className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Select at least 2 themes to start comparing.</p>
          </div>
        ) : loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading comparison data...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-destructive">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{error}</p>
          </div>
        ) : data && data.length >= 2 ? (
          <ComparisonView data={data} />
        ) : null}
      </div>
    </div>
  )
}

// --- Comparison View ---

function ComparisonView({ data }: { data: ThemeComparison[] }) {
  const themeCount = data.length

  // Build radar chart data
  const radarData = SCORE_AXES.map((axis) => {
    const point: Record<string, any> = { axis: axis.label }
    data.forEach((theme) => {
      point[theme.id] = theme.themeScores[axis.key] ?? 0
    })
    return point
  })

  // Find winner per score dimension
  const scoreWinners: Record<string, string | null> = {}
  for (const axis of SCORE_AXES) {
    let bestId: string | null = null
    let bestVal = -1
    for (const theme of data) {
      const val = theme.themeScores[axis.key]
      if (val !== null && val > bestVal) {
        bestVal = val
        bestId = theme.id
      }
    }
    scoreWinners[axis.key] = bestId
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-16"
    >
      {/* Score Radar Overlay */}
      <ComparisonCard icon={Sparkles} title="Thesis Score Comparison" subtitle="AI-validated multi-dimensional scoring (0–100)">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar chart */}
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                axisLine={false}
              />
              {data.map((theme, idx) => (
                <Radar
                  key={theme.id}
                  name={theme.name}
                  dataKey={theme.id}
                  stroke={THEME_COLORS[idx].stroke}
                  fill={THEME_COLORS[idx].stroke}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value: string) => {
                  const idx = data.findIndex((t) => t.name === value)
                  return (
                    <span style={{ color: idx >= 0 ? THEME_COLORS[idx].stroke : undefined, fontWeight: 500 }}>
                      {value}
                    </span>
                  )
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>

          {/* Score table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dimension</th>
                  {data.map((theme, idx) => (
                    <th key={theme.id} className="text-center py-2 px-2">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: THEME_COLORS[idx].stroke }}
                        />
                        <Link href={`/themes/${theme.id}`} className="text-xs font-medium hover:text-primary line-clamp-1 max-w-[120px]" title={theme.name}>
                          {theme.name}
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCORE_AXES.map((axis) => (
                  <tr key={axis.key} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 text-muted-foreground font-medium">{axis.label}</td>
                    {data.map((theme) => {
                      const score = theme.themeScores[axis.key]
                      const isWinner = scoreWinners[axis.key] === theme.id
                      return (
                        <td key={theme.id} className="text-center py-2.5 px-2">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center min-w-[2.5rem] rounded-md px-2 py-1 text-sm font-bold',
                              getScoreBadgeClass(score),
                            )}
                          >
                            {score ?? '—'}
                          </span>
                          {isWinner && score !== null && (
                            <Trophy className="inline-block w-3 h-3 ml-1 text-amber-500" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ComparisonCard>

      {/* Basket Comparison */}
      <ComparisonCard icon={Layers} title="Basket Composition" subtitle={`${themeCount === 2 ? 'Both' : 'All'} themes' stock baskets side-by-side`}>
        <div className={cn('grid gap-4', themeCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
          {data.map((theme, idx) => (
            <div key={theme.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold line-clamp-1">{theme.name}</h4>
                <span
                  className="text-xs px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: THEME_COLORS[idx].fill, color: THEME_COLORS[idx].stroke }}
                >
                  {theme.basketSize} stocks
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {theme.basketMembers.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No basket members</span>
                ) : (
                  theme.basketMembers.map((m, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 bg-muted rounded-md text-foreground"
                      title={m.companyName}
                    >
                      {m.ticker || m.companyName.split(' ')[0]}
                    </span>
                  ))
                )}
              </div>
              {theme.topThesis && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Top Thesis</p>
                  <Link
                    href={`/themes/${theme.id}`}
                    className="text-xs font-medium hover:text-primary line-clamp-2 flex items-start gap-1"
                  >
                    {theme.topThesis.title}
                    <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Overlap analysis */}
        <BasketOverlapAnalysis data={data} />
      </ComparisonCard>

      {/* Paper Trade Performance */}
      <ComparisonCard icon={TrendingUp} title="Paper Trade Performance" subtitle="Active paper trading results across themes">
        <div className={cn('grid gap-4', themeCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
          {data.map((theme, idx) => (
            <div key={theme.id} className="rounded-xl border border-border p-4">
              <h4 className="text-sm font-semibold mb-3 line-clamp-1">{theme.name}</h4>
              {theme.paperTradeStats ? (
                <div className="space-y-2">
                  <StatRow label="Active Trades" value={String(theme.paperTradeStats.count)} />
                  <StatRow label="Total Value" value={`$${theme.paperTradeStats.totalValue.toLocaleString()}`} />
                  <StatRow
                    label="Avg P&L %"
                    value={`${theme.paperTradeStats.avgPnlPercent > 0 ? '+' : ''}${theme.paperTradeStats.avgPnlPercent.toFixed(2)}%`}
                    valueClass={theme.paperTradeStats.avgPnlPercent >= 0 ? 'text-success' : 'text-destructive'}
                  />
                  <StatRow
                    label="Best Trade"
                    value={`${theme.paperTradeStats.bestTrade > 0 ? '+' : ''}${theme.paperTradeStats.bestTrade.toFixed(2)}%`}
                    valueClass="text-success"
                  />
                  <StatRow
                    label="Worst Trade"
                    value={`${theme.paperTradeStats.worstTrade.toFixed(2)}%`}
                    valueClass="text-destructive"
                  />
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No active paper trades
                </div>
              )}
            </div>
          ))}
        </div>
      </ComparisonCard>

      {/* Sentiment Comparison */}
      <ComparisonCard icon={PieChart} title="Sentiment & Social Signals" subtitle="X/Twitter engagement and sentiment scores">
        <div className="space-y-6">
          {/* Sentiment score bar chart */}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.map((t) => ({ name: t.name.length > 25 ? t.name.slice(0, 22) + '...' : t.name, score: t.sentiment.score ?? 0, tweets: t.sentiment.tweetCount }))}>
              <XAxis
                dataKey="name"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: any, name: any, props: any) => [
                  name === 'score' ? `${value}/100 (${props.payload.tweets} tweets)` : value,
                  name === 'score' ? 'Sentiment' : name,
                ]}
              />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {data.map((t, i) => (
                  <Cell key={i} fill={t.sentiment.score !== null ? getScoreHex(t.sentiment.score) : 'hsl(var(--muted-foreground))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Per-theme sentiment detail */}
          <div className={cn('grid gap-4', themeCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            {data.map((theme, idx) => (
              <div key={theme.id} className="rounded-xl border border-border p-4">
                <h4 className="text-sm font-semibold mb-2 line-clamp-1">{theme.name}</h4>
                <div className="flex items-center gap-3">
                  {theme.sentiment.score !== null ? (
                    <div
                      className="w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ borderColor: getScoreHex(theme.sentiment.score), color: getScoreHex(theme.sentiment.score) }}
                    >
                      {theme.sentiment.score}
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full border-2 border-muted flex items-center justify-center text-sm text-muted-foreground flex-shrink-0">
                      —
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="text-muted-foreground">Sentiment Score</p>
                    <p className="text-xs text-muted-foreground">{theme.sentiment.tweetCount} tweets analyzed</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ComparisonCard>

      {/* Summary / CTA */}
      <ComparisonCard icon={Trophy} title="At a Glance" subtitle="Key takeaways across all dimensions">
        <div className="space-y-3">
          {SCORE_AXES.filter((a) => a.key !== 'overallScore').map((axis) => {
            const winnerId = scoreWinners[axis.key]
            const winner = data.find((t) => t.id === winnerId)
            const winnerIdx = winnerId ? data.findIndex((t) => t.id === winnerId) : -1
            if (!winner) return null
            return (
              <div key={axis.key} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-muted-foreground w-28 flex-shrink-0">{axis.label}</span>
                <span
                  className="text-sm font-medium"
                  style={{ color: winnerIdx >= 0 ? THEME_COLORS[winnerIdx].stroke : undefined }}
                >
                  {winner.name}
                </span>
                <span className="text-sm font-bold ml-auto" style={{ color: getScoreHex(winner.themeScores[axis.key]) }}>
                  {winner.themeScores[axis.key]}
                </span>
              </div>
            )
          })}
          {/* Best paper trade performer */}
          {(() => {
            const withTrades = data.filter((t) => t.paperTradeStats !== null)
            if (withTrades.length === 0) return null
            const best = withTrades.reduce((a, b) =>
              (a.paperTradeStats!.avgPnlPercent > b.paperTradeStats!.avgPnlPercent ? a : b)
            )
            const bestIdx = data.findIndex((t) => t.id === best.id)
            return (
              <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                <TrendingUp className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-sm text-muted-foreground w-28 flex-shrink-0">Paper P&L</span>
                <span className="text-sm font-medium" style={{ color: bestIdx >= 0 ? THEME_COLORS[bestIdx].stroke : undefined }}>
                  {best.name}
                </span>
                <span className={cn('text-sm font-bold ml-auto', best.paperTradeStats!.avgPnlPercent >= 0 ? 'text-success' : 'text-destructive')}>
                  {best.paperTradeStats!.avgPnlPercent > 0 ? '+' : ''}{best.paperTradeStats!.avgPnlPercent.toFixed(2)}%
                </span>
              </div>
            )
          })()}
          {/* Largest basket */}
          {(() => {
            const largest = data.reduce((a, b) => (a.basketSize > b.basketSize ? a : b))
            const largestIdx = data.findIndex((t) => t.id === largest.id)
            return (
              <div className="flex items-center gap-3 py-2">
                <Layers className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-muted-foreground w-28 flex-shrink-0">Basket Size</span>
                <span className="text-sm font-medium" style={{ color: largestIdx >= 0 ? THEME_COLORS[largestIdx].stroke : undefined }}>
                  {largest.name}
                </span>
                <span className="text-sm font-bold ml-auto text-primary">
                  {largest.basketSize} stocks
                </span>
              </div>
            )
          })()}
        </div>
      </ComparisonCard>
    </motion.div>
  )
}

// --- Helper Components ---

function ComparisonCard({ icon: Icon, title, subtitle, children }: {
  icon: any; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </motion.div>
  )
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold font-mono', valueClass)}>{value}</span>
    </div>
  )
}

function BasketOverlapAnalysis({ data }: { data: ThemeComparison[] }) {
  // Find overlapping tickers across themes
  const tickerMap = new Map<string, string[]>() // ticker → theme names
  for (const theme of data) {
    for (const member of theme.basketMembers) {
      const ticker = (member.ticker || member.companyName).toUpperCase()
      const existing = tickerMap.get(ticker) || []
      if (!existing.includes(theme.name)) {
        tickerMap.set(ticker, [...existing, theme.name])
      }
    }
  }

  const overlaps = Array.from(tickerMap.entries())
    .filter(([, themes]) => themes.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  if (overlaps.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-border/40">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Shared Holdings ({overlaps.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {overlaps.map(([ticker, themes]) => (
          <span
            key={ticker}
            className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium"
            title={`In: ${themes.join(', ')}`}
          >
            {ticker}
          </span>
        ))}
      </div>
    </div>
  )
}
