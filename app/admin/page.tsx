'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Globe, Target, TrendingUp, Users, Trash2,
  Loader2, Mail, Crown, ExternalLink, CheckCircle2, XCircle,
  AlertTriangle, Layers, Plus, ChevronDown, ChevronUp, FolderInput, FolderPlus
} from 'lucide-react'
import { toast } from 'sonner'

interface ThemeData {
  id: string
  name: string
  slug: string
  description: string
  isPublic: boolean
  publishedAt: string | null
  createdAt: string
  _count: { theses: number }
}

interface ThesisData {
  id: string
  title: string
  overallScore: number | null
  status: string
  isPublic: boolean
  publishedAt: string | null
  createdAt: string
  userId: string
  themeId: string | null
  theme: { id: string; name: string } | null
  _count: { paperTrades: number; tradeStrategies: number }
}

interface AdminData {
  themes: ThemeData[]
  theses: ThesisData[]
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
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null)
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')
  const [newThemeDesc, setNewThemeDesc] = useState('')

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

  async function toggleThemePublish(themeId: string, current: boolean) {
    try {
      const res = await fetch(`/api/admin/themes/${themeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !current }),
      })
      if (res.ok) {
        toast.success(!current ? 'Theme published' : 'Theme unpublished')
        fetchData()
      }
    } catch {
      toast.error('Failed to toggle')
    }
  }

  async function createTheme() {
    if (!newThemeName.trim()) {
      toast.error('Theme name is required')
      return
    }
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newThemeName, description: newThemeDesc, isPublic: true }),
      })
      if (res.ok) {
        toast.success('Theme created')
        setNewThemeName('')
        setNewThemeDesc('')
        setShowCreateTheme(false)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to create theme')
      }
    } catch {
      toast.error('Failed to create theme')
    }
  }

  async function moveThesisToTheme(thesisId: string, themeId: string | null) {
    try {
      const res = await fetch(`/api/admin/theses/${thesisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId }),
      })
      if (res.ok) {
        toast.success('Thesis moved')
        fetchData()
      } else {
        toast.error('Failed to move thesis')
      }
    } catch {
      toast.error('Failed to move thesis')
    }
  }

  async function deleteTheme(themeId: string) {
    if (!confirm('Delete this theme? Theses will be unlinked but not deleted.')) return
    try {
      await fetch(`/api/admin/themes/${themeId}`, { method: 'DELETE' })
      toast.success('Theme deleted')
      fetchData()
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function deleteThesis(id: string) {
    if (!confirm('Delete this thesis permanently? All strategies and paper trades will be removed.')) return
    try {
      await fetch(`/api/admin/theses/${id}`, { method: 'DELETE' })
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
    { key: 'themes', label: 'Themes', icon: Layers, count: data.themes.length },
    { key: 'strategies', label: 'Strategies', icon: Target, count: data.strategies.length },
    { key: 'trades', label: 'Paper Trades', icon: TrendingUp, count: data.paperTrades.length },
    { key: 'users', label: 'Users', icon: Users, count: data.users.length },
  ]

  // Group theses by theme
  const thesesByTheme = (data.theses || []).reduce((acc, t) => {
    const key = t.themeId || 'unassigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, ThesisData[]>)

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
              Manage themes, theses, strategies, paper trades, and users
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
              <div className="space-y-4">
                {/* Create theme bar */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    Investment Themes
                  </h2>
                  <button
                    onClick={() => setShowCreateTheme(!showCreateTheme)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Theme
                  </button>
                </div>

                {/* Create theme form */}
                <AnimatePresence>
                  {showCreateTheme && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-card border border-border rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <FolderPlus className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm">Create New Theme</span>
                      </div>
                      <input
                        type="text"
                        placeholder="Theme name (e.g., AI Infrastructure)"
                        value={newThemeName}
                        onChange={(e) => setNewThemeName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <textarea
                        placeholder="Short description..."
                        value={newThemeDesc}
                        onChange={(e) => setNewThemeDesc(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={createTheme}
                          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setShowCreateTheme(false); setNewThemeName(''); setNewThemeDesc('') }}
                          className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Theme cards */}
                {data.themes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No themes yet. Create one above.</p>
                ) : (
                  data.themes.map((theme) => {
                    const childTheses = thesesByTheme[theme.id] || []
                    const isExpanded = expandedTheme === theme.id
                    return (
                      <div key={theme.id} className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* Theme header */}
                        <div className="p-4 flex items-center gap-3">
                          <button
                            onClick={() => setExpandedTheme(isExpanded ? null : theme.id)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                          >
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate group-hover:text-primary transition-colors">{theme.name}</h3>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{theme._count.theses} theses</span>
                                {theme.isPublic ? (
                                  <span className="flex items-center gap-1 text-primary">
                                    <Globe className="w-3 h-3" /> Public
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <XCircle className="w-3 h-3" /> Private
                                  </span>
                                )}
                                {theme.publishedAt && <span>{new Date(theme.publishedAt).toLocaleDateString()}</span>}
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleThemePublish(theme.id, theme.isPublic)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                theme.isPublic
                                  ? 'bg-muted hover:bg-muted/70 text-muted-foreground'
                                  : 'bg-primary hover:bg-primary text-white'
                              }`}
                            >
                              {theme.isPublic ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              onClick={() => router.push(`/themes/${theme.id}`)}
                              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
                              title="View theme page"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteTheme(theme.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                              title="Delete theme"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded: child theses */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-border/40"
                            >
                              {childTheses.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 px-4">No theses assigned to this theme.</p>
                              ) : (
                                <div className="divide-y divide-border/30">
                                  {childTheses.map((thesis) => (
                                    <div key={thesis.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                                      <button
                                        onClick={() => router.push(`/thesis/${thesis.id}`)}
                                        className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                                      >
                                        <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0"
                                          style={{ borderColor: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280', color: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280' }}>
                                          {thesis.overallScore ?? '—'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <span className="text-sm font-medium truncate block group-hover:text-primary transition-colors">{thesis.title}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {thesis._count.tradeStrategies} strategies · {thesis._count.paperTrades} active trades
                                          </span>
                                        </div>
                                      </button>
                                      {/* Move to theme dropdown */}
                                      <select
                                        value={theme.id}
                                        onChange={(e) => moveThesisToTheme(thesis.id, e.target.value || null)}
                                        className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background max-w-[160px]"
                                        title="Move to theme"
                                      >
                                        {data.themes.map((t) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                        <option value="">— Unassign —</option>
                                      </select>
                                      <button
                                        onClick={() => router.push(`/thesis/${thesis.id}`)}
                                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => deleteThesis(thesis.id)}
                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })
                )}

                {/* Unassigned theses */}
                {thesesByTheme['unassigned'] && thesesByTheme['unassigned'].length > 0 && (
                  <div className="bg-card border border-dashed border-border rounded-xl overflow-hidden mt-6">
                    <div className="p-4 bg-muted/20">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Unassigned Theses ({thesesByTheme['unassigned'].length})
                      </h3>
                    </div>
                    <div className="divide-y divide-border/30">
                      {thesesByTheme['unassigned'].map((thesis) => (
                        <div key={thesis.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                          <button
                            onClick={() => router.push(`/thesis/${thesis.id}`)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                          >
                            <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ borderColor: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280', color: thesis.overallScore && thesis.overallScore >= 70 ? '#10b981' : '#6b7280' }}>
                              {thesis.overallScore ?? '—'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block group-hover:text-primary transition-colors">{thesis.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {thesis._count.tradeStrategies} strategies · {thesis._count.paperTrades} active trades
                              </span>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <FolderInput className="w-3.5 h-3.5 text-muted-foreground" />
                            <select
                              value=""
                              onChange={(e) => e.target.value && moveThesisToTheme(thesis.id, e.target.value)}
                              className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background max-w-[160px]"
                              title="Assign to theme"
                            >
                              <option value="">Assign...</option>
                              {data.themes.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => deleteThesis(thesis.id)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STRATEGIES TAB */}
            {tab === 'strategies' && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Thesis</th>
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
                              <button onClick={(e) => { e.stopPropagation(); fetch(`/api/admin/strategies/${s.id}`, { method: 'DELETE' }).then(() => { toast.success('Deleted'); fetchData() }) }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete">
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
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Thesis</th>
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
                              <button onClick={(e) => { e.stopPropagation(); if (!confirm('Delete this paper trade?')) return; fetch(`/api/admin/paper-trades/${t.id}`, { method: 'DELETE' }).then(() => { toast.success('Deleted'); fetchData() }) }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete">
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
