export const PRESELL_QUALITY_VERSION = 1 as const;
export const QUALITY_TARGET = 85 as const;
export const RENDERER_V4_ID = "v4" as const;
export const QUALITY_RUBRIC_VERSION = "1" as const;
export const QUALITY_PROMPT_VERSION = "1" as const;

export const QUALITY_DIMENSIONS = [
  "DESIGN_HIERARCHY",
  "COPY_CLARITY",
  "DEPTH_ORGANIZATION",
  "IMAGES_COMPOSITION",
  "MOBILE_EXPERIENCE",
  "TRANSPARENCY_LEGIBILITY",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export const QUALITY_DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  DESIGN_HIERARCHY: 0.25,
  COPY_CLARITY: 0.2,
  DEPTH_ORGANIZATION: 0.2,
  IMAGES_COMPOSITION: 0.15,
  MOBILE_EXPERIENCE: 0.1,
  TRANSPARENCY_LEGIBILITY: 0.1,
};

export const ASSESSMENT_STATUSES = [
  "NOT_EVALUATED",
  "EVALUATION_PENDING",
  "EVALUATION_FAILED",
  "QUALITY_REJECTED",
  "QUALITY_BLOCKED",
  "QUALITY_PASSED",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const EVALUATOR_TYPES = ["DETERMINISTIC_BASELINE", "MULTIMODAL_AI", "MOCK_TEST"] as const;
export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

export const HUMAN_REVIEW_ELIGIBILITIES = ["NOT_ELIGIBLE", "ELIGIBLE"] as const;
export type HumanReviewEligibility = (typeof HUMAN_REVIEW_ELIGIBILITIES)[number];

export const CRITICAL_FAILURE_CODES = [
  "UNGROUNDED_CLAIM",
  "INVENTED_HEALTH_BENEFIT",
  "UNAPPROVED_IMAGE_CONTEXT",
  "MISLEADING_COMMERCIAL_CTA",
  "BROKEN_ESSENTIAL_LAYOUT",
  "INSUFFICIENT_EDITORIAL_CONTENT",
  "SEVERE_MOBILE_BREAKAGE",
  "FALSE_PRICE_GUARANTEE_OR_MAKER",
] as const;
export type CriticalFailureCode = (typeof CRITICAL_FAILURE_CODES)[number];

export type DimensionScore = {
  dimension: QualityDimension;
  weight: number;
  score: number;
  rationale: string;
};

export type QualityFinding = {
  id: string;
  dimension: QualityDimension | "CRITICAL";
  severity: "INFO" | "WARNING" | "BLOCKING";
  message: string;
  evidence: string[];
};

export type RecommendedAction = {
  id: string;
  action: string;
  allowed: boolean;
  reason: string;
};

export type CostMetadata = {
  paidAiEnabled: boolean;
  estimatedUsd: number;
  actualUsd: number;
  evaluationCount: number;
  cached: boolean;
  notes: string[];
};

export type PresellQualityAssessment = {
  assessmentId: string;
  assessmentVersion: typeof PRESELL_QUALITY_VERSION;
  campaignId: number;
  generationId: string | null;
  productContractVersion: number;
  rendererVersion: string;
  evaluatorType: EvaluatorType;
  evaluatorModel: string | null;
  evaluatedAt: string | null;
  desktopScreenshotReference: string | null;
  mobileScreenshotReference: string | null;
  overallScore: number | null;
  dimensionScores: DimensionScore[];
  criticalFailures: CriticalFailureCode[];
  findings: QualityFinding[];
  recommendedActions: RecommendedAction[];
  assessmentStatus: AssessmentStatus;
  humanReviewEligibility: HumanReviewEligibility;
  evidenceReferences: string[];
  costMetadata: CostMetadata;
  aiQualityApproval: false | true;
  humanReviewApproval: false;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  promptVersion?: string | null;
  rubricVersion?: string | null;
  inputFingerprint?: string | null;
  screenshotHashes?: string[];
  provider?: string | null;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
  errorCode?: string | null;
};

export type QualityScoreInput = {
  dimensionScores: Array<{ dimension: QualityDimension; score: number; rationale: string }>;
  criticalFailures: CriticalFailureCode[];
  evaluatorType: EvaluatorType;
  evaluationCompleted: boolean;
  evaluationFailed?: boolean;
};
