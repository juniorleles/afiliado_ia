import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, type PresellQualityAssessment } from "@/lib/presell-quality/types";
import { rubricVersionsComparable } from "@/lib/presell-quality/normalize";

export const EVALUATOR_VARIATION_LIMIT = 8;

export type EvaluatorConsistencyStatus = "COMPARABLE" | "RUBRIC_MISMATCH" | "BINDING_MISMATCH" | "INCOMPLETE" | "EVALUATOR_UNSTABLE";

export type EvaluatorConsistencyReport = {
  status: EvaluatorConsistencyStatus;
  firstAssessmentId: string | null;
  secondAssessmentId: string | null;
  firstGenerationId: string | null;
  secondGenerationId: string | null;
  firstScore: number | null;
  secondScore: number | null;
  variation: number | null;
  rubricComparable: boolean;
  promptComparable: boolean;
  screenshotHashesMatch: boolean;
  generationIdsMatch: boolean;
};

export function measureEvaluatorConsistency(input: {
  first: PresellQualityAssessment | null;
  second: PresellQualityAssessment | null;
  variationLimit?: number;
}): EvaluatorConsistencyReport {
  const first = input.first;
  const second = input.second;
  const limit = input.variationLimit ?? EVALUATOR_VARIATION_LIMIT;
  const rubricComparable = rubricVersionsComparable(first?.rubricVersion, second?.rubricVersion);
  const promptComparable = rubricVersionsComparable(first?.promptVersion ?? QUALITY_PROMPT_VERSION, second?.promptVersion ?? QUALITY_PROMPT_VERSION);
  const generationIdsMatch = Boolean(first?.generationId && first.generationId === second?.generationId);
  const firstHashes = [...(first?.screenshotHashes ?? [])].sort().join(",");
  const secondHashes = [...(second?.screenshotHashes ?? [])].sort().join(",");
  const screenshotHashesMatch = Boolean(firstHashes && firstHashes === secondHashes);
  const firstScore = first?.overallScore ?? null;
  const secondScore = second?.overallScore ?? null;
  const variation = firstScore != null && secondScore != null ? Math.abs(secondScore - firstScore) : null;

  let status: EvaluatorConsistencyStatus = "COMPARABLE";
  if (!first || !second || firstScore == null || secondScore == null) status = "INCOMPLETE";
  else if (!generationIdsMatch || !screenshotHashesMatch) status = "BINDING_MISMATCH";
  else if (!rubricComparable || !promptComparable) status = "RUBRIC_MISMATCH";
  else if (variation != null && variation > limit) status = "EVALUATOR_UNSTABLE";

  return {
    status,
    firstAssessmentId: first?.assessmentId ?? null,
    secondAssessmentId: second?.assessmentId ?? null,
    firstGenerationId: first?.generationId ?? null,
    secondGenerationId: second?.generationId ?? null,
    firstScore,
    secondScore,
    variation,
    rubricComparable,
    promptComparable,
    screenshotHashesMatch,
    generationIdsMatch,
  };
}

export function currentRubricPair(): { rubricVersion: string; promptVersion: string } {
  return { rubricVersion: QUALITY_RUBRIC_VERSION, promptVersion: QUALITY_PROMPT_VERSION };
}
