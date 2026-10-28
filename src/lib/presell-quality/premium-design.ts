import type { ThemeId } from "@/lib/design-system/tokens";

export const PREMIUM_ENGINE_VERSION = "1";
export const PREMIUM_ENGINE_ID = "premium-v1";
export const EXECUTION_54AU_ID = "execution-54au";
export const MAX_DESIGN_ITERATIONS = 4;
export const VISUAL_SCORE_TARGET = 90;
export const QUALITY_SCORE_TARGET = 85;
export const PAID_AI_BUDGET_USD = 0;
export const PREMIUM_DISPLAY_THEME: ThemeId = "forest";

export const PREMIUM_CTA_LABEL = "View Product Details";
export const PREMIUM_CTA_SECONDARY_LABEL = "Check Product Availability";
export const PREMIUM_CTA_CAPTION = "Preview only. Commercial checkout is not enabled.";

export const VISUAL_DIMENSIONS = [
  "HERO_FIRST_IMPRESSION",
  "COMPOSITION_HIERARCHY",
  "TYPOGRAPHY_LEGIBILITY",
  "CARDS_COMPONENTS",
  "IMAGE_USE",
  "CTA_EMPHASIS",
  "MOBILE",
] as const;

export type VisualDimension = (typeof VISUAL_DIMENSIONS)[number];

export const VISUAL_DIMENSION_WEIGHTS: Record<VisualDimension, number> = {
  HERO_FIRST_IMPRESSION: 0.2,
  COMPOSITION_HIERARCHY: 0.2,
  TYPOGRAPHY_LEGIBILITY: 0.15,
  CARDS_COMPONENTS: 0.15,
  IMAGE_USE: 0.1,
  CTA_EMPHASIS: 0.1,
  MOBILE: 0.1,
};

export const FORBIDDEN_REFERENCE_CHROME =
  /\b(fda[- ]approved|gmp certified|verified buyer|★★|star review|customer testimonial|free shipping|frete gr[aá]tis|limited[- ]time|%\s*off)\b/i;

export function weightedVisualScore(scores: Record<VisualDimension, number>): number {
  let total = 0;
  for (const dimension of VISUAL_DIMENSIONS) {
    total += scores[dimension] * VISUAL_DIMENSION_WEIGHTS[dimension];
  }
  return Math.round(total);
}

export function visualWeightsSumToOne(): boolean {
  const sum = VISUAL_DIMENSIONS.reduce((acc, dimension) => acc + VISUAL_DIMENSION_WEIGHTS[dimension], 0);
  return Math.abs(sum - 1) < 1e-9;
}
