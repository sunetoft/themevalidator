/**
 * Incremental Re-Analysis
 *
 * When a new stock is added to a thesis theme, this updates the analysis
 * sections (ecosystem, bottlenecks, valuation, external factors) to
 * incorporate the new member — without re-running the full analysis
 * from scratch.
 */

import { prisma } from "@/lib/prisma";
import { chatComplete } from "@/lib/llm";

const REANALYZE_PROMPT = `You are updating an existing investment thesis analysis after a new stock was added to the theme.

You will receive:
1. The thesis title and description
2. The CURRENT analysis sections (JSON)
3. The list of ALL theme members (including the new one)
4. Details about the newly added stock

Update the following analysis sections to incorporate the new stock. Keep all existing entries, and ADD or MODIFY entries where the new stock is relevant:

- "ecosystem": Add the new stock as a member if not already present. Update the ecosystem score if the new stock meaningfully changes ecosystem completeness.
- "bottlenecks": Add the new ticker to affectedCompanies where relevant. Add new bottleneck items if the stock introduces new ones. Update score.
- "valuation": Add the new stock to topPicks if it's investment-worthy. Update score.
- "externalFactors": Add new factors if the stock introduces new risks or catalysts. Update score.
- "sentiment": Update summary if the new stock shifts overall sentiment. Update score.
- "overallScore": Recalculate as weighted average.

Respond in JSON with the SAME structure as the input analysis, but updated:
{
  "sentiment": { "overall": "...", "score": 0-100, "summary": "...", "keySignals": ["..."] },
  "ecosystem": { "score": 0-100, "summary": "...", "members": [{ "companyName": "...", "ticker": "...", "role": "...", "competency": "...", "moatRating": 1-10, "valuationStatus": "...", "marketCap": "...", "notes": "..." }] },
  "externalFactors": { "score": 0-100, "factors": [{ "name": "...", "impact": "...", "severity": "...", "description": "..." }] },
  "bottlenecks": { "score": 0-100, "items": [{ "name": "...", "pricingPowerBenefit": "...", "affectedCompanies": ["TICK"], "description": "..." }] },
  "valuation": { "score": 0-100, "topPicks": [{ "ticker": "...", "companyName": "...", "moatStrength": "...", "valuationGrade": "...", "catalysts": ["..."], "risks": ["..."] }] },
  "overallScore": 0-100
}

IMPORTANT: Preserve ALL existing items. Only add or modify entries that should include the new stock. Update scores to reflect the complete picture.
Respond with raw JSON only. No code blocks or markdown.`;

export async function reanalyzeThesis(
  thesisId: string,
  newMember: { ticker: string; companyName: string; role?: string | null; competency?: string | null; notes?: string | null }
): Promise<{ success: boolean; error?: string }> {
  // Fetch thesis with all current data
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: { themeMembers: true },
  });

  if (!thesis) {
    return { success: false, error: "Thesis not found" };
  }

  // Build current analysis snapshot
  const currentAnalysis = {
    sentiment: thesis.sentimentData ?? {},
    ecosystem: thesis.ecosystemData ?? {},
    externalFactors: thesis.externalFactors ?? {},
    bottlenecks: thesis.bottlenecks ?? {},
    valuation: thesis.valuationData ?? {},
  };

  // Build full member list for context
  const allMembers = thesis.themeMembers.map((m: any) => ({
    ticker: m.ticker,
    companyName: m.companyName,
    role: m.role,
    valuationStatus: m.valuationStatus,
    moatRating: m.moatRating,
  }));

  const messages = [
    { role: "system" as const, content: REANALYZE_PROMPT },
    {
      role: "user" as const,
      content: `Thesis: ${thesis.title}\nDescription: ${thesis.description}

CURRENT ANALYSIS:
${JSON.stringify(currentAnalysis, null, 2)}

ALL THEME MEMBERS (${allMembers.length}):
${JSON.stringify(allMembers, null, 2)}

NEWLY ADDED STOCK:
${JSON.stringify(newMember, null, 2)}

Please update the analysis sections to incorporate the new stock. Preserve all existing items.`,
    },
  ];

  try {
    const content = await chatComplete(messages, {
      jsonMode: true,
      maxTokens: 6000,
      temperature: 0.5,
    });

    let updated: any;
    try {
      updated = JSON.parse(content);
    } catch {
      console.error("[reanalyze] Failed to parse LLM response");
      return { success: false, error: "Failed to parse re-analysis" };
    }

    // Update thesis with refreshed analysis
    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        sentimentScore: updated?.sentiment?.score ?? thesis.sentimentScore,
        ecosystemScore: updated?.ecosystem?.score ?? thesis.ecosystemScore,
        riskScore: updated?.externalFactors?.score ?? thesis.riskScore,
        opportunityScore: updated?.bottlenecks?.score ?? thesis.opportunityScore,
        moatScore: updated?.valuation?.score ?? thesis.moatScore,
        overallScore: updated?.overallScore ?? thesis.overallScore,
        sentimentData: updated?.sentiment
          ? { ...updated.sentiment, tweets: (thesis.sentimentData as any)?.tweets ?? [] }
          : thesis.sentimentData,
        ecosystemData: updated?.ecosystem ?? thesis.ecosystemData,
        externalFactors: updated?.externalFactors ?? thesis.externalFactors,
        bottlenecks: updated?.bottlenecks ?? thesis.bottlenecks,
        valuationData: updated?.valuation ?? thesis.valuationData,
      },
    });

    // Sync ecosystem members: add any new ones the LLM identified
    const ecosystemMembers = updated?.ecosystem?.members ?? [];
    const existingTickers = new Set(
      thesis.themeMembers.map((m: any) => m.ticker?.toUpperCase()).filter(Boolean)
    );

    for (const member of ecosystemMembers) {
      const ticker = member?.ticker?.toUpperCase();
      if (ticker && !existingTickers.has(ticker)) {
        await prisma.themeMember.create({
          data: {
            thesisId,
            ticker: member.ticker,
            companyName: member.companyName ?? "Unknown",
            role: member.role ?? null,
            competency: member.competency ?? null,
            moatRating: member.moatRating ?? null,
            valuationStatus: member.valuationStatus ?? null,
            marketCap: member.marketCap ?? null,
            notes: member.notes ?? null,
          },
        });
        existingTickers.add(ticker);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[reanalyze] Error:", err?.message);
    return { success: false, error: err?.message ?? "Re-analysis failed" };
  }
}
