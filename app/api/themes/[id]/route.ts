export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPositivlisteExposure, normalizeTicker } from "@/lib/etf-holdings";

// GET /api/themes/[id] — theme detail with all child theses.
// Public themes are open to everyone. Non-public themes (e.g. freshly created
// analyses that have not been admin-published yet) are visible to their owner
// and to admins only.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const isAdmin = (session?.user as any)?.role === "admin";

  const theme = await prisma.theme.findFirst({
    where: {
      id: params.id,
      OR: [
        { isPublic: true },
        userId ? { theses: { some: { userId } } } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      publishedAt: true,
      isPublic: true,
      theses: {
        select: {
          id: true,
          userId: true,
          title: true,
          description: true,
          overallScore: true,
          sentimentScore: true,
          ecosystemScore: true,
          riskScore: true,
          opportunityScore: true,
          moatScore: true,
          sentimentData: true,
          ecosystemData: true,
          externalFactors: true,
          bottlenecks: true,
          valuationData: true,
          financialData: true,
          technicalData: true,
          earningsData: true,
          productEvaluator: true,
          themeEtfs: true,
          graphSyncedAt: true,
          status: true,
          publishedAt: true,
          basketMembers: {
            select: {
              id: true,
              ticker: true,
              companyName: true,
              role: true,
              competency: true,
              moatRating: true,
              valuationStatus: true,
              marketCap: true,
              peRatio: true,
              instrumentType: true,
              sector: true,
              notes: true,
            },
          },
          thesisAlerts: {
            where: { resolved: false },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              severity: true,
              ticker: true,
              title: true,
              description: true,
              data: true,
              createdAt: true,
            },
          },
          paperTrades: {
            where: { status: "active" },
            select: {
              id: true,
              totalValue: true,
              pnl: true,
              pnlPercent: true,
              initialCapital: true,
              positions: {
                select: {
                  ticker: true,
                  quantity: true,
                  marketValue: true,
                  unrealizedPnl: true,
                },
              },
            },
          },
        },
        orderBy: { overallScore: "desc" },
      },
    },
  });

  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  // Non-admin owners of a non-public theme see only their own theses.
  const visibleTheses =
    theme.isPublic || isAdmin
      ? theme.theses
      : theme.theses.filter((t) => t.userId === userId);

  // Compute per-thesis aggregate stats
  const thesesWithAggregates = visibleTheses.map((thesis) => {
    const trades = thesis.paperTrades;
    const aggregate =
      trades.length > 0
        ? {
            totalTrades: trades.length,
            avgPnl:
              Math.round(
                (trades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / trades.length) * 100
              ) / 100,
            avgPnlPercent:
              Math.round(
                (trades.reduce((s: number, t: any) => s + (t.pnlPercent ?? 0), 0) /
                  trades.length) *
                  100
              ) / 100,
            bestTrade: Math.max(...trades.map((t: any) => t.pnlPercent ?? 0)),
            worstTrade: Math.min(...trades.map((t: any) => t.pnlPercent ?? 0)),
            tickerPerformance: (() => {
              const map = new Map<
                string,
                { totalValue: number; totalUnrealized: number; count: number }
              >();
              for (const trade of trades) {
                for (const pos of trade.positions) {
                  const existing = map.get(pos.ticker) || {
                    totalValue: 0,
                    totalUnrealized: 0,
                    count: 0,
                  };
                  existing.totalValue += pos.marketValue ?? 0;
                  existing.totalUnrealized += pos.unrealizedPnl ?? 0;
                  existing.count += 1;
                  map.set(pos.ticker, existing);
                }
              }
              return Array.from(map.entries())
                .map(([ticker, data]) => ({
                  ticker,
                  totalValue: Math.round(data.totalValue),
                  avgUnrealized: Math.round(data.totalUnrealized / data.count),
                  appearances: data.count,
                }))
                .sort((a, b) => b.totalValue - a.totalValue);
            })(),
          }
        : null;

    // Strip individual trade data, keep aggregate (and internal userId)
    const { paperTrades: _, userId: __, ...thesisData } = thesis;
    return { ...thesisData, aggregate };
  });

  // Merge ETFs across theses (deduplicate by symbol)
  const allEtfs: any[] = [];
  const etfSymbols = new Set<string>();
  for (const t of visibleTheses) {
    const etfs = (t.themeEtfs as any[]) ?? [];
    for (const etf of etfs) {
      if (etf?.symbol && !etfSymbols.has(etf.symbol)) {
        etfSymbols.add(etf.symbol);
        allEtfs.push(etf);
      }
    }
  }

  // Reverse-lookup the Danish positivliste (etf.stdigital.dk) for funds that
  // actually hold the stocks named in these theses. The ETF app owns the
  // holdings data; this is a cross-app call with a short in-process cache and
  // fails soft (null → the card simply doesn't render).
  const tickerSet = new Set<string>();
  const addTicker = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const t = normalizeTicker(raw);
    if (t) tickerSet.add(t);
  };
  for (const t of visibleTheses) {
    for (const m of ((t as any).basketMembers as any[]) ?? []) {
      if ((m?.instrumentType ?? "stock") === "stock") addTicker(m?.ticker);
    }
    for (const m of (((t as any).ecosystemData as any)?.members as any[]) ?? []) {
      if ((m?.instrumentType ?? "stock") === "stock") addTicker(m?.ticker);
    }
    for (const p of (((t as any).valuationData as any)?.topPicks as any[]) ?? []) {
      addTicker(p?.ticker);
    }
  }

  const positivlisteEtfs = await getPositivlisteExposure(Array.from(tickerSet), {
    limit: 12,
  });

  // Compute theme-level aggregated scores
  const scoreFields = [
    "overallScore",
    "sentimentScore",
    "ecosystemScore",
    "riskScore",
    "opportunityScore",
    "moatScore",
  ] as const;
  const themeScores: Record<string, number | null> = {};
  for (const field of scoreFields) {
    const values = visibleTheses
      .map((t) => t[field])
      .filter((v): v is number => v !== null);
    themeScores[field] =
      values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : null;
  }

  const { isPublic: _isPublic, theses: _theses, ...themeMeta } = theme;

  return NextResponse.json({
    ...themeMeta,
    theses: thesesWithAggregates,
    mergedEtfs: allEtfs,
    positivlisteEtfs,
    themeScores,
  });
}
