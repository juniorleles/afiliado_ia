import { PRODUCT_CONTRACT_VERSION } from "@/lib/product-contract/types";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_RUBRIC_VERSION,
  RENDERER_V4_ID,
  type CriticalFailureCode,
  type QualityDimension,
} from "@/lib/presell-quality/types";

export type ScreenshotRole = "desktop" | "mobile" | "desktop-viewport" | "mobile-viewport" | "section";

export type PresellScreenshotRef = {
  role: ScreenshotRole;
  path: string;
  generationId: string;
  sha256: string;
  width: number;
  height: number;
};

export type ApprovedAssetRef = {
  id: string;
  eligible: boolean;
  kind?: string | null;
};

export type PresellEvaluationInput = {
  campaignId: number;
  generationId: string;
  productContractVersion: number;
  rendererVersion: string;
  screenshots: {
    desktop: PresellScreenshotRef | null;
    mobile: PresellScreenshotRef | null;
  };
  pageStructure: unknown;
  renderedCopy: string;
  approvedFacts: string[];
  evidenceReferences: string[];
  approvedAssets: ApprovedAssetRef[];
  editorialConstraints: string[];
  rubricVersion: string;
  promptVersion: string;
  previewPath?: string | null;
  pageVersionToken?: string | null;
};

export type ModelDimensionPayload = {
  dimension: QualityDimension;
  score: number;
  rationale: string;
  evidence: string[];
  problems: string[];
  recommendedActions: string[];
};

export type ModelQualityPayload = {
  dimensionScores: ModelDimensionPayload[];
  criticalFailures: CriticalFailureCode[];
  findings: Array<{
    id: string;
    dimension: QualityDimension | "CRITICAL";
    severity: "INFO" | "WARNING" | "BLOCKING";
    message: string;
    evidence: string[];
  }>;
  recommendedActions: Array<{
    id: string;
    action: string;
    allowed: boolean;
    reason: string;
  }>;
};

export function defaultEvaluationMeta(): {
  productContractVersion: number;
  rendererVersion: string;
  rubricVersion: string;
  promptVersion: string;
} {
  return {
    productContractVersion: PRODUCT_CONTRACT_VERSION,
    rendererVersion: RENDERER_V4_ID,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
}
