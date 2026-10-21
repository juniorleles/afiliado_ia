import type { ConversionBrief, MissingEvidenceItem } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { ProductFacts, SourcePageCategory } from "@/lib/product-facts";

export const ENRICHMENT_VERSION = 1 as const;

export type VerificationState = "SELLER_DECLARED" | "CONFLICTING" | "ABSENT" | "HYPOTHESIS";

export type EnrichmentPriority =
  | "identity"
  | "value_and_differentiators"
  | "features_and_specs"
  | "offer"
  | "guarantee_and_terms"
  | "faq"
  | "authorized_visuals";

export type StructuredRecord = {
  field: string;
  text?: string;
  question?: string;
  name?: string;
  value?: string;
  unit?: string;
  kind?: string;
  packageName?: string;
  totalPrice?: string;
  unitPrice?: string;
  quantity?: string;
};

export type EnrichmentSource = {
  url: string;
  retrievedAt?: string;
  pageCategory?: SourcePageCategory;
  html?: string;
  records?: StructuredRecord[];
};

export type ProvenanceRecord = {
  field: string;
  text: string;
  sourceUrl: string;
  retrievedAt: string | null;
  excerpt: string;
  verification: VerificationState;
  restriction: "PUBLISHABLE" | "INTERNAL_ONLY" | "WITHHELD";
  class: "FACT" | "HYPOTHESIS" | "EDITORIAL_SUGGESTION";
};

export type ConflictRecord = {
  field: string;
  values: Array<{ text: string; sourceUrl: string }>;
  kept: string;
  reason: string;
};

export type CompletenessSnapshot = {
  hasIdentity: boolean;
  hasDescription: boolean;
  hasBrand: boolean;
  featureCount: number;
  specCount: number;
  componentCount: number;
  usageCount: number;
  packageCount: number;
  hasPrice: boolean;
  hasGuarantee: boolean;
  returnsCount: number;
  shippingCount: number;
  faqCount: number;
  authorizedImage: boolean;
  authorizedHop: boolean;
  missingPaths: string[];
};

export type PriorityOutcome = {
  priority: EnrichmentPriority;
  missingBefore: string[];
  filled: string[];
  stillMissing: string[];
};

export type EnrichmentResult = {
  version: typeof ENRICHMENT_VERSION;
  scenarioKey: string;
  beforeFacts: ProductFacts;
  afterFacts: ProductFacts;
  beforeContract: ProductContract;
  afterContract: ProductContract;
  beforeBrief: ConversionBrief;
  afterBrief: ConversionBrief;
  provenance: ProvenanceRecord[];
  conflicts: ConflictRecord[];
  withheld: Array<{ field: string; text: string; reason: string }>;
  visualCandidates: Array<{ url: string; sourceUrl: string; authorized: false }>;
  stillMissing: MissingEvidenceItem[];
  addedFields: string[];
  completenessBefore: CompletenessSnapshot;
  completenessAfter: CompletenessSnapshot;
  priorities: PriorityOutcome[];
};
