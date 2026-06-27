'use client'

import { motion } from 'framer-motion'
import { PieChart, TrendingUp } from 'lucide-react'

export interface ThemeETF {
  symbol?: string
  name?: string
  provider?: string
  focus?: string
  aum?: string
  ytdReturn?: string
  ytdValue?: number
  overlap?: string
  expenseRatio?: string
  category?: string
  totalAssets?: number
}

function getYtdColor(ytd?: string): string {
  if (!ytd) return 'text-muted-foreground'
  const num = parseFloat(ytd)
  if (isNaN(num)) return 'text-muted-foreground'
  return num >= 0 ? 'text-success' : 'text-destructive'
}

export default function ThemeETFsCard({ etfs }: { etfs: ThemeETF[] }) {
  if (!etfs || etfs.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden mb-6"
    >
      <div className="p-5 border-b border-border/50 flex items-center gap-2">
        <PieChart className="w-5 h-5 text-accent" />
        <h2 className="font-display font-semibold">Theme ETFs</h2>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
          {etfs.length} ETF{etfs.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {etfs.map((etf, i) => (
          <motion.div
            key={etf.symbol || i}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-muted/20 border border-border/50 rounded-lg p-4 hover:border-border transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary text-lg">{etf.symbol}</span>
                  {etf.expenseRatio && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {etf.expenseRatio} ER
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{etf.name}</p>
              </div>
              {etf.ytdReturn && (
                <div className="text-right">
                  <div className={`font-mono font-semibold text-sm ${getYtdColor(etf.ytdReturn)}`}>
                    {etf.ytdReturn}
                  </div>
                  <div className="text-xs text-muted-foreground">YTD</div>
                </div>
              )}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              {etf.aum && (
                <div>
                  <span className="text-muted-foreground">AUM</span>
                  <p className="font-mono font-medium">{etf.aum}</p>
                </div>
              )}
              {etf.provider && (
                <div>
                  <span className="text-muted-foreground">Provider</span>
                  <p className="font-medium truncate">{etf.provider}</p>
                </div>
              )}
              {etf.category && (
                <div>
                  <span className="text-muted-foreground">Category</span>
                  <p className="font-medium truncate">{etf.category}</p>
                </div>
              )}
            </div>

            {/* Focus */}
            {etf.focus && (
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{etf.focus}</p>
            )}

            {/* Overlap */}
            {etf.overlap && (
              <div className="mt-2 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-primary" />
                <span className="text-xs text-primary">{etf.overlap}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
