export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ThemeDetailClient from "./theme-detail-client";

export default async function ThemeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const theme = await prisma.theme.findFirst({
    where: { id: params.id, isPublic: true },
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
          sentimentScore: true,
          ecosystemScore: true,
          riskScore: true,
          opportunityScore: true,
          moatScore: true,
          status: true,
          createdAt: true,
        },
        orderBy: { overallScore: "desc" },
      },
    },
  });

  if (!theme) {
    notFound();
  }

  // Aggregate theme-level scores
  const scores = theme.theses
    .map((t) => t.overallScore)
    .filter((s): s is number => s !== null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  const themeData = {
    ...JSON.parse(JSON.stringify(theme)),
    avgScore,
  };

  return <ThemeDetailClient themeId={theme.id} theme={themeData} />;
}
