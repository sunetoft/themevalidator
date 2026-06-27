#!/usr/bin/env python3
"""
Fetch comprehensive financial data for tickers using yfinance.
Called by lib/financial-data.ts via child_process.

Input (stdin JSON):
{
  "tickers": ["NVDA", "AMD", "TSM", ...],
  "etfs": ["SMH", "SOXX"],          // optional — ETFs to enrich
  "python": "/path/to/python3"      // not used, script is already running
}

Output (stdout JSON):
{
  "stocks": {
    "NVDA": {
      "metrics": { marketCap, trailingPE, forwardPE, pegRatio, ... },
      "earnings": [ { period, actual, estimate, surprise }, ... ],
      "technical": { currentPrice, ma50, ma200, rsi14, trend, ... },
      "analyst": { targetMeanPrice, recommendationKey, numberOfAnalysts }
    },
    ...
  },
  "etfs": {
    "SMH": { name, totalAssets, ytdReturn, category, fundFamily, ... },
    ...
  },
  "errors": { "TICKER": "error message" }
}
"""

import sys
import json
import traceback

def safe_float(v, decimals=2):
    try:
        if v is None:
            return None
        f = float(v)
        # Reject NaN and Infinity — they produce invalid JSON
        if f != f or f in (float('inf'), float('-inf')):
            return None
        return round(f, decimals)
    except (TypeError, ValueError):
        return None

def safe_str(v):
    if v is None:
        return None
    return str(v)

def fetch_stock_data(ticker, yf):
    """Fetch metrics, earnings, technicals for a single stock."""
    t = yf.Ticker(ticker)
    info = t.info or {}

    # ── Financial Metrics ──
    metric_keys = [
        'marketCap', 'trailingPE', 'forwardPE', 'pegRatio',
        'priceToSalesTrailing12Months', 'priceToBook',
        'profitMargins', 'operatingMargins', 'revenueGrowth', 'earningsGrowth',
        'returnOnEquity', 'returnOnAssets', 'debtToEquity',
        'currentRatio', 'quickRatio', 'totalRevenue', 'totalCash', 'totalDebt',
        'beta', 'sharesOutstanding', 'dividendYield',
        'enterpriseToRevenue', 'enterpriseToEbitda',
        'pegRatio',
    ]
    metrics = {}
    for k in metric_keys:
        v = info.get(k)
        if v is not None:
            # Convert numpy types and large numbers
            if k in ('marketCap', 'totalRevenue', 'totalCash', 'totalDebt', 'enterpriseValue'):
                metrics[k] = safe_float(v, 0)
            elif k in ('revenueGrowth', 'earningsGrowth', 'profitMargins', 'operatingMargins',
                       'returnOnEquity', 'returnOnAssets', 'dividendYield'):
                metrics[k] = safe_float(v, 4)
            else:
                metrics[k] = safe_float(v, 2)

    # Format market cap for display
    mc = metrics.get('marketCap')
    if mc:
        if mc >= 1e12:
            metrics['marketCapDisplay'] = f"${mc/1e12:.2f}T"
        elif mc >= 1e9:
            metrics['marketCapDisplay'] = f"${mc/1e9:.1f}B"
        elif mc >= 1e6:
            metrics['marketCapDisplay'] = f"${mc/1e6:.0f}M"

    # 52-week range
    metrics['fiftyTwoWeekHigh'] = safe_float(info.get('fiftyTwoWeekHigh'), 2)
    metrics['fiftyTwoWeekLow'] = safe_float(info.get('fiftyTwoWeekLow'), 2)
    metrics['currentPrice'] = safe_float(info.get('currentPrice') or info.get('regularMarketPrice'), 2)

    # ── Earnings History ──
    earnings_list = []
    try:
        if hasattr(t, 'earnings_history') and t.earnings_history is not None:
            eh = t.earnings_history.tail(4)
            for _, row in eh.iterrows():
                earnings_list.append({
                    'period': str(row.get('quarter', row.get('period', ''))),
                    'actual': safe_float(row.get('epsActual')),
                    'estimate': safe_float(row.get('epsEstimate')),
                    'surprise': safe_float(row.get('epsDifference')),
                    'surprisePercent': safe_float(row.get('surprisePercent'), 2),
                })
    except Exception:
        pass

    # Next earnings date
    next_earnings = None
    try:
        ts = info.get('earningsTimestampStart') or info.get('earningsTimestamp')
        if ts:
            import datetime
            next_earnings = datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d')
    except Exception:
        pass

    # ── Technical Indicators ──
    technical = {}
    try:
        hist = t.history(period='1y')
        if len(hist) >= 50:
            current = float(hist['Close'].iloc[-1])
            ma50 = float(hist['Close'].tail(50).mean())
            ma200 = float(hist['Close'].tail(200).mean()) if len(hist) >= 200 else None

            # RSI (14-day Wilder's)
            delta = hist['Close'].diff()
            gain = delta.clip(lower=0)
            loss = -delta.clip(upper=0)
            avg_gain = float(gain.tail(14).mean())
            avg_loss = float(loss.tail(14).mean())
            if avg_loss > 0:
                rs = avg_gain / avg_loss
                rsi = round(100 - (100 / (1 + rs)), 1)
            else:
                rsi = 100.0

            # Trend determination
            if ma200 and current > ma50 > ma200:
                trend = 'strong_bullish'
            elif ma200 and current > ma50:
                trend = 'bullish'
            elif ma200 and current < ma50 < ma200:
                trend = 'strong_bearish'
            elif ma200 and current < ma50:
                trend = 'bearish'
            else:
                trend = 'neutral'

            high52 = float(hist['Close'].max())
            low52 = float(hist['Close'].min())

            technical = {
                'currentPrice': round(current, 2),
                'ma50': round(ma50, 2),
                'ma200': round(ma200, 2) if ma200 else None,
                'rsi14': rsi,
                'trend': trend,
                'aboveMA50': bool(current > ma50),
                'aboveMA200': bool(current > ma200) if ma200 else None,
                'pctFrom52wHigh': round((current / high52 - 1) * 100, 1),
                'pctFrom52wLow': round((current / low52 - 1) * 100, 1),
                'ytdReturn': round((current / float(hist['Close'].iloc[0]) - 1) * 100, 1),
                'threeMonthReturn': round((current / float(hist['Close'].iloc[-63]) - 1) * 100, 1) if len(hist) >= 63 else None,
                'avgVolume': safe_float(info.get('averageVolume'), 0),
            }

            # Support/resistance (recent swing highs/lows)
            recent = hist['Close'].tail(20)
            technical['recentSupport'] = round(float(recent.min()), 2)
            technical['recentResistance'] = round(float(recent.max()), 2)
    except Exception:
        pass

    # ── Analyst Consensus ──
    analyst = {
        'targetMeanPrice': safe_float(info.get('targetMeanPrice'), 2),
        'targetHighPrice': safe_float(info.get('targetHighPrice'), 2),
        'targetLowPrice': safe_float(info.get('targetLowPrice'), 2),
        'recommendationKey': safe_str(info.get('recommendationKey')),
        'numberOfAnalysts': info.get('numberOfAnalystOpinions'),
    }

    # Upside to target
    if analyst['targetMeanPrice'] and metrics.get('currentPrice'):
        analyst['upsideToTarget'] = round(
            (analyst['targetMeanPrice'] / metrics['currentPrice'] - 1) * 100, 1
        )

    return {
        'metrics': metrics,
        'earnings': earnings_list,
        'nextEarningsDate': next_earnings,
        'technical': technical,
        'analyst': analyst,
    }


def fetch_etf_data(ticker, yf):
    """Fetch ETF-specific data."""
    t = yf.Ticker(ticker)
    info = t.info or {}

    data = {
        'symbol': ticker,
        'name': info.get('shortName') or info.get('longName', ''),
        'category': info.get('category'),
        'fundFamily': info.get('fundFamily'),
        'totalAssets': safe_float(info.get('totalAssets'), 0),
        'ytdReturn': safe_float(info.get('ytdReturn'), 2),
        'beta3Year': safe_float(info.get('beta3Year'), 2),
        'annualReportExpenseRatio': safe_float(info.get('annualReportExpenseRatio'), 4),
        'navPrice': safe_float(info.get('navPrice'), 2),
        'currentPrice': safe_float(info.get('currentPrice') or info.get('regularMarketPrice'), 2),
    }

    # Format AUM
    if data['totalAssets']:
        aum = data['totalAssets']
        if aum >= 1e12:
            data['aumDisplay'] = f"${aum/1e12:.1f}T"
        elif aum >= 1e9:
            data['aumDisplay'] = f"${aum/1e9:.1f}B"
        elif aum >= 1e6:
            data['aumDisplay'] = f"${aum/1e6:.0f}M"

    # Top holdings (if available)
    try:
        if hasattr(t, 'get_holdings'):
            holdings = t.get_holdings()
            if holdings is not None and len(holdings) > 0:
                # Get top 10 holdings
                top = holdings.head(10)
                data['topHoldings'] = [
                    {
                        'symbol': str(row.get('symbol', row.name)) if hasattr(row, 'name') else str(idx),
                        'weight': safe_float(row.get('holdingPercent') or row.get('weight'), 4),
                    }
                    for idx, row in top.iterrows()
                ]
    except Exception:
        pass

    # YTD chart data for sparkline
    try:
        hist = t.history(period='6mo')
        if len(hist) > 0:
            current = float(hist['Close'].iloc[-1])
            data['sixMonthReturn'] = round((current / float(hist['Close'].iloc[0]) - 1) * 100, 1)
            data['currentPrice'] = round(current, 2)
    except Exception:
        pass

    return data


def main():
    input_data = json.loads(sys.stdin.read())
    tickers = input_data.get('tickers', [])
    etfs = input_data.get('etfs', [])

    import yfinance as yf

    result = {
        'stocks': {},
        'etfs': {},
        'errors': {},
    }

    # Fetch stock data
    for ticker in tickers:
        try:
            result['stocks'][ticker] = fetch_stock_data(ticker, yf)
        except Exception as e:
            result['errors'][ticker] = str(e)[:200]

    # Fetch ETF data
    for etf in etfs:
        try:
            result['etfs'][etf] = fetch_etf_data(etf, yf)
        except Exception as e:
            result['errors'][etf] = str(e)[:200]

    # Sanitize NaN/Infinity from entire result tree (yfinance can produce these)
    def sanitize_nan(obj):
        if isinstance(obj, float):
            if obj != obj or obj in (float('inf'), float('-inf')):
                return None
            return obj
        elif isinstance(obj, dict):
            return {k: sanitize_nan(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_nan(v) for v in obj]
        return obj

    result = sanitize_nan(result)
    print(json.dumps(result, default=str, allow_nan=False))


if __name__ == '__main__':
    main()
