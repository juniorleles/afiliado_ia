import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import { stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SectionType } from "@/lib/conversion-strategy/types";
import type {
  PresellCategory,
  PresellCtaStatus,
  PresellPlan,
  PresellSlot,
  PresellSlotDecision,
} from "@/lib/presell-strategy/types";
import { PRESELL_SLOTS } from "@/lib/presell-strategy/types";

const SLOT_RENDER: Record<PresellSlot, SectionType | SectionType[]> = {
  HERO: "hero",
  PRODUCT_OVERVIEW: "presentation",
  KEY_DIFFERENTIATORS: "differentiators",
  HOW_IT_WORKS: "how_it_works",
  INGREDIENTS_OR_SPECIFICATIONS: "specifications",
  PRODUCT_CONSIDERATIONS: "trust",
  FAQ: "faq",
  OFFICIAL_OFFER_HANDOFF: ["offers", "cta_final"],
  LEGAL_DISCLOSURE: "legal",
};

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function presellCategoryOf(input: { category?: string; productKind?: string }): PresellCategory {
  const blob = `${input.category ?? ""} ${input.productKind ?? ""}`.toLowerCase();
  if (/\b(supplement|vitamin|capsule|dietary|probiotic|greens)\b/.test(blob)) return "SUPPLEMENT";
  if (/\b(earbud|headphone|electronic|wireless|battery|bluetooth|charger)\b/.test(blob)) return "ELECTRONICS";
  if (/\b(balm|serum|cream|beauty|cosmetic|skincare|lip)\b/.test(blob)) return "BEAUTY";
  return "GENERAL";
}

export function howItWorksHeadline(category: PresellCategory): string {
  if (category === "SUPPLEMENT") return "Directions for Use";
  if (category === "BEAUTY") return "How to apply";
  return "How it works";
}

export function usageDistinctFromFaq(contract: ProductContract): boolean {
  const usage = (contract.usage ?? []).map((item) => keyOf(item.text)).filter(Boolean);
  if (!usage.length) return false;
  const faqAnswers = new Set((contract.faq ?? []).map((item) => keyOf(item.answer)));
  return usage.some((text) => !faqAnswers.has(text));
}

export function shouldIncludeHowItWorks(contract: ProductContract): boolean {
  return usageDistinctFromFaq(contract);
}

export function presellCtaAuthorization(contract: ProductContract): {
  status: PresellCtaStatus;
  label: string | null;
  href: string | null;
  reason: string;
} {
  const href = contract.cta.href?.trim() || null;
  if (href) {
    const hop = stripUnverifiedHop(href);
    if (hop.hopPlaceholder) {
      return {
        status: "BLOCKED_PLACEHOLDER",
        label: null,
        href: null,
        reason: "Placeholder hop values are not a commercial destination.",
      };
    }
  }
  if (!purchaseCtaAllowed(contract) || !href) {
    return {
      status: "PREVIEW_ONLY",
      label: null,
      href: null,
      reason: "No authorized official-offer destination is available. Preview stays without an active purchase CTA.",
    };
  }
  const label = contract.cta.label?.trim() || (contract.offer?.packages.length ? "View Official Offer" : "Visit Official Website");
  return {
    status: "AUTHORIZED",
    label,
    href,
    reason: "An authorized official destination is present.",
  };
}

function facts(values: Array<string | undefined | null>): string[] {
  return values.filter((item): item is string => Boolean(item && item.trim()));
}

function decide(input: {
  slot: PresellSlot;
  include: boolean;
  available: string[];
  missing: string[];
  reason: string;
}): PresellSlotDecision {
  return {
    slot: input.slot,
    include: input.include,
    status: input.include ? "SELECTED" : "OMITTED",
    renderAs: SLOT_RENDER[input.slot],
    reason: input.reason,
    selectionReason: input.include ? input.reason : null,
    omissionReason: input.include ? null : input.reason,
    evidenceIds: [],
    availableFacts: input.available,
    missingFacts: input.include ? [] : input.missing,
  };
}

export function buildPresellPlan(contract: ProductContract): PresellPlan {
  const category = presellCategoryOf({
    category: contract.identity.productKind,
    productKind: contract.identity.productKind,
  });
  const cta = presellCtaAuthorization(contract);
  const overview = facts([contract.description?.text, contract.valueProposition?.headline?.text]);
  const identityKeys = new Set(facts([contract.identity.productName, contract.identity.productKind]).map(keyOf));
  const differentiators = (contract.features ?? []).map((item) => item.text).filter((text) => !identityKeys.has(keyOf(text)));
  const usage = (contract.usage ?? []).map((item) => item.text);
  const composition = [
    ...(contract.specifications ?? []).map((item) => item.name),
    ...(contract.components ?? []).map((item) => item.name),
  ];
  const considerations = facts([
    ...(contract.cautions ?? []).map((item) => item.text),
    ...(contract.operational?.returns ?? []).map((item) => item.statement),
    ...(contract.operational?.shipping ?? []).map((item) => item.statement),
  ]);
  const faq = (contract.faq ?? []).map((item) => item.question);
  const packages = (contract.offer?.packages ?? []).map((item) => item.label);
  const includeHow = shouldIncludeHowItWorks(contract);
  const includeHandoff = cta.status === "AUTHORIZED" || packages.length > 0;

  const slots: PresellSlotDecision[] = [
    decide({
      slot: "HERO",
      include: true,
      available: facts([contract.identity.productName, contract.identity.productKind]),
      missing: [],
      reason: "Every presell opens with the product identity.",
    }),
    decide({
      slot: "PRODUCT_OVERVIEW",
      include: overview.length > 0,
      available: overview,
      missing: ["description or value proposition"],
      reason: overview.length
        ? "A source-stated overview is available."
        : "No description or value proposition is present, so overview is omitted.",
    }),
    decide({
      slot: "KEY_DIFFERENTIATORS",
      include: differentiators.length > 0,
      available: differentiators,
      missing: ["stated characteristics"],
      reason: differentiators.length
        ? "Source-stated characteristics can be shown."
        : "No stated characteristics remain to show.",
    }),
    decide({
      slot: "HOW_IT_WORKS",
      include: includeHow,
      available: usage,
      missing: ["distinct usage instructions"],
      reason: includeHow
        ? "Usage instructions exist and are not already the FAQ answer."
        : usage.length
          ? "Usage is already answered in the FAQ, so a duplicate how-it-works block is omitted."
          : "No usage instructions are present.",
    }),
    decide({
      slot: "INGREDIENTS_OR_SPECIFICATIONS",
      include: composition.length > 0,
      available: composition,
      missing: ["specifications or composition"],
      reason: composition.length
        ? category === "ELECTRONICS"
          ? "Specifications or included items are available."
          : "Declared composition or specifications are available."
        : "No specifications or composition were provided.",
    }),
    decide({
      slot: "PRODUCT_CONSIDERATIONS",
      include: considerations.length > 0,
      available: considerations,
      missing: ["cautions, returns or shipping"],
      reason: considerations.length
        ? "Cautions or operational facts can be restated without strengthening them."
        : "No cautions or operational facts are present.",
    }),
    decide({
      slot: "FAQ",
      include: faq.length > 0,
      available: faq,
      missing: ["source-answered questions"],
      reason: faq.length ? "The source already answered questions." : "No FAQ is present.",
    }),
    decide({
      slot: "OFFICIAL_OFFER_HANDOFF",
      include: includeHandoff,
      available: facts([cta.label ?? undefined, ...packages]),
      missing: ["authorized destination or verified packages"],
      reason:
        cta.status === "AUTHORIZED"
          ? "An authorized official destination can be offered."
          : packages.length
            ? "Verified packages can be shown without an active purchase CTA."
            : cta.reason,
    }),
    decide({
      slot: "LEGAL_DISCLOSURE",
      include: true,
      available: facts([contract.legal.affiliateDisclosure]),
      missing: [],
      reason: "Affiliate disclosure stays on every presell.",
    }),
  ];

  return {
    version: 1,
    objective: "INFORM_THEN_HANDOFF",
    category,
    sequence: [...PRESELL_SLOTS],
    slots,
    selected: slots.filter((item) => item.include).map((item) => item.slot),
    omitted: slots.filter((item) => !item.include).map((item) => item.slot),
    cta,
    independentReviewClaim: false,
  };
}

export function attachSlotEvidence(
  plan: PresellPlan,
  evidence: Array<{ slot: PresellSlot; evidenceIds: string[] }>,
): PresellPlan {
  const map = new Map(evidence.map((item) => [item.slot, item.evidenceIds]));
  const slots = plan.slots.map((slot) => ({
    ...slot,
    evidenceIds: map.get(slot.slot) ?? slot.evidenceIds,
  }));
  return { ...plan, slots };
}
