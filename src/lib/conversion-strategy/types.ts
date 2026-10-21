import type { DataState } from "@/lib/product-contract/types";
import type { CompositionId } from "@/lib/design-system/compose";

export const CONVERSION_BRIEF_VERSION = 1 as const;

export type KnowledgeClass = "FACT" | "HYPOTHESIS" | "EDITORIAL_SUGGESTION";

export type UseRestriction = "PUBLISHABLE" | "INTERNAL_ONLY" | "WITHHELD";

export type StrategyStatus = "READY" | "PARTIAL" | "INSUFFICIENT_DATA" | "BLOCKED";

export type ConversionGoal = "SEND_TO_OFFER" | "SEND_TO_DETAILS" | "INFORM";

export type TrafficIntent = "INFORMATION" | "EVALUATION" | "CONSIDERATION";

export type SectionType =
  | "hero"
  | "presentation"
  | "differentiators"
  | "benefits"
  | "demonstration"
  | "specifications"
  | "offers"
  | "guarantee"
  | "trust"
  | "faq"
  | "cta_final"
  | "legal";

export type TracedClaim = {
  id: string;
  text: string;
  class: KnowledgeClass;
  evidenceRefs: string[];
  sourceUrl: string | null;
  verification: DataState | "FROM_CONTRACT";
  restriction: UseRestriction;
  contractPath: string;
};

export type DecisionTrace = {
  id: string;
  decision: string;
  reason: string;
  evidenceRefs: string[];
  class: KnowledgeClass;
};

export type CustomerQuestion = {
  question: string;
  answerable: boolean;
  class: KnowledgeClass;
  evidenceRefs: string[];
  restriction: UseRestriction;
  contractPath: string | null;
};

export type PackagePresentation = {
  label: string;
  quantityText?: string;
  totalPrice?: string;
  unitPrice?: string;
  originalPrice?: string;
  savings?: string;
  popularityLabel?: string;
  evidenceRefs: string[];
  highlight: boolean;
};

export type SectionPlanItem = {
  id: string;
  type: SectionType;
  commercialGoal: string;
  priority: number;
  include: boolean;
  factPaths: string[];
  contentNeeded: string[];
  available: string[];
  missing: string[];
  displayWhen: string;
  positionReason: string;
};

export type MissingEvidenceItem = {
  path: string;
  state: DataState;
  reason: string | null;
  neededFor: string;
  class: "EDITORIAL_SUGGESTION";
  restriction: "INTERNAL_ONLY";
};

export type VisualPriority = {
  need: string;
  why: string;
  class: "EDITORIAL_SUGGESTION";
  restriction: "INTERNAL_ONLY";
};

export type ConversionBrief = {
  briefVersion: typeof CONVERSION_BRIEF_VERSION;
  status: StrategyStatus;
  /** Editorial completeness. Never publication approval. */
  editorialQuality: "READY" | "PARTIAL" | "INSUFFICIENT_DATA";
  /** Publication stays human-gated. BLOCKED only when a safety gate failed. */
  publication: { approval: "REQUIRED"; blockers: string[] };
  productIdentity: {
    productName: string;
    brand?: string;
    productKind?: string;
    language: "en";
  };
  conversionGoal: ConversionGoal;
  /** Free noun from the source, or unspecified. Never a layout switch. */
  productCategory: string;
  trafficIntent: TrafficIntent;
  audienceHypothesis: TracedClaim;
  valueProposition?: TracedClaim;
  primaryMessage?: TracedClaim;
  keyDifferentiators: TracedClaim[];
  customerQuestions: CustomerQuestion[];
  objections: TracedClaim[];
  benefitCandidates: TracedClaim[];
  offerStrategy: {
    mode: "PACKAGES" | "NO_VERIFIED_PRICE" | "INSUFFICIENT_CONTEXT";
    packageCount: number;
    notes: TracedClaim[];
  };
  packagePresentation: PackagePresentation[];
  ctaStrategy: {
    action: "AUTHORIZED_HOP" | "NONE";
    href?: string;
    label?: string;
    reason: string;
  };
  trustSignals: TracedClaim[];
  sectionPlan: SectionPlanItem[];
  visualPriorities: VisualPriority[];
  creativeBrief: {
    compositionHint: CompositionId;
    narrativeShape: "IMAGE_LED" | "EDITORIAL_LED" | "FACTS_LED";
    density: "thin" | "full";
    notes: TracedClaim[];
  };
  missingEvidence: MissingEvidenceItem[];
  decisions: DecisionTrace[];
};
