/**
 * Enrichment layer — bridges Agent Reach capabilities into the web app.
 *
 * 1. fetchUrlViaJina: clean markdown extraction from any URL (replaces regex HTML stripping)
 * 2. fetchMarketSignals: RSS headlines relevant to thesis keywords (Seeking Alpha)
 */

/**
 * Fetch a URL via Jina Reader API → clean, readable markdown.
 * Falls back to empty string on failure (caller handles gracefully).
 *
 * https://r.jina.ai/URL returns the page content as markdown,
 * stripping navigation, scripts, ads, and boilerplate automatically.
 */
export async function fetchUrlViaJina(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "text/markdown",
        "User-Agent": "ThemeInvestorBot/1.0",
      },
    });

    if (!res.ok) {
      console.error(`[Jina Reader] HTTP ${res.status} for ${url}`);
      return "";
    }

    const text = await res.text();

    // Jina returns: Title: ...\n\nURL Source: ...\n\nMarkdown Content:\n<content>
    // Strip the header boilerplate, keep just the content
    const contentStart = text.indexOf("Markdown Content:");
    const clean =
      contentStart >= 0 ? text.slice(contentStart + 18).trim() : text.trim();

    // Cap to avoid token explosion (GLM-5.1 context)
    return clean.substring(0, 12000);
  } catch (err: any) {
    console.error(`[Jina Reader] Error fetching ${url}:`, err?.message);
    return "";
  }
}

/**
 * Fetch recent market headlines from RSS feeds and filter by thesis keywords.
 * Returns relevant headlines that the LLM can use as real-world context.
 */
export async function fetchMarketSignals(
  keywords: string[],
  tickers: string[]
): Promise<{ headlines: string[]; source: string }> {
  const feeds = [
    "https://seekingalpha.com/market_currents.xml",
  ];

  // Build keyword lowercased set for matching
  const matchWords = [
    ...keywords.map((k) => k.toLowerCase()),
    ...tickers.map((t) => t.toLowerCase()),
  ].filter((w) => w.length > 2);

  if (matchWords.length === 0) {
    return { headlines: [], source: "rss" };
  }

  const headlines: string[] = [];

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "ThemeInvestorBot/1.0" },
      });

      if (!res.ok) continue;

      const xml = await res.text();

      // Lightweight RSS parsing — extract <title> and <description> entries
      const items = xml.matchAll(
        /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/g
      );

      for (const item of items) {
        const title = item[1]?.trim();
        if (!title) continue;

        const titleLower = title.toLowerCase();
        if (matchWords.some((kw) => titleLower.includes(kw))) {
          headlines.push(title);
        }
      }
    } catch (err: any) {
      console.error(`[RSS] Error fetching ${feedUrl}:`, err?.message);
    }
  }

  // Deduplicate and cap
  return {
    headlines: [...new Set(headlines)].slice(0, 15),
    source: "rss",
  };
}

/**
 * Extract searchable keywords and tickers from thesis text.
 * Used to build RSS queries, X search queries, and financial data fetches.
 *
 * Ticker detection strategies (in priority order):
 * 1. Explicit patterns: (VRT), $VRT, **Name (TICK)**, TICK.DE / TICK.PA (international)
 * 2. Context-based: "Ticker: VRT" or "symbol VRT"
 * 3. Fallback: bare uppercase words filtered against a large stopword list
 */
export function extractSearchTerms(
  text: string
): { tickers: string[]; keywords: string[] } {
  const tickersSet = new Set<string>();

  // Strategy 1: Parenthesized tickers after company names: "Vertiv (VRT)", "(IFX.DE)"
  // Also matches $TICK prefix and **Name (TICK)** patterns
  const parenMatches = text.matchAll(/(?:\*\*)?[A-Z][A-Za-z]+[A-Za-z\s&.,']*(?:\*\*)?\s*\((\$?[A-Z]{1,5}(?:\.[A-Z]{1,3})?)\)/g);
  for (const m of parenMatches) {
    const ticker = m[1].replace(/^\$/, '').toUpperCase();
    if (ticker.length >= 1 && ticker.length <= 8) tickersSet.add(ticker);
  }

  // Strategy 2: Dollar-prefixed tickers: $VRT, $NVTS
  const dollarMatches = text.matchAll(/\$([A-Z]{1,5}(?:\.[A-Z]{1,3})?)/g);
  for (const m of dollarMatches) {
    tickersSet.add(m[1].toUpperCase());
  }

  // Strategy 3: International format standalone: IFX.DE, SU.PA, IFNNY
  const intlMatches = text.matchAll(/\b([A-Z]{2,5}\.[A-Z]{1,3})\b/g);
  for (const m of intlMatches) {
    tickersSet.add(m[1].toUpperCase());
  }

  // Strategy 4: "Ticker: VRT" or "Symbol: VRT" patterns
  const labelMatches = text.matchAll(/(?:ticker|symbol|stock)[s]?\s*[:=]\s*\$?([A-Z]{1,5}(?:\.[A-Z]{1,3})?)/gi);
  for (const m of labelMatches) {
    tickersSet.add(m[1].toUpperCase());
  }

  // Strategy 5: Fallback — bare uppercase words, but only if we didn't get enough from above
  // AND filtered against a comprehensive stopword list
  if (tickersSet.size < 3) {
    const stopWords = new Set([
      // English common words
      "THE", "AND", "FOR", "WITH", "THIS", "THAT", "FROM", "HAVE", "BEEN",
      "WILL", "THEY", "WERE", "WHAT", "WHICH", "NOT", "BUT", "ALL", "CAN",
      "HAS", "HAD", "HER", "HIS", "OUR", "OUT", "DAY", "GET", "GOT", "ARE",
      "BIT", "PUT", "CALL", "ETF", "USD", "USA", "CEO", "CFO", "IPO",
      "PER", "ROI", "ROE", "EPS", "GDP", "CAGR", "EBITDA", "PE", "PB",
      // Tech/domain abbreviations that look like tickers but aren't
      "DC", "AC", "AI", "ML", "GPU", "CPU", "MW", "KW", "HVDC", "LVDC",
      "LLC", "INC", "CORP", "LTD", "CO", "PCB", "IC", "IP", "IT", "SAAS",
      "PAAS", "IAAS", "API", "SDK", "RAM", "SSD", "HDD", "PCI", "USB",
      "LED", "OLED", "LCD", "RF", "EM", "EMI", "UPS", "PDU", "SST",
      "BOM", "MOQ", "CAD", "CAM", "FAE", "NRE", "TAM", "SAM", "SOM",
      "FPGA", "ASIC", "SOC", "DRAM", "NAND", "BPS", "QPS", "RPM",
      "SEC", "MIN", "MAX", "AVG", "STD", "VAR", "PDF", "CSV", "XML",
      "SQL", "CSS", "HTML", "HTTP", "HTTPS", "SSH", "SSL", "TLS",
      "DNS", "CDN", "WAF", "DDOS", "MIT", "BERK", "CALTECH",
      "GAAP", "NON", "YTD", "QTD", "MTD", "FYI", "TBD", "TBA",
      "PPE", "CPE", "OPEX", "CAPEX", "COGS", "AR", "AP", "DPO",
      "DSO", "DIO", "CCC", "WACC", "NPV", "IRR", "DCF", "LBO",
      "MBO", "SBC", "FDX", "EXP", "IMP", "FOB", "CIF",
    ]);
    const bareMatches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
    for (const t of bareMatches) {
      if (!stopWords.has(t)) tickersSet.add(t);
    }
  }

  const tickers = [...tickersSet].slice(0, 12);

  // Keywords: capitalized phrases (company names, tech terms)
  const phraseMatches =
    text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) ?? [];
  const keywords = [
    ...new Set(
      phraseMatches
        .filter(
          (p) =>
            p.length > 4 &&
            !p.match(/^(The|This|That|These|Those|When|While|What|Which)\s/i)
        )
        .slice(0, 5)
    ),
  ];

  return { tickers, keywords };
}
