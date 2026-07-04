'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign, BarChart3,
  Pause, Play, Square, Clock, CheckCircle2, XCircle, AlertTriangle,
  Activity, RefreshCw, Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface PaperTradeData {
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
  orders: Array<{
    id: string
    ticker: string
    side: string
    orderType: string
    targetPrice: number
    quantity: number
    filledPrice: number | null
    status: string
    notes: string | null
    filledAt: string | null
    createdAt: string
  }>
  positions: Array<{
    id: string
    ticker: string
    quantity: number
    avgCostBasis: number
    currentPrice: number
    marketValue: number
    unrealizedPnl: number
    lastUpdatedAt: string
  }>
  tradeLog: Array<{
    id: string
    action: string
    ticker: string | null
    details: string
    priceAtAction: number | null
    createdAt: string
  }>
    strategy: {
    name: string | null
    amount: number
    riskProfile: string
    status: string
  }
}

export default function PaperTradePage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const params = useParams()
  const thesisId = params?.id as string
  const tradeId = params?.tradeId as string

  const [trade, setTrade] = useState<PaperTradeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTrade = useCallback(async () => {
    try {
      const res = await fetch(`/api/paper-trade/${tradeId}`)
      if (res.ok) {
        setTrade(await res.json())
      } else {
        router.push(`/thesis/${thesisId}`)
      }
    } catch {
      router.push(`/thesis/${thesisId}`)
    } finally {
      setLoading(false)
    }
  }, [tradeId, thesisId, router])

  useEffect(() => {
    if (tradeId) fetchTrade()
  }, [tradeId, fetchTrade])

  const handleAction = async (action: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/paper-trade/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        toast.success(`Trade ${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'completed'}`)
        await fetchTrade()
      } else {
        const err = await res.json()
        toast.error(err?.error ?? 'Action failed')
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleManualCheck = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/paper-trade/check-prices', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Price check done. ${data.ordersFilled} orders filled.`)
        await fetchTrade()
      } else {
        toast.error('Price check failed')
      }
    } catch {
      toast.error('Price check failed')
    } finally {
      setRefreshing(false)
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

  if (!trade) return null

  const pendingOrders = trade.orders.filter((o) => o.status === 'pending')
  const filledOrders = trade.orders.filter((o) => o.status === 'filled')
  const pnlColor = trade.pnl >= 0 ? 'text-primary' : 'text-red-400'
  const pnlBg = trade.pnl >= 0 ? 'bg-primary/10' : 'bg-red-500/10'

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1100px] mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/thesis/${thesisId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Analysis
        </button>

        {/* Header */}
        <div className="mb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
                <Activity className="w-8 h-8 text-primary" />
                {trade.name || 'Paper Trade Dashboard'}
              </h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-sm mt-1">
                <span>${trade.initialCapital.toLocaleString()}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>Started {new Date(trade.startedAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>Risk: {trade.strategy.riskProfile}</span>
                {trade.strategy.name && (
                  <span className="text-xs">· Strategy: {trade.strategy.name}</span>
                )}
                {trade.status === 'active' && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">ACTIVE</span>
                )}
                {trade.status === 'paused' && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-xs font-mono">PAUSED</span>
                )}
                {trade.status === 'completed' && (
                  <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-mono">COMPLETED</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {trade.status === 'active' && (
                <>
                  <button
                    onClick={handleManualCheck}
                    disabled={refreshing}
                    className="px-3 py-2 border border-border rounded-lg text-sm flex items-center gap-1.5 hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Check Prices
                  </button>
                  <button
                    onClick={() => handleAction('pause')}
                    disabled={actionLoading}
                    className="px-3 py-2 border border-amber-500/30 text-amber-500 rounded-lg text-sm flex items-center gap-1.5 hover:bg-amber-500/10 transition-colors"
                  >
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                  <button
                    onClick={() => handleAction('complete')}
                    disabled={actionLoading}
                    className="px-3 py-2 border border-red-500/30 text-red-400 rounded-lg text-sm flex items-center gap-1.5 hover:bg-red-500/10 transition-colors"
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                </>
              )}
              {trade.status === 'paused' && (
                <>
                  <button
                    onClick={() => handleAction('resume')}
                    disabled={actionLoading}
                    className="px-3 py-2 bg-primary hover:bg-primary text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-4 h-4" /> Resume
                  </button>
                  <button
                    onClick={() => handleAction('complete')}
                    disabled={actionLoading}
                    className="px-3 py-2 border border-red-500/30 text-red-400 rounded-lg text-sm flex items-center gap-1.5 hover:bg-red-500/10 transition-colors"
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">TOTAL VALUE</p>
            <p className="text-lg md:text-xl font-mono font-bold">${trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className={`${pnlBg} border border-border rounded-xl p-4`} style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">P&L</p>
            <p className={`text-lg md:text-xl font-mono font-bold ${pnlColor}`}>
              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-sm ml-1">({trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)</span>
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">CASH</p>
            <p className="text-lg md:text-xl font-mono font-bold">${trade.currentCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">ORDERS</p>
            <p className="text-lg md:text-xl font-mono font-bold">
              {filledOrders.length}<span className="text-sm text-muted-foreground">/{trade.orders.length}</span>
              <span className="text-xs text-muted-foreground ml-1">filled</span>
            </p>
          </div>
        </div>

        {/* Positions */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> POSITIONS ({trade.positions.length})
          </h3>
          {trade.positions.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 py-4 text-center">No open positions yet. Waiting for orders to fill.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-right py-2 pr-4">Qty</th>
                    <th className="text-right py-2 pr-4">Avg Cost</th>
                    <th className="text-right py-2 pr-4">Current</th>
                    <th className="text-right py-2 pr-4">Mkt Value</th>
                    <th className="text-right py-2">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trade.positions.map((pos) => (
                    <tr key={pos.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 font-mono font-medium text-primary">{pos.ticker}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{Math.floor(pos.quantity)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">${pos.avgCostBasis.toFixed(2)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">${pos.currentPrice.toFixed(2)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">${pos.marketValue.toFixed(2)}</td>
                      <td className={`py-2.5 text-right font-mono font-medium ${pos.unrealizedPnl >= 0 ? 'text-primary' : 'text-red-400'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {trade.positions.map((pos) => (
                  <div key={pos.id} className="bg-muted/20 rounded-lg p-3 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-medium text-primary">{pos.ticker}</span>
                      <span className={`font-mono text-sm font-medium ${pos.unrealizedPnl >= 0 ? 'text-primary' : 'text-red-400'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Qty: <span className="font-mono">{Math.floor(pos.quantity)}</span></span>
                      <span>Cost: <span className="font-mono">${pos.avgCostBasis.toFixed(2)}</span></span>
                      <span>Current: <span className="font-mono">${pos.currentPrice.toFixed(2)}</span></span>
                      <span>Value: <span className="font-mono">${pos.marketValue.toFixed(2)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" /> PENDING ORDERS ({pendingOrders.length})
            </h3>
            {/* Limit Buy Orders */}
            {pendingOrders.some((o) => o.side === 'buy') && (
              <div className="mb-4">
                <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> LIMIT BUY ORDERS
                </p>
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-4">Ticker</th>
                        <th className="text-right py-2 pr-4">Limit Price</th>
                        <th className="text-right py-2 pr-4">Qty</th>
                        <th className="text-right py-2 pr-4">Est. Cost</th>
                        <th className="text-right py-2">Allocation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.filter((o) => o.side === 'buy').map((order) => (
                        <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 pr-4 font-mono font-medium text-primary">{order.ticker}</td>
                          <td className="py-2.5 pr-4 text-right font-mono font-bold text-primary">
                            ${order.targetPrice.toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono">{Math.floor(order.quantity)}</td>
                          <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground">
                            ${(order.targetPrice * order.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                              {order.orderType.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="space-y-3 md:hidden">
                    {pendingOrders.filter((o) => o.side === 'buy').map((order) => (
                      <div key={order.id} className="bg-muted/20 rounded-lg p-3 border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-medium text-primary">{order.ticker}</span>
                          <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                            {order.orderType.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <span>Limit: <span className="font-mono font-bold text-primary">${order.targetPrice.toFixed(2)}</span></span>
                          <span>Qty: <span className="font-mono">{Math.floor(order.quantity)}</span></span>
                          <span>Est. Cost: <span className="font-mono">${(order.targetPrice * order.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              </div>
            )}
            {/* Sell Orders (Stop Loss / Take Profit) */}
            {pendingOrders.some((o) => o.side === 'sell') && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">EXIT ORDERS</p>
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-4">Ticker</th>
                        <th className="text-left py-2 pr-4">Type</th>
                        <th className="text-right py-2 pr-4">Trigger Price</th>
                        <th className="text-right py-2 pr-4">Qty</th>
                        <th className="text-right py-2">Est. Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.filter((o) => o.side === 'sell').map((order) => (
                        <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 pr-4 font-mono font-medium">{order.ticker}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              order.orderType === 'stop-loss'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-primary/10 text-primary'
                            }`}>
                              {order.orderType === 'stop-loss' ? 'Stop Loss' : 'Take Profit'}
                            </span>
                          </td>
                          <td className={`py-2.5 pr-4 text-right font-mono ${
                            order.orderType === 'stop-loss' ? 'text-red-400' : 'text-primary'
                          }`}>
                            ${order.targetPrice.toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono">{Math.floor(order.quantity)}</td>
                          <td className="py-2.5 text-right font-mono text-muted-foreground">
                            ${(order.targetPrice * order.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="space-y-3 md:hidden">
                    {pendingOrders.filter((o) => o.side === 'sell').map((order) => (
                      <div key={order.id} className="bg-muted/20 rounded-lg p-3 border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-medium">{order.ticker}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            order.orderType === 'stop-loss'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-primary/10 text-primary'
                          }`}>
                            {order.orderType === 'stop-loss' ? 'Stop Loss' : 'Take Profit'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <span>Trigger: <span className={`font-mono ${order.orderType === 'stop-loss' ? 'text-red-400' : 'text-primary'}`}>${order.targetPrice.toFixed(2)}</span></span>
                          <span>Qty: <span className="font-mono">{Math.floor(order.quantity)}</span></span>
                          <span>Est. Value: <span className="font-mono">${(order.targetPrice * order.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              </div>
            )}
          </div>
        )}

        {/* Filled Orders */}
        {filledOrders.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> FILLED ORDERS ({filledOrders.length})
            </h3>
            <div className="space-y-2">
              {filledOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
                      order.side === 'buy' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className="font-mono font-medium">{order.ticker}</span>
                    <span className="text-muted-foreground">{Math.floor(order.quantity)} @ ${order.filledPrice?.toFixed(2)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {order.filledAt ? new Date(order.filledAt).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade Log */}
        <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">ACTIVITY LOG</h3>
          {trade.tradeLog.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 py-4 text-center">No activity yet.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {trade.tradeLog.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-2 text-sm">
                  <div className="mt-0.5 flex-shrink-0">
                    {log.action === 'order_filled' ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : log.action === 'price_check' ? (
                      <RefreshCw className="w-4 h-4 text-blue-400" />
                    ) : log.action.includes('stop') ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Activity className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground text-xs leading-relaxed">{log.details}</p>
                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {trade.lastCheckedAt && (
          <p className="text-xs text-muted-foreground/50 text-center mt-4">
            Last price check: {new Date(trade.lastCheckedAt).toLocaleString()}
          </p>
        )}
      </main>
    </div>
  )
}
