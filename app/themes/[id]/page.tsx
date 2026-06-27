export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ThemeDetailClient from "./theme-detail-client";

export default async function ThemeDetailPage({
  params,
}: {
  params: { id: string };
}) {
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
      publishedAt: true,
    },
  });

  if (!thesis) {
    notFound();
  }

  return <ThemeDetailClient themeId={thesis.id} theme={JSON.parse(JSON.stringify(thesis))} />;
}
