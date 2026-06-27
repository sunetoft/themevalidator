/**
 * Financial Data Enrichment Layer
 *
 * Fetches REAL financial data for tickers using yfinance (via Python script).
 * Used by the analysis pipeline to ground LLM analysis in actual numbers,
 * and by the thesis monitor cron to detect changes.
 *
 * Data fetched per stock:
 *   - Metrics: marketCap, P/E, PEG, P/S, profit margins, revenue/earnings growth, debt/equity, beta
 *   - Earnings: last 4 quarters (actual vs estimate, surprise %), next earnings date
 *   - Technical: RSI(14), MA50, MA200, trend classification, 52w position, YTD/3M returns
 *   - Analyst: mean target price, recommendation, # analysts, upside %
 */

import { execFile } from 'child_process'
import path from 'path'

const PYTHON = '/Users/Shared/Hermes/venv/bin/python3'
const SCRIPT = path.join(process.cwd(), 'scripts', 'fetch-financials.py')
const FETCH_TIMEOUT_MS = 45_000 // 45s max for all tickers

// ── Types ──

export interface StockMetrics {
  marketCap?: number
  marketCapDisplay?: string
  trailingPE?: number
  forwardPE?: number
  pegRatio?: number
  priceToSalesTrailing12Months?: number
  priceToBook?: number
  profitMargins?: number
  operatingMargins?: number
  revenueGrowth?: number
  earningsGrowth?: number
  returnOnEquity?: number
  returnOnAssets?: number
  debtToEquity?: number
  currentRatio?: number
  quickRatio?: number
  beta?: number
  dividendYield?: number
  enterpriseToRevenue?: number
  enterpriseToEbitda?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  currentPrice?: number
  sharesOutstanding?: number
}

export interface EarningsRecord {
  period?: string
  actual?: number
  estimate?: number
  surprise?: number
  surprisePercent?: number
}

export interface TechnicalData {
  currentPrice?: number
  ma50?: number
  ma200?: number
  rsi14?: number
  trend?: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish'
  aboveMA50?: boolean
  aboveMA200?: boolean
  pctFrom52wHigh?: number
  pctFrom52wLow?: number
  ytdReturn?: number
  threeMonthReturn?: number
  avgVolume?: number
  recentSupport?: number
  recentResistance?: number
}

export interface AnalystData {
  targetMeanPrice?: number
  targetHighPrice?: number
  targetLowPrice?: number
  recommendationKey?: string
  numberOfAnalysts?: number
  upsideToTarget?: number
}

export interface StockFinancialData {
  metrics: StockMetrics
  earnings: EarningsRecord[]
  nextEarningsDate?: string
  technical: TechnicalData
  analyst: AnalystData
}

export interface ETFData {
  symbol: string
  name?: string
  category?: string
  fundFamily?: string
  totalAssets?: number
  aumDisplay?: string
  ytdReturn?: number
  sixMonthReturn?: number
  beta3Year?: number
  annualReportExpenseRatio?: number
  navPrice?: number
  currentPrice?: number
  topHoldings?: Array<{ symbol: string; weight?: number }>
}

export interface FinancialDataResult {
  stocks: Record<string, StockFinancialData>
  etfs: Record<string, ETFData>
  errors: Record<string, string>
}

// ── Core fetch function ──

/**
 * Fetch financial data for multiple tickers via the Python yfinance script.
 * Batches all tickers into a single Python invocation for efficiency.
 */
export async function fetchFinancialData(
  stockTickers: string[],
  etfTickers: string[] = [],
): Promise<FinancialDataResult> {
  if (stockTickers.length === 0 && etfTickers.length === 0) {
    return { stocks: {}, etfs: {}, errors: {} }
  }

  const input = JSON.stringify({
    tickers: stockTickers,
    etfs: etfTickers,
  })

  return new Promise((resolve) => {
    const child = execFile(
      PYTHON,
      [SCRIPT],
      {
        timeout: FETCH_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[financial-data] Python script error:', error.message)
          // Return partial/empty result — don't break the analysis pipeline
          resolve({ stocks: {}, etfs: {}, errors: { _script: error.message } })
          return
        }

        try {
          const result = JSON.parse(stdout) as FinancialDataResult
          resolve(result)
        } catch (parseErr: any) {
          console.error('[financial-data] JSON parse error:', parseErr?.message)
          resolve({ stocks: {}, etfs: {}, errors: { _parse: parseErr?.message } })
        }
      },
    )

    // Write input to stdin
    child.stdin?.write(input)
    child.stdin?.end()
  })
}

/**
 * Fetch data for a single ticker (convenience wrapper).
 */
export async function fetchSingleTicker(ticker: string): Promise<StockFinancialData | null> {
  const result = await fetchFinancialData([ticker])
  return result.stocks[ticker] ?? null
}

/**
 * Compact summary of financial data for LLM context.
 * Formats the data into a readable string for the prompt.
 */
export function formatFinancialDataForLLM(data: FinancialDataResult): string {
  const lines: string[] = []

  if (Object.keys(data.stocks).length > 0) {
    lines.push('=== REAL-TIME FINANCIAL DATA (via Yahoo Finance) ===')
    lines.push('Use these REAL numbers in your analysis. Do not invent or estimate metrics.\n')

    for (const [ticker, stock] of Object.entries(data.stocks)) {
      const m = stock.metrics
      const t = stock.technical
      const a = stock.analyst
      const e = stock.earnings

      lines.push(`--- ${ticker} ---`)

      // Metrics
      if (m.marketCapDisplay) lines.push(`  Market Cap: ${m.marketCapDisplay}`)
      if (m.trailingPE) lines.push(`  P/E (trailing): ${m.trailingPE}`)
      if (m.forwardPE) lines.push(`  P/E (forward): ${m.forwardPE}`)
      if (m.pegRatio) lines.push(`  PEG Ratio: ${m.pegRatio}`)
      if (m.priceToSalesTrailing12Months) lines.push(`  P/S: ${m.priceToSalesTrailing12Months}`)
      if (m.profitMargins !== undefined) lines.push(`  Profit Margin: ${(m.profitMargins * 100).toFixed(1)}%`)
      if (m.operatingMargins !== undefined) lines.push(`  Operating Margin: ${(m.operatingMargins * 100).toFixed(1)}%`)
      if (m.revenueGrowth !== undefined) lines.push(`  Revenue Growth (YoY): ${(m.revenueGrowth * 100).toFixed(1)}%`)
      if (m.earningsGrowth !== undefined) lines.push(`  Earnings Growth (YoY): ${(m.earningsGrowth * 100).toFixed(1)}%`)
      if (m.returnOnEquity !== undefined) lines.push(`  ROE: ${(m.returnOnEquity * 100).toFixed(1)}%`)
      if (m.debtToEquity) lines.push(`  Debt/Equity: ${m.debtToEquity}`)
      if (m.currentRatio) lines.push(`  Current Ratio: ${m.currentRatio}`)
      if (m.beta) lines.push(`  Beta: ${m.beta}`)

      // Earnings
      if (stock.nextEarningsDate) lines.push(`  Next Earnings: ${stock.nextEarningsDate}`)
      if (e.length > 0) {
        const beats = e.filter(q => (q.surprisePercent ?? 0) > 0).length
        const avgSurprise = (e.reduce((s, q) => s + (q.surprisePercent ?? 0), 0) / e.length).toFixed(1)
        lines.push(`  Earnings: ${beats}/${e.length} beats, avg surprise ${avgSurprise}%`)
        const recent = e[0]
        if (recent?.actual && recent?.estimate && recent.surprisePercent !== undefined) {
          lines.push(`    Last Q: EPS ${recent.actual} vs est ${recent.estimate} (${recent.surprisePercent >= 0 ? '+' : ''}${recent.surprisePercent.toFixed(1)}%)`)
        }
      }

      // Technical
      if (t.currentPrice) {
        lines.push(`  Technical: Price $${t.currentPrice} | RSI ${t.rsi14} | ${t.trend}`)
        if (t.ma50) lines.push(`    MA50 $${t.ma50} | MA200 ${t.ma200 ? '$' + t.ma200 : 'N/A'}`)
        if (t.ytdReturn !== undefined) lines.push(`    YTD: ${t.ytdReturn > 0 ? '+' : ''}${t.ytdReturn}% | 3M: ${t.threeMonthReturn !== undefined ? (t.threeMonthReturn > 0 ? '+' : '') + t.threeMonthReturn + '%' : 'N/A'}`)
        lines.push(`    52W position: ${t.pctFrom52wHigh}% from high, ${t.pctFrom52wLow}% from low`)
      }

      // Analyst
      if (a.targetMeanPrice) {
        const upside = a.upsideToTarget ?? 0
        lines.push(`  Analyst: Target $${a.targetMeanPrice} (${upside > 0 ? '+' : ''}${upside}% upside) | ${a.recommendationKey} | ${a.numberOfAnalysts} analysts`)
      }

      lines.push('')
    }
  }

  if (Object.keys(data.etfs).length > 0) {
    lines.push('=== THEME ETFs (REAL DATA) ===')
    for (const [symbol, etf] of Object.entries(data.etfs)) {
      lines.push(`--- ${symbol}: ${etf.name || ''} ---`)
      if (etf.aumDisplay) lines.push(`  AUM: ${etf.aumDisplay}`)
      if (etf.ytdReturn !== undefined) lines.push(`  YTD Return: ${etf.ytdReturn > 0 ? '+' : ''}${etf.ytdReturn}%`)
      if (etf.category) lines.push(`  Category: ${etf.category}`)
      if (etf.fundFamily) lines.push(`  Provider: ${etf.fundFamily}`)
      if (etf.annualReportExpenseRatio !== undefined) lines.push(`  Expense Ratio: ${(etf.annualReportExpenseRatio * 100).toFixed(2)}%`)
      lines.push('')
    }
  }

  if (Object.keys(data.errors).length > 0) {
    lines.push(`Note: ${Object.keys(data.errors).length} ticker(s) failed to fetch: ${Object.keys(data.errors).join(', ')}`)
  }

  return lines.join('\n')
}
