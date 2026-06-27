'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'

interface Snapshot {
  id: string
  totalValue: number
  pnl: number
  pnlPercent: number
  createdAt: string
}

interface Props {
  tradeId: string
  initialCapital: number
}

export default function PerformanceChart({ tradeId, initialCapital }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/paper-trade/${tradeId}/snapshots`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.snapshots) setSnapshots(data.snapshots)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tradeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (snapshots.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-xs">Performance chart will appear after more price checks.</p>
      </div>
    )
  }

  // Build SVG sparkline
  const width = 400
  const height = 120
  const padding = 10
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  const values = snapshots.map(s => s.totalValue)
  const minVal = Math.min(...values, initialCapital)
  const maxVal = Math.max(...values, initialCapital)
  const range = maxVal - minVal || 1

  const points = snapshots.map((s, i) => {
    const x = padding + (i / (snapshots.length - 1)) * chartWidth
    const y = padding + chartHeight - ((s.totalValue - minVal) / range) * chartHeight
    return { x, y, ...s }
  })

  // Build path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padding + chartHeight} L ${points[0].x.toFixed(1)} ${padding + chartHeight} Z`

  const lastPnl = snapshots[snapshots.length - 1].pnl
  const isPositive = lastPnl >= 0
  const lineColor = isPositive ? '#10b981' : '#ef4444'
  const fillColor = isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'

  // Baseline (initial capital) position
  const baselineY = padding + chartHeight - ((initialCapital - minVal) / range) * chartHeight

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {isPositive ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
          Performance Over Time
        </span>
        <span className={`text-xs font-mono font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
          {isPositive ? '+' : ''}${lastPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          ({isPositive ? '+' : ''}{snapshots[snapshots.length - 1].pnlPercent.toFixed(2)}%)
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '120px' }}>
        {/* Initial capital baseline */}
        <line
          x1={padding} y1={baselineY} x2={width - padding} y2={baselineY}
          stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-muted-foreground opacity-40"
        />
        {/* Area fill */}
        <path d={areaD} fill={fillColor} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill={lineColor} />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{new Date(snapshots[0].createdAt).toLocaleDateString()}</span>
        <span className="text-[10px] text-muted-foreground">{new Date(snapshots[snapshots.length - 1].createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
