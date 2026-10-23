#!/usr/bin/env python3
"""
Fetch forward guidance / projection data for tickers using yfinance.

This is the data backbone for the Thesis Timeline assessment: "when does this
theme start to ramp?" needs (a) projected sales and (b) margin improvement, not
trailing P/E.

Called by lib/timeline.ts via child_process.

Input (stdin JSON):
  {"tickers": ["VRT", "NVDA", "AMD"]}

Output (stdout JSON):
{
  "stocks": {
    "VRT": {
      "nextEarningsDate": "2026-10-28",
      "revenueEstimate": { "0q": {"revenue": 3762379600, "growth": 0.4061, "analysts": 24},
                           "+1q": {...}, "0y": {...}, "+1y": {...} },
      "epsEstimate":     { "0q": {"eps": 1.82, "growth": 0.4707, "analysts": 25}, ... },
      "quarters": [ {"period": "2026-Q2", "revenue": 3274300000,
                     "grossMargin": 0.3772, "operatingMargin": 0.1948,
                     "revenueYoY": 0.3241}, ... ],   // newest first, max 6
      "marginTrend": {"grossMarginNow": 0.3772, "grossMarginYearAgo": 0.3399,
                      "operatingMarginNow": 0.1948, "operatingMarginYearAgo": 0.1693,
                      "grossBpsYoY": 373, "operatingBpsYoY": 255,
                      "direction": "expanding" }
    }
  },
  "errors": {"TICKER": "reason"}
}

No NaN/Infinity ever reaches the JSON (Prisma Json columns reject them).
"""

import sys
import json
import math
import traceback

import yfinance as yf

MAX_QUARTERS = 6
EST_PERIODS = ["0q", "+1q", "0y", "+1y"]


def safe_num(v, decimals=4):
    """float or None — rejects NaN/Infinity, which break JSON/Prisma."""
    try:
        if v is None:
            return None
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, decimals)
    except (TypeError, ValueError):
        return None


def period_label(ts):
    """Timestamp('2026-06-30') -> '2026-Q2'."""
    try:
        q = (int(ts.month) - 1) // 3 + 1
        return f"{int(ts.year)}-Q{q}"
    except Exception:
        return str(ts)[:10]


def parse_estimates(df, value_col):
    """Turn yfinance revenue_estimate / earnings_estimate into a small dict."""
    out = {}
    if df is None or getattr(df, "empty", True):
        return out
    for period in EST_PERIODS:
        if period not in df.index:
            continue
        row = df.loc[period]
        out[period] = {
            value_col: safe_num(row.get("avg"), 0 if value_col == "revenue" else 4),
            "growth": safe_num(row.get("growth"), 4),
            "analysts": safe_num(row.get("numberOfAnalysts"), 0),
        }
    return out


def fetch_ticker(ticker):
    t = yf.Ticker(ticker)
    result = {}

    # ── Forward estimates (projected sales) ──
    try:
        result["revenueEstimate"] = parse_estimates(t.revenue_estimate, "revenue")
    except Exception:
        result["revenueEstimate"] = {}
    try:
        result["epsEstimate"] = parse_estimates(t.earnings_estimate, "eps")
    except Exception:
        result["epsEstimate"] = {}

    # ── Next earnings date (when guidance gets refreshed) ──
    # NOTE: do NOT use `t.calendar` here — in yfinance 0.2.x it retries a
    # quoteSummary endpoint forever when Yahoo throttles, which hangs the whole
    # batch. `info['earningsTimestampStart']` is what fetch-financials.py uses.
    try:
        import datetime
        info = t.info or {}
        ts = info.get("earningsTimestampStart") or info.get("earningsTimestamp")
        if ts:
            result["nextEarningsDate"] = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
    except Exception:
        pass

    # ── Quarterly margin trend (is the margin story actually improving?) ──
    quarters = []
    try:
        q = t.quarterly_income_stmt
        if q is not None and not q.empty:
            cols = list(q.columns)[:MAX_QUARTERS]

            def row(name):
                return q.loc[name] if name in q.index else None

            rev, gross, op = row("Total Revenue"), row("Gross Profit"), row("Operating Income")
            raw = []
            for c in cols:
                r = safe_num(rev.get(c), 0) if rev is not None else None
                g = safe_num(gross.get(c), 0) if gross is not None else None
                o = safe_num(op.get(c), 0) if op is not None else None
                raw.append({
                    "period": period_label(c),
                    "revenue": r,
                    "grossMargin": (round(g / r, 4) if g is not None and r else None),
                    "operatingMargin": (round(o / r, 4) if o is not None and r else None),
                })

            # YoY revenue growth needs the same quarter one year back.
            for i, item in enumerate(raw):
                prior = raw[i + 4] if i + 4 < len(raw) else None
                if prior and prior.get("revenue") and item.get("revenue"):
                    item["revenueYoY"] = round(item["revenue"] / prior["revenue"] - 1, 4)
            quarters = raw
    except Exception:
        quarters = []

    result["quarters"] = quarters

    # ── Margin trend summary (bps YoY on the latest reported quarter) ──
    if len(quarters) >= 5:
        now, year_ago = quarters[0], quarters[4]
        gm_now, gm_ago = now.get("grossMargin"), year_ago.get("grossMargin")
        om_now, om_ago = now.get("operatingMargin"), year_ago.get("operatingMargin")

        def bps(a, b):
            if a is None or b is None:
                return None
            return round((a - b) * 10000, 0)

        gross_bps, op_bps = bps(gm_now, gm_ago), bps(om_now, om_ago)
        direction = "unknown"
        if op_bps is not None:
            if op_bps >= 100:
                direction = "expanding"
            elif op_bps <= -100:
                direction = "contracting"
            else:
                direction = "flat"
        result["marginTrend"] = {
            "grossMarginNow": gm_now,
            "grossMarginYearAgo": gm_ago,
            "operatingMarginNow": om_now,
            "operatingMarginYearAgo": om_ago,
            "grossBpsYoY": gross_bps,
            "operatingBpsYoY": op_bps,
            "direction": direction,
        }
    else:
        result["marginTrend"] = {"direction": "unknown"}

    return result


def main():
    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}
    tickers = [str(t).strip().upper() for t in (payload.get("tickers") or []) if str(t).strip()]

    stocks, errors = {}, {}
    for ticker in tickers:
        try:
            stocks[ticker] = fetch_ticker(ticker)
        except Exception as exc:  # noqa: BLE001 — one bad ticker must not kill the batch
            errors[ticker] = f"{type(exc).__name__}: {exc}"

    print(json.dumps({"stocks": stocks, "errors": errors}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"stocks": {}, "errors": {"_script": traceback.format_exc()[-500:]}}))
