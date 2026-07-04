export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ThemesGalleryClient from "./themes-gallery-client";

export default async function ThemesPage() {
  // Fetch all public themes with their child theses for aggregation
  const themes = await prisma.theme.findMany({
    where: { isPublic: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      publishedAt: true,
      theses: {
        select: {
          id: true,
          title: true,
          description: true,
          overallScore: true,
          themeMembers: {
            select: { ticker: true, companyName: true },
          },
          _count: {
            select: {
              paperTrades: {
                where: { status: "active" },
              },
            },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  // Aggregate per theme
  const aggregated = themes.map((theme) => {
    const scores = theme.theses
      .map((t) => t.overallScore)
      .filter((s): s is number => s !== null);
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    const allMembers = theme.theses.flatMap((t) => t.themeMembers);
    const activeTrades = theme.theses.reduce(
      (sum, t) => sum + t._count.paperTrades,
      0
    );

    return {
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      description: theme.description,
      iconUrl: theme.iconUrl,
      publishedAt: theme.publishedAt,
      thesisCount: theme.theses.length,
      avgScore,
      basketMembers: allMembers,
      activeTrades,
    };
  });

  return <ThemesGalleryClient themes={JSON.parse(JSON.stringify(aggregated))} />;
}
