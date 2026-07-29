export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import CompareClient from "./compare-client";

export default async function ComparePage() {
  // Fetch all public themes with minimal data for the selector
  const themes = await prisma.theme.findMany({
    where: { isPublic: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      theses: {
        where: { status: "completed" },
        select: {
          overallScore: true,
          basketMembers: { select: { ticker: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const themeOptions = themes.map((t) => {
    const scores = t.theses.map((th) => th.overallScore).filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const basketCount = new Set(t.theses.flatMap((th) => th.basketMembers.map((b) => b.ticker))).size;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      avgScore,
      basketCount,
      thesisCount: t.theses.length,
    };
  });

  return <CompareClient themes={JSON.parse(JSON.stringify(themeOptions))} />;
}
