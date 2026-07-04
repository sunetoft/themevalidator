'use client'

import { getScoreHex } from '@/lib/scores'
import Link from 'next/link'
import { Zap, TrendingUp, Users, ArrowRight, Sparkles, Search, Layers } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState, useMemo } from 'react'

interface ThemeCard {
  id: string
  name: string
  slug: string
  description: string
  iconUrl: string | null
  publishedAt: string | null
  thesisCount: number
  avgScore: number | null
  basketMembers: { ticker: string | null; companyName: string }[]
  activeTrades: number
}

export default function ThemesGalleryClient({ themes }: { themes: ThemeCard[] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'theses'>('newest')

  const filteredThemes = useMemo(() => {
    let result = themes

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.basketMembers.some(m => (m.ticker ?? '').toLowerCase().includes(q) || m.companyName.toLowerCase().includes(q))
      )
    }

    // Sort
    const sorted = [...result]
    if (sortBy === 'score') {
      sorted.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    } else if (sortBy === 'theses') {
      sorted.sort((a, b) => b.thesisCount - a.thesisCount)
    } else {
      sorted.sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    }
    return sorted
  }, [themes, search, sortBy])

  // Deduplicate basket tickers for display
  const dedupeMembers = (members: ThemeCard['basketMembers']) => {
    const seen = new Set<string>()
    const unique: ThemeCard['basketMembers'] = []
    for (const m of members) {
      const key = (m.ticker || m.companyName).toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(m)
      }
    }
    return unique
  }

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
              Browse macro investment themes, each backed by one or more AI-validated theses
              with full basket analysis, scoring, and paper trade results.
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
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'score' | 'theses')}
                className="px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="newest">Newest First</option>
                <option value="score">Highest Score</option>
                <option value="theses">Most Theses</option>
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
              {filteredThemes.map((theme, i) => {
                const uniqueMembers = dedupeMembers(theme.basketMembers)
                return (
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
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Layers className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <h3 className="text-lg font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                            {theme.name}
                          </h3>
                        </div>
                        {theme.avgScore !== null && (
                          <div className="flex-shrink-0 ml-2">
                            <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold"
                              style={{
                                borderColor: getScoreHex(theme.avgScore),
                                color: getScoreHex(theme.avgScore)
                              }}
                            >
                              {theme.avgScore}
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                        {theme.description}
                      </p>

                      {/* Thesis count badge */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md font-medium">
                          {theme.thesisCount} thesis{theme.thesisCount !== 1 ? 'es' : ''}
                        </span>
                      </div>

                      {/* Basket tickers */}
                      {uniqueMembers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {uniqueMembers.slice(0, 6).map((m, idx) => (
                            <span key={idx} className="text-xs px-2 py-1 bg-muted rounded-md text-muted-foreground">
                              {m.ticker || m.companyName}
                            </span>
                          ))}
                          {uniqueMembers.length > 6 && (
                            <span className="text-xs px-2 py-1 text-muted-foreground">
                              +{uniqueMembers.length - 6} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer stats */}
                      <div className="flex items-center gap-4 pt-4 border-t border-border/40">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          {theme.activeTrades} active trades
                        </div>
                        <div className="flex-1" />
                        <span className="text-xs font-medium text-primary group-hover:gap-2 flex items-center gap-1 transition-all">
                          View Theme
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
