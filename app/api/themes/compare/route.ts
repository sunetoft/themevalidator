export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/themes/compare?ids=id1,id2,id3
// Returns side-by-side comparison data for up to 3 themes
export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "Missing 'ids' parameter" }, { status: 400 });
  }

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (ids.length < 2) {
    return NextResponse.json({ error: "Select at least 2 themes to compare" }, { status: 400 });
  }

  const themes = await prisma.theme.findMany({
    where: { id: { in: ids }, isPublic: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      publishedAt: true,
      theses: {
        where: { status: "completed" },
        select: {
          id: true,
          title: true,
          overallScore: true,
          sentimentScore: true,
          ecosystemScore: true,
          riskScore: true,
          opportunityScore: true,
          moatScore: true,
          sentimentData: true,
          valuationData: true,
          basketMembers: {
            select: {
              ticker: true,
              companyName: true,
              role: true,
              competency: true,
              moatRating: true,
              valuationStatus: true,
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
                select: { ticker: true, quantity: true, marketValue: true, unrealizedPnl: true },
              },
            },
          },
        },
        orderBy: { overallScore: "desc" },
      },
    },
  });

  // Map results preserving the order requested by the user
  const ordered = ids
    .map((id) => themes.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  if (ordered.length < 2) {
    return NextResponse.json({ error: "Not enough valid public themes found" }, { status: 404 });
  }

  // Build comparison-friendly data per theme
  const scoreFields = [
    "overallScore",
    "sentimentScore",
    "ecosystemScore",
    "riskScore",
    "opportunityScore",
    "moatScore",
  ] as const;

  const comparisonData = ordered.map((theme) => {
    const theses = theme.theses;
    const allMembers = theses.flatMap((t) => t.basketMembers);

    // Deduplicate basket members by ticker
    const seenTickers = new Set<string>();
    const uniqueBasket = allMembers.filter((m) => {
      const key = (m.ticker ?? m.companyName).toLowerCase();
      if (seenTickers.has(key)) return false;
      seenTickers.add(key);
      return true;
    });

    // Aggregate scores across theses
    const themeScores: Record<string, number | null> = {};
    for (const field of scoreFields) {
      const values = theses.map((t) => t[field]).filter((v): v is number => v !== null);
      themeScores[field] =
        values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    }

    // Paper trade aggregates
    const allTrades = theses.flatMap((t) => t.paperTrades);
    const tradeAggregate =
      allTrades.length > 0
        ? {
            count: allTrades.length,
            avgPnlPercent:
              Math.round(
                (allTrades.reduce((s, t) => s + (t.pnlPercent ?? 0), 0) / allTrades.length) * 100,
              ) / 100,
            totalValue: Math.round(allTrades.reduce((s, t) => s + (t.totalValue ?? 0), 0)),
            bestTrade: Math.max(...allTrades.map((t) => t.pnlPercent ?? 0)),
            worstTrade: Math.min(...allTrades.map((t) => t.pnlPercent ?? 0)),
          }
        : null;

    // Sentiment data (merge tweet counts across theses)
    let sentimentSummary: { score: number | null; tweetCount: number; topTweets: any[] } = {
      score: themeScores.sentimentScore,
      tweetCount: 0,
      topTweets: [],
    };
    for (const t of theses) {
      const sd = t.sentimentData as any;
      if (sd?.tweets) {
        sentimentSummary.tweetCount += sd.tweets.length;
      }
    }

    return {
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      description: theme.description,
      thesisCount: theses.length,
      themeScores,
      basketSize: uniqueBasket.length,
      basketMembers: uniqueBasket.slice(0, 15), // cap for display
      topThesis: theses[0]
        ? {
            title: theses[0].title,
            overallScore: theses[0].overallScore,
          }
        : null,
      paperTradeStats: tradeAggregate,
      sentiment: sentimentSummary,
      publishedAt: theme.publishedAt,
    };
  });

  return NextResponse.json({ themes: comparisonData });
}
