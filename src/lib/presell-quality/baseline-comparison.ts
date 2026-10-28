import type { PresellQualityAssessment, QualityDimension } from "@/lib/presell-quality/types";

export type EvaluatorStability = "STABLE" | "NOT_ESTABLISHED" | "EVALUATOR_UNSTABLE";
export type BaselineComparisonStatus = "IMPROVED" | "INCONCLUSIVE" | "REGRESSED";

export type BaselineComparison = {
  baselineGenerationId: string;
  baselineScore: number;
  newGenerationId: string | null;
  newScore: number | null;
  evaluationRuns: number;
  evaluatorStability: EvaluatorStability;
  qualityTargetReached: boolean;
  status: BaselineComparisonStatus;
  reasons: string[];
  dimensionDelta: Array<{ dimension: QualityDimension; baseline: number | null; next: number | null }>;
};

export function compareAgainstBaseline(input: {
  baselineGenerationId: string;
  baselineScore: number;
  baseline?: PresellQualityAssessment | null;
  nextGenerationId: string | null;
  assessments: PresellQualityAssessment[];
  contentSafetyPass: boolean;
  addedOperationalContent: boolean;
  criticalRegressions: string[];
  scoreRangeLimit?: number;
}): BaselineComparison {
  const valid = input.assessments.filter((item) => item.assessmentStatus !== "EVALUATION_FAILED" && item.overallScore != null);
  const scores = valid.map((item) => item.overallScore as number);
  const range = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : 0;
  const limit = input.scoreRangeLimit ?? 8;
  let evaluatorStability: EvaluatorStability = "NOT_ESTABLISHED";
  if (scores.length >= 2 && range > limit) evaluatorStability = "EVALUATOR_UNSTABLE";
  else if (scores.length >= 2) evaluatorStability = "STABLE";
  const newScore = scores[0] ?? null;
  const reasons: string[] = [];
  if (!input.contentSafetyPass) reasons.push("Content safety gate failed.");
  if (input.criticalRegressions.length) reasons.push(...input.criticalRegressions);
  if (evaluatorStability === "EVALUATOR_UNSTABLE") reasons.push("Evaluator scores diverged beyond the stability limit.");
  if (evaluatorStability === "NOT_ESTABLISHED") reasons.push("Only one evaluation ran, so stability is not established.");
  if (!input.addedOperationalContent) reasons.push("No new approved operational content was demonstrated on the page.");
  if (scores.length >= 2) reasons.push(`Evaluation scores: ${scores.join(", ")}.`);

  let status: BaselineComparisonStatus = "INCONCLUSIVE";
  const materialDrop =
    scores.length > 0 &&
    Math.max(...scores) + 1e-9 < input.baselineScore &&
    input.baselineScore - Math.max(...scores) > limit;
  const allAtOrAbove = scores.length > 0 && scores.every((score) => score + 1e-9 >= input.baselineScore);
  if (input.criticalRegressions.length) {
    status = "REGRESSED";
  } else if (!input.contentSafetyPass || evaluatorStability === "EVALUATOR_UNSTABLE" || evaluatorStability === "NOT_ESTABLISHED") {
    status = "INCONCLUSIVE";
  } else if (materialDrop) {
    status = "REGRESSED";
    reasons.push("Every valid evaluation scored materially below the 54AJ baseline.");
  } else if (input.addedOperationalContent && allAtOrAbove && evaluatorStability === "STABLE") {
    status = "IMPROVED";
    reasons.push("Stable evaluation and added operational evidence without critical regressions.");
  } else {
    status = "INCONCLUSIVE";
    if (scores.some((score) => score < input.baselineScore) && scores.some((score) => score >= input.baselineScore)) {
      reasons.push("Scores straddle the baseline. Numeric movement alone is not treated as improvement or regression.");
    }
  }

  const dimensions: QualityDimension[] = [
    "DESIGN_HIERARCHY",
    "COPY_CLARITY",
    "DEPTH_ORGANIZATION",
    "IMAGES_COMPOSITION",
    "MOBILE_EXPERIENCE",
    "TRANSPARENCY_LEGIBILITY",
  ];
  return {
    baselineGenerationId: input.baselineGenerationId,
    baselineScore: input.baselineScore,
    newGenerationId: input.nextGenerationId,
    newScore,
    evaluationRuns: input.assessments.length,
    evaluatorStability,
    qualityTargetReached: newScore != null && newScore >= 85 && evaluatorStability !== "EVALUATOR_UNSTABLE",
    status,
    reasons,
    dimensionDelta: dimensions.map((dimension) => ({
      dimension,
      baseline: input.baseline?.dimensionScores.find((row) => row.dimension === dimension)?.score ?? null,
      next: valid[0]?.dimensionScores.find((row) => row.dimension === dimension)?.score ?? null,
    })),
  };
}
