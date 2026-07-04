'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScoreBadge from '@/components/score-badge'
import {
  Zap, Plus, Clock, TrendingUp, Target, Trash2, ExternalLink,
  Search, ChevronRight, BarChart3, AlertTriangle, Shield,
  Crown, CreditCard, Lock, RotateCw, ArrowDownUp
} from 'lucide-react'
import { toast } from 'sonner'
import ScoringMethodologyModal from '@/components/scoring-methodology'

interface Thesis {
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
  basketMembers: Array<{ companyName: string; ticker: string | null }>
}

export default function DashboardPage() {
  const { data: session, status } = useSession() || {}
  const router = useRouter()
  const [theses, setTheses] = useState<Thesis[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'status'>('newest')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<{
    active: boolean
    plan: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    paperTradeCount: number
    maxPaperTrades: number
  } | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTheses()
      fetchSubscription()
    }
  }, [status])

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/subscription')
      if (res.ok) {
        const data = await res.json()
        setSubscription(data)
      }
    } catch (err: any) {
      console.error('Subscription fetch error:', err)
    }
  }

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      if (res.ok) {
        const { url } = await res.json()
        window.location.href = url
      } else {
        toast.error('Failed to open billing portal')
      }
    } catch {
      toast.error('Failed to open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  const fetchTheses = async () => {
    try {
      const res = await fetch('/api/theses')
      if (res.ok) {
        const data = await res.json()
        setTheses(data ?? [])
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const deleteThesis = async (id: string) => {
    if (!confirm('Delete this thesis analysis?')) return
    try {
      const res = await fetch(`/api/theses/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTheses((prev) => (prev ?? []).filter((t: Thesis) => t?.id !== id))
        toast.success('Thesis deleted')
      }
    } catch (err: any) {
      toast.error('Failed to delete')
    }
  }

  const filteredTheses = (theses ?? [])
    .filter((t: Thesis) =>
      (t?.title ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
      (t?.description ?? '').toLowerCase().includes((search ?? '').toLowerCase())
    )

  // Sort the filtered list
  const sortedTheses = [...filteredTheses].sort((a: Thesis, b: Thesis) => {
    if (sortBy === 'score') {
      return (b?.overallScore ?? 0) - (a?.overallScore ?? 0)
    } else if (sortBy === 'status') {
      // failed first, then analyzing, then completed
      const order = { failed: 0, analyzing: 1, completed: 2 } as Record<string, number>
      return (order[a?.status] ?? 3) - (order[b?.status] ?? 3)
    }
    // newest first (default)
    return new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime()
  })

  const retryThesis = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`/api/theses/${id}/retry`, { method: 'POST' })
      if (res.ok && res.body) {
        // Read the SSE stream to know when it's done
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let done = false
        while (!done) {
          const { value, done: streamDone } = await reader.read()
          done = streamDone
          if (value) {
            const text = decoder.decode(value)
            if (text.includes('"status":"completed"') || text.includes('"status":"error"')) {
              break
            }
          }
        }
        toast.success('Analysis re-run successfully')
        fetchTheses() // refresh list
      } else {
        toast.error('Retry failed')
      }
    } catch (err: any) {
      toast.error('Retry failed: ' + (err?.message ?? 'unknown error'))
    } finally {
      setRetrying(null)
    }
  }

  const completedTheses = (theses ?? []).filter((t: Thesis) => t?.status === 'completed')
  const avgScore = completedTheses.length > 0
    ? Math.round(completedTheses.reduce((sum: number, t: Thesis) => sum + (t?.overallScore ?? 0), 0) / completedTheses.length)
    : 0

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1200px] mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-3xl font-bold tracking-tight mb-2">
            Investment <span className="text-primary">Theme</span> Dashboard
          </h1>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <p className="text-muted-foreground">Track and validate emerging investment themes with AI-powered analysis.</p>
            <ScoringMethodologyModal />
          </div>
        </div>

        {/* Subscription status banner */}
        {subscription && (() => {
          const isAdminUser = (session?.user as any)?.role === 'admin'
          if (isAdminUser) return null // admin doesn't need to see subscription UI

          if (!subscription.active) {
            return (
              <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 animate-fade-in-d1">
                <div className="rounded-lg bg-amber-500/10 p-2.5">
                  <Lock className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Free Plan — Limited Access</p>
                  <p className="text-xs text-muted-foreground">
                    Subscribe to create trading strategies and run up to {subscription.maxPaperTrades || 20} paper trades.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/pricing')}
                  className="mt-3 sm:mt-0 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  <Crown className="w-4 h-4" />
                  Upgrade
                </button>
              </div>
            )
          }

          // Active subscription
          return (
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-fade-in-d1">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Crown className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">Pro Member</p>
                  {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full">
                      Cancels {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Paper trades: {subscription.paperTradeCount}/{subscription.maxPaperTrades} used
                  {subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd &&
                    ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  }
                </p>
              </div>
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="mt-3 sm:mt-0 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                {portalLoading ? 'Loading...' : 'Manage'}
              </button>
            </div>
          )
        })()}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in-d1">
          {[
            { icon: Target, label: 'Total Analyses', value: theses?.length ?? 0, color: 'text-primary' },
            { icon: TrendingUp, label: 'Avg Score', value: avgScore, color: 'text-blue-500' },
            { icon: BarChart3, label: 'Completed', value: completedTheses?.length ?? 0, color: 'text-purple-500' },
            { icon: Shield, label: 'High Conviction', value: completedTheses.filter((t: Thesis) => (t?.overallScore ?? 0) >= 70)?.length ?? 0, color: 'text-amber-500' },
          ].map((stat: any, i: number) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
              <p className="font-mono text-xl md:text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search theses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'score' | 'status')}
              className="px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            >
              <option value="newest">Newest</option>
              <option value="score">Highest Score</option>
              <option value="status">Status</option>
            </select>
          </div>
          <button
            onClick={() => router.push('/analyze')}
            className="px-5 py-2.5 bg-primary hover:bg-primary text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Analysis
          </button>
        </div>

        {/* Thesis list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i: number) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6 animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-3" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : sortedTheses.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-2">No analyses found</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {search ? 'No theses match your search.' : 'Start validating investment themes by creating your first analysis.'}
            </p>
            {!search && (
              <button
                onClick={() => router.push('/analyze')}
                className="px-5 py-2.5 bg-primary hover:bg-primary text-white font-medium rounded-lg text-sm transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create First Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {sortedTheses.map((thesis: Thesis, i: number) => (
                <motion.div
                  key={thesis?.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all cursor-pointer group"
                  style={{ boxShadow: 'var(--shadow-sm)' }}
                  onClick={() => router.push(`/thesis/${thesis?.id}`)}
                >
                  <div className="flex items-start gap-4">
                    <ScoreBadge score={thesis?.overallScore} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold truncate">{thesis?.title ?? 'Untitled'}</h3>
                        {thesis?.status === 'analyzing' && (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-xs rounded-full flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            Analyzing
                          </span>
                        )}
                        {thesis?.status === 'failed' && (
                          <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Failed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{thesis?.description ?? ''}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {thesis?.createdAt ? new Date(thesis.createdAt).toLocaleDateString() : ''}
                        </span>
                        {(thesis?.basketMembers?.length ?? 0) > 0 && (
                          <span>{thesis.basketMembers.length} companies</span>
                        )}
                        <span className="capitalize">{thesis?.inputType ?? ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {thesis?.status === 'failed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            retryThesis(thesis?.id)
                          }}
                          disabled={retrying === thesis?.id}
                          title="Retry analysis"
                          className="p-2 hover:bg-primary/10 hover:text-primary rounded-lg transition-all disabled:opacity-50"
                        >
                          <RotateCw className={`w-4 h-4 ${retrying === thesis?.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteThesis(thesis?.id)
                        }}
                        className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
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
