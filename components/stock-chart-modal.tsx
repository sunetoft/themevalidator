'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface PricePoint {
  date: string
  price: number
}

interface ChartData {
  ticker: string
  currentPrice: number | null
  yearChange: number | null
  threeMonthChange: number | null
  yearHigh: number | null
  yearLow: number | null
  oneYear: PricePoint[]
  threeMonths: PricePoint[]
  _cached?: boolean
  _cachedAt?: number
  _stale?: boolean
}

interface Props {
  ticker: string
  companyName?: string
  onClose: () => void
}

export default function StockChartModal({ ticker, companyName, onClose }: Props) {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChart()
  }, [ticker])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const fetchChart = async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const url = `/api/stock-chart?ticker=${encodeURIComponent(ticker)}${forceRefresh ? '&refresh=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const d = await res.json()
      setData(d)
    } catch {
      setError('Failed to load chart data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as PricePoint
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground">{formatDate(point.date)}</p>
        <p className="font-mono text-sm font-bold text-foreground">${point.price.toFixed(2)}</p>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="font-mono font-bold text-primary text-sm">{ticker}</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-base">{ticker}</h3>
                {companyName && <p className="text-xs text-muted-foreground">{companyName}</p>}
              </div>
              {data?.currentPrice && (
                <div className="ml-4 flex items-center gap-3">
                  <span className="font-mono text-lg font-bold">${data.currentPrice.toFixed(2)}</span>
                  {data.yearChange !== null && (
                    <span className={`flex items-center gap-1 text-sm font-medium ${data.yearChange >= 0 ? 'text-primary' : 'text-red-400'}`}>
                      {data.yearChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {data.yearChange >= 0 ? '+' : ''}{data.yearChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
              {data?._cached && (
                <span className="ml-2 text-xs text-muted-foreground" title={data._cachedAt ? `Cached at ${new Date(data._cachedAt).toLocaleString()}` : 'Cached'}>
                  {data._stale && '⚠ '}
                  {data._cachedAt
                    ? `cached ${new Date(data._cachedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${new Date(data._cachedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                    : 'cached'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchChart(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                title="Refresh from Yahoo Finance"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <p className="text-red-400">{error}</p>
                <button onClick={() => fetchChart()} className="mt-3 text-sm text-primary hover:underline">Retry</button>
              </div>
            ) : data ? (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">52W HIGH</p>
                    <p className="font-mono text-sm font-bold">${data.yearHigh?.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">52W LOW</p>
                    <p className="font-mono text-sm font-bold">${data.yearLow?.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">3M CHANGE</p>
                    <p className={`font-mono text-sm font-bold ${data.threeMonthChange && data.threeMonthChange >= 0 ? 'text-primary' : 'text-red-400'}`}>
                      {data.threeMonthChange !== null ? `${data.threeMonthChange >= 0 ? '+' : ''}${data.threeMonthChange.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">1Y CHANGE</p>
                    <p className={`font-mono text-sm font-bold ${data.yearChange && data.yearChange >= 0 ? 'text-primary' : 'text-red-400'}`}>
                      {data.yearChange !== null ? `${data.yearChange >= 0 ? '+' : ''}${data.yearChange.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>

                {/* 1 Year Chart */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">1 Year Price Action</h4>
                  <div className="bg-muted/20 border border-border/50 rounded-xl p-4" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.oneYear} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <defs>
                          <linearGradient id="color1Y" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142 60% 45%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(142 60% 45%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateShort}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          width={60}
                          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        {(data.yearChange ?? 0) >= 0 && (
                          <ReferenceLine y={data.oneYear[0]?.price} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.3} />
                        )}
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="hsl(142 60% 45%)"
                          strokeWidth={2}
                          fill="url(#color1Y)"
                          animationDuration={600}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3 Months Chart */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">3 Months Price Action</h4>
                  <div className="bg-muted/20 border border-border/50 rounded-xl p-4" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.threeMonths} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <defs>
                          <linearGradient id="color3M" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={30}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          width={60}
                          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#color3M)"
                          animationDuration={600}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
