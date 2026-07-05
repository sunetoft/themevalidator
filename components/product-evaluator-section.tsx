'use client'

import { motion } from 'framer-motion'
import {
  Package, Crown, Sword, Handshake, TrendingUp,
  ChevronUp, ChevronDown, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { useState } from 'react'
import { getScoreBadgeClass } from '@/lib/scores'

// ── Types ──

interface ProductEvaluatorStock {
  ticker?: string
  companyName?: string
  flagshipProducts?: string[]
  pricingPower?: string        // strong | moderate | weak
  pricingPowerEvidence?: string
  segmentGrowthHighlights?: string[]
  recentPartnerships?: string[]
  competitivePosition?: string // monopoly | dominant | challenger | commodity
  productMoat?: string         // patents | switching costs | network effects | scale advantage | regulatory | none
}

interface ProductEvaluatorData {
  score?: number | null
  summary?: string
  perStock?: ProductEvaluatorStock[]
}

// ── Helpers ──

function getPricingPowerStyle(power?: string): string {
  switch (power?.toLowerCase()) {
    case 'strong': return 'bg-primary/10 text-primary border-primary/20'
    case 'moderate': return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    case 'weak': return 'bg-red-500/10 text-red-500 border-red-500/20'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

function getPricingPowerIcon(power?: string) {
  switch (power?.toLowerCase()) {
    case 'strong': return <Crown className="w-3.5 h-3.5" />
    case 'moderate': return <Sword className="w-3.5 h-3.5" />
    case 'weak': return <AlertTriangle className="w-3.5 h-3.5" />
    default: return null
  }
}

function getPositionStyle(pos?: string): string {
  switch (pos?.toLowerCase()) {
    case 'monopoly': return 'bg-purple-500/10 text-purple-400'
    case 'dominant': return 'bg-primary/10 text-primary'
    case 'challenger': return 'bg-amber-500/10 text-amber-500'
    case 'commodity': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

function getMoatIcon(moat?: string) {
  if (!moat || moat === 'none') return <AlertTriangle className="w-3 h-3 text-muted-foreground" />
  return <CheckCircle2 className="w-3 h-3 text-primary" />
}

// ── Main Component ──

interface ProductEvaluatorSectionProps {
  data: ProductEvaluatorData | null
  expanded: boolean
  onToggle: () => void
}

export default function ProductEvaluatorSection({
  data,
  expanded,
  onToggle,
}: ProductEvaluatorSectionProps) {
  const perStock = data?.perStock ?? []
  const score = data?.score ?? null

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-d3"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-cyan-500" />
          <h2 className="font-display font-semibold">Product Evaluator</h2>
          {score !== null && score !== undefined && (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getScoreBadgeClass(score)}`}>
              {score}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {/* Summary */}
          {data?.summary && (
            <p className="text-sm text-muted-foreground italic">{data.summary}</p>
          )}

          {/* No data fallback */}
          {perStock.length === 0 && (
            <p className="text-sm text-muted-foreground">No product evaluator data available</p>
          )}

          {/* Per-stock cards */}
          {perStock.map((stock, i) => (
            <ProductStockCard key={i} stock={stock} delay={i * 0.05} />
          ))}

          {/* Legend */}
          {perStock.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Crown className="w-3 h-3 text-primary" /> Strong pricing power
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sword className="w-3 h-3 text-amber-500" /> Moderate
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 text-red-500" /> Weak
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Per-Stock Card ──

function ProductStockCard({ stock, delay }: { stock: ProductEvaluatorStock; delay: number }) {
  const [expanded, setExpanded] = useState(false)
  const ticker = stock.ticker ?? '???'
  const name = stock.companyName ?? ''
  const power = stock.pricingPower ?? ''
  const position = stock.competitivePosition ?? ''
  const moat = stock.productMoat ?? ''
  const products = stock.flagshipProducts ?? []
  const evidence = stock.pricingPowerEvidence ?? ''
  const segments = stock.segmentGrowthHighlights ?? []
  const partnerships = stock.recentPartnerships ?? []

  const hasDetails = evidence || segments.length > 0 || partnerships.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-muted/30 rounded-lg overflow-hidden"
    >
      {/* Header row — always visible */}
      <div
        className={`p-3 cursor-pointer ${hasDetails ? 'hover:bg-muted/50' : ''} transition-colors`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{ticker}</span>
            <span className="text-sm text-muted-foreground">{name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Pricing Power badge */}
            {power && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getPricingPowerStyle(power)}`}>
                {getPricingPowerIcon(power)}
                {power}
              </span>
            )}
            {/* Competitive Position badge */}
            {position && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPositionStyle(position)}`}>
                {position}
              </span>
            )}
            {/* Product Moat badge */}
            {moat && moat !== 'none' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                {getMoatIcon(moat)}
                {moat}
              </span>
            )}
          </div>
        </div>

        {/* Flagship products — inline chips */}
        {products.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {products.map((p, j) => (
              <span key={j} className="px-1.5 py-0.5 bg-card border border-border text-xs rounded text-muted-foreground">
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Quick evidence preview (first 120 chars) */}
        {evidence && !expanded && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{evidence}</p>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2"
        >
          {/* Pricing Power Evidence */}
          {evidence && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">Pricing Evidence: </span>
              <span className="text-foreground">{evidence}</span>
            </div>
          )}

          {/* Segment Growth Highlights */}
          {segments.length > 0 && (
            <div className="space-y-1">
              {segments.map((seg, j) => (
                <div key={j} className="flex items-start gap-1.5 text-xs">
                  <TrendingUp className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground">{seg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent Partnerships */}
          {partnerships.length > 0 && (
            <div className="space-y-1">
              {partnerships.map((partner, j) => (
                <div key={j} className="flex items-start gap-1.5 text-xs">
                  <Handshake className="w-3 h-3 text-cyan-500 mt-0.5 shrink-0" />
                  <span className="text-foreground">{partner}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
