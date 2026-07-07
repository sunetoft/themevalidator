'use client'

import { motion } from 'framer-motion'
import {
  DollarSign, Activity, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, Minus, Gauge,
  Target, CircleDollarSign, Loader2, Check
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

// ── Types ──

interface PerStockFinancial {
  ticker?: string
  earningsAssessment?: string
  growthVsValuation?: string
  marginAnalysis?: string
  guidanceOutlook?: string
  healthGrade?: string
  keyMetric?: string
}

interface PerStockTechnical {
  ticker?: string
  signal?: string
  trend?: string
  rsiInterpretation?: string
  keyLevels?: string
  actionableNote?: string
}

interface RealMetrics {
  metrics?: Record<string, any>
  indicators?: Record<string, any>
}

interface FinancialDataSection {
  score?: number | null
  summary?: string
  perStock?: PerStockFinancial[]
  metrics?: Record<string, any>
}

interface TechnicalDataSection {
  score?: number | null
  summary?: string
  perStock?: PerStockTechnical[]
  indicators?: Record<string, any>
}

// ── Helpers ──

function getGradeColor(grade?: string) {
  if (!grade) return 'text-muted-foreground'
  if (grade === 'A') return 'text-success'
  if (grade === 'B') return 'text-blue-500'
  if (grade === 'C') return 'text-amber-500'
  return 'text-destructive'
}

function getSignalColor(signal?: string) {
  if (signal === 'bullish') return 'text-success bg-success/10'
  if (signal === 'bearish') return 'text-destructive bg-red-500/10'
  return 'text-muted-foreground bg-muted'
}

function getSignalIcon(signal?: string) {
  if (signal === 'bullish') return <TrendingUp className="w-3.5 h-3.5" />
  if (signal === 'bearish') return <TrendingDown className="w-3.5 h-3.5" />
  return <Minus className="w-3.5 h-3.5" />
}

// ── Sync action icon component ──

type SyncTarget = 'tradescouter' | 'optionlookup'

function SyncIcon({
  ticker,
  target,
}: {
  ticker: string
  target: SyncTarget
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'added' | 'error'>('idle')

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation() // don't toggle stock expansion
    if (status === 'loading') return

    setStatus('loading')
    try {
      const resp = await fetch(`/api/${target}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.toUpperCase(), action: 'add' }),
      })
      const data = await resp.json()
      if (data.success) {
        setStatus('added')
        toast.success(`${ticker} added to ${target === 'tradescouter' ? 'TradeScouter' : 'OptionLookup'}`)
      } else {
        setStatus('error')
        toast.error(`Failed to add ${ticker}`)
        setTimeout(() => setStatus('idle'), 2000)
      }
    } catch {
      setStatus('error')
      toast.error(`Failed to add ${ticker}`)
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [ticker, target, status])

  const isTS = target === 'tradescouter'
  const label = isTS ? 'Add to TradeScouter' : 'Add to OptionLookup'
  const activeColor = isTS ? 'text-cyan-400 hover:text-cyan-300' : 'text-success hover:text-success/80'

  return (
    <button
      onClick={handleClick}
      title={label}
      className={`p-1 rounded transition-colors ${
        status === 'added'
          ? 'text-success cursor-default'
          : status === 'error'
          ? 'text-destructive'
          : `text-muted-foreground hover:bg-muted/50 ${status === 'idle' ? activeColor : ''}`
      }`}
      disabled={status === 'loading' || status === 'added'}
    >
      {status === 'loading' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === 'added' ? (
        <Check className="w-4 h-4" />
      ) : (
        isTS ? <Target className="w-4 h-4" /> : <CircleDollarSign className="w-4 h-4" />
      )}
    </button>
  )
}

// ── Main Component ──

export default function FinancialTechnicalSection({
  financialHealth,
  technicalAnalysis,
}: {
  financialHealth: FinancialDataSection | null
  technicalAnalysis: TechnicalDataSection | null
}) {
  const [activeTab, setActiveTab] = useState<'financial' | 'technical'>('financial')
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())

  // Cross-site registration checks
  const [tsRegistered, setTsRegistered] = useState(false)
  const [olRegistered, setOlRegistered] = useState(false)
  const [regChecked, setRegChecked] = useState(false)

  useEffect(() => {
    async function checkRegistrations() {
      try {
        const [tsResp, olResp] = await Promise.all([
          fetch('/api/tradescouter/status'),
          fetch('/api/optionlookup/status'),
        ])
        const [tsData, olData] = await Promise.all([
          tsResp.json().catch(() => ({ registered: false })),
          olResp.json().catch(() => ({ registered: false })),
        ])
        setTsRegistered(tsData.registered === true)
        setOlRegistered(olData.registered === true)
      } catch {
        // both offline — leave as false
      } finally {
        setRegChecked(true)
      }
    }
    checkRegistrations()
  }, [])

  const hasFinancial = financialHealth && (financialHealth.perStock?.length ?? 0) > 0
  const hasTechnical = technicalAnalysis && (technicalAnalysis.perStock?.length ?? 0) > 0

  if (!hasFinancial && !hasTechnical) return null

  const toggleStock = (ticker: string) => {
    setExpandedStocks(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  const currentData = activeTab === 'financial' ? financialHealth : technicalAnalysis
  const perStock = currentData?.perStock ?? []
  const realMetrics = activeTab === 'financial'
    ? financialHealth?.metrics ?? {}
    : technicalAnalysis?.indicators ?? {}

  const showSyncIcons = regChecked && (tsRegistered || olRegistered)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden mb-6"
    >
      {/* Header with tabs */}
      <div className="border-b border-border/50">
        <div className="flex items-center border-b border-border/30">
          {hasFinancial && (
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-5 py-4 flex items-center gap-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'financial'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Financial Health
              {financialHealth?.score != null && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-mono ${
                  financialHealth.score >= 70 ? 'bg-success/10 text-success' :
                  financialHealth.score >= 50 ? 'bg-amber-500/10 text-amber-500' :
                  'bg-red-500/10 text-destructive'
                }`}>
                  {financialHealth.score}
                </span>
              )}
            </button>
          )}
          {hasTechnical && (
            <button
              onClick={() => setActiveTab('technical')}
              className={`px-5 py-4 flex items-center gap-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'technical'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="w-4 h-4" />
              Technical Analysis
              {technicalAnalysis?.score != null && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-mono ${
                  technicalAnalysis.score >= 70 ? 'bg-success/10 text-success' :
                  technicalAnalysis.score >= 50 ? 'bg-amber-500/10 text-amber-500' :
                  'bg-red-500/10 text-destructive'
                }`}>
                  {technicalAnalysis.score}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {currentData?.summary && (
        <div className="px-5 py-3 bg-muted/20 text-sm text-muted-foreground italic">
          {currentData.summary}
        </div>
      )}

      {/* Per-stock cards */}
      <div className="p-4 space-y-2">
        {perStock.map((stock, i) => {
          const ticker = stock.ticker || `Stock ${i + 1}`
          const isExpanded = expandedStocks.has(ticker)
          const realData = realMetrics?.[ticker] ?? {}
          const isFinancial = activeTab === 'financial'

          return (
            <div key={ticker + i} className="bg-muted/15 border border-border/40 rounded-lg overflow-hidden">
              {/* Stock row header */}
              <button
                onClick={() => toggleStock(ticker)}
                className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-primary w-16">{ticker}</span>

                  {isFinancial ? (
                    <>
                      {(stock as PerStockFinancial).healthGrade && (
                        <span className={`font-mono font-bold text-lg ${getGradeColor((stock as PerStockFinancial).healthGrade)}`}>
                          {(stock as PerStockFinancial).healthGrade}
                        </span>
                      )}
                      {(stock as PerStockFinancial).keyMetric && (
                        <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                          {(stock as PerStockFinancial).keyMetric}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {(stock as PerStockTechnical).signal && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getSignalColor((stock as PerStockTechnical).signal)}`}>
                          {getSignalIcon((stock as PerStockTechnical).signal)}
                          {(stock as PerStockTechnical).signal}
                        </span>
                      )}
                      {realData?.rsi14 !== undefined && (
                        <span className="text-xs font-mono text-muted-foreground">
                          RSI {realData.rsi14}
                        </span>
                      )}
                      {realData?.trend && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {realData.trend.replace('_', ' ')}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Real metrics badges + sync icons + chevron */}
                <div className="flex items-center gap-2">
                  {isFinancial && realData?.trailingPE && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      P/E {realData.trailingPE}
                    </span>
                  )}
                  {isFinancial && realData?.revenueGrowth !== undefined && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      realData.revenueGrowth > 0.15 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      Rev {(realData.revenueGrowth * 100).toFixed(0)}%
                    </span>
                  )}
                  {!isFinancial && realData?.currentPrice && (
                    <span className="text-xs font-mono text-muted-foreground">
                      ${realData.currentPrice}
                    </span>
                  )}

                  {/* Cross-site sync icons */}
                  {showSyncIcons && (stock as PerStockFinancial | PerStockTechnical).ticker && (
                    <div className="flex items-center gap-0.5 ml-1" onClick={e => e.stopPropagation()}>
                      {tsRegistered && (
                        <SyncIcon ticker={(stock as any).ticker!} target="tradescouter" />
                      )}
                      {olRegistered && (
                        <SyncIcon ticker={(stock as any).ticker!} target="optionlookup" />
                      )}
                    </div>
                  )}

                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/30">
                  {isFinancial ? (
                    <>
                      {(stock as PerStockFinancial).earningsAssessment && (
                        <DetailRow label="Earnings & Guidance" value={(stock as PerStockFinancial).earningsAssessment!} />
                      )}
                      {(stock as PerStockFinancial).growthVsValuation && (
                        <DetailRow label="Growth vs Valuation" value={(stock as PerStockFinancial).growthVsValuation!} />
                      )}
                      {(stock as PerStockFinancial).marginAnalysis && (
                        <DetailRow label="Margin Analysis" value={(stock as PerStockFinancial).marginAnalysis!} />
                      )}
                      {(stock as PerStockFinancial).guidanceOutlook && (
                        <DetailRow label="Guidance Outlook" value={(stock as PerStockFinancial).guidanceOutlook!} />
                      )}
                    </>
                  ) : (
                    <>
                      {(stock as PerStockTechnical).trend && (
                        <DetailRow label="Trend" value={(stock as PerStockTechnical).trend!} />
                      )}
                      {(stock as PerStockTechnical).rsiInterpretation && (
                        <DetailRow label="RSI" value={(stock as PerStockTechnical).rsiInterpretation!} />
                      )}
                      {(stock as PerStockTechnical).keyLevels && (
                        <DetailRow label="Key Levels" value={(stock as PerStockTechnical).keyLevels!} />
                      )}
                      {(stock as PerStockTechnical).actionableNote && (
                        <DetailRow label="Actionable" value={(stock as PerStockTechnical).actionableNote!} />
                      )}
                    </>
                  )}

                  {/* Real data mini-grid */}
                  {Object.keys(realData).length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-2 pt-2 border-t border-border/20">
                      {isFinancial ? (
                        <>
                          {realData.marketCapDisplay && <MiniMetric label="Mkt Cap" value={realData.marketCapDisplay} />}
                          {realData.forwardPE && <MiniMetric label="Fwd P/E" value={realData.forwardPE.toString()} />}
                          {realData.pegRatio && <MiniMetric label="PEG" value={realData.pegRatio.toString()} />}
                          {realData.profitMargins !== undefined && <MiniMetric label="Margin" value={`${(realData.profitMargins * 100).toFixed(1)}%`} />}
                          {realData.returnOnEquity !== undefined && <MiniMetric label="ROE" value={`${(realData.returnOnEquity * 100).toFixed(0)}%`} />}
                          {realData.debtToEquity && <MiniMetric label="D/E" value={realData.debtToEquity.toString()} />}
                        </>
                      ) : (
                        <>
                          {realData.ma50 && <MiniMetric label="MA50" value={`$${realData.ma50}`} />}
                          {realData.ma200 && <MiniMetric label="MA200" value={`$${realData.ma200}`} />}
                          {realData.ytdReturn !== undefined && <MiniMetric label="YTD" value={`${realData.ytdReturn > 0 ? '+' : ''}${realData.ytdReturn}%`} />}
                          {realData.threeMonthReturn !== undefined && <MiniMetric label="3M" value={`${realData.threeMonthReturn > 0 ? '+' : ''}${realData.threeMonthReturn}%`} />}
                          {realData.recentSupport && <MiniMetric label="Support" value={`$${realData.recentSupport}`} />}
                          {realData.recentResistance && <MiniMetric label="Resist" value={`$${realData.recentResistance}`} />}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[110px]">{label}:</span>
      <span className="text-xs text-foreground leading-relaxed">{value}</span>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xs font-mono font-medium">{value}</div>
    </div>
  )
}
