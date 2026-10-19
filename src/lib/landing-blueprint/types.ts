import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { ProductFacts } from "@/lib/product-facts";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

export const BLUEPRINT_VERSION = 1;

export const SECTION_STATUSES = ["PENDING", "READY", "GENERATING", "GENERATED", "VALIDATED", "FAILED"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const EVIDENCE_SOURCES = ["ProductFacts", "MarketResearchReport", "MarketIntelligenceAnalysis", "StrategyDecision"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export type BlueprintDependency = {
  source: EvidenceSource;
  field: string;
  required: boolean;
  met: boolean;
};

export type BlueprintSection = {
  id: string;
  type: string;
  enabled: boolean;
  priority: number;
  objective: string;
  evidence: BlueprintDependency[];
  tone: string;
  expectedLength: string;
  requiredFacts: string[];
  requiredResearch: string[];
  requiredStrategy: string[];
  dependencies: BlueprintDependency[];
  generationStatus: SectionStatus;
};

export type LandingBlueprint = {
  version: number;
  campaignId: number;
  blueprintVersion: number;
  generatedAt: string;
  language: string;
  strategy: {
    approachId: string | null;
    recommendedApproach: string | null;
    confidence: number | null;
  };
  sections: BlueprintSection[];
  seo: {
    language: string;
    measuredKeywords: number;
    source: string | null;
  };
  schema: {
    plannedTypes: string[];
    productIdentified: boolean;
  };
  validation: {
    readySections: number;
    pendingSections: number;
    blocking: string[];
  };
};

export type BlueprintInput = {
  campaignId: number;
  language: string;
  facts: ProductFacts;
  analysis: MarketIntelligenceAnalysis | null;
  decision: StrategyDecision | null;
  report: MarketResearchReport | null;
  previousVersion?: number;
  now?: string;
};
