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

/** Hex colors for inline styles (radar charts, SVG, etc.) — derived from CSS design tokens */
export const SCORE_HEX: Record<ScoreTier, string> = {
  strong: "hsl(142 60% 45%)",   // --success
  moderate: "hsl(38 80% 50%)",  // --warning
  weak: "hsl(0 84% 60%)",       // --destructive
};

export function getScoreHex(score: number | null): string {
  if (score === null || score === undefined) return "#6b7280"; // gray-500
  return SCORE_HEX[getScoreTier(score)];
}

/** Tailwind text color classes */
export const SCORE_TEXT: Record<ScoreTier, string> = {
  strong: "text-success",
  moderate: "text-warning",
  weak: "text-destructive",
};

export function getScoreTextClass(score: number | null): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  return SCORE_TEXT[getScoreTier(score)];
}

/** Tailwind bg color classes */
export const SCORE_BG: Record<ScoreTier, string> = {
  strong: "bg-success",
  moderate: "bg-warning",
  weak: "bg-destructive",
};

export function getScoreBarClass(score: number | null): string {
  if (score === null || score === undefined) return "bg-muted-foreground";
  return SCORE_BG[getScoreTier(score)];
}

/** Combined text + bg classes for badges/pills */
export const SCORE_BADGE: Record<ScoreTier, string> = {
  strong: "text-success bg-success/10",
  moderate: "text-warning bg-warning/10",
  weak: "text-destructive bg-destructive/10",
};

export function getScoreBadgeClass(score: number | null): string {
  if (score === null || score === undefined) return "text-muted-foreground bg-muted";
  return SCORE_BADGE[getScoreTier(score)];
}
