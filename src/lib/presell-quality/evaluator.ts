import { PRODUCT_CONTRACT_VERSION } from "@/lib/product-contract/types";
import { emptyCostMetadata, qualityCostGate } from "@/lib/presell-quality/cost";
import { approvalsFromAssessment, humanReviewEligibilityOf } from "@/lib/presell-quality/policy";
import { resolveAssessmentStatus } from "@/lib/presell-quality/score";
import {
  PRESELL_QUALITY_VERSION,
  RENDERER_V4_ID,
  type EvaluatorType,
  type PresellQualityAssessment,
  type QualityScoreInput,
} from "@/lib/presell-quality/types";

export type QualityEvaluatorInput = {
  campaignId: number;
  generationId?: string | null;
  desktopScreenshotReference?: string | null;
  mobileScreenshotReference?: string | null;
  pageStructure?: unknown;
  contract?: unknown;
  approvedFacts?: string[];
  eligibleAssets?: string[];
  evidenceReferences?: string[];
};

export type QualityEvaluator = {
  type: EvaluatorType;
  evaluate(input: QualityEvaluatorInput): Promise<PresellQualityAssessment>;
};

function idOf(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function unevaluatedAssessment(input: QualityEvaluatorInput, evaluatorType: EvaluatorType = "DETERMINISTIC_BASELINE"): PresellQualityAssessment {
  const resolved = resolveAssessmentStatus({
    dimensionScores: [],
    criticalFailures: [],
    evaluatorType,
    evaluationCompleted: false,
  });
  const draft: PresellQualityAssessment = {
    assessmentId: idOf("pqa"),
    assessmentVersion: PRESELL_QUALITY_VERSION,
    campaignId: input.campaignId,
    generationId: input.generationId ?? null,
    productContractVersion: PRODUCT_CONTRACT_VERSION,
    rendererVersion: RENDERER_V4_ID,
    evaluatorType,
    evaluatorModel: null,
    evaluatedAt: null,
    desktopScreenshotReference: input.desktopScreenshotReference ?? null,
    mobileScreenshotReference: input.mobileScreenshotReference ?? null,
    overallScore: resolved.overallScore,
    dimensionScores: [],
    criticalFailures: [],
    findings: [
      {
        id: "not-evaluated",
        dimension: "CRITICAL",
        severity: "INFO",
        message: "AI visual evaluation was not executed. Absence is not quality approval.",
        evidence: [],
      },
    ],
    recommendedActions: [],
    assessmentStatus: resolved.assessmentStatus,
    humanReviewEligibility: humanReviewEligibilityOf(resolved.assessmentStatus),
    evidenceReferences: input.evidenceReferences ?? [],
    costMetadata: emptyCostMetadata(["No paid multimodal call was made."]),
    aiQualityApproval: false,
    humanReviewApproval: false,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
  };
  return { ...draft, ...approvalsFromAssessment(draft) };
}

export function assessmentFromScores(
  input: QualityEvaluatorInput & { evaluatorType: EvaluatorType; evaluatorModel?: string | null },
  scores: QualityScoreInput,
): PresellQualityAssessment {
  const resolved = resolveAssessmentStatus(scores);
  const draft: PresellQualityAssessment = {
    ...unevaluatedAssessment(input, input.evaluatorType),
    evaluatorModel: input.evaluatorModel ?? null,
    evaluatedAt: scores.evaluationCompleted ? new Date().toISOString() : null,
    overallScore: resolved.overallScore,
    dimensionScores: scores.dimensionScores.map((row) => ({
      dimension: row.dimension,
      weight: ({
        DESIGN_HIERARCHY: 0.25,
        COPY_CLARITY: 0.2,
        DEPTH_ORGANIZATION: 0.2,
        IMAGES_COMPOSITION: 0.15,
        MOBILE_EXPERIENCE: 0.1,
        TRANSPARENCY_LEGIBILITY: 0.1,
      } as const)[row.dimension],
      score: row.score,
      rationale: row.rationale,
    })),
    criticalFailures: scores.criticalFailures,
    assessmentStatus: resolved.assessmentStatus,
    humanReviewEligibility: resolved.humanReviewEligibility,
    aiQualityApproval: resolved.aiQualityApproval,
  };
  return { ...draft, ...approvalsFromAssessment(draft) };
}

export function createBlockedMultimodalEvaluator(): QualityEvaluator {
  return {
    type: "MULTIMODAL_AI",
    async evaluate(input) {
      const gate = qualityCostGate();
      const base = unevaluatedAssessment(input, "MULTIMODAL_AI");
      return {
        ...base,
        assessmentStatus: "EVALUATION_FAILED",
        findings: [
          {
            id: "paid-ai-blocked",
            dimension: "CRITICAL",
            severity: "BLOCKING",
            message: gate.reason,
            evidence: ["AIA_ALLOW_PAID_AI"],
          },
        ],
        costMetadata: emptyCostMetadata([gate.reason]),
      };
    },
  };
}
