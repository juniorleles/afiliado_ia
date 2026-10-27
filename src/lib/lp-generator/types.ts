import type { GateId, GateResult } from "@/lib/quality-gate/types";
import type { Defect } from "@/lib/quality-gate/types";
import type { SourcePageCategory } from "@/lib/product-facts";
import type { CopyProducer } from "@/lib/page-blueprint/types";
import type { AiExecutionStatus } from "@/lib/lp-generator/ai-copy/types";
import type { ContentQualityStatus } from "@/lib/lp-generator/content-quality";
import type { QualityInspectionRecord } from "@/lib/lp-generator/quality-persist";
import type { ConversionGoal, StrategyStatus } from "@/lib/conversion-strategy/types";
import type { CompositionId } from "@/lib/design-system/compose";

export const LP_GENERATOR_VERSION = 1 as const;

export const GENERATION_STATES = [
  "CREATED",
  "RESEARCHING",
  "BUILDING_CONTRACT",
  "GENERATING_STRATEGY",
  "GENERATING_COPY",
  "SELECTING_ASSETS",
  "RENDERING",
  "VALIDATING",
  "PREVIEW_READY",
  "NEEDS_REVIEW",
  "FAILED",
] as const;

export type GenerationState = (typeof GENERATION_STATES)[number];

export type CommercialGoal = "INFORM" | "SEND_TO_OFFER" | "SEND_TO_DETAILS";

export type GenerationInput = {
  productName: string;
  category?: string;
  salesUrl: string;
  affiliateUrl?: string;
  hopLink?: string;
  language: string;
  market: string;
  goal: CommercialGoal;
};

export type SourceFetchRecord = {
  url: string;
  requestedUrl: string;
  ok: boolean;
  status: number | null;
  reason: string | null;
  hopPlaceholder: boolean;
  pageCategory: SourcePageCategory;
  bytes: number;
};

export type AuthorizedImageUse = {
  id: string;
  src: string;
  role: "hero" | "gallery";
  status: "USER_APPROVED";
};

export type GateLabelMap = {
  TECHNICAL_PASS: boolean;
  CONTENT_PASS: boolean;
  CONTENT_QUALITY_STATUS: ContentQualityStatus;
  ASSET_AUTHORIZATION_PASS: boolean;
  COMMERCIAL_POLICY_PASS: boolean;
  VISUAL_REVIEW_PENDING: boolean;
  HUMAN_APPROVAL_PENDING: true;
};

export type GenerationRecord = {
  version: typeof LP_GENERATOR_VERSION;
  id: string;
  hash: string;
  status: GenerationState;
  input: GenerationInput;
  productKey: string;
  sources: SourceFetchRecord[];
  limitations: string[];
  strategy?: {
    status: StrategyStatus;
    conversionGoal: ConversionGoal;
    composition: CompositionId;
    narrativeShape: string;
    blueprintVersion: number;
  };
  copy?: {
    producer: CopyProducer;
    aiUsed: boolean;
    aiConfigured: boolean;
    headline: string;
    sectionCount: number;
    source?: "OPENAI_REAL" | "OPENAI_REAL_REPROCESSED" | "DETERMINISTIC_OFFLINE" | "AI_FALLBACK";
  };
  ai?: {
    provider: string;
    model: string | null;
    status: AiExecutionStatus;
    fallbackUsed: boolean;
    latencyMs: number | null;
    costEstimate: string | null;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    } | null;
    requestId?: string | null;
    costUsd?: number | null;
    costStatus?: "CALCULATED" | "COST_UNVERIFIED" | "NOT_CHARGED" | null;
  };
  research?: {
    productName: string;
    category?: string;
    ingredientCount: number;
    featureCount: number;
    droppedCount: number;
  };
  assets: {
    productKey: string;
    approvedUsed: AuthorizedImageUse[];
    approvedAvailable: number;
    pendingCount: number;
    blockedCount: number;
  };
  gates?: Record<GateId, GateResult>;
  gateLabels?: GateLabelMap;
  defects: Defect[];
  qualityInspection?: QualityInspectionRecord;
  errors: string[];
  timings: {
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    stages: Array<{ state: GenerationState; ms: number }>;
  };
  previewPath: string | null;
  reusedFrom?: string;
  campaignId?: number;
  researchRunId?: string;
  review?: ReviewGenerationMeta;
  sandbox?: {
    enabled: true;
    sessionId: string;
    ctaPath: string;
    productionPromotionBlocked: true;
  };
};

export type ReviewContentStatus =
  | "GENERATED"
  | "INSUFFICIENT_APPROVED_CONTENT"
  | "BLOCKED_QUALITY_GATE"
  | "FAILED";

export type ReviewGenerationMeta = {
  approvedFacts: string[];
  contentStatus: ReviewContentStatus;
  heroImageStatus: "SELECTED" | "HERO_IMAGE_MISSING";
  productContractStatus: string;
  media: {
    approved: number;
    eligible: number;
    used: number;
    excluded: Array<{ assetId: string; assetUrl: string; reason: string | null }>;
  };
};

export type GenerationSummary = {
  id: string;
  hash: string;
  productName: string;
  productKey: string;
  status: GenerationState;
  createdAt: string;
  updatedAt: string;
  previewPath: string | null;
};
