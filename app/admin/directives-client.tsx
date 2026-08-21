'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Pause, Play, Trash2, Pencil, History, CalendarPlus,
  ChevronDown, ChevronUp, Zap, X, Check, Loader2, Filter, Archive,
} from 'lucide-react'

interface DirectiveRow {
  id: string
  theme: string
  themeId: string | null
  tickers: string[]
  tags: string[]
  nominalWeight: number
  decayFn: string
  ttlDays: number
  startedAt: string
  status: 'active' | 'paused' | 'expired' | 'archived'
  totalPausedSeconds: number
  scope: 'collector' | 'scanner' | 'both'
  reason: string | null
  effectiveWeight: number
  remainingDays: number | null
  expiresAt: string | null
  createdAt: string
  _count?: { events: number }
}

interface ThemeOpt { id: string; name: string; slug: string }

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  expired: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
}

function fmtWeight(n: number) {
  return n.toFixed(2)
}

export default function DirectivesClient() {
  const [directives, setDirectives] = useState<DirectiveRow[]>([])
  const [themes, setThemes] = useState<ThemeOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ id: string; events: any[] } | null>(null)

  const [form, setForm] = useState({
    theme: '', themeId: '', weight: '1.5', window: '30', decay: 'linear',
    scope: 'both', tickers: '', tags: '', reason: '',
  })
  const [edit, setEdit] = useState<DirectiveRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [dRes, tRes] = await Promise.all([
        fetch('/api/admin/directives'),
        fetch('/api/admin/themes'),
      ])
      if (dRes.status === 403) {
        toast.error('Admin access required')
        return
      }
      setDirectives(await dRes.json())
      if (tRes.ok) setThemes(await tRes.json())
    } catch {
      toast.error('Failed to load directives')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function loadDetail(id: string) {
    try {
      const res = await fetch(`/api/admin/directives/${id}`)
      if (res.ok) setDetail(await res.json())
    } catch {
      /* ignore */
    }
  }

  function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
    } else {
      setExpanded(id)
      loadDetail(id)
    }
  }

  function resetForm() {
    setForm({ theme: '', themeId: '', weight: '1.5', window: '30', decay: 'linear', scope: 'both', tickers: '', tags: '', reason: '' })
    setShowForm(false)
  }

  async function create() {
    if (!form.theme.trim()) {
      toast.error('Theme is required')
      return
    }
    const body = {
      theme: form.theme,
      themeId: form.themeId || undefined,
      weight: parseFloat(form.weight) || 1.5,
      window: parseFloat(form.window) || 30,
      decay: form.decay,
      scope: form.scope,
      tickers: form.tickers.split(',').map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      reason: form.reason || undefined,
    }
    const res = await fetch('/api/admin/directives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`Directive '${data.theme}' created`)
      resetForm()
      fetchData()
    } else {
      toast.error(data.error || 'Failed to create directive')
    }
  }

  async function act(id: string, action: string, extra: Record<string, any> = {}) {
    const res = await fetch(`/api/admin/directives/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const data = await res.json()
    if (res.ok) {
      const labels: Record<string, string> = {
        pause: 'paused', resume: 'resumed', drop: 'archived', extend: 'extended',
      }
      toast.success(`Directive ${labels[action] ?? action}`)
      fetchData()
      if (expanded === id) loadDetail(id)
    } else {
      toast.error(data.error || 'Action failed')
    }
  }

  async function saveEdit() {
    if (!edit) return
    const body = {
      theme: edit.theme,
      themeId: edit.themeId || undefined,
      weight: edit.nominalWeight,
      window: edit.ttlDays,
      decay: edit.decayFn,
      scope: edit.scope,
      tickers: edit.tickers,
      tags: edit.tags,
      reason: edit.reason || undefined,
    }
    const res = await fetch(`/api/admin/directives/${edit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success('Directive updated')
      setEdit(null)
      fetchData()
    } else {
      toast.error(data.error || 'Failed to update')
    }
  }

  async function hardDelete(id: string) {
    if (!confirm('Permanently delete this directive and its history?')) return
    await fetch(`/api/admin/directives/${id}`, { method: 'DELETE' })
    toast.success('Directive deleted')
    if (expanded === id) setExpanded(null)
    fetchData()
  }

  const visible = showAll
    ? directives
    : directives.filter((d) => d.status === 'active' || d.status === 'paused')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Focus Directives
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showAll ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showAll ? 'All statuses' : 'Active & paused'}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Directive
          </button>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Theme *</label>
                  <input
                    list="theme-options"
                    value={form.theme}
                    onChange={(e) => setForm({ ...form, theme: e.target.value })}
                    placeholder="e.g., crypto"
                    className={inputCls}
                  />
                  <datalist id="theme-options">
                    {themes.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Weight (soft multiplier)</label>
                  <input type="number" step="0.1" min="1" value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Window (days)</label>
                  <input type="number" min="1" value={form.window}
                    onChange={(e) => setForm({ ...form, window: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Decay</label>
                  <select value={form.decay} onChange={(e) => setForm({ ...form, decay: e.target.value })} className={inputCls}>
                    <option value="linear">linear (fade to 1.0)</option>
                    <option value="none">none (constant)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Scope</label>
                  <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className={inputCls}>
                    <option value="both">collector + scanner</option>
                    <option value="collector">collector only</option>
                    <option value="scanner">scanner only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tickers (comma-separated)</label>
                  <input value={form.tickers} onChange={(e) => setForm({ ...form, tickers: e.target.value })}
                    placeholder="COIN, MSTR, MARA" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="crypto, bitcoin, mining" className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason / note</label>
                  <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="why are we focusing here?" className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={create} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90">
                  <Check className="w-4 h-4" /> Create
                </button>
                <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {visible.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No directives yet. Create one to steer focus.</p>
      ) : (
        visible.map((d) => {
          const isEditing = edit?.id === d.id
          const isOpen = expanded === d.id
          return (
            <div key={d.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Row header */}
              <div className="p-4 flex items-center gap-3">
                <button onClick={() => toggleExpand(d.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left group">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate group-hover:text-primary transition-colors">{d.theme}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${STATUS_STYLE[d.status]}`}>
                        {d.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>eff <b className="text-foreground">{fmtWeight(d.effectiveWeight)}</b></span>
                      <span>nom {fmtWeight(d.nominalWeight)}</span>
                      {d.status === 'active' && d.remainingDays !== null && (
                        <span>{d.remainingDays.toFixed(1)}d left</span>
                      )}
                      {d.status === 'paused' && <span>clock frozen</span>}
                      <span>{d.scope}</span>
                      <span className="hidden sm:inline">{d.decayFn}</span>
                      {d.tickers.length > 0 && <span className="truncate">{d.tickers.join(', ')}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {d.status === 'active' && (
                    <button onClick={() => act(d.id, 'pause')} title="Pause (freeze clock)"
                      className="p-2 text-muted-foreground hover:text-amber-500 rounded-lg hover:bg-muted">
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {d.status === 'paused' && (
                    <button onClick={() => act(d.id, 'resume')} title="Resume"
                      className="p-2 text-muted-foreground hover:text-emerald-500 rounded-lg hover:bg-muted">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {(d.status === 'active' || d.status === 'paused') && (
                    <>
                      <button onClick={() => act(d.id, 'extend', { days: 7 })} title="Extend +7 days"
                        className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                        <CalendarPlus className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEdit(isEditing ? null : d)} title="Edit"
                        className={`p-2 rounded-lg hover:bg-muted ${isEditing ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => act(d.id, 'drop')} title="Archive"
                        className="p-2 text-muted-foreground hover:text-amber-500 rounded-lg hover:bg-muted">
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button onClick={() => hardDelete(d.id)} title="Delete permanently"
                    className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inline edit */}
              <AnimatePresence>
                {isEditing && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border/40">
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input value={edit.theme} onChange={(e) => setEdit({ ...edit!, theme: e.target.value })} className={inputCls} placeholder="theme" />
                      <input type="number" step="0.1" value={edit.nominalWeight}
                        onChange={(e) => setEdit({ ...edit!, nominalWeight: parseFloat(e.target.value) })} className={inputCls} placeholder="weight" />
                      <input type="number" value={edit.ttlDays}
                        onChange={(e) => setEdit({ ...edit!, ttlDays: parseFloat(e.target.value) })} className={inputCls} placeholder="window days" />
                      <select value={edit.decayFn} onChange={(e) => setEdit({ ...edit!, decayFn: e.target.value as any })} className={inputCls}>
                        <option value="linear">linear</option>
                        <option value="none">none</option>
                      </select>
                      <select value={edit.scope} onChange={(e) => setEdit({ ...edit!, scope: e.target.value as any })} className={inputCls}>
                        <option value="both">both</option>
                        <option value="collector">collector</option>
                        <option value="scanner">scanner</option>
                      </select>
                      <input value={edit.tickers.join(', ')} onChange={(e) => setEdit({ ...edit!, tickers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={inputCls} placeholder="tickers" />
                      <input value={edit.tags.join(', ')} onChange={(e) => setEdit({ ...edit!, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={inputCls} placeholder="tags" />
                      <input value={edit.reason ?? ''} onChange={(e) => setEdit({ ...edit!, reason: e.target.value })} className={inputCls} placeholder="reason" />
                      <div className="flex gap-2 md:col-span-3">
                        <button onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90">
                          <Check className="w-4 h-4" /> Save
                        </button>
                        <button onClick={() => setEdit(null)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium">
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Audit trail */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border/40">
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <History className="w-4 h-4 text-muted-foreground" /> Audit trail
                      </div>
                      {d.reason && <p className="text-sm text-muted-foreground mb-3">“{d.reason}”</p>}
                      {detail?.id === d.id && detail.events?.length ? (
                        <div className="space-y-1 max-h-56 overflow-y-auto">
                          {detail.events.map((e: any) => (
                            <div key={e.id} className="text-xs flex items-start gap-2 py-1">
                              <span className="text-muted-foreground whitespace-nowrap">
                                {new Date(e.createdAt).toLocaleString()}
                              </span>
                              <span className="font-medium">{e.action}</span>
                              {e.field && <span className="text-muted-foreground">{e.field}: {e.oldValue} → {e.newValue}</span>}
                              {e.reason && <span className="text-muted-foreground italic">({e.reason})</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No events recorded.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })
      )}
    </div>
  )
}
