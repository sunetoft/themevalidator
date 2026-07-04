'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, DollarSign, TrendingUp, TrendingDown, ChevronRight, ChevronDown,
  Layers, Sparkles, Pause, CheckCircle2, BarChart3, Clock, Trash2, Loader2,
  Eye, Square, Sigma
} from 'lucide-react'
import { toast } from 'sonner'
import { sharpeColorClass } from '@/lib/sharpe'
import PerformanceChart from '@/components/performance-chart'

/** Staleness badge — shows how long since last price check */
function StalenessBadge({ lastCheckedAt, status }: { lastCheckedAt: string; status: string }) {
  if (status !== 'active') return null
  const now = Date.now()
  const checked = new Date(lastCheckedAt).getTime()
  const minutesAgo = Math.floor((now - checked) / 60000)

  if (minutesAgo < 1) return <span className="text-success">Updated just now</span>
  if (minutesAgo < 15) return <span className="text-success">Updated {minutesAgo}m ago</span>
  if (minutesAgo < 60) return <span className="text-amber-500">Updated {minutesAgo}m ago</span>
  if (minutesAgo < 1440) return <span className="text-orange-500">Updated {Math.floor(minutesAgo / 60)}h ago</span>
  return <span className="text-red-400">Updated {Math.floor(minutesAgo / 1440)}d ago</span>
}

interface PaperTradeItem {
  id: string
  name: string | null
  initialCapital: number
  currentCash: number
  totalValue: number
  pnl: number
  pnlPercent: number
  status: string
  lastCheckedAt: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  strategy: { riskProfile: string; amount: number }
  _count: { orders: number; positions: number }
  positions?: Array<{
    ticker: string
    quantity: number
    avgCostBasis: number
    currentPrice: number
    marketValue: number
    unrealizedPnl: number
  }>
  orders?: Array<{
    id: string
    ticker: string
    side: string
    orderType: string
    targetPrice: number
    quantity: number
  }>
  sharpeRatio?: number | null
  tickerSharpe?: Record<string, number | null>
}

interface ThesisGroup {
  id: string
  title: string
  overallScore: number | null
  status: string
  paperTrades: PaperTradeItem[]
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active: { label: 'Active', color: 'bg-primary/10 text-primary', icon: <Activity className="w-3.5 h-3.5" /> },
  paused: { label: 'Paused', color: 'bg-amber-500/10 text-amber-500', icon: <Pause className="w-3.5 h-3.5" /> },
  completed: { label: 'Completed', color: 'bg-muted text-muted-foreground', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
}

export default function PaperTradesPage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const [groups, setGroups] = useState<ThesisGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null)


  useEffect(() => {
    fetchPaperTrades()
  }, [])

  const fetchPaperTrades = async () => {
    try {
      const res = await fetch('/api/paper-trades')
      if (res.ok) setGroups(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const handleDelete = async (e: React.MouseEvent, tradeId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this paper trade? This action cannot be undone.')) return
    setDeletingId(tradeId)
    try {
      const res = await fetch(`/api/paper-trades?id=${tradeId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Paper trade deleted')
        setGroups(prev => prev.map(g => ({
          ...g,
          paperTrades: g.paperTrades.filter(t => t.id !== tradeId)
        })).filter(g => g.paperTrades.length > 0))
      } else {
        toast.error('Failed to delete paper trade')
      }
    } catch {
      toast.error('Failed to delete paper trade')
    } finally {
      setDeletingId(null)
    }
  }

  const handleComplete = async (e: React.MouseEvent, tradeId: string) => {
    e.stopPropagation()
    if (!confirm('Stop this paper trade? All pending orders will be cancelled.')) return
    try {
      const res = await fetch(`/api/paper-trade/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (res.ok) {
        toast.success('Paper trade stopped')
        fetchPaperTrades()
      } else {
        toast.error('Failed to stop paper trade')
      }
    } catch {
      toast.error('Failed to stop paper trade')
    }
  }

  const toggleBasket = (tradeId: string) => {
    setExpandedTrade(prev => prev === tradeId ? null : tradeId)
  }

  const allTrades = groups.flatMap((g) => g.paperTrades)
  const activeTrades = allTrades.filter((t) => t.status === 'active')
  const totalValue = allTrades.reduce((sum, t) => sum + t.totalValue, 0)
  const totalPnl = allTrades.reduce((sum, t) => sum + t.pnl, 0)
  const totalInitial = allTrades.reduce((sum, t) => sum + t.initialCapital, 0)
  const overallPnlPct = totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            Paper Trades
          </h1>
          <p className="text-muted-foreground mt-2">Monitor all your paper trading sessions across investment themes.</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">ACTIVE TRADES</p>
            <p className="text-2xl font-mono font-bold text-primary">{activeTrades.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">TOTAL VALUE</p>
            <p className="text-2xl font-mono font-bold">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className={`${totalPnl >= 0 ? 'bg-primary/5' : 'bg-red-500/5'} border border-border rounded-xl p-4`} style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">TOTAL P&L</p>
            <p className={`text-2xl font-mono font-bold ${totalPnl >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">RETURN</p>
            <p className={`text-2xl font-mono font-bold ${overallPnlPct >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {overallPnlPct >= 0 ? '+' : ''}{overallPnlPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Grouped Paper Trades */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-xl" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No paper trades yet.</p>
            <p className="text-sm text-muted-foreground/60">Start a paper trade from any completed trading strategy.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {groups.map((group, gi) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.05 }}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                  style={{ boxShadow: 'var(--shadow-sm)' }}
                >
                  {/* Theme Header */}
                  <button
                    onClick={() => router.push(`/thesis/${group.id}`)}
                    className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/30 transition-colors border-b border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <h2 className="font-display font-semibold text-base">{group.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          {group.paperTrades.length} paper trade{group.paperTrades.length > 1 ? 's' : ''}
                          {group.overallScore != null && (
                            <span className="ml-2">· Score: {group.overallScore}/100</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* Trades */}
                  <div className="divide-y divide-border/50">
                    {group.paperTrades.map((trade) => {
                      const cfg = statusConfig[trade.status] || statusConfig.active
                      const isExpanded = expandedTrade === trade.id
                      const positions = trade.positions || []
                      const pendingOrders = trade.orders || []

                      return (
                        <div key={trade.id}>
                          <div className="flex items-center justify-between p-3 sm:p-4 hover:bg-muted/20 transition-colors text-left group/item">
                            <button
                              onClick={() => router.push(`/thesis/${group.id}/paper-trade/${trade.id}`)}
                              className="flex items-center gap-4 min-w-0 flex-1"
                            >
                              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${trade.pnl >= 0 ? 'bg-primary/10' : 'bg-red-500/10'}`}>
                                {trade.pnl >= 0 ? (
                                  <TrendingUp className="w-4 h-4 text-primary" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm truncate max-w-[280px]">
                                    {trade.name || `$${trade.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color} flex items-center gap-1`}>
                                    {cfg.icon} {cfg.label}
                                  </span>
                                  <span className={`font-mono text-xs font-medium ${trade.pnl >= 0 ? 'text-primary' : 'text-red-400'}`}>
                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                                  </span>
                                  {trade.sharpeRatio !== undefined && trade.sharpeRatio !== null && (
                                    <span className={`flex items-center gap-0.5 font-mono text-xs font-medium ${sharpeColorClass(trade.sharpeRatio)}`} title="Sharpe Ratio">
                                      <Sigma className="w-3 h-3" />
                                      {trade.sharpeRatio.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ${trade.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  <span className="mx-1">·</span>
                                  Started {new Date(trade.startedAt).toLocaleDateString()}
                                  <span className="mx-1">·</span>
                                  {trade._count.positions} positions
                                  <span className="mx-1">·</span>
                                  {trade._count.orders} orders
                                  {trade.lastCheckedAt && (
                                    <>
                                      <span className="mx-1">·</span>
                                      <StalenessBadge lastCheckedAt={trade.lastCheckedAt} status={trade.status} />
                                    </>
                                  )}
                                </p>
                              </div>
                            </button>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Expand basket button */}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBasket(trade.id) }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isExpanded
                                    ? 'text-primary bg-primary/10'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 opacity-100 md:opacity-0 md:group-hover/item:opacity-100'
                                }`}
                                title="View stock basket"
                              >
                                <BarChart3 className="w-4 h-4" />
                              </button>

                              {/* Stop button for active trades */}
                              {trade.status === 'active' && (
                                <button
                                  onClick={(e) => handleComplete(e, trade.id)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors opacity-100 md:opacity-0 md:group-hover/item:opacity-100"
                                  title="Stop trade"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                onClick={(e) => handleDelete(e, trade.id)}
                                disabled={deletingId === trade.id}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-100 md:opacity-0 md:group-hover/item:opacity-100 disabled:opacity-50"
                                title="Delete paper trade"
                              >
                                {deletingId === trade.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>

                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>

                          {/* Expanded Basket Monitor */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                              <div className="px-4 pb-4">
                                <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
                                  {/* Performance Chart */}
                                  <PerformanceChart tradeId={trade.id} initialCapital={trade.initialCapital} />

                                  {/* Pending Orders */}
                                  {pendingOrders.length > 0 && (
                                    <div className="mb-3">
                                      <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5" />
                                        PENDING ORDERS ({pendingOrders.length})
                                      </h4>
                                      <div className="space-y-1">
                                        {pendingOrders.map((order: any) => (
                                          <div key={order.id} className="flex flex-wrap items-center justify-between gap-1 py-1 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono font-medium text-primary w-14">{order.ticker}</span>
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                order.side === 'buy'
                                                  ? 'bg-primary/10 text-primary'
                                                  : order.orderType === 'stop-loss'
                                                    ? 'bg-red-500/10 text-red-400'
                                                    : 'bg-primary/10 text-primary'
                                              }`}>
                                                {order.side === 'buy' ? 'BUY' : order.orderType === 'stop-loss' ? 'SL' : 'TP'}
                                              </span>
                                              <span className="text-muted-foreground">
                                                {Math.floor(order.quantity)} @ ${order.targetPrice.toFixed(2)}
                                              </span>
                                            </div>
                                            <span className="font-mono text-muted-foreground">
                                              ${(order.targetPrice * order.quantity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Positions */}
                                  <h4 className={`text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2 ${pendingOrders.length > 0 ? 'pt-3 border-t border-border/50' : ''}`}>
                                    <BarChart3 className="w-3.5 h-3.5" />
                                    STOCK BASKET MONITOR
                                  </h4>
                                    {positions.length === 0 ? (
                                      <p className="text-xs text-muted-foreground text-center py-3">
                                        No open positions. Waiting for orders to fill.
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {positions.map((pos: any) => {
                                          const pnlPct = pos.avgCostBasis > 0
                                            ? ((pos.currentPrice - pos.avgCostBasis) / pos.avgCostBasis) * 100
                                            : 0
                                          return (
                                            <div key={pos.ticker} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-medium text-primary w-14">{pos.ticker}</span>
                                                <span className="text-xs text-muted-foreground">
                                                  {Math.floor(pos.quantity)} shares
                                                </span>
                                                {trade.tickerSharpe && trade.tickerSharpe[pos.ticker] !== undefined && trade.tickerSharpe[pos.ticker] !== null && (
                                                  <span className={`flex items-center gap-0.5 font-mono text-xs ${sharpeColorClass(trade.tickerSharpe[pos.ticker])}`} title="Sharpe Ratio">
                                                    <Sigma className="w-3 h-3" />
                                                    {trade.tickerSharpe[pos.ticker]!.toFixed(2)}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 sm:gap-4">
                                                <div className="text-right">
                                                  <span className="text-xs text-muted-foreground">@ ${pos.currentPrice.toFixed(2)}</span>
                                                </div>
                                                <div className="text-right min-w-[80px]">
                                                  <span className={`font-mono text-sm font-medium ${
                                                    pos.unrealizedPnl >= 0 ? 'text-primary' : 'text-red-400'
                                                  }`}>
                                                    {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                                                  </span>
                                                  <span className={`ml-1.5 text-xs ${
                                                    pnlPct >= 0 ? 'text-primary/70' : 'text-red-400/70'
                                                  }`}>
                                                    ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                        {/* Basket total */}
                                        <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between">
                                          <span className="text-xs font-medium text-muted-foreground">Total Portfolio Value</span>
                                          <span className="font-mono text-sm font-medium">
                                            ${trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                        {trade.sharpeRatio !== undefined && trade.sharpeRatio !== null && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                              <Sigma className="w-3 h-3" />
                                              Basket Sharpe Ratio
                                            </span>
                                            <span className={`font-mono text-sm font-bold ${sharpeColorClass(trade.sharpeRatio)}`}>
                                              {trade.sharpeRatio.toFixed(2)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}