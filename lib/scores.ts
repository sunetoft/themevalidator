/**
 * Shared score utilities — used across all pages for consistent coloring.
 * Thresholds: 70+ = strong (green), 50-69 = moderate (amber), <50 = weak (red).
 */

export const SCORE_THRESHOLDS = {
  strong: 70,
  moderate: 50,
} as const;

export type ScoreTier = "strong" | "moderate" | "weak";

export function getScoreTier(score: number): ScoreTier {
  if (score >= SCORE_THRESHOLDS.strong) return "strong";
  if (score >= SCORE_THRESHOLDS.moderate) return "moderate";
  return "weak";
}

/** Hex colors for inline styles (radar charts, SVG, etc.) */
export const SCORE_HEX: Record<ScoreTier, string> = {
  strong: "#10b981", // emerald-500
  moderate: "#eab308", // yellow-500
  weak: "#ef4444", // red-500
};

export function getScoreHex(score: number | null): string {
  if (score === null || score === undefined) return "#6b7280"; // gray-500
  return SCORE_HEX[getScoreTier(score)];
}

/** Tailwind text color classes */
export const SCORE_TEXT: Record<ScoreTier, string> = {
  strong: "text-emerald-500",
  moderate: "text-yellow-500",
  weak: "text-red-500",
};

export function getScoreTextClass(score: number | null): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  return SCORE_TEXT[getScoreTier(score)];
}

/** Tailwind bg color classes */
export const SCORE_BG: Record<ScoreTier, string> = {
  strong: "bg-emerald-500",
  moderate: "bg-yellow-500",
  weak: "bg-red-500",
};

export function getScoreBarClass(score: number | null): string {
  if (score === null || score === undefined) return "bg-muted-foreground";
  return SCORE_BG[getScoreTier(score)];
}

/** Combined text + bg classes for badges/pills */
export const SCORE_BADGE: Record<ScoreTier, string> = {
  strong: "text-emerald-500 bg-emerald-500/10",
  moderate: "text-yellow-500 bg-yellow-500/10",
  weak: "text-red-500 bg-red-500/10",
};

export function getScoreBadgeClass(score: number | null): string {
  if (score === null || score === undefined) return "text-muted-foreground bg-muted";
  return SCORE_BADGE[getScoreTier(score)];
}
