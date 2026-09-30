/**
 * Local Validation Lab — diagnostic types.
 * Isolated from campaign analytics, publication, and Ads.
 */

import type { VariantApproach } from "@/lib/ai/generate-variants";
import type { GroundingStatus } from "@/lib/ai/grounding-validator";
import type { PublicationGate } from "@/lib/policy-linter";
import type { ImportQuality } from "@/lib/product-facts";
import type { VisualQaActionCode, VisualQaStatus } from "@/lib/visual-qa/types";
import type { MarketResearchReport, MarketResearchQuality, MarketResearchStatus } from "@/lib/market-research/types";
import type { StrategyConfidence, StrategyFamily, StrategyRecommendation } from "@/lib/strategy/types";

export const VALIDATION_RUN_STATUSES = ["READY", "RUNNING", "COMPLETE", "FAILED"] as const;
export type ValidationRunStatus = (typeof VALIDATION_RUN_STATUSES)[number];

export const PIPELINE_STAGES = [
  "IMPORT",
  "PRODUCT_FACTS",
  "AI_CONTENT",
  "GROUNDING",
  "POLICY_LINTER",
  "DESIGN_PLAN",
  "CREATIVE_COMPOSITION",
  "DESKTOP_RENDER",
  "MOBILE_RENDER",
  "VISUAL_QA",
  "PERFORMANCE_QA",
] as const;
export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

export const STAGE_OUTCOMES = ["OK", "FAIL", "SKIPPED", "BLOCKED"] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

export const HUMAN_REVIEW_STATES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type HumanReviewState = (typeof HUMAN_REVIEW_STATES)[number];

export const FAILURE_TYPES = [
  "IMPORT_FAILURE",
  "SOURCE_INSUFFICIENT",
  "ASSET_FAILURE",
  "GROUNDING_FAILURE",
  "POLICY_BLOCK",
  "GENERATION_FAILURE",
  "STRUCTURAL_SIMILARITY",
  "VISUAL_FAILURE",
  "MOBILE_FAILURE",
  "PERFORMANCE_FAILURE",
] as const;
export type FailureType = (typeof FAILURE_TYPES)[number];

export const SOURCE_CONDITIONS = [
  "GOOD_PACKSHOT",
  "WEAK_PACKSHOT",
  "NO_PACKSHOT",
  "RICH_PRODUCT_FACTS",
  "LIMITED_PRODUCT_FACTS",
  "HEALTH_SENSITIVE",
  "NON_HEALTH",
  "LONG_SOURCE",
  "SHORT_SOURCE",
  "GOOD_IMPORT_SOURCE",
  "DIFFICULT_IMPORT_SOURCE",
] as const;
export type SourceCondition = (typeof SOURCE_CONDITIONS)[number];

export const STRUCTURAL_DIVERSITY_LEVELS = ["GOOD", "LIMITED", "POOR"] as const;
export type StructuralDiversityLevel = (typeof STRUCTURAL_DIVERSITY_LEVELS)[number];

export const AI_REVIEW_VERDICTS = ["PASS", "REVIEW_REQUIRED"] as const;
export type AiReviewVerdict = (typeof AI_REVIEW_VERDICTS)[number];

export const AI_REVIEW_DIMENSIONS = [
  "VISUAL_HIERARCHY",
  "PRODUCT_PROMINENCE",
  "TYPOGRAPHY",
  "CONTENT_DENSITY",
  "CTA_CLARITY",
  "SECTION_RHYTHM",
  "MOBILE_COMPOSITION",
  "DESKTOP_COMPOSITION",
  "PREMIUM_APPEARANCE",
] as const;
export type AiReviewDimensionId = (typeof AI_REVIEW_DIMENSIONS)[number];

export { VALIDATION_SAFE_HREF, VALIDATION_SAFE_AFFILIATE } from "@/lib/validation/constants";

export const PERFORMANCE_BUDGET = {
  mobileLighthouse: 95,
  lcpMs: 2430,
  cls: 0,
  transferBytes: 195_000,
} as const;

export type PipelineStageRecord = {
  id: PipelineStageId;
  outcome: StageOutcome;
  at: string;
  notes: string;
  error?: string;
};

export type StructureFingerprint = {
  heroFamily: string;
  sceneSequence: string;
  sectionVariants: string;
  ctaDistribution: string;
  imageSlotDistribution: string;
  layoutFamilies: string;
  contentPriorityPattern: string;
  visualTheme: string;
  template: string;
  approach: string;
  key: string;
};

export const GATE_TRACE_VERSION = 1;

export type PersistedGroundingFailure = {
  proposition: string;
  reason: string;
  severity: "hard" | "soft";
  claimClass: string | null;
  section: string | null;
  slotId: string | null;
  authorizedEvidence: string[];
};

/** Immutable record of one grounding evaluation. Independent of the composed page. */
export type GroundingStageSnapshot = {
  stage: "PRE_COMPOSITION_GROUNDING" | "FINAL_COMPOSITION_GROUNDING";
  status: GroundingStatus | "UNAVAILABLE";
  evaluatedHash: string;
  representation: string;
  failures: PersistedGroundingFailure[];
  evaluatedAt: string;
};

export type GateTrace = {
  version: typeof GATE_TRACE_VERSION;
  evaluatedAt: string;
  preComposition: GroundingStageSnapshot;
  finalComposition: GroundingStageSnapshot;
  policy: {
    stage: "POLICY_LINTER";
    gate: PublicationGate | "UNAVAILABLE";
    publicationGate: PublicationGate | "UNAVAILABLE";
    blockingRules: string[];
    warnings: string[];
  };
  authorityViolations: Array<{ topic: string; text: string; reason: string; requiredField: string }>;
};

export type ContentQaSnapshot = {
  groundingStatus: GroundingStatus | "UNAVAILABLE";
  policyGate: PublicationGate | "UNAVAILABLE";
  finalGate: PublicationGate | "UNAVAILABLE";
  warnings: string[];
  blockingRules: string[];
  /** Present for candidates evaluated after gate-trace persistence. Absent on earlier rows. */
  gateTrace?: GateTrace | null;
};

export type SourceQaSnapshot = {
  importQuality: ImportQuality | "UNAVAILABLE";
  productAssetStatus: string;
  productFactCompleteness: "RICH" | "LIMITED" | "EMPTY";
  sourceProvenance: string;
  conditions: SourceCondition[];
};

export type AssetQaSnapshot = {
  packshotFound: boolean;
  packshotRole: string | null;
  packshotDimensions: { width: number; height: number } | null;
  packshotProvenance: string;
  packshotClassification: string | null;
  rejectedAssetCount: number;
};

export type VisualQaSnapshot = {
  status: VisualQaStatus | "UNAVAILABLE";
  highCount: number;
  warningCount: number;
  actionCodes: VisualQaActionCode[];
  overflowViewports: string[];
};

export type AiDimensionFinding = {
  dimension: AiReviewDimensionId;
  verdict: AiReviewVerdict;
  reason: string;
  evidence: string;
  recommended_action_code: string;
};

export type IndividualAiVisualReview = {
  state: "OK" | "UNAVAILABLE" | "PARSE_FAILED";
  overall: AiReviewVerdict | "UNAVAILABLE";
  dimensions: AiDimensionFinding[];
  rawError?: string;
  usedDesktopScreenshot: boolean;
  usedMobileScreenshot: boolean;
};

export type CrossPageAiReview = {
  state: "OK" | "UNAVAILABLE" | "PARSE_FAILED" | "SKIPPED";
  DIVERSITY_REVIEW: AiReviewVerdict | "UNAVAILABLE";
  repeatedPatterns: string[];
  reason: string;
  evidence: string;
  rawError?: string;
};

export type LightweightPerformance = {
  transferBytes: number;
  imageBytes: number;
  jsBytes: number;
  lcpMs: number | null;
  cls: number | null;
  overflow: boolean;
  regressionFlags: string[];
  lighthouseUsed: boolean;
  lighthousePerformance: number | null;
};

export type ValidationFailure = {
  type: FailureType;
  stage: PipelineStageId | "SUMMARY";
  message: string;
};

export type ValidationProduct = {
  key: string;
  name: string;
  sourceUrl: string;
  origin: "IMPORT" | "EXISTING_DRAFT";
  campaignId?: number | null;
  affiliateUrlStored: boolean;
  discoveryNote?: string;
  MARKET_RESEARCH_STATUS?: MarketResearchStatus;
  MARKET_RESEARCH_QUALITY?: MarketResearchQuality;
  MARKET_RESEARCH_DATE?: string;
  MARKET_SOURCES?: number;
  RECOMMENDED_STRATEGY?: StrategyFamily;
  STRATEGY_CONFIDENCE?: StrategyConfidence;
  STRATEGY_RATIONALE?: string;
  ALTERNATIVES?: StrategyFamily[];
};

export type CandidateStrategyMeta = {
  recommended: boolean;
  confidence?: StrategyConfidence;
  rationale?: string;
  fallbackUsed?: boolean;
  researchedAt?: string;
};

export type ValidationCandidate = {
  id: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  productKey: string;
  productName: string;
  approach: VariantApproach;
  template: string;
  theme: string;
  heroVariant: string;
  stages: PipelineStageRecord[];
  fingerprint: StructureFingerprint | null;
  conditions: SourceCondition[];
  contentQa: ContentQaSnapshot;
  sourceQa: SourceQaSnapshot;
  assetQa: AssetQaSnapshot;
  visualQa: VisualQaSnapshot;
  aiReview: IndividualAiVisualReview;
  performance: LightweightPerformance | null;
  failures: ValidationFailure[];
  humanReview: HumanReviewState;
  humanNotes: string;
  desktopScreenshot: string | null;
  mobileScreenshot: string | null;
  pageCompositionJson: string | null;
  designPlanJson: string | null;
  creativeJson: string | null;
  factsJson: string | null;
  campaignId: number | null;
  publicationStatus: "draft";
  strategyMeta?: CandidateStrategyMeta | null;
};

export type ValidationRunSummary = {
  PRODUCTS_TESTED: number;
  CANDIDATES_GENERATED: number;
  IMPORT_SUCCESS_RATE: number | null;
  GROUNDING_PASS_RATE: number | null;
  POLICY_READY_COUNT: number;
  POLICY_REVIEW_COUNT: number;
  POLICY_BLOCKED_COUNT: number;
  PACKSHOT_SUCCESS_RATE: number | null;
  VISUAL_PASS_COUNT: number;
  VISUAL_REVIEW_COUNT: number;
  STRUCTURAL_DIVERSITY: StructuralDiversityLevel | "INSUFFICIENT_SAMPLE";
  PERFORMANCE_PASS_COUNT: number;
};

export type ValidationRun = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ValidationRunStatus;
  notes: string;
  products: ValidationProduct[];
  summary: ValidationRunSummary | null;
  crossPageReview: CrossPageAiReview | null;
  structuralDiversity: StructuralDiversityLevel | "INSUFFICIENT_SAMPLE" | null;
  marketResearch?: MarketResearchReport | null;
  strategy?: StrategyRecommendation | null;
};

export const VALIDATION_ISOLATION = {
  renderPixel: false,
  trackClicks: false,
  disableAffiliateNavigation: true,
  publicationStatus: "draft" as const,
  robotsIndex: false,
} as const;
