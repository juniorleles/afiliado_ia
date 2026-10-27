import type { SectionType } from "@/lib/conversion-strategy/types";

export const PRESELL_SLOTS = [
  "HERO",
  "PRODUCT_OVERVIEW",
  "KEY_DIFFERENTIATORS",
  "HOW_IT_WORKS",
  "INGREDIENTS_OR_SPECIFICATIONS",
  "PRODUCT_CONSIDERATIONS",
  "FAQ",
  "OFFICIAL_OFFER_HANDOFF",
  "LEGAL_DISCLOSURE",
] as const;

export type PresellSlot = (typeof PRESELL_SLOTS)[number];

export type PresellCategory = "SUPPLEMENT" | "BEAUTY" | "ELECTRONICS" | "GENERAL";

export type PresellCtaStatus = "AUTHORIZED" | "PREVIEW_ONLY" | "BLOCKED_PLACEHOLDER";

export type PresellSlotDecision = {
  slot: PresellSlot;
  include: boolean;
  status: "SELECTED" | "OMITTED";
  renderAs: SectionType | SectionType[];
  reason: string;
  selectionReason: string | null;
  omissionReason: string | null;
  evidenceIds: string[];
  availableFacts: string[];
  missingFacts: string[];
};

export type PresellPlan = {
  version: 1;
  objective: "INFORM_THEN_HANDOFF";
  category: PresellCategory;
  sequence: PresellSlot[];
  slots: PresellSlotDecision[];
  selected: PresellSlot[];
  omitted: PresellSlot[];
  cta: {
    status: PresellCtaStatus;
    label: string | null;
    href: string | null;
    reason: string;
  };
  independentReviewClaim: false;
};
