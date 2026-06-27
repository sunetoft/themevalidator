'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, DollarSign, Shield, ChevronRight, Loader2,
  Play, CheckCircle2, Clock, AlertTriangle, Layers, Sparkles, Trash2, Eye, Target
} from 'lucide-react'
import { toast } from 'sonner'

interface ThesisGroup {
  id: string
  title: string
  overallScore: number | null
  status: string
  tradeStrategies: Array<{
    id: string
    name: string | null
    amount: number
    riskProfile: string
    status: string
    strategy: string | null
    createdAt: string
    updatedAt: string
    entryTrades: number
    _count: { paperTrades: number }
  }>
}

const riskColors: Record<string, string> = {
  High: 'text-red-400 bg-red-500/10 border-red-500/20',
  Medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Low: 'text-primary bg-primary/10 border-primary/20',
}

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-primary" />,
  generating: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  failed: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
}

export default function StrategiesPage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const [groups, setGroups] = useState<ThesisGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchStrategies()
  }, [])

  const fetchStrategies = async () => {
    try {
      const res = await fetch('/api/strategies')
      if (res.ok) setGroups(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const handleDelete = async (e: React.MouseEvent, strategyId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this strategy? All associated paper trades will also be deleted.')) return
    setDeletingId(strategyId)
    try {
      const res = await fetch(`/api/strategies?id=${strategyId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Strategy deleted')
        // Remove from local state
        setGroups(prev => prev.map(g => ({
          ...g,
          tradeStrategies: g.tradeStrategies.filter(s => s.id !== strategyId)
        })).filter(g => g.tradeStrategies.length > 0))
      } else {
        toast.error('Failed to delete strategy')
      }
    } catch {
      toast.error('Failed to delete strategy')
    } finally {
      setDeletingId(null)
    }
  }

  const totalStrategies = groups.reduce((sum, g) => sum + g.tradeStrategies.length, 0)
  const completedStrategies = groups.reduce(
    (sum, g) => sum + g.tradeStrategies.filter((s) => s.status === 'completed').length, 0
  )
  const totalCapital = groups.reduce(
    (sum, g) => sum + g.tradeStrategies.reduce((s2, s) => s2 + s.amount, 0), 0
  )

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            Trading Strategies
          </h1>
          <p className="text-muted-foreground mt-2">All your trading strategies organized by investment theme.</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">TOTAL STRATEGIES</p>
            <p className="text-2xl font-mono font-bold">{totalStrategies}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">COMPLETED</p>
            <p className="text-2xl font-mono font-bold text-primary">{completedStrategies}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground mb-1">TOTAL CAPITAL</p>
            <p className="text-2xl font-mono font-bold">${totalCapital.toLocaleString()}</p>
          </div>
        </div>

        {/* Grouped Strategies */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-xl" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No trading strategies yet.</p>
            <p className="text-sm text-muted-foreground/60">Create a strategy from any completed thesis analysis.</p>
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
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors border-b border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <h2 className="font-display font-semibold text-base">{group.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          {group.tradeStrategies.length} strateg{group.tradeStrategies.length === 1 ? 'y' : 'ies'}
                          {group.overallScore != null && (
                            <span className="ml-2">· Score: {group.overallScore}/100</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* Strategies */}
                  <div className="divide-y divide-border/50">
                    {group.tradeStrategies.map((strategy) => (
                      <div
                        key={strategy.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors text-left group/item"
                      >
                        <button
                          onClick={() => router.push(`/thesis/${group.id}/strategy?strategyId=${strategy.id}`)}
                          className="flex items-center gap-4 min-w-0 flex-1"
                        >
                          <div className="flex-shrink-0">
                            {statusIcons[strategy.status] || statusIcons.pending}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate max-w-[280px]">
                                {strategy.name || `$${strategy.amount.toLocaleString()}`}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${riskColors[strategy.riskProfile] || riskColors.Medium}`}>
                                <Shield className="w-3 h-3 inline mr-1" />
                                {strategy.riskProfile}
                              </span>
                              <span className="text-xs text-muted-foreground capitalize">{strategy.status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              ${strategy.amount.toLocaleString()} · {new Date(strategy.createdAt).toLocaleDateString()}
                              {strategy.entryTrades > 0 && (
                                <span className="ml-2 text-blue-400">
                                  <Target className="w-3 h-3 inline mr-0.5" />
                                  {strategy.entryTrades} entr{strategy.entryTrades === 1 ? 'y' : 'ies'}
                                </span>
                              )}
                              {strategy._count.paperTrades > 0 && (
                                <span className="ml-2 text-primary">
                                  <Play className="w-3 h-3 inline mr-0.5" />
                                  {strategy._count.paperTrades} paper trade{strategy._count.paperTrades > 1 ? 's' : ''}
                                </span>
                              )}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => router.push(`/thesis/${group.id}/strategy?strategyId=${strategy.id}`)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover/item:opacity-100"
                            title="View strategy"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, strategy.id)}
                            disabled={deletingId === strategy.id}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover/item:opacity-100 disabled:opacity-50"
                            title="Delete strategy"
                          >
                            {deletingId === strategy.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
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