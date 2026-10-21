import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { EditorialIssue, EditorialQualityReport, PageBlueprint, SalesCopy } from "@/lib/page-blueprint/types";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function evaluateEditorialQuality(input: {
  copy: SalesCopy;
  blueprint: PageBlueprint;
  contract: ProductContract;
  brief: ConversionBrief;
}): EditorialQualityReport {
  const blocking: EditorialIssue[] = [];
  const major: EditorialIssue[] = [];
  const minor: EditorialIssue[] = [];

  if (!input.copy.headline.text.trim()) {
    blocking.push({ code: "HEADLINE_EMPTY", severity: "BLOCKING", message: "headline is empty", path: "headline" });
  } else if (
    !input.copy.headline.text.includes(input.contract.identity.productName) &&
    input.copy.headline.text !== input.contract.valueProposition?.headline?.text
  ) {
    blocking.push({ code: "HEADLINE_UNGROUNDED", severity: "BLOCKING", message: "headline is not a contract statement", path: "headline" });
  }

  if (input.copy.cta.action === "AUTHORIZED_HOP" && !purchaseCtaAllowed(input.contract)) {
    blocking.push({ code: "CTA_UNAUTHORIZED", severity: "BLOCKING", message: "copy hops without authorization", path: "cta" });
  }
  if (input.brief.conversionGoal === "INFORM" && input.copy.cta.action === "AUTHORIZED_HOP") {
    blocking.push({ code: "CTA_GOAL_MISMATCH", severity: "BLOCKING", message: "inform goal cannot carry a commercial hop", path: "cta" });
  }
  if (input.copy.cta.action === "AUTHORIZED_HOP" && input.brief.conversionGoal === "SEND_TO_OFFER" && input.copy.offerMicrocopy.length === 0) {
    major.push({ code: "OFFER_MISSING", severity: "MAJOR", message: "offer goal has no package microcopy", path: "offerMicrocopy" });
  }

  const offerSection = input.copy.sections.find((item) => item.sectionType === "offers");
  if (offerSection && input.copy.offerMicrocopy.length === 0) {
    blocking.push({ code: "OFFER_EMPTY", severity: "BLOCKING", message: "offers section has no verified packages", path: "sections.offers" });
  }

  for (const [i, entry] of input.copy.faq.entries()) {
    if (!entry.answer.text.trim()) {
      blocking.push({ code: "FAQ_UNANSWERED", severity: "BLOCKING", message: "FAQ has no grounded answer", path: `faq[${i}]` });
    }
  }

  for (const section of input.blueprint.sections) {
    if (section.renderEligibility === "ELIGIBLE" && section.body.length === 0 && section.items.length === 0 && section.sectionType !== "hero") {
      major.push({ code: "SECTION_EMPTY", severity: "MAJOR", message: `${section.sectionType} has no useful content`, path: section.sectionId });
    }
  }

  const seen = new Map<string, string>();
  for (const section of input.copy.sections) {
    for (const item of [...section.body, ...section.items.map((row) => row.text)]) {
      const key = keyOf(item.text);
      if (key.length < 12) continue;
      const prior = seen.get(key);
      if (prior && prior !== section.sectionType) {
        minor.push({
          code: "FACT_REPEATED",
          severity: "MINOR",
          message: `the same statement appears in ${prior} and ${section.sectionType}`,
          path: section.sectionType,
        });
      } else {
        seen.set(key, section.sectionType);
      }
    }
  }

  const eligible = input.blueprint.sections.filter((item) => item.renderEligibility === "ELIGIBLE");
  const thin = eligible.filter((item) => item.body.length + item.items.length <= 1 && item.sectionType !== "legal" && item.sectionType !== "cta_final" && item.sectionType !== "hero");
  if (thin.length >= 4 && eligible.length >= 8) {
    minor.push({ code: "THIN_SECTIONS", severity: "MINOR", message: "several sections carry only one fact", path: "sections" });
  }

  if (input.copy.offerMicrocopy.some((pack) => pack.popularityLabel && !(input.contract.offer?.packages ?? []).some((real) => real.popularityLabel === pack.popularityLabel))) {
    blocking.push({ code: "POPULARITY_INVENTED", severity: "BLOCKING", message: "popularity label is not in the contract", path: "offerMicrocopy" });
  }

  return {
    blocking,
    major,
    minor,
    notes: [
      "Editorial checks do not produce a conversion score.",
      "Aesthetic judgment stays NOT_EVALUATED without multimodal review.",
      `producer=${input.copy.producer}`,
    ],
    conversionScore: null,
  };
}
