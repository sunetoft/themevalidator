/**
 * In-memory stock data cache.
 *
 * Data persists for the lifetime of the Next.js server process (survives
 * across all requests). Only cleared when:
 *   1. A client requests with ?refresh=true
 *   2. The server process restarts
 *
 * This avoids hammering Yahoo Finance on every chart open.
 */

interface CachedEntry {
  data: any
  cachedAt: number
}

const cache = new Map<string, CachedEntry>()

/** Track the last time the cron job ran a full refresh */
let lastCronRefreshAt: number | null = null

/**
 * Get cached stock data for a ticker, or null if not cached.
 */
export function getCachedStockData(ticker: string): CachedEntry | null {
  const key = ticker.toUpperCase()
  return cache.get(key) ?? null
}

/**
 * Store stock data in the cache.
 */
export function setCachedStockData(ticker: string, data: any): void {
  const key = ticker.toUpperCase()
  cache.set(key, { data, cachedAt: Date.now() })
}

/**
 * Remove a ticker's cached data (forces re-fetch on next request).
 */
export function invalidateStockData(ticker: string): void {
  const key = ticker.toUpperCase()
  cache.delete(key)
}

/**
 * Clear the entire stock cache.
 */
export function clearStockCache(): void {
  cache.clear()
}

/**
 * Get all cached ticker symbols (uppercase).
 */
export function getCachedTickers(): string[] {
  return Array.from(cache.keys())
}

/**
 * Record + query when the cron last ran.
 */
export function setLastCronRefresh(): void {
  lastCronRefreshAt = Date.now()
}

export function getLastCronRefresh(): number | null {
  return lastCronRefreshAt
}
