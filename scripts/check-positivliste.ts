import { readFileSync } from 'fs'
import { getPositivlisteExposure } from '@/lib/etf-holdings'

// load .env like next does
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const tickers = process.argv.slice(2)
  const data = await getPositivlisteExposure(tickers, { limit: 12 })
  if (!data) {
    console.log('RESULT: null (ETF app unreachable or key missing)')
    console.log('ETF_INTERNAL_URL =', process.env.ETF_INTERNAL_URL)
    console.log('CROSS_SITE_API_KEY set =', !!process.env.CROSS_SITE_API_KEY)
    process.exit(1)
  }
  console.log('tickers:', data.tickers.join(','))
  console.log('coverage:', data.coverage.map((c) => `${c.ticker}:${c.fundCount}`).join(' '))
  console.log('fundCount:', data.fundCount, '| returned:', data.funds.length)
  for (const f of data.funds.slice(0, 6)) {
    console.log(
      ` ${f.matchCount}/${data.tickers.length}  ${f.name.slice(0, 62).padEnd(62)} ${(f.totalWeight * 100).toFixed(2)}%  [${f.holdings.map((h) => h.ticker).join(',')}]`
    )
  }
}

main()
