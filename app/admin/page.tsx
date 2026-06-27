'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Globe, Target, TrendingUp, Users, Trash2,
  Loader2, Mail, Crown, ExternalLink, CheckCircle2, XCircle,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'

interface AdminData {
  theses: Array<{
    id: string
    title: string
    overallScore: number | null
    status: string
    isPublic: boolean
    publishedAt: string | null
    createdAt: string
    userId: string
    _count: { paperTrades: number; tradeStrategies: number }
  }>
  strategies: Array<{
    id: string
    amount: number
    riskProfile: string
    status: string
    createdAt: string
    updatedAt: string
    thesis: { id: string; title: string }
    user: { id: string; email: string; name: string | null }
    _count: { paperTrades: number }
  }>
  paperTrades: Array<{
    id: string
    initialCapital: number
    totalValue: number
    pnl: number
    pnlPercent: number
    status: string
    startedAt: string
    lastCheckedAt: string | null
    strategy: { id: string; riskProfile: string; amount: number }
    thesis: { id: string; title: string }
    user: { id: string; email: string; name: string | null }
    _count: { positions: number; orders: number }
  }>
  users: Array<{
    id: string
    email: string
    name: string | null
    role: string
    createdAt: string
    subscription: {
      status: string
      tier: string
      currentPeriodEnd: string
      cancelAtPeriodEnd: boolean
    } | null
    _count: { theses: number; paperTrades: number; tradeStrategies: number }
  }>
}

type Tab = 'themes' | 'strategies' | 'trades' | 'users'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('themes')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth')
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') {
      toast.error('Admin access required')
      router.push('/dashboard')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated' && (session?.user as any)?.role === 'admin') {
      fetchData()
    }
  }, [status, session])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/overview')
      if (res.status === 403) {
        toast.error('Admin access required')
        router.push('/dashboard')
        return
      }
      const d = await res.json()
      setData(d)
    } catch {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  async function togglePublish(thesisId: string, current: boolean) {
    try {
      const res = await fetch(`/api/admin/themes/${thesisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !current }),
      })
      if (res.ok) {
        toast.success(!current ? 'Theme published to public gallery' : 'Theme unpublished')
        fetchData()
      }
    } catch {
      toast.error('Failed to toggle')
    }
  }

  async function deleteStrategy(id: string) {
    if (!confirm('Delete this strategy and all its paper trades?')) return
    try {
      await fetch(`/api/admin/strategies/${id}`, { method: 'DELETE' })
      toast.success('Strategy deleted')
      fetchData()
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function deletePaperTrade(id: string) {
    if (!confirm('Delete this paper trade permanently?')) return
    try {
      await fetch(`/api/admin/paper-trades/${id}`, { method: 'DELETE' })
      toast.success('Paper trade deleted')
      fetchData()
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function deleteThesis(id: string) {
    if (!confirm('Delete this thesis permanently? All strategies and paper trades will be removed.')) return
    try {
      await fetch(`/api/admin/themes/${id}`, { method: 'DELETE' })
      toast.success('Thesis deleted')
      fetchData()
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background">
                <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'themes', label: 'Themes', icon: Globe, count: data.theses.length },
    { key: 'strategies', label: 'Strategies', icon: Target, count: data.strategies.length },
    { key: 'trades', label: 'Paper Trades', icon: TrendingUp, count: data.paperTrades.length },
    { key: 'users', label: 'Users', icon: Users, count: data.users.length },
  ]

  return (
    <div className="min-h-screen bg-background">
            <div className="container mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage all themes, strategies, paper trades, and users
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {/* THEMES TAB */}
            {tab === 'themes' && (
              <div className="space-y-3">
                {data.theses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No analyses yet.</p>
                ) : (
                  data.theses.map((thesis) => (
                    <div key={thesis.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 transition-colors hover:border-primary/40">
                      <button
                        onClick={() => router.push(`/thesis/${thesis.id}`)}
                        className="flex items-center gap-4 flex-1 min-w-0 text-left group cursor-pointer"
                        title="View theme detail"
                      >
                        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 group-hover:scale-110 transition-transform"
                          style={{ borderColor: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280', color: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280' }}>
                          {thesis.overallScore ?? '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate group-hover:text-primary transition-colors">{thesis.title}</h3>
                            {thesis.status === 'analyzing' && (
                              <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full">Analyzing</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{thesis._count.tradeStrategies} strategies</span>
                            <span>{thesis._count.paperTrades} active trades</span>
                            <span>{new Date(thesis.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {thesis.isPublic ? (
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-full font-medium">
                            <Globe className="w-3 h-3" /> Published
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded-full">
                            <XCircle className="w-3 h-3" /> Private
                          </span>
                        )}
                        <button
                          onClick={() => togglePublish(thesis.id, thesis.isPublic)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            thesis.isPublic
                              ? 'bg-muted hover:bg-muted/70 text-muted-foreground'
                              : 'bg-primary hover:bg-primary text-white'
                          }`}
                        >
                          {thesis.isPublic ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => router.push(`/thesis/${thesis.id}`)}
                          className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
                          title="View detail"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteThesis(thesis.id)}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* STRATEGIES TAB */}
            {tab === 'strategies' && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Theme</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Created By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Risk</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Trades</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.strategies.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No strategies yet.</td></tr>
                    ) : (
                      data.strategies.map((s) => (
                        <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-primary/5 cursor-pointer transition-colors" onClick={() => router.push(`/thesis/${s.thesis.id}/strategy?strategyId=${s.id}`)}>
                          <td className="px-4 py-3 text-sm font-medium truncate max-w-[200px] hover:text-primary transition-colors">{s.thesis.title}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              {s.user.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{s.riskProfile}</td>
                          <td className="px-4 py-3 text-sm font-mono">${s.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">{s._count.paperTrades}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              s.status === 'completed' ? 'bg-primary/10 text-primary' :
                              s.status === 'generating' ? 'bg-amber-500/10 text-amber-500' :
                              s.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                              'bg-muted text-muted-foreground'
                            }`}>{s.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={(e) => { e.stopPropagation(); router.push(`/thesis/${s.thesis.id}/strategy?strategyId=${s.id}`) }} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted" title="View detail">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deleteStrategy(s.id) }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAPER TRADES TAB */}
            {tab === 'trades' && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Theme</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Created By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Capital</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Value</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">P&L</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Positions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paperTrades.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No paper trades yet.</td></tr>
                    ) : (
                      data.paperTrades.map((t) => (
                        <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-primary/5 cursor-pointer transition-colors" onClick={() => router.push(`/thesis/${t.thesis.id}/paper-trade/${t.id}`)}>
                          <td className="px-4 py-3 text-sm font-medium truncate max-w-[180px] hover:text-primary transition-colors">{t.thesis.title}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              {t.user.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">${t.initialCapital.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-mono">${t.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="px-4 py-3 text-sm font-mono font-medium">
                            <span className={t.pnl >= 0 ? 'text-primary' : 'text-red-500'}>
                              {t.pnl >= 0 ? '+' : ''}{t.pnlPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{t._count.positions}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              t.status === 'active' ? 'bg-primary/10 text-primary' :
                              t.status === 'completed' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-muted text-muted-foreground'
                            }`}>{t.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={(e) => { e.stopPropagation(); router.push(`/thesis/${t.thesis.id}/paper-trade/${t.id}`) }} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted" title="View detail">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deletePaperTrade(t.id) }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* USERS TAB */}
            {tab === 'users' && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Subscription</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                              {(u.name || u.email)[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{u.name || '—'}</div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <Shield className="h-3 w-3" /> Admin
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">User</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.subscription ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <Crown className="h-3 w-3" />
                              {u.subscription.status}
                              {u.subscription.cancelAtPeriodEnd && ' (canceling)'}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Free</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            {u._count.theses > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{u._count.theses} theses</span>}
                            {u._count.tradeStrategies > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{u._count.tradeStrategies} strategies</span>}
                            {u._count.paperTrades > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{u._count.paperTrades} trades</span>}
                            {u._count.theses === 0 && u._count.paperTrades === 0 && u._count.tradeStrategies === 0 && (
                              <span className="text-muted-foreground/50">No data</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
