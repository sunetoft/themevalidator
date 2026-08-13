export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ThemeDetailClient from "./theme-detail-client";

export default async function ThemeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const isAdmin = (session?.user as any)?.role === "admin";

  const theme = await prisma.theme.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      isPublic: true,
      publishedAt: true,
    },
  });

  if (!theme) {
    notFound();
  }

  // A non-public theme is only visible to admins or users who own a thesis in it.
  // (New analyses create non-public themes — the owner must still be able to view them.)
  let ownsTheme = false;
  if (!theme.isPublic && !isAdmin && userId) {
    ownsTheme =
      (await prisma.thesis.count({ where: { themeId: theme.id, userId } })) > 0;
  }

  if (!theme.isPublic && !isAdmin && !ownsTheme) {
    notFound();
  }

  // For a non-public theme, non-admin owners see only their own theses.
  // Public themes and admins see all theses in the theme.
  const theses = await prisma.thesis.findMany({
    where: {
      themeId: theme.id,
      ...(theme.isPublic || isAdmin ? {} : { userId: userId as string }),
    },
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
  });

  // Aggregate theme-level scores
  const scores = theses
    .map((t) => t.overallScore)
    .filter((s): s is number => s !== null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  const themeData = JSON.parse(
    JSON.stringify({
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      description: theme.description,
      publishedAt: theme.publishedAt,
      avgScore,
      theses,
    })
  );

  return <ThemeDetailClient themeId={theme.id} theme={themeData} />;
}
