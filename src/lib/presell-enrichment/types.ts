import type { ProductFacts, SourcePageCategory } from "@/lib/product-facts";
import type { PresellSlot } from "@/lib/presell-strategy/types";

export const PRESELL_ENRICHMENT_VERSION = 1 as const;

export const PRESELL_SEMANTIC_FIELDS = [
  "PRODUCT_OVERVIEW",
  "PRODUCT_PURPOSE",
  "FEATURES",
  "DIFFERENTIATORS",
  "INGREDIENTS",
  "SPECIFICATIONS",
  "HOW_TO_USE",
  "HOW_IT_WORKS",
  "CAUTIONS",
  "FAQ",
  "WARRANTY_OR_GUARANTEE",
  "SELLER_CLAIMS",
  "SOURCE_REFERENCES",
] as const;

export type PresellSemanticField = (typeof PRESELL_SEMANTIC_FIELDS)[number];

export type EvidenceClass =
  | "VERIFIED_PRODUCT_FACT"
  | "SELLER_STATED"
  | "UNVERIFIED"
  | "CONFLICTING"
  | "PROHIBITED";

export type EvidenceUseRestriction =
  | "PUBLISHABLE"
  | "ATTRIBUTED_ONLY"
  | "INTERNAL_ONLY"
  | "NOT_PERMANENT"
  | "BLOCKED";

export type EvidenceRegistryEntry = {
  id: string;
  field: PresellSemanticField;
  originalText: string;
  source: string;
  url: string;
  collectedAt: string | null;
  evidenceType: "HTML" | "STRUCTURED_RECORD" | "JSON_LD" | "META" | "EXISTING_FACT";
  extractionMode?: "HTTP" | "BROWSER_RENDERED";
  verification: EvidenceClass;
  restriction: EvidenceUseRestriction;
  question?: string;
  name?: string;
  value?: string;
  unit?: string;
  notes: string[];
  sourceType?: string;
  sourceClassification?: string;
};

export type EvidenceRegistry = {
  version: typeof PRESELL_ENRICHMENT_VERSION;
  entries: EvidenceRegistryEntry[];
  conflicts: Array<{ field: string; ids: string[]; reason: string }>;
  blocked: string[];
};

export type EnrichedFieldPayload = {
  field: PresellSemanticField;
  texts: string[];
  evidenceIds: string[];
  publishable: boolean;
  reason: string;
};

export type PresellSectionTrace = {
  slot: PresellSlot;
  status: "SELECTED" | "OMITTED";
  evidenceIds: string[];
  selectionReason: string | null;
  omissionReason: string | null;
};

export type PresellEnrichmentResult = {
  version: typeof PRESELL_ENRICHMENT_VERSION;
  facts: ProductFacts;
  registry: EvidenceRegistry;
  fields: EnrichedFieldPayload[];
  benefitCandidates: string[];
  addedFields: string[];
  omittedEmpty: PresellSemanticField[];
  sections: PresellSectionTrace[];
  limitations: string[];
};

export type ExtractedPresellItem = {
  field: PresellSemanticField;
  text: string;
  url: string;
  collectedAt: string | null;
  evidenceType: EvidenceRegistryEntry["evidenceType"];
  extractionMode?: "HTTP" | "BROWSER_RENDERED";
  pageCategory?: SourcePageCategory;
  question?: string;
  name?: string;
  value?: string;
  unit?: string;
  notes?: string[];
};
