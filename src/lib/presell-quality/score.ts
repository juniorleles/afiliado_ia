import {
  QUALITY_DIMENSION_WEIGHTS,
  QUALITY_TARGET,
  type AssessmentStatus,
  type HumanReviewEligibility,
  type QualityScoreInput,
} from "@/lib/presell-quality/types";

export function weightedQualityScore(input: QualityScoreInput["dimensionScores"]): number {
  let total = 0;
  for (const row of input) {
    const weight = QUALITY_DIMENSION_WEIGHTS[row.dimension];
    const score = Math.max(0, Math.min(100, row.score));
    total += score * weight;
  }
  return Math.round(total);
}

export function resolveAssessmentStatus(input: QualityScoreInput): {
  overallScore: number | null;
  assessmentStatus: AssessmentStatus;
  humanReviewEligibility: HumanReviewEligibility;
  aiQualityApproval: boolean;
} {
  if (input.evaluatorType === "MULTIMODAL_AI" && input.evaluationFailed) {
    return { overallScore: null, assessmentStatus: "EVALUATION_FAILED", humanReviewEligibility: "NOT_ELIGIBLE", aiQualityApproval: false };
  }
  if (!input.evaluationCompleted) {
    return { overallScore: null, assessmentStatus: "NOT_EVALUATED", humanReviewEligibility: "NOT_ELIGIBLE", aiQualityApproval: false };
  }
  const overallScore = weightedQualityScore(input.dimensionScores);
  if (input.criticalFailures.length > 0) {
    const capped = Math.min(overallScore, QUALITY_TARGET - 1);
    const blocked = input.criticalFailures.some((code) =>
      code === "UNAPPROVED_IMAGE_CONTEXT" ||
      code === "MISLEADING_COMMERCIAL_CTA" ||
      code === "INSUFFICIENT_EDITORIAL_CONTENT" ||
      code === "BROKEN_ESSENTIAL_LAYOUT",
    );
    return {
      overallScore: capped,
      assessmentStatus: blocked ? "QUALITY_BLOCKED" : "QUALITY_REJECTED",
      humanReviewEligibility: "NOT_ELIGIBLE",
      aiQualityApproval: false,
    };
  }
  if (input.evaluatorType !== "MULTIMODAL_AI") {
    return {
      overallScore,
      assessmentStatus: overallScore >= QUALITY_TARGET ? "QUALITY_REJECTED" : "QUALITY_REJECTED",
      humanReviewEligibility: "NOT_ELIGIBLE",
      aiQualityApproval: false,
    };
  }
  if (overallScore >= QUALITY_TARGET) {
    return { overallScore, assessmentStatus: "QUALITY_PASSED", humanReviewEligibility: "ELIGIBLE", aiQualityApproval: true };
  }
  return { overallScore, assessmentStatus: "QUALITY_REJECTED", humanReviewEligibility: "NOT_ELIGIBLE", aiQualityApproval: false };
}
