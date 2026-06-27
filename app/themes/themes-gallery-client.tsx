'use client'

import { getScoreHex } from '@/lib/scores'
import Link from 'next/link'
import { Zap, TrendingUp, Users, ArrowRight, Sparkles, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState, useMemo } from 'react'

interface Theme {
  id: string
  title: string
  description: string
  overallScore: number | null
  sentimentScore: number | null
  ecosystemScore: number | null
  riskScore: number | null
  opportunityScore: number | null
  moatScore: number | null
  publishedAt: string | null
  themeMembers: { ticker: string | null; companyName: string }[]
  _count: { paperTrades: number }
}

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) return null
  const hex = getScoreHex(score)
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold" style={{ color: hex }}>{score}</span>
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
    </div>
  )
}

export default function ThemesGalleryClient({ themes }: { themes: Theme[] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'trades'>('newest')

  const filteredThemes = useMemo(() => {
    let result = themes

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.themeMembers.some(m => (m.ticker ?? '').toLowerCase().includes(q) || m.companyName.toLowerCase().includes(q))
      )
    }

    // Sort
    const sorted = [...result]
    if (sortBy === 'score') {
      sorted.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
    } else if (sortBy === 'trades') {
      sorted.sort((a, b) => b._count.paperTrades - a._count.paperTrades)
    } else {
      sorted.sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    }
    return sorted
  }, [themes, search, sortBy])

  return (
    <div className="min-h-screen bg-background">
      
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="container mx-auto max-w-6xl py-12 px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 mb-3 text-sm text-primary">
              <Sparkles className="w-4 h-4" />
              AI-Powered Investment Theme Analysis
            </div>
            <h1 className="text-4xl font-bold mb-3">Explore Investment Themes</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Browse AI-validated investment themes and their paper trade results.
              Subscribe to create your own strategies and paper trades.
            </p>
          </div>

          {/* Search + Sort controls */}
          {themes.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search themes, tickers, companies..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'score' | 'trades')}
                className="px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="newest">Newest First</option>
                <option value="score">Highest Score</option>
                <option value="trades">Most Traded</option>
              </select>
            </div>
          )}

          {/* Themes grid */}
          {themes.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No themes published yet.</p>
              <p className="text-sm mt-2">Check back soon for new investment themes.</p>
            </div>
          ) : filteredThemes.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No themes match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredThemes.map((theme, i) => (
                <motion.div
                  key={theme.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <Link
                    href={`/themes/${theme.id}`}
                    className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all group h-full"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                        {theme.title}
                      </h3>
                      {theme.overallScore !== null && (
                        <div className="flex-shrink-0 ml-2">
                          <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold"
                            style={{
                            borderColor: getScoreHex(theme.overallScore),
                            color: getScoreHex(theme.overallScore)
                            }}
                          >
                            {theme.overallScore}
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                      {theme.description}
                    </p>

                    {/* Member tickers */}
                    {theme.themeMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {theme.themeMembers.slice(0, 5).map((m, idx) => (
                          <span key={idx} className="text-xs px-2 py-1 bg-muted rounded-md text-muted-foreground">
                            {m.ticker || m.companyName}
                          </span>
                        ))}
                        {theme.themeMembers.length > 5 && (
                          <span className="text-xs px-2 py-1 text-muted-foreground">
                            +{theme.themeMembers.length - 5} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer stats */}
                    <div className="flex items-center gap-4 pt-4 border-t border-border/40">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {theme._count.paperTrades} active trades
                      </div>
                      <div className="flex-1" />
                      <span className="text-xs font-medium text-primary group-hover:gap-2 flex items-center gap-1 transition-all">
                        View Details
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
