export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ThemesGalleryClient from "./themes-gallery-client";

export default async function ThemesPage() {
  // Fetch all public themes (analyses published by admin)
  const themes = await prisma.thesis.findMany({
    where: { isPublic: true },
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
      publishedAt: true,
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
    orderBy: { publishedAt: "desc" },
  });

  return <ThemesGalleryClient themes={JSON.parse(JSON.stringify(themes))} />;
}
