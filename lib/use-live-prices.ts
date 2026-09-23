'use client'

/**
 * Client hook for live quotes.
 *
 * Prices on ThemeInvestor pages must come from market data, never from a price
 * the LLM echoed into generated prose. This hook batches the page's tickers
 * into a single request to `/api/live-prices` (the server caches 60s, so
 * concurrent viewers share one upstream fetch) and polls on an interval.
 *
 * Chunks tickers into groups of ≤40 fetched in parallel — large baskets would
 * otherwise hit the server's ticker cap and leave rows without prices.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export interface LivePrice {
  price: number
  display: string
  prevClose: number | null
  dayChangePct: number | null
  asOf: string | null
}

type PriceMap = Record<string, LivePrice>

const CHUNK_SIZE = 40
const DEFAULT_INTERVAL_MS = 60_000

export function useLivePrices(
  tickers: Array<string | null | undefined>,
  intervalMs: number = DEFAULT_INTERVAL_MS
): { prices: PriceMap; asOf: string | null; loading: boolean } {
  const [prices, setPrices] = useState<PriceMap>({})
  const [asOf, setAsOf] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Stable dependency string — a new array identity each render must not refetch.
  const key = useMemo(
    () =>
      Array.from(
        new Set(
          tickers
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim().toUpperCase())
        )
      ).sort().join(','),
    [tickers.join(',')] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!key) {
      setLoading(false)
      return
    }

    const all = key.split(',')
    let cancelled = false

    async function load() {
      const chunks: string[][] = []
      for (let i = 0; i < all.length; i += CHUNK_SIZE) {
        chunks.push(all.slice(i, i + CHUNK_SIZE))
      }

      try {
        const results = await Promise.all(
          chunks.map(async (chunk) => {
            const resp = await fetch(
              `/api/live-prices?tickers=${encodeURIComponent(chunk.join(','))}`,
              { cache: 'no-store' }
            )
            if (!resp.ok) return null
            return resp.json()
          })
        )
        if (cancelled || !mounted.current) return

        const merged: PriceMap = {}
        let latest: string | null = null
        for (const r of results) {
          if (!r?.prices) continue
          Object.assign(merged, r.prices)
          if (r.asOf && (!latest || r.asOf > latest)) latest = r.asOf
        }
        setPrices(merged)
        setAsOf(latest)
      } catch {
        /* keep the last known snapshot on a transient failure */
      } finally {
        if (!cancelled && mounted.current) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [key, intervalMs])

  return { prices, asOf, loading }
}
