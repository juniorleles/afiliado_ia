import {
  VISUAL_DIMENSION_WEIGHTS,
  VISUAL_DIMENSIONS,
  VISUAL_SCORE_TARGET,
  QUALITY_SCORE_TARGET,
  visualWeightsSumToOne,
  type VisualDimension,
} from "@/lib/presell-quality/premium-design";
import { QUALITY_TARGET } from "@/lib/presell-quality/types";

export const PREMIUM_VISUAL_EVALUATION_V2 = "PREMIUM_VISUAL_EVALUATION_V2";
export const VISUAL_EVAL_PROMPT_VERSION_V2 = "2";
export const VISUAL_EVAL_RUBRIC_VERSION_V2 = "2";

export const VISUAL_EVAL_V2_INTERPRETATION = [
  "Score visual-quality equivalence against the official reference, not literal reproduction of its commercial chrome.",
  "Do not lower scores for missing testimonials, star ratings, FDA/GMP seals, discounts, free shipping, or medical claims when the Product Contract does not support them.",
  "A high-contrast informational CTA may score well without claiming a discount.",
  "A professional estimated-delivery card may replace a free-shipping badge without inventing free shipping.",
  "Continue to penalize a weak hero, small packshot, faint CTA, poor type, confused hierarchy, sparse cards, prototype look, weak contrast, misalignment, and broken mobile packing.",
  "Do not inflate scores to force QUALITY_APPROVED. Calibration is not a scoring bypass.",
] as const;

export const VISUAL_EVAL_V2_NON_PENALTIES = [
  "Missing testimonials or star ratings without evidence",
  "Missing FDA or GMP seals without proof",
  "Missing discount language without a documented offer",
  "Missing free-shipping claims without evidence",
  "Missing medical or efficacy promises that remain blocked",
] as const;

export const VISUAL_EVAL_V2_PENALTIES = [
  "Weak hero or first impression",
  "Undersized or poorly staged packshot",
  "Low-visibility CTA",
  "Poor typography or contrast",
  "Inconsistent spacing or confused hierarchy",
  "Visually poor cards",
  "Disorganized mobile packing",
  "Excess copy crowding the first fold",
  "Prototype or unfinished appearance",
  "Misaligned elements",
] as const;

export function visualRubricV2Record(): {
  id: typeof PREMIUM_VISUAL_EVALUATION_V2;
  promptVersion: typeof VISUAL_EVAL_PROMPT_VERSION_V2;
  rubricVersion: typeof VISUAL_EVAL_RUBRIC_VERSION_V2;
  weights: Record<VisualDimension, number>;
  visualTarget: typeof VISUAL_SCORE_TARGET;
  editorialTarget: typeof QUALITY_SCORE_TARGET;
  weightsPreserved: boolean;
  thresholdsPreserved: boolean;
  interpretation: typeof VISUAL_EVAL_V2_INTERPRETATION;
} {
  return {
    id: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    rubricVersion: VISUAL_EVAL_RUBRIC_VERSION_V2,
    weights: { ...VISUAL_DIMENSION_WEIGHTS },
    visualTarget: VISUAL_SCORE_TARGET,
    editorialTarget: QUALITY_SCORE_TARGET,
    weightsPreserved: visualWeightsSumToOne() && VISUAL_DIMENSION_WEIGHTS.HERO_FIRST_IMPRESSION === 0.2,
    thresholdsPreserved: VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && QUALITY_TARGET === 85,
    interpretation: VISUAL_EVAL_V2_INTERPRETATION,
  };
}

export function visualComparisonPromptV2(): { system: string; userText: string } {
  return {
    system: `You are an independent visual quality evaluator for affiliate presells.
Methodology ${PREMIUM_VISUAL_EVALUATION_V2}. Prompt ${VISUAL_EVAL_PROMPT_VERSION_V2}.
Compare visitor screenshots to PREMIUM_PRESELL_DESIGN_STANDARD_V1 (last image).
Score visual-quality equivalence: composition, hierarchy, typography, image use, CTA emphasis, card craft, professionalism, and responsiveness.
Do not require the page to reproduce testimonials, star ratings, FDA/GMP seals, discounts, free shipping, or medical claims from the reference.
Do not penalize the absence of those elements when the product contract does not support them.
A highlighted informational CTA and professional logistics cards are legitimate alternatives.
Continue to penalize a weak hero, small packshot, faint CTA, poor type, confused hierarchy, sparse cards, prototype look, weak contrast, misalignment, and broken mobile packing.
Do not raise scores to force approval. Return a json object.`,
    userText: `Return a json object. Score each visual dimension 0-100: ${VISUAL_DIMENSIONS.join(", ")}.
Also return desktopVisualScore, mobileVisualScore, criticalDefects (array of strings), rationales, and problems.
Each problem must be: {section, severity, problem, visualEvidence, referenceDifference, recommendedFix, expectedImpact, requiresContentChange}.
Do not treat missing unverified commercial chrome as a defect.
Target ${VISUAL_SCORE_TARGET}. Images: 1=desktop visitor first fold 1440x900, 2=mobile visitor first fold 390x844, 3=official premium reference.`,
  };
}
