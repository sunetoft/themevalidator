'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  RefreshCw,
  TrendingUp,
  Clock,
  CircleDashed,
  AlertTriangle,
  CheckCircle2,
  Target,
  ArrowUpRight,
  Info,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Types (shape written by lib/timeline.ts) ──

export interface TimelineRow {
  id: string
  title: string
  themeId: string | null
  themeName: string | null
  overallScore: number | null
  tickers: string[]
  updatedAt: string
  canEdit: boolean
  timeline: {
    rampWindowStart?: string
    rampQuarter?: string
    rampWindowEnd?: string
    verdict?: 'ramping' | 'inflecting' | 'early' | 'stalled'
    confidence?: number
    headline?: string
    guidanceRead?: string
    guidanceSource?: string
    phases?: Array<{ label: string; window: string; trigger?: string; whatToWatch?: string }>
    perTicker?: Array<{
      ticker: string
      salesGrowthNextQ?: string
      salesGrowthNextFY?: string
      marginTrend?: string
      marginBpsYoY?: number | null
      rampQuarter?: string
      signal?: string
      note?: string
    }>
    confirmations?: string[]
    invalidations?: string[]
    dataGaps?: string[]
    basis?: { tickers?: string[]; tickersWithEstimates?: number; tickersWithMargins?: number }
    error?: string
  }
}

// ── Verdict styling ──

const VERDICT = {
  ramping: {
    label: 'Ramping now',
    short: 'Ramping',
    icon: TrendingUp,
    text: 'text-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    bar: 'from-emerald-500 to-emerald-400',
    dot: 'bg-emerald-400',
  },
  inflecting: {
    label: 'Inflecting',
    short: 'Inflecting',
    icon: Target,
    text: 'text-amber-400',
    chip: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    bar: 'from-amber-500 to-amber-400',
    dot: 'bg-amber-400',
  },
  early: {
    label: 'Early',
    short: 'Early',
    icon: Clock,
    text: 'text-sky-400',
    chip: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
    bar: 'from-sky-500 to-sky-400',
    dot: 'bg-sky-400',
  },
  stalled: {
    label: 'Stalled',
    short: 'Stalled',
    icon: AlertTriangle,
    text: 'text-red-400',
    chip: 'bg-red-500/10 text-red-400 border-red-500/25',
    bar: 'from-red-500 to-red-400',
    dot: 'bg-red-400',
  },
} as const

const style = (verdict?: string) => VERDICT[(verdict as keyof typeof VERDICT) ?? 'early'] ?? VERDICT.early

// ── Quarter math ──

const qIndex = (q?: string): number | null => {
  const m = /^(\d{4})-Q([1-4])$/.exec(q ?? '')
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null
}

const qFromIndex = (i: number) => `${Math.floor(i / 4)}-Q${(i % 4) + 1}`

const qShort = (i: number) => `Q${(i % 4) + 1} ’${String(Math.floor(i / 4)).slice(2)}`

/** "2027-Q1" → "Q1 ’27" (year kept — an ambiguous "Q1" is worse than useless) */
const shortQuarter = (q?: string) => {
  const i = qIndex(q)
  return i === null ? '—' : qShort(i)
}

const currentQuarterIndex = () => {
  const d = new Date()
  return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3)
}

const monthsUntil = (q?: string) => {
  const idx = qIndex(q)
  if (idx === null) return null
  return (idx - currentQuarterIndex()) * 3
}

const monthsLabel = (months: number | null) => {
  if (months === null) return null
  if (months === 0) return 'this quarter'
  if (months < 0) return `${Math.abs(months)}mo ago`
  return `in ~${months}mo`
}

// ── Component ──

export default function TimelineClient({ rows, signedIn }: { rows: TimelineRow[]; signedIn: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'ramping' | 'inflecting' | 'early' | 'stalled'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const usable = rows.filter((r) => !r.timeline?.error && r.timeline?.rampQuarter)
  const broken = rows.filter((r) => r.timeline?.error)

  const ordered = useMemo(
    () =>
      [...usable].sort(
        (a, b) => (qIndex(a.timeline.rampQuarter) ?? 9999) - (qIndex(b.timeline.rampQuarter) ?? 9999),
      ),
    [usable],
  )

  const counts = {
    ramping: usable.filter((r) => r.timeline.verdict === 'ramping').length,
    inflecting: usable.filter((r) => r.timeline.verdict === 'inflecting').length,
    early: usable.filter((r) => r.timeline.verdict === 'early').length,
    stalled: usable.filter((r) => r.timeline.verdict === 'stalled').length,
  }

  // Axis: start one quarter back so "already ramping" theses are visible.
  const axisStart = currentQuarterIndex() - 1
  const axisQuarters = 10
  const todayIdx = currentQuarterIndex()

  const visible = filter === 'all' ? ordered : ordered.filter((r) => r.timeline.verdict === filter)

  const regenerate = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/theses/${id}/timeline`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        toast.success('Timeline reassessed')
        router.refresh()
      } else {
        toast.error(data?.error || 'Could not reassess this timeline')
      }
    } catch {
      toast.error('Could not reassess this timeline')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1200px] px-4 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarClock className="h-6 w-6 text-primary" />
            </span>
            Thesis Timeline
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            When each thesis is expected to play out — derived from forward revenue guidance and margin trend,
            not from price action. A thesis has ramped when its demand shows up in reported numbers.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { key: 'ramping', label: 'RAMPING NOW', value: counts.ramping, tone: 'text-emerald-400' },
            { key: 'inflecting', label: 'INFLECTING', value: counts.inflecting, tone: 'text-amber-400' },
            { key: 'early', label: 'EARLY (4Q+)', value: counts.early, tone: 'text-sky-400' },
            { key: 'stalled', label: 'STALLED', value: counts.stalled, tone: 'text-red-400' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(filter === s.key ? 'all' : (s.key as any))}
              className={cn(
                'rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent/40',
                filter === s.key && 'border-accent/60 ring-1 ring-accent/30',
              )}
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <p className="mb-1 text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('font-mono text-2xl font-bold', s.tone)}>{s.value}</p>
            </button>
          ))}
        </div>

        {/* Empty state */}
        {ordered.length === 0 && broken.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <CircleDashed className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No timeline assessments yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Every new thesis gets a ramp assessment automatically once its analysis completes.
            </p>
            {signedIn ? (
              <Link
                href="/analyze"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110"
              >
                Analyse a thesis <ArrowUpRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/themes"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110"
              >
                Browse published themes <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}

        {/* Ramp map */}
        {visible.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-xl border border-border bg-card" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Ramp map</h2>
              <span className="text-xs text-muted-foreground">
                {filter === 'all' ? `${visible.length} theses` : `${visible.length} × ${style(filter).label}`}
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="ml-2 text-accent hover:underline">
                    clear
                  </button>
                )}
              </span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[720px] px-5 py-4">
                {/* Axis header */}
                <div className="mb-3 flex items-stretch">
                  <div className="w-[220px] shrink-0" />
                  <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${axisQuarters}, minmax(0,1fr))` }}>
                    {Array.from({ length: axisQuarters }).map((_, i) => {
                      const qi = axisStart + i
                      return (
                        <div
                          key={qi}
                          className={cn(
                            'border-l border-border/60 pb-1 pl-1.5 text-[10px] font-mono tracking-tight',
                            qi === todayIdx ? 'text-accent' : 'text-muted-foreground',
                          )}
                        >
                          {qShort(qi)}
                          {qi === todayIdx && <span className="ml-1 text-[9px] text-accent/80">now</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Rows */}
                <div className="space-y-1.5">
                  {visible.map((row) => {
                    const st = style(row.timeline.verdict)
                    const start = qIndex(row.timeline.rampWindowStart) ?? qIndex(row.timeline.rampQuarter) ?? todayIdx
                    const end = qIndex(row.timeline.rampWindowEnd) ?? start
                    const left = Math.max(0, ((start - axisStart) / axisQuarters) * 100)
                    const width = Math.min(
                      100 - left,
                      Math.max(3, ((Math.min(end, axisStart + axisQuarters - 1) - start + 1) / axisQuarters) * 100),
                    )
                    return (
                      <div
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenId(openId === row.id ? null : row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setOpenId(openId === row.id ? null : row.id)
                          }
                        }}
                        className="group flex w-full cursor-pointer items-center rounded-lg py-1 pr-1 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="w-[220px] shrink-0 pr-3">
                          <p className="truncate text-xs font-medium leading-tight">{row.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {row.themeId && row.themeName ? (
                              <Link
                                href={`/themes/${row.themeId}`}
                                onClick={(e) => e.stopPropagation()}
                                title={`Open theme: ${row.themeName}`}
                                className="underline-offset-2 hover:text-accent hover:underline"
                              >
                                {row.themeName}
                              </Link>
                            ) : (
                              row.themeName ?? '—'
                            )}
                            {row.timeline.confidence !== undefined && ` · ${row.timeline.confidence}%`}
                          </p>
                        </div>
                        <div className="relative h-6 flex-1">
                          {/* today marker */}
                          <div
                            className="absolute inset-y-0 z-0 border-l border-dashed border-accent/40"
                            style={{ left: `${((todayIdx - axisStart) / axisQuarters) * 100}%` }}
                          />
                          <div
                            className={cn(
                              'absolute inset-y-0 z-10 rounded-md bg-gradient-to-r opacity-90 transition-opacity group-hover:opacity-100',
                              st.bar,
                              openId === row.id && 'ring-2 ring-accent/50',
                            )}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${row.timeline.rampWindowStart} → ${row.timeline.rampWindowEnd}`}
                          >
                            <span className="absolute inset-0 flex items-center justify-center truncate px-1.5 text-[10px] font-semibold text-black/80">
                              {start === end
                                ? qShort(start)
                                : `${qShort(start)}–${qShort(end)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Detail cards */}
        <div className="space-y-3">
          {visible.map((row) => {
            const t = row.timeline
            const st = style(t.verdict)
            const Icon = st.icon
            const open = openId === row.id
            const months = monthsUntil(t.rampWindowStart ?? t.rampQuarter)
            return (
              <motion.div
                key={row.id}
                layout
                className="overflow-hidden rounded-xl border border-border bg-card"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(open ? null : row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpenId(open ? null : row.id)
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', st.chip)}>
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{row.title}</span>
                      <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', st.chip)}>
                        {st.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {t.rampWindowStart} → {t.rampWindowEnd}
                      </span>
                      {months !== null && months >= 0 && (
                        <span className="text-[11px] text-muted-foreground">{monthsLabel(months)}</span>
                      )}
                      {row.themeId && row.themeName && (
                        <Link
                          href={`/themes/${row.themeId}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Open theme: ${row.themeName}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:border-accent/40 hover:text-accent"
                        >
                          <Layers className="h-3 w-3" />
                          {row.themeName}
                          <ArrowUpRight className="h-2.5 w-2.5" />
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.headline}</p>
                  </div>

                  <div className="hidden w-24 shrink-0 md:block">
                    <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>confidence</span>
                      <span className="font-mono">{t.confidence ?? '—'}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r', st.bar)}
                        style={{ width: `${Math.max(4, Math.min(100, t.confidence ?? 0))}%` }}
                      />
                    </div>
                  </div>

                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-border px-5 py-4">
                        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
                          {/* Left: read + phases */}
                          <div>
                            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Guidance read
                            </h4>
                            <p className="text-sm leading-relaxed">{t.guidanceRead}</p>

                            {(t.phases?.length ?? 0) > 0 && (
                              <>
                                <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Ramp phases
                                </h4>
                                <ol className="space-y-2">
                                  {t.phases!.map((p, i) => (
                                    <li key={i} className="flex gap-3">
                                      <span
                                        className={cn(
                                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                                          st.chip,
                                        )}
                                      >
                                        {i + 1}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium">
                                          {p.label}
                                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{p.window}</span>
                                        </p>
                                        {p.trigger && <p className="text-xs text-muted-foreground">{p.trigger}</p>}
                                        {p.whatToWatch && (
                                          <p className="text-[11px] text-muted-foreground/80">Watch: {p.whatToWatch}</p>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </>
                            )}
                          </div>

                          {/* Right: per-ticker */}
                          <div>
                            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Per-ticker basis
                            </h4>
                            <div className="overflow-hidden rounded-lg border border-border">
                              <table className="w-full text-[11px]">
                                <thead className="bg-muted/50 text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-medium">Ticker</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Sales Q+1</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Sales FY+1</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Margin YoY</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Ramps in</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(t.perTicker ?? []).map((s) => {
                                    const bps =
                                      typeof s.marginBpsYoY === 'number' && Number.isFinite(s.marginBpsYoY)
                                        ? s.marginBpsYoY
                                        : null
                                    return (
                                      <tr key={s.ticker} className="border-t border-border/60">
                                        <td className="px-2 py-1.5 font-mono font-medium">{s.ticker}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{s.salesGrowthNextQ ?? '—'}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{s.salesGrowthNextFY ?? '—'}</td>
                                        <td
                                          className={cn(
                                            'px-2 py-1.5 text-right font-mono',
                                            bps === null
                                              ? 'text-muted-foreground'
                                              : bps > 0
                                                ? 'text-emerald-400'
                                                : bps < 0
                                                  ? 'text-red-400'
                                                  : 'text-muted-foreground',
                                          )}
                                        >
                                          {bps === null
                                            ? (s.marginTrend ?? '—')
                                            : `${bps > 0 ? '+' : ''}${Math.round(bps)}bp`}
                                        </td>
                                        <td
                                          className="px-2 py-1.5 text-right font-mono text-muted-foreground"
                                          title={
                                            s.rampQuarter
                                              ? `${s.ticker}: ramp expected to show up in reported numbers in ${s.rampQuarter}`
                                              : undefined
                                          }
                                        >
                                          {s.rampQuarter ? shortQuarter(s.rampQuarter) : '—'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                  {(t.perTicker?.length ?? 0) === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-2 py-2 text-center text-muted-foreground">
                                        No per-ticker basis returned
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                              Ramps in = quarter that ticker&apos;s growth is expected to show up in reported numbers
                              (Q1 ’27 = Jan–Mar 2027).
                            </p>
                          </div>
                        </div>

                        {/* Confirm / invalidate */}
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Confirms the ramp
                            </p>
                            <ul className="space-y-1">
                              {(t.confirmations ?? []).map((c, i) => (
                                <li key={i} className="text-xs text-muted-foreground">
                                  • {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5" /> Breaks the timeline
                            </p>
                            <ul className="space-y-1">
                              {(t.invalidations ?? []).map((c, i) => (
                                <li key={i} className="text-xs text-muted-foreground">
                                  • {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Info className="h-3 w-3" />
                            Basis: {t.guidanceSource === 'company-guidance' ? 'company guidance' : 'analyst consensus'} ·
                            {' '}
                            {t.basis?.tickersWithEstimates ?? 0}/{t.basis?.tickers?.length ?? row.tickers.length} tickers with
                            forward sales · {t.basis?.tickersWithMargins ?? 0} with margin trend
                            {(t.dataGaps?.length ?? 0) > 0 && ` · gaps: ${t.dataGaps!.join(', ')}`}
                          </p>
                          <div className="flex items-center gap-2">
                            {row.themeId && (
                              <Link
                                href={`/themes/${row.themeId}`}
                                className="text-[11px] font-medium text-accent hover:underline"
                              >
                                Open thesis
                              </Link>
                            )}
                            {row.canEdit && (
                              <button
                                onClick={() => regenerate(row.id)}
                                disabled={busyId === row.id}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
                              >
                                {busyId === row.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Reassess
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        {/* Failed assessments */}
        {broken.length > 0 && (
          <section className="mt-6 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {broken.length} timeline assessment(s) failed
            </p>
            <ul className="space-y-1">
              {broken.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {r.title} — {r.timeline.error}
                  </span>
                  {r.canEdit && (
                    <button
                      onClick={() => regenerate(r.id)}
                      disabled={busyId === r.id}
                      className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
                    >
                      {busyId === r.id ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
