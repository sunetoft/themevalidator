'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, DollarSign, Shield, CheckCircle2, XCircle,
  Loader2, Send, Eye, ChevronRight, TrendingUp,
  Sparkles, Activity, Play, Check, Minus, BarChart3, Target,
  Info, X
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import StockChartModal from '@/components/stock-chart-modal'

/** Parse strategy markdown into individual stock sections + a summary section */
function parseStrategyIntoSections(content: string): { stocks: Array<{ ticker: string; title: string; content: string }>; summary: string } {
  if (!content) return { stocks: [], summary: '' }

  const lines = content.split('\n')
  const sections: Array<{ ticker: string; title: string; content: string }> = []
  let summaryLines: string[] = []
  let currentSection: { ticker: string; title: string; lines: string[] } | null = null
  let inSummary = false

  const summaryKeywords = ['portfolio summary', 'rebalancing schedule', 'key theme catalysts', 'maximum portfolio', 'overall', 'summary']

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headerMatch) {
      const headerText = headerMatch[1].trim()
      if (summaryKeywords.some((kw) => headerText.toLowerCase().includes(kw))) {
        if (currentSection) {
          sections.push({ ticker: currentSection.ticker, title: currentSection.title, content: currentSection.lines.join('\n') })
          currentSection = null
        }
        inSummary = true
        summaryLines.push(line)
        continue
      }
      const tickerMatch = headerText.match(/\*{0,2}([A-Z]{1,5})\*{0,2}\s*[\(\-\:]?/)
      if (tickerMatch) {
        if (currentSection) {
          sections.push({ ticker: currentSection.ticker, title: currentSection.title, content: currentSection.lines.join('\n') })
        }
        inSummary = false
        currentSection = { ticker: tickerMatch[1], title: headerText.replace(/\*{1,2}/g, ''), lines: [] }
        continue
      }
    }

    if (inSummary) {
      summaryLines.push(line)
    } else if (currentSection) {
      currentSection.lines.push(line)
    } else {
      summaryLines.push(line)
    }
  }

  if (currentSection) {
    sections.push({ ticker: currentSection.ticker, title: currentSection.title, content: currentSection.lines.join('\n') })
  }

  return { stocks: sections, summary: summaryLines.join('\n').trim() }
}

/** Extract key attributes from a stock section's markdown content */
function extractAttributes(content: string): Array<{ label: string; value: string; color?: string }> {
  const attrs: Array<{ label: string; value: string; color?: string }> = []
  const patterns = [
    { label: 'Allocation', regex: /\*{0,2}Allocation\*{0,2}[:\s-]+(.+?)(?:\n|$)/i },
    { label: 'Entry Strategy', regex: /\*{0,2}Entry\s*Strateg(?:y|ies)\*{0,2}[:\s-]+(.+?)(?:\n|$)/i },
    { label: 'Position Size', regex: /\*{0,2}Position\s*Siz(?:e|ing)\*{0,2}[:\s-]+(.+?)(?:\n|$)/i },
    { label: 'Stop-Loss', regex: /\*{0,2}Stop[\s-]*Loss\*{0,2}[:\s-]+(.+?)(?:\n|$)/i, color: 'text-red-400' },
    { label: 'Take-Profit', regex: /\*{0,2}Take[\s-]*Profit\*{0,2}[:\s-]+(.+?)(?:\n|$)/i, color: 'text-primary' },
    { label: 'Monitoring', regex: /\*{0,2}Monitoring\s*(?:Cadence)?\*{0,2}[:\s-]+(.+?)(?:\n|$)/i },
    { label: 'Exit Triggers', regex: /\*{0,2}Exit\s*Triggers?\*{0,2}[:\s-]+(.+?)(?:\n|$)/i },
    { label: 'Risk Notes', regex: /\*{0,2}Risk\s*Notes?\*{0,2}[:\s-]+(.+?)(?:\n|$)/i, color: 'text-amber-400' },
  ]
  for (const p of patterns) {
    const match = content.match(p.regex)
    if (match) {
      attrs.push({ label: p.label, value: match[1].replace(/\*{1,2}/g, '').trim(), color: p.color })
    }
  }
  return attrs
}

/** Compute a confidence score (0-100) from theme member data */
function computeConfidence(member: {
  valuationStatus: string | null
  moatRating: number | null
  role: string | null
}): number {
  let score = 50 // base
  // Moat contributes up to 30pts
  if (member.moatRating != null) {
    score += (member.moatRating / 10) * 30
  }
  // Valuation contributes up to 20pts
  if (member.valuationStatus === 'undervalued') score += 20
  else if (member.valuationStatus === 'fair') score += 10
  else if (member.valuationStatus === 'overvalued') score -= 15
  // Role bonus
  if (member.role === 'leader' || member.role === 'enabler') score += 5
  return Math.min(100, Math.max(0, Math.round(score)))
}

function confidenceColor(score: number): string {
  if (score >= 70) return 'text-primary'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function confidenceBg(score: number): string {
  if (score >= 70) return 'bg-primary/10'
  if (score >= 40) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

const QUESTION_CATEGORIES = [
  'Entry Strategy',
  'Risk Management',
  'Portfolio Construction',
  'Time Horizon & Monitoring',
] as const

const QUESTIONS = [
  {
    id: 'entryLumpSum',
    category: 'Entry Strategy',
    title: 'Lump Sum',
    question: 'Do you prefer to invest the full intended amount for this high-growth basket all at once (lump sum) when conditions look good?',
    why: 'Clarifies whether the investor wants immediate full exposure or is more cautious about timing.',
    llmHandling: 'Yes → Use lump-sum entry with clear technical/fundamental triggers. No → Default to gradual entry or combine with DCA question.',
  },
  {
    id: 'entryDca',
    category: 'Entry Strategy',
    title: 'DCA',
    question: 'Would you rather use Dollar-Cost-Averaging (DCA) to enter gradually over several weeks or months?',
    why: 'Determines the preferred method to reduce timing risk in volatile high-growth stocks.',
    llmHandling: 'Yes → Build a phased DCA schedule (e.g., over 3–6 months). No + Yes on Lump Sum → Pure lump sum. Both No → Ask for clarification or use hybrid.',
  },
  {
    id: 'opportunisticBuying',
    category: 'Entry Strategy',
    title: 'Opportunistic Buying',
    question: 'If prices drop significantly, do you want to make additional opportunistic buys (extra DCA) into the basket?',
    why: 'Tests appetite for buying the dip and deploying more capital during drawdowns.',
    llmHandling: 'Yes → Add rules for extra purchases on 15-30% drawdowns. No → Stick strictly to original entry plan; no additional capital deployment.',
  },
  {
    id: 'stopLosses',
    category: 'Risk Management',
    title: 'Stop Losses',
    question: 'Do you want to use stop-loss or trailing stop orders on individual stocks to limit losses?',
    why: 'Reveals risk tolerance and willingness to automate loss protection in a volatile theme.',
    llmHandling: 'Yes → Implement tight (8-15%) or wide (20%+) stops/trailing rules. No → Rely on discretionary signals, technical levels, or wider risk buffers.',
  },
  {
    id: 'exitRules',
    category: 'Risk Management',
    title: 'Exit Rules',
    question: 'Should we set clear, predefined exit rules (e.g. profit targets, maximum loss thresholds, or time-based exits) for stocks in the basket?',
    why: 'Shows if the investor wants structured selling rules or more flexible/discretionary exits.',
    llmHandling: 'Yes → Define specific take-profit levels, max loss, or time-based exits. No → Use trend-following, rebalancing-based, or discretionary exit logic.',
  },
  {
    id: 'portfolioAllocation',
    category: 'Portfolio Construction',
    title: 'Portfolio Allocation Size',
    question: 'Should this high-growth basket represent a large portion of your overall portfolio (15-30%+)?',
    why: 'Defines overall conviction and risk budget for the theme.',
    llmHandling: 'Yes → Allocate 15-35% of total portfolio to the basket. No → Cap at 5-15%. Use to determine number of stocks and position sizes.',
  },
  {
    id: 'weighting',
    category: 'Portfolio Construction',
    title: 'Weighting Method',
    question: 'Do you want equal weighting across all stocks in the basket?',
    why: 'Clarifies preference between simple equal allocation vs conviction/market-cap weighted.',
    llmHandling: 'Yes → Use equal weighting (e.g., 10 stocks = 10% each of basket). No → Apply conviction-based, market-cap, or risk-parity weighting.',
  },
  {
    id: 'rebalancing',
    category: 'Portfolio Construction',
    title: 'Rebalancing',
    question: 'Should the basket be rebalanced periodically (e.g. every 3–6 months) to maintain target weights?',
    why: 'Determines how much the portfolio should be actively adjusted over time.',
    llmHandling: 'Yes → Include scheduled rebalancing rules (quarterly/semi-annual). No → Use buy-and-hold or threshold-based rebalancing only.',
  },
  {
    id: 'timeHorizon',
    category: 'Time Horizon & Monitoring',
    title: 'Time Horizon',
    question: 'Is your intended holding period long-term (5+ years), rather than short-to-medium term?',
    why: 'Sets expectations for strategy horizon and turnover level.',
    llmHandling: 'Yes → Long-term buy-and-hold bias with wide stops. No → Medium-term focus with more frequent profit-taking and tighter management.',
  },
  {
    id: 'monitoring',
    category: 'Time Horizon & Monitoring',
    title: 'Monitoring Style',
    question: 'Do you prefer active monthly monitoring and adjustments rather than a passive approach?',
    why: "Reveals the investor's desired level of involvement and ability to react to volatility.",
    llmHandling: 'Yes → Design more dynamic rules, frequent review triggers, and alert recommendations. No → Prioritize simple, rules-based, low-maintenance strategy with minimal intervention.',
  },
]

interface ThesisData {
  id: string
  title: string
  description: string
  themeMembers: Array<{
    ticker: string | null
    companyName: string
    valuationStatus: string | null
    moatRating: number | null
    role: string | null
    marketCap: string | null
    peRatio: string | null
    competency: string | null
  }>
}

export default function StrategyPage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const params = useParams()
  const thesisId = params?.id as string
  const searchParams = useSearchParams()

  const [thesis, setThesis] = useState<ThesisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'form' | 'review' | 'generating' | 'result'>('form')

  // Form state
  const [strategyName, setStrategyName] = useState('')
  const [amount, setAmount] = useState('')
  const [riskProfile, setRiskProfile] = useState('Medium')
  const [answers, setAnswers] = useState<Record<string, boolean>>(
    Object.fromEntries(QUESTIONS.map((q) => [q.id, false]))
  )

  // Ticker selection state
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set())

  // Strategy state
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [strategyContent, setStrategyContent] = useState('')
  const [eligibleStocks, setEligibleStocks] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [currentStrategyId, setCurrentStrategyId] = useState<string | null>(null)
  const [startingPaperTrade, setStartingPaperTrade] = useState(false)
  const [activePaperTradeId, setActivePaperTradeId] = useState<string | null>(null)
  const [existingStrategies, setExistingStrategies] = useState<any[]>([])
  const [chartModal, setChartModal] = useState<{ ticker: string; companyName?: string } | null>(null)
  const [infoModalQ, setInfoModalQ] = useState<typeof QUESTIONS[number] | null>(null)
  const [paperTradeName, setPaperTradeName] = useState('')
  const [paperTradeNameModal, setPaperTradeNameModal] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (thesisId) {
      fetchThesis()
      fetchExistingStrategies()
    }
  }, [thesisId])

  // Initialize selected tickers and default name when thesis loads
  useEffect(() => {
    if (thesis) {
      const eligible = thesis.themeMembers
        .filter((m) => m.ticker)
        .map((m) => m.ticker as string)
      setSelectedTickers(new Set(eligible))
      // Generate default strategy name from thesis title
      if (!strategyName) {
        setStrategyName(`${thesis.title} Strategy`)
      }
    }
  }, [thesis])

  const fetchThesis = async () => {
    try {
      const res = await fetch(`/api/theses/${thesisId}`)
      if (res.ok) {
        const data = await res.json()
        setThesis(data)
      } else {
        router.push('/dashboard')
      }
    } catch {
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingStrategies = async () => {
    try {
      const res = await fetch(`/api/theses/${thesisId}/strategy`)
      if (res.ok) {
        const data = await res.json()
        const completed = data.filter((s: any) => s.status === 'completed')
        setExistingStrategies(completed)

        // Auto-load a specific strategy if strategyId is in the URL
        const sid = searchParams.get('strategyId')
        if (sid) {
          const found = completed.find((s: any) => s.id === sid)
          if (found) {
            setStrategyContent(found.strategy || '')
            setCurrentStrategyId(found.id)
            setStrategyName(found.name || '')
            setAmount(String(found.amount))
            setRiskProfile(found.riskProfile)
            setStep('result')
          }
        }
      }
    } catch { /* ignore */ }
  }

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  const toggleAllTickers = () => {
    const eligible = thesis?.themeMembers
      .filter((m) => m.ticker)
      .map((m) => m.ticker as string) ?? []
    if (selectedTickers.size === eligible.length) {
      setSelectedTickers(new Set())
    } else {
      setSelectedTickers(new Set(eligible))
    }
  }

  const promptPaperTradeName = (strategyId: string) => {
    if (selectedTickers.size === 0) {
      toast.error('Please select at least one ticker for paper trading')
      return
    }
    // Generate default name
    const defaultName = thesis
      ? `${thesis.title} — Paper Trade (${new Date().toLocaleDateString()})`
      : `Paper Trade ${new Date().toLocaleDateString()}`
    setPaperTradeName(defaultName)
    setPaperTradeNameModal(strategyId)
  }

  const handleStartPaperTrade = async () => {
    const strategyId = paperTradeNameModal
    if (!strategyId) return
    if (selectedTickers.size === 0) {
      toast.error('Please select at least one ticker for paper trading')
      return
    }
    setStartingPaperTrade(true)
    try {
      const res = await fetch('/api/paper-trade/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          selectedTickers: Array.from(selectedTickers),
          name: paperTradeName || null,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Paper trade started!')
        setPaperTradeNameModal(null)
        router.push(`/thesis/${thesisId}/paper-trade/${data.paperTradeId}`)
      } else {
        toast.error(data?.error ?? 'Failed to start paper trade')
      }
    } catch {
      toast.error('Failed to start paper trade')
    } finally {
      setStartingPaperTrade(false)
    }
  }

  const handleSubmitForm = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid investment amount')
      return
    }
    if (selectedTickers.size === 0) {
      toast.error('Please select at least one ticker')
      return
    }

    try {
      const res = await fetch(`/api/theses/${thesisId}/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmount, riskProfile, answers, name: strategyName || null }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err?.error ?? 'Failed to generate prompt')
        return
      }

      const data = await res.json()
      setGeneratedPrompt(data.prompt)
      setCurrentStrategyId(data.strategyId ?? null)
      setEligibleStocks(data.eligibleStocks ?? [])
      setStep('review')
    } catch (err: any) {
      toast.error('Something went wrong')
    }
  }

  const handleGenerateStrategy = async () => {
    setStep('generating')
    setGenerating(true)
    setStrategyContent('')

    const numAmount = parseFloat(amount)

    try {
      const res = await fetch(`/api/theses/${thesisId}/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          riskProfile,
          answers,
          name: strategyName || null,
          generateNow: true,
          strategyId: currentStrategyId,
        }),
      })

      if (!res.ok) {
        toast.error('Strategy generation failed')
        setStep('review')
        setGenerating(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let partialRead = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        partialRead += decoder.decode(value, { stream: true })
        const lines = partialRead.split('\n')
        partialRead = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.status === 'completed') {
                setStrategyContent(data.content ?? '')
                if (data.strategyId) setCurrentStrategyId(data.strategyId)
                setStep('result')
                setGenerating(false)
                toast.success('Trading strategy generated!')
                return
              } else if (data.status === 'streaming') {
                setStrategyContent(data.content ?? '')
                setStep('result')
              } else if (data.status === 'error') {
                toast.error(data.message ?? 'Generation failed')
                setStep('review')
                setGenerating(false)
                return
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      toast.error('Strategy generation failed')
      setStep('review')
    } finally {
      setGenerating(false)
    }
  }

  const toggleAnswer = (id: string) => {
    setAnswers((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
                <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!thesis) {
    return (
      <div className="min-h-screen bg-background">
                <div className="text-center py-32">
          <p className="text-muted-foreground">Thesis not found</p>
        </div>
      </div>
    )
  }

  const stockBasket = thesis.themeMembers.filter(
    (m) => m.ticker
  )

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[1000px] mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push(`/thesis/${thesisId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Analysis
        </button>

        {/* Page header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-primary" />
            {strategyName || 'Create Trade Strategy'}
          </h1>
          <p className="text-muted-foreground">
            Build a personalized trading strategy for{' '}
            <span className="text-foreground font-medium">{thesis.title}</span>
          </p>
        </div>

        {/* Unified Ticker Cards with Confidence + Selection */}
        <div className="mb-6 animate-fade-in-d1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              STOCK BASKET ({stockBasket.length} stocks)
            </h3>
            <button
              onClick={toggleAllTickers}
              className="text-xs text-primary hover:text-primary transition-colors font-medium"
            >
              {selectedTickers.size === stockBasket.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {stockBasket.map((member, i) => {
              const ticker = member.ticker as string
              const confidence = computeConfidence(member)
              const isSelected = selectedTickers.has(ticker)

              return (
                <motion.div
                  key={ticker}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => toggleTicker(ticker)}
                  className={`bg-card border rounded-xl overflow-hidden cursor-pointer transition-all group ${
                    isSelected
                      ? 'border-primary/50 ring-1 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/30 opacity-60'
                  }`}
                  style={{ boxShadow: 'var(--shadow-sm)' }}
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-border/50 bg-muted/20 flex items-center gap-3">
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-primary text-white' : 'border border-muted-foreground/30 text-transparent'
                    }`}>
                      <Check className="w-3.5 h-3.5" />
                    </div>

                    {/* Ticker badge - clickable for chart */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setChartModal({ ticker, companyName: member.companyName }) }}
                      className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 hover:bg-primary/25 transition-colors group/badge"
                      title={`${ticker} — Click to view price chart`}
                    >
                      <span className="font-mono font-bold text-primary text-sm group-hover/badge:underline">{ticker}</span>
                    </button>

                    {/* Title + role */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setChartModal({ ticker, companyName: member.companyName }) }}
                        className="text-left hover:text-primary transition-colors w-full"
                        title="Click to view price chart"
                      >
                        <h4 className="font-display font-semibold text-sm truncate hover:underline">{member.companyName}</h4>
                      </button>
                      {member.role && (
                        <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                      )}
                    </div>

                    {/* Confidence score */}
                    <div className={`flex flex-col items-center flex-shrink-0 ${confidenceBg(confidence)} rounded-lg px-2.5 py-1.5`}>
                      <span className={`text-lg font-mono font-bold leading-tight ${confidenceColor(confidence)}`}>{confidence}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">confidence</span>
                    </div>
                  </div>

                  {/* Card Body - All info in one place */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Valuation</span>
                        <span className={`text-xs font-medium ${
                          member.valuationStatus === 'undervalued' ? 'text-primary' :
                          member.valuationStatus === 'overvalued' ? 'text-red-400' : 'text-amber-400'
                        }`}>
                          {member.valuationStatus ?? 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Moat</span>
                        <span className="text-xs font-medium">
                          {member.moatRating != null ? `${member.moatRating}/10` : 'N/A'}
                        </span>
                      </div>
                      {member.marketCap && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Mkt Cap</span>
                          <span className="text-xs font-medium font-mono">{member.marketCap}</span>
                        </div>
                      )}
                      {member.peRatio && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">P/E</span>
                          <span className="text-xs font-medium font-mono">{member.peRatio}</span>
                        </div>
                      )}
                    </div>
                    {member.competency && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pt-1 border-t border-border/30">
                        {member.competency}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Selection summary */}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Target className="w-3.5 h-3.5" />
            <span>
              <strong className="text-foreground">{selectedTickers.size}</strong> of {stockBasket.length} stocks selected for trading
            </span>
          </div>
        </div>

        {/* Existing Completed Strategies */}
        {existingStrategies.length > 0 && step === 'form' && (
          <div
            className="bg-card border border-border rounded-xl p-5 mb-6 animate-fade-in-d2"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" /> COMPLETED STRATEGIES
            </h3>
            <div className="space-y-2">
              {existingStrategies.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">
                      {s.name || `$${s.amount?.toLocaleString()} — ${s.riskProfile} Risk`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${s.amount?.toLocaleString()} · {s.riskProfile} Risk · {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => promptPaperTradeName(s.id)}
                    disabled={startingPaperTrade}
                    className="px-3 py-1.5 bg-primary hover:bg-primary text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {startingPaperTrade ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Paper Trade
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1: Form */}
          {step === 'form' && (
            <div
              className="space-y-6 animate-fade-in-d2"
            >
              {/* Strategy Name */}
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <label className="text-sm font-medium text-muted-foreground mb-3 block">STRATEGY NAME</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder="e.g. Aggressive AI Basket, Conservative Dividend Play"
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground/50 mt-1">Give your strategy a descriptive name to easily identify it later.</p>
              </div>

              {/* Strategy Name */}
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <label className="text-sm font-medium text-muted-foreground mb-3 block">STRATEGY NAME</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder={`e.g. $${parseFloat(amount) ? parseFloat(amount).toLocaleString() : ''} ${riskProfile}-Risk on ${thesis?.title?.split(':')[0]?.trim() || thesis?.title || ''}`}
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Give your strategy a descriptive name so you can identify it later.</p>
              </div>

              {/* Amount */}
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <label className="text-sm font-medium text-muted-foreground mb-3 block">INVESTMENT AMOUNT (USD)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      setAmount(val)
                    }}
                    placeholder="10000"
                    className="w-full pl-10 pr-4 py-3 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-lg"
                  />
                </div>
              </div>

              {/* Risk Profile */}
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <label className="text-sm font-medium text-muted-foreground mb-3 block">RISK PROFILE</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Low', 'Medium', 'High'].map((profile) => (
                    <button
                      key={profile}
                      onClick={() => setRiskProfile(profile)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        riskProfile === profile
                          ? profile === 'High'
                            ? 'border-red-500 bg-red-500/10 text-red-400'
                            : profile === 'Low'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      <Shield className={`w-5 h-5 mx-auto mb-1 ${riskProfile === profile ? '' : 'opacity-50'}`} />
                      <span className="text-sm font-medium">{profile}</span>
                      <p className="text-xs mt-0.5 opacity-70">
                        {profile === 'Low' ? 'Solid picks' : profile === 'High' ? 'High risk/reward' : 'Balanced'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions */}
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <label className="text-sm font-medium text-muted-foreground mb-4 block">STRATEGY PREFERENCES</label>
                <div className="space-y-5">
                  {QUESTION_CATEGORIES.map((cat) => {
                    const catQuestions = QUESTIONS.filter((q) => q.category === cat)
                    return (
                      <div key={cat}>
                        <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-2 px-1">{cat}</h4>
                        <div className="space-y-2">
                          {catQuestions.map((q, i) => (
                            <motion.div
                              key={q.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => toggleAnswer(q.id)}
                            >
                              <div className="mt-0.5 flex-shrink-0">
                                {answers[q.id] ? (
                                  <CheckCircle2 className="w-5 h-5 text-primary" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-muted-foreground/40" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium">{q.title}</p>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setInfoModalQ(q) }}
                                    className="text-muted-foreground/50 hover:text-primary transition-colors flex-shrink-0"
                                    aria-label={`More info: ${q.title}`}
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{q.question}</p>
                              </div>
                              <span className={`text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 ${
                                answers[q.id]
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {answers[q.id] ? 'YES' : 'NO'}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmitForm}
                disabled={selectedTickers.size === 0}
                className="w-full py-3.5 bg-primary hover:bg-primary text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye className="w-5 h-5" />
                Review Strategy Prompt ({selectedTickers.size} stocks)
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Review prompt */}
          {step === 'review' && (
            <div
              className="space-y-6 animate-fade-in"
            >
              <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">GENERATED PROMPT</h3>
                <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed">
                  {generatedPrompt}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('form')}
                  className="flex-1 py-3 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors font-medium"
                >
                  ← Back to Edit
                </button>
                <button
                  onClick={handleGenerateStrategy}
                  className="flex-1 py-3 bg-primary hover:bg-primary text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Generate Strategy
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Generating / Result */}
          {(step === 'generating' || step === 'result') && (
            <div
              className="space-y-6 animate-fade-in"
            >
              {generating && (
                <div className="flex items-center gap-3 text-primary mb-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">Generating your personalized trading strategy...</span>
                </div>
              )}

              {/* Rendered strategy content */}
              <div ref={contentRef}>
                {strategyContent ? (
                  (() => {
                    const parsed = parseStrategyIntoSections(strategyContent)
                    if (parsed.stocks.length > 0) {
                      return (
                        <div className="space-y-5">
                          <div className="grid gap-4 md:grid-cols-2">
                            {parsed.stocks.map((stock, i) => {
                              const attrs = extractAttributes(stock.content)
                              const member = thesis?.themeMembers.find((m) => m.ticker === stock.ticker)
                              const confidence = member ? computeConfidence(member) : null
                              return (
                                <motion.div
                                  key={stock.ticker + i}
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className="bg-card border border-border rounded-xl overflow-hidden"
                                  style={{ boxShadow: 'var(--shadow-sm)' }}
                                >
                                  {/* Card Header */}
                                  <div className="px-5 py-4 border-b border-border bg-muted/20">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setChartModal({ ticker: stock.ticker, companyName: member?.companyName }) }}
                                          className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors cursor-pointer group/badge"
                                          title={`${stock.ticker} — Click to view price chart`}
                                        >
                                          <span className="font-mono font-bold text-primary text-sm group-hover/badge:underline">{stock.ticker}</span>
                                        </button>
                                        <div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setChartModal({ ticker: stock.ticker, companyName: member?.companyName }) }}
                                            className="text-left hover:text-primary transition-colors"
                                            title="Click to view price chart"
                                          >
                                            <h3 className="font-display font-semibold text-sm hover:underline">{stock.title}</h3>
                                          </button>
                                          {member && (
                                            <p className="text-xs text-muted-foreground">
                                              {member.role && <span className="capitalize">{member.role}</span>}
                                              {member.moatRating != null && <span className="ml-2">· Moat: {member.moatRating}/10</span>}
                                              {member.valuationStatus && (
                                                <span className={`ml-2 ${
                                                  member.valuationStatus === 'undervalued' ? 'text-primary' :
                                                  member.valuationStatus === 'overvalued' ? 'text-red-400' : 'text-amber-400'
                                                }`}>
                                                  · {member.valuationStatus}
                                                </span>
                                              )}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      {confidence != null && (
                                        <div className={`flex flex-col items-center ${confidenceBg(confidence)} rounded-lg px-2 py-1`}>
                                          <span className={`text-base font-mono font-bold leading-tight ${confidenceColor(confidence)}`}>{confidence}</span>
                                          <span className="text-[9px] text-muted-foreground">score</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Card Body */}
                                  <div className="p-5">
                                    {attrs.length > 0 ? (
                                      <div className="space-y-3">
                                        {attrs.map((attr, ai) => (
                                          <div key={ai} className="flex items-start gap-2">
                                            <span className="text-xs text-muted-foreground min-w-[90px] flex-shrink-0 pt-0.5 uppercase tracking-wide">
                                              {attr.label}
                                            </span>
                                            <span className={`text-sm leading-relaxed ${attr.color || 'text-foreground'}`}>
                                              {attr.value}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
                                        <ReactMarkdown>{stock.content}</ReactMarkdown>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>

                          {parsed.summary && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: parsed.stocks.length * 0.05 + 0.1 }}
                              className="bg-card border border-border rounded-xl p-6 prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground"
                              style={{ boxShadow: 'var(--shadow-sm)' }}
                            >
                              <ReactMarkdown>{parsed.summary}</ReactMarkdown>
                            </motion.div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div
                        className="bg-card border border-border rounded-xl p-6 prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground"
                        style={{ boxShadow: 'var(--shadow-sm)' }}
                      >
                        <ReactMarkdown>{strategyContent}</ReactMarkdown>
                      </div>
                    )
                  })()
                ) : (
                  <div className="bg-card border border-border rounded-xl p-6 text-center py-12" style={{ boxShadow: 'var(--shadow-sm)' }}>
                    <Sparkles className="w-8 h-8 text-primary mx-auto mb-3 animate-pulse" />
                    <p className="text-muted-foreground">Crafting your strategy...</p>
                  </div>
                )}
              </div>

              {!generating && strategyContent && (
                <div className="space-y-3">
                  {currentStrategyId && (
                    <button
                      onClick={() => promptPaperTradeName(currentStrategyId)}
                      disabled={startingPaperTrade || selectedTickers.size === 0}
                      className="w-full py-3.5 bg-gradient-to-r from-primary to-teal-600 hover:from-primary hover:to-teal-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {startingPaperTrade ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Setting up paper trade...</>
                      ) : (
                        <><Activity className="w-5 h-5" /> Start Paper Trade ({selectedTickers.size} stocks)<Play className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setStep('form')
                        setStrategyContent('')
                        setCurrentStrategyId(null)
                      }}
                      className="flex-1 py-3 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors font-medium"
                    >
                      ← Create New Strategy
                    </button>
                    <button
                      onClick={() => router.push(`/thesis/${thesisId}`)}
                      className="flex-1 py-3 bg-primary hover:bg-primary text-white rounded-xl font-semibold transition-colors"
                    >
                      Back to Analysis
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
      </main>

      {/* Paper Trade Name Modal */}
      {paperTradeNameModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onKeyDown={(e) => { if (e.key === 'Escape') setPaperTradeNameModal(null) }}
        >
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Name Your Paper Trade</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedTickers.size} stock{selectedTickers.size > 1 ? 's' : ''} selected
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPaperTradeNameModal(null)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">TRADE NAME</label>
                  <input
                    type="text"
                    value={paperTradeName}
                    onChange={(e) => setPaperTradeName(e.target.value)}
                    placeholder="e.g. CSP Wheel on NVDA"
                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStartPaperTrade() }}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Give your paper trade a descriptive name to identify it on your dashboard.</p>
                </div>
                <button
                  onClick={handleStartPaperTrade}
                  disabled={startingPaperTrade || !paperTradeName.trim()}
                  className="w-full py-3 bg-gradient-to-r from-primary to-teal-600 hover:from-primary hover:to-teal-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {startingPaperTrade ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Setting up paper trade...</>
                  ) : (
                    <><Activity className="w-5 h-5" /> Start Paper Trade</>
                  )}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Stock Chart Modal */}
      {chartModal && (
        <StockChartModal
          ticker={chartModal.ticker}
          companyName={chartModal.companyName}
          onClose={() => setChartModal(null)}
        />
      )}

      {/* Question Info Modal */}
      {infoModalQ && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setInfoModalQ(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setInfoModalQ(null) }}
          role="button"
          tabIndex={0}
        >
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Info className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-primary/80 font-medium uppercase tracking-wider">{infoModalQ.category}</p>
                    <h3 className="text-base font-semibold">{infoModalQ.title}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setInfoModalQ(null)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Question</p>
                  <p className="text-sm text-foreground">{infoModalQ.question}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why This Matters</p>
                  <p className="text-sm text-muted-foreground">{infoModalQ.why}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                  <p className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-1">How the AI Uses Your Answer</p>
                  <p className="text-sm text-muted-foreground">{infoModalQ.llmHandling}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
