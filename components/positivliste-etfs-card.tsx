'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Landmark, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import type { PositivlisteExposure, PositivlisteFund } from '@/lib/etf-holdings'

const ETF_APP = 'https://etf.stdigital.dk'

function pct(w: number | null | undefined, digits = 2): string {
  if (w == null) return '—'
  return `${(w * 100).toFixed(digits)}%`
}

function fmtTer(ter: number | null): string {
  return ter != null ? `${ter.toFixed(2)}%` : '—'
}

function holdingsSearchUrl(ticker: string): string {
  return `${ETF_APP}/find-etf?mode=holdings&q=${encodeURIComponent(ticker)}`
}

function fundTypeBadge(type: string | null): { label: string; cls: string } {
  switch (type) {
    case 'ETF':
      return { label: 'ETF', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
    case 'Investeringsforening':
      return { label: 'DK fund', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' }
    case 'Fond':
      return { label: 'Fund', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' }
    default:
      return { label: type ?? 'Fund', cls: 'bg-muted text-muted-foreground border-border' }
  }
}

function FundRow({
  fund,
  totalTickers,
  rank,
}: {
  fund: PositivlisteFund
  totalTickers: number
  rank: number
}) {
  const badge = fundTypeBadge(fund.fundType)
  const full = fund.matchCount === totalTickers
  return (
    <div className="bg-muted/20 border border-border/50 rounded-lg p-3.5 hover:border-border transition-colors">
      <div className="flex items-start gap-3">
        <span className="font-mono text-xs text-muted-foreground pt-0.5 w-5 shrink-0 text-right">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <a
              href={`${ETF_APP}/fond/${fund.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm leading-snug hover:text-primary transition-colors inline-flex items-start gap-1.5 group"
            >
              <span className="line-clamp-2">{fund.name}</span>
              <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
            </a>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold font-mono ${
                full ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'
              }`}
              title={`Holds ${fund.matchCount} of ${totalTickers} stocks from this thesis`}
            >
              {fund.matchCount}/{totalTickers}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            <span className={`px-1.5 py-0.5 rounded border text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
            {fund.ticker && <span className="font-mono font-medium text-foreground/80">{fund.ticker}</span>}
            {fund.isin && <span className="font-mono">{fund.isin}</span>}
            <span>TER {fmtTer(fund.ter)}</span>
            {fund.currency && <span>{fund.currency}</span>}
            <span>
              combined weight{' '}
              <span className="font-mono font-medium text-foreground">{pct(fund.totalWeight)}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {fund.holdings.map((h) => (
              <a
                key={h.ticker}
                href={holdingsSearchUrl(h.ticker)}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  h.companyName
                    ? `${h.companyName} — ${pct(h.weight)} of this fund`
                    : `${pct(h.weight)} of this fund`
                }
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-mono transition-colors"
              >
                {h.ticker}
                <span className="text-primary/70">{pct(h.weight)}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PositivlisteEtfsCard({
  data,
}: {
  data: PositivlisteExposure | null | undefined
}) {
  const [showAll, setShowAll] = useState(false)
  const [sortMode, setSortMode] = useState<'coverage' | 'exposure'>('coverage')

  if (!data || !data.funds || data.funds.length === 0) return null

  const coverage = data.coverage ?? []
  const found = coverage.filter((c) => c.found)
  const missing = coverage.filter((c) => !c.found)
  const totalTickers = data.tickers.length
  const rankedFunds =
    sortMode === 'exposure' && data.fundsByExposure?.length ? data.fundsByExposure : data.funds
  const visibleFunds = showAll ? rankedFunds : rankedFunds.slice(0, 6)
  const fullCoverage = data.funds.filter((f) => f.matchCount === totalTickers).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden mb-6"
    >
      <div className="p-5 border-b border-border/50 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Landmark className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold flex flex-wrap items-center gap-2">
              Positivliste ETF Exposure
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
                {data.fundCount} fund{data.fundCount === 1 ? '' : 's'}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Funds on SKAT&apos;s positivliste that actually hold the stocks analysed in this thesis
              {fullCoverage > 0 && (
                <>
                  {' — '}
                  <span className="text-success font-medium">{fullCoverage}</span> hold the full basket
                </>
              )}
              .
            </p>
          </div>
        </div>
        <a
          href={ETF_APP}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          etf.stdigital.dk
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-5 space-y-4">
        {/* Per-ticker coverage */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Positivliste coverage ({found.length}/{totalTickers} stocks held by at least one fund)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {coverage.map((c) => (
              <a
                key={c.ticker}
                href={holdingsSearchUrl(c.ticker)}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  c.found
                    ? `${c.fundCount} funds hold ${c.ticker} (highest weight ${pct(c.maxWeight)})`
                    : `No fund on the positivliste holds ${c.ticker}`
                }
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-mono transition-colors ${
                  c.found
                    ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                    : 'bg-muted/30 text-muted-foreground border-border/50'
                }`}
              >
                {c.ticker}
                <span className="text-[10px] opacity-80">{c.fundCount}</span>
              </a>
            ))}
          </div>
          {missing.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
              <span>
                No positivliste fund holds {missing.map((m) => m.ticker).join(', ')} — typically
                US-only listings with no European UCITS coverage.
              </span>
            </p>
          )}
        </div>

        {/* Ranked funds */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {sortMode === 'coverage'
                ? 'Broadest coverage — ranked by thesis stocks held'
                : 'Highest exposure — ranked by combined weight in thesis stocks'}
            </div>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(
                [
                  { id: 'coverage', label: 'Broadest' },
                  { id: 'exposure', label: 'Most exposed' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSortMode(m.id)
                    setShowAll(false)
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sortMode === m.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {visibleFunds.map((fund, i) => (
            <FundRow key={fund.id} fund={fund} totalTickers={totalTickers} rank={i + 1} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {rankedFunds.length > 6 ? (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAll ? 'Show fewer' : `Show all ${rankedFunds.length}`}
            </button>
          ) : (
            <span />
          )}
          {data.fundCount > data.funds.length && data.tickers[0] && (
            <a
              href={holdingsSearchUrl(data.tickers[0])}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              View all {data.fundCount} funds on etf.stdigital.dk
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 text-[11px] text-muted-foreground/70 leading-relaxed">
        Source: ETF Positivlisten (etf.stdigital.dk) holdings data for funds on SKAT&apos;s
        positivliste. Weights are the stock&apos;s share of the fund, not of your portfolio. Matches use
        normalized ticker symbols, so a symbol shared by two listings (e.g. NXT = Nextracker / Next
        plc) can show up — hover a ticker to see the matched company name. Not investment advice.
      </div>
    </motion.div>
  )
}
