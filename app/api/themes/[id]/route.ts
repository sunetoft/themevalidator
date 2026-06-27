export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/themes/[id] — public theme detail (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const thesis = await prisma.thesis.findFirst({
    where: { id: params.id, isPublic: true },
    select: {
      id: true,
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
      themeEtfs: true,
      publishedAt: true,
      themeMembers: {
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
  });

  if (!thesis) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  // Compute aggregate stats
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
          // Aggregate ticker performance
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

  return NextResponse.json({
    ...thesis,
    paperTrades: undefined, // Don't leak individual trades
    aggregate,
  });
}
