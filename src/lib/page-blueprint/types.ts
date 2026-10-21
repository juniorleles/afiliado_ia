import type { CompositionId } from "@/lib/design-system/compose";
import type { ConversionGoal, MissingEvidenceItem, SectionType, StrategyStatus, TrafficIntent } from "@/lib/conversion-strategy/types";

export const PAGE_BLUEPRINT_VERSION = 1 as const;
export const SALES_COPY_VERSION = 1 as const;

export type CopyProducer = "DETERMINISTIC_OFFLINE" | "EDITORIAL_ADAPTER";

export type RenderEligibility = "ELIGIBLE" | "WITHHELD" | "INSUFFICIENT";

export type VisualIntent = "PRODUCT_IMAGE" | "OFFER_CARDS" | "TEXT" | "NONE";

export type GroundedText = {
  text: string;
  evidenceRefs: string[];
  contractPaths: string[];
  producer: CopyProducer;
};

export type CopyItem = {
  title?: GroundedText;
  text: GroundedText;
};

export type SectionCopy = {
  sectionType: SectionType;
  headline: GroundedText;
  body: GroundedText[];
  items: CopyItem[];
  cta?: GroundedText;
};

export type SalesCopy = {
  copyVersion: typeof SALES_COPY_VERSION;
  producer: CopyProducer;
  headline: GroundedText;
  subheadline?: GroundedText;
  valueProposition?: GroundedText;
  introduction: GroundedText;
  sections: SectionCopy[];
  offerMicrocopy: Array<{
    label: string;
    quantityText?: string;
    totalPrice?: string;
    unitPrice?: string;
    popularityLabel?: string;
    evidenceRefs: string[];
  }>;
  cta: {
    action: "AUTHORIZED_HOP" | "NONE";
    label?: GroundedText;
    href?: string;
    caption?: GroundedText;
  };
  closing?: GroundedText;
  faq: Array<{ question: GroundedText; answer: GroundedText }>;
};

export type BlueprintSection = {
  sectionId: string;
  sectionType: SectionType;
  commercialPurpose: string;
  headline: GroundedText;
  body: GroundedText[];
  supportingFacts: string[];
  evidenceRefs: string[];
  visualIntent: VisualIntent;
  renderEligibility: RenderEligibility;
  items: CopyItem[];
};

export type PageBlueprint = {
  blueprintVersion: typeof PAGE_BLUEPRINT_VERSION;
  producer: CopyProducer;
  productIdentity: {
    productName: string;
    brand?: string;
    productKind?: string;
    language: "en";
  };
  conversionGoal: ConversionGoal;
  trafficIntent: TrafficIntent;
  strategyStatus: StrategyStatus;
  narrative: {
    shape: "IMAGE_LED" | "EDITORIAL_LED" | "FACTS_LED";
    density: "thin" | "full";
    compositionHint: CompositionId;
    throughline: GroundedText;
  };
  messageHierarchy: GroundedText[];
  sections: BlueprintSection[];
  images: {
    hero?: { src: string; alt: string; evidenceRefs: string[] };
    gallery: Array<{ src: string; alt: string }>;
  };
  offers: SalesCopy["offerMicrocopy"];
  cta: SalesCopy["cta"];
  absence: MissingEvidenceItem[];
  publication: { approval: "REQUIRED"; blockers: string[] };
};

export type EditorialIssue = {
  code: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  message: string;
  path: string;
};

export type EditorialQualityReport = {
  blocking: EditorialIssue[];
  major: EditorialIssue[];
  minor: EditorialIssue[];
  notes: string[];
  conversionScore: null;
};

export type GroundingReport = {
  ok: boolean;
  violations: Array<{ rule: string; path: string; message: string }>;
};
