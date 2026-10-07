/**
 * Host record domain: end-to-end product analysis snapshot.
 *
 * Frozen analysis records and the stage list. Presence of a stage means that
 * module ran. It is not a judgment of a product. This module does not reach
 * an outside system and does not run another engine.
 */
export type ProductAnalysisMetadata = Record<string, string | number | boolean | null>;

export const PRODUCT_ANALYSIS_STATUSES = ["OK", "REJECTED"] as const;
export type ProductAnalysisStatus = (typeof PRODUCT_ANALYSIS_STATUSES)[number];

export interface ProductAnalysisIssue {
  field: string;
  message: string;
}

export const PRODUCT_ANALYSIS_CONTEXT_MEMBERS = [
  "marketplaceUrl",
  "marketplaceProductId",
  "rawHtml",
  "landingHtml",
  "searchContext",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const PRODUCT_ANALYSIS_STAGES = [
  "ClickBankImporter",
  "LandingPageIntelligence",
  "GoogleSearchIntelligence",
  "CompetitionIntelligence",
  "CommercialIntelligence",
  "ProductIntelligenceReport",
  "Discovery",
  "Opportunity",
  "Traffic",
  "Decision",
  "Workflow",
  "ExecutionPlanner",
  "GoogleAdsCampaignBuilder",
] as const;

export type ProductAnalysisStage = (typeof PRODUCT_ANALYSIS_STAGES)[number];

export const PRODUCT_ANALYSIS_WORKFLOW_ID = "workflow-draft";

export interface ProductAnalysisExecution {
  stage: ProductAnalysisStage;
  count: number;
}

export interface ProductAnalysis {
  productFacts: Record<string, unknown>;
  landingPageEvidence: Record<string, unknown>;
  searchEvidence: Record<string, unknown>;
  competitionEvidence: Record<string, unknown>;
  commercialEvidence: Record<string, unknown>;
  report: Record<string, unknown>;
  evidenceGraph: Record<string, unknown>;
  discovery: Record<string, unknown>;
  opportunityAnalysis: Record<string, unknown>;
  trafficAnalysis: Record<string, unknown>;
  decisionAnalysis: Record<string, unknown>;
  workflow: Record<string, unknown>;
  executionPlan: Record<string, unknown>;
  googleAdsDraft: Record<string, unknown>;
  executions: readonly ProductAnalysisExecution[];
  executionMetadata: ProductAnalysisMetadata;
}

export const PRODUCT_ANALYSIS_SNAPSHOT_KEYS = ["analysisId", "productName", "landingPage", "createdAt", "metadata"] as const;

export interface ProductAnalysisSnapshot {
  analysisId: string;
  productName: string;
  landingPage: string;
  createdAt: string;
  metadata: ProductAnalysisMetadata;
}

export interface ProductAnalysisSnapshotInit {
  analysisId: string;
  productName: string;
  landingPage: string;
  createdAt: string;
  metadata?: ProductAnalysisMetadata;
}

export interface ProductAnalysisResult {
  status: ProductAnalysisStatus;
  issues: ProductAnalysisIssue[];
  analysis: ProductAnalysis | null;
  snapshot: ProductAnalysisSnapshot | null;
  metadata: ProductAnalysisMetadata;
  executionTime: number;
  executions: readonly ProductAnalysisExecution[];
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepProductAnalysis<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepProductAnalysis(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainProductAnalysis<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainProductAnalysis(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainProductAnalysis(inner)])) as T;
  }
  return value;
}

export function createProductAnalysisSnapshot(init: ProductAnalysisSnapshotInit): ProductAnalysisSnapshot {
  return freezeDeepProductAnalysis({
    analysisId: init.analysisId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainProductAnalysis(init.metadata ?? {}),
  });
}
