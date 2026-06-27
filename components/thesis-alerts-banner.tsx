'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  TrendingDown, TrendingUp, DollarSign, BarChart2, X,
  ChevronDown, ChevronUp, Bell
} from 'lucide-react'
import { useState } from 'react'

export interface ThesisAlertData {
  id: string
  type: string
  severity: string // critical, warning, info, positive
  ticker: string | null
  title: string
  description: string
  data?: any
  createdAt: string
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertCircle className="w-5 h-5 text-destructive" />
    case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />
    case 'positive': return <CheckCircle2 className="w-5 h-5 text-success" />
    default: return <Info className="w-5 h-5 text-blue-500" />
  }
}

function getAlertIcon(type: string) {
  if (type.includes('earnings') || type.includes('guidance')) return <DollarSign className="w-4 h-4" />
  if (type.includes('price') || type.includes('valuation')) return <BarChart2 className="w-4 h-4" />
  if (type.includes('breakdown') || type.includes('downgrade')) return <TrendingDown className="w-4 h-4" />
  if (type.includes('breakout') || type.includes('upgrade')) return <TrendingUp className="w-4 h-4" />
  return <Bell className="w-4 h-4" />
}

function getSeverityBg(severity: string) {
  switch (severity) {
    case 'critical': return 'border-red-500/30 bg-red-500/5'
    case 'warning': return 'border-amber-500/30 bg-amber-500/5'
    case 'positive': return 'border-success/30 bg-success/5'
    default: return 'border-blue-500/30 bg-blue-500/5'
  }
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ThesisAlertsBanner({ alerts }: { alerts: ThesisAlertData[] }) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  const criticalCount = visible.filter(a => a.severity === 'critical').length
  const warningCount = visible.filter(a => a.severity === 'warning').length

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mb-6 rounded-xl border ${criticalCount > 0 ? 'border-red-500/40' : 'border-amber-500/40'} overflow-hidden`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 flex items-center justify-between ${criticalCount > 0 ? 'bg-red-500/10' : 'bg-amber-500/10'} hover:bg-opacity-20 transition-colors`}
      >
        <div className="flex items-center gap-3">
          {criticalCount > 0 ? (
            <AlertCircle className="w-5 h-5 text-destructive" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <div className="text-left">
            <span className="font-display font-semibold text-sm">
              Thesis Alerts — {visible.length} active
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {criticalCount > 0 && `${criticalCount} critical`}
              {criticalCount > 0 && warningCount > 0 && ' · '}
              {warningCount > 0 && `${warningCount} warning${warningCount > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Alert list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-2">
              {visible.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityBg(alert.severity)} relative group`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getSeverityIcon(alert.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {getAlertIcon(alert.type)}
                      <span className="font-medium text-sm">{alert.title}</span>
                      {alert.ticker && (
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {alert.ticker}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
                    <span className="text-xs text-muted-foreground/70">{timeAgo(alert.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
