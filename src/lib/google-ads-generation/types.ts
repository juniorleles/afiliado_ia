export type AdEvidence = {
  origin: "ProductFacts" | "MarketIntelligenceAnalysis" | "StrategyDecision" | "LandingDocument";
  field: string;
  text: string;
};

export type AdText = {
  text: string;
  evidence: AdEvidence;
};

export type AdSitelink = {
  text: string;
  description: string | null;
  finalUrl: string;
  evidence: AdEvidence;
};

export type AdSnippet = {
  header: "Types" | "Brands";
  values: AdText[];
};

export type AdKeywords = {
  brand: string[];
  commercial: string[];
  problem: string[];
  longTail: string[];
};

export type GoogleAdsPackage = {
  version: 1;
  campaignId: number;
  generatedAt: string;
  durationMs: number;
  approachId: string | null;
  strategyNote: string | null;
  finalUrl: string;
  displayUrl: string;
  displayPaths: [string, string];
  headlines: AdText[];
  descriptions: AdText[];
  sitelinks: AdSitelink[];
  callouts: AdText[];
  structuredSnippets: AdSnippet[];
  keywords: AdKeywords;
  negativeKeywords: string[];
  policy: { status: "PASS" | "FAIL"; issues: string[] };
  assetStrength: { score: number; label: "Excelente" | "Boa" | "Média" | "Fraca" };
  warnings: string[];
};
