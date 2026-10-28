import type { AssessmentStatus, HumanReviewEligibility, PresellQualityAssessment } from "@/lib/presell-quality/types";
import { canEnterHumanReviewQueue, type GlobalPresellQualityGate } from "@/lib/presell-quality/global-quality-gate";

export function humanReviewEligibilityOf(
  status: AssessmentStatus,
  gate?: Pick<GlobalPresellQualityGate, "status"> | null,
): HumanReviewEligibility {
  if (gate) return canEnterHumanReviewQueue(gate) ? "ELIGIBLE" : "NOT_ELIGIBLE";
  return status === "QUALITY_PASSED" ? "ELIGIBLE" : "NOT_ELIGIBLE";
}

export function approvalsFromAssessment(assessment: Pick<PresellQualityAssessment, "assessmentStatus">): {
  aiQualityApproval: boolean;
  humanReviewApproval: false;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
} {
  return {
    aiQualityApproval: assessment.assessmentStatus === "QUALITY_PASSED",
    humanReviewApproval: false,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
  };
}

export function qualityPassedWithoutAi(assessment: Pick<PresellQualityAssessment, "evaluatorType" | "assessmentStatus">): boolean {
  return assessment.assessmentStatus === "QUALITY_PASSED" && assessment.evaluatorType !== "MULTIMODAL_AI";
}
