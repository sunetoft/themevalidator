export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ThesisRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  // Find the thesis to get its parent theme, then redirect to the merged theme page
  const thesis = await prisma.thesis.findUnique({
    where: { id: params.id },
    select: { themeId: true },
  });

  if (thesis?.themeId) {
    redirect(`/themes/${thesis.themeId}`);
  }

  // Fallback: no parent theme, go to themes gallery
  redirect("/themes");
}
