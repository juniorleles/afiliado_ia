export const SECTION_IDS = [
  "hero",
  "problem",
  "agitation",
  "solution",
  "benefits",
  "ingredients",
  "scientific-evidence",
  "testimonials",
  "comparison",
  "faq",
  "guarantee",
  "cta",
  "footer",
  "seo",
  "schema",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type EvidenceOrigin = "ProductFacts" | "MarketIntelligenceAnalysis" | "StrategyDecision";

export type EvidenceUse = {
  origin: EvidenceOrigin;
  field: string;
  text: string;
};

export type CopyScores = {
  copyScore: number;
  readability: number;
  evidenceScore: number;
  persuasionScore: number;
  complianceScore: number;
};

export type SectionGeneration = {
  sectionId: SectionId;
  generatedContent: Record<string, unknown> | null;
  reasoning: string[];
  evidenceUsed: EvidenceUse[];
  confidence: number;
  warnings: string[];
  generationTime: number;
  status: "GENERATED" | "FAILED";
  inputFingerprint: string;
  cached: boolean;
  scores: CopyScores;
};

export type GeneratedSections = {
  version: 1;
  campaignId: number;
  generatedAt: string;
  averageGenerationTimeMs: number;
  sections: SectionGeneration[];
};
