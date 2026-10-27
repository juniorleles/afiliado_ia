import { isIngredientOnlyLabel, isIncompleteFragment, isWeakCommercialLead } from "@/lib/lp-generator/structure";
import { dedupeSalesCopy } from "@/lib/page-blueprint/dedupe";
import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";
import type { Defect } from "@/lib/quality-gate/types";

export const CONTENT_QUALITY_RULE_VERSION = 1 as const;

export type ContentQualityStatus = "PASS" | "REPAIRED" | "BLOCKED";

export type ContentQualityReport = {
  status: ContentQualityStatus;
  defects: Defect[];
  repairs: string[];
  copy: SalesCopy;
};

const TESTIMONIAL = /\b(verified buyer|testimonial|★★|five stars|i tried this and)\b/i;
const MEDICAL = /\b(clinically proven|backed by (?:clinical|scientific) research|cures?|treats?|diagnos|doctors? worldwide|erases wrinkles)\b/i;
const HTML_MARK = /<[^>]+>|&nbsp;|{\s*\//;

function defect(id: string, message: string, evidence: string[]): Defect {
  return {
    id,
    kind: "EDITORIAL_QUALITY",
    severity: "BLOCKING",
    gate: "EDITORIAL_QUALITY_GATE",
    message,
    evidence,
    files: [],
    fixable: true,
    acceptance: "commercial identity and complete grounded sentences are required for PREVIEW_READY",
  };
}

function walk(copy: SalesCopy): string[] {
  return [
    copy.headline.text,
    copy.subheadline?.text,
    copy.introduction.text,
    ...copy.sections.flatMap((section) => [section.headline.text, ...section.body.map((item) => item.text), ...section.items.map((item) => item.text.text)]),
    ...copy.faq.flatMap((item) => [item.question.text, item.answer.text]),
  ].filter((item): item is string => Boolean(item));
}

export function inspectContentQuality(input: {
  copy: SalesCopy;
  contract: ProductContract;
  brief: ConversionBrief;
}): Defect[] {
  const defects: Defect[] = [];
  const name = input.contract.identity.productName;
  const ingredients = (input.contract.components ?? []).map((item) => item.name);
  const headline = input.copy.headline.text.trim();

  if (!headline) {
    defects.push(defect("headline-empty", "Headline is empty.", ["headline"]));
  } else if (isWeakCommercialLead(headline, name, ingredients) || isIngredientOnlyLabel(headline, name)) {
    defects.push(defect("headline-ingredient", "Headline is an ingredient or a weak lead, not the product identity.", [headline]));
  } else if (!headline.toLowerCase().includes(name.toLowerCase()) && headline !== input.contract.valueProposition?.headline?.text) {
    defects.push(defect("headline-identity", "Headline does not present the product identity.", [headline]));
  }

  for (const [i, text] of walk(input.copy).entries()) {
    if (HTML_MARK.test(text) || isIncompleteFragment(text)) {
      defects.push(defect(`fragment-${i}`, "Copy contains an incomplete or HTML fragment.", [text]));
    }
    if (TESTIMONIAL.test(text)) defects.push(defect(`testimonial-${i}`, "Copy contains a testimonial that is not in the contract.", [text]));
    if (MEDICAL.test(text)) defects.push(defect(`medical-${i}`, "Copy contains an ungrounded medical promise.", [text]));
  }

  if (input.copy.cta.action === "AUTHORIZED_HOP" && input.contract.cta.state !== "AUTHORIZED") {
    defects.push(defect("cta-no-hop", "A purchase CTA exists without an authorized HopLink.", ["cta"]));
  }

  if ((input.copy.offerMicrocopy?.length ?? 0) > 0 && !(input.contract.offer?.packages.length)) {
    defects.push(defect("offer-unverified", "Offers are presented without verified packages.", ["offerMicrocopy"]));
  }

  const repeats = countContentRepetitions(input.copy);
  if (repeats >= 3) {
    defects.push(defect("repetition", "Copy repeats the same statements too often.", [`repeats=${repeats}`]));
  }

  return defects;
}

/** Same counter the 54G inspector used: long texts that appear more than once. */
export function countContentRepetitions(copy: SalesCopy): number {
  const keys = walk(copy).map((item) => item.toLowerCase().replace(/\s+/g, " ").trim()).filter((item) => item.length > 16);
  const seen = new Set<string>();
  let repeats = 0;
  for (const key of keys) {
    if (seen.has(key)) repeats += 1;
    seen.add(key);
  }
  return repeats;
}

export function repairContentQuality(input: {
  copy: SalesCopy;
  contract: ProductContract;
  brief: ConversionBrief;
}): ContentQualityReport {
  const repairs: string[] = [];
  let copy: SalesCopy = { ...input.copy, sections: input.copy.sections.map((section) => ({ ...section, body: [...section.body], items: [...section.items] })) };
  const name = input.contract.identity.productName;
  const ingredients = (input.contract.components ?? []).map((item) => item.name);

  if (isWeakCommercialLead(copy.headline.text, name, ingredients) || isIngredientOnlyLabel(copy.headline.text, name) || MEDICAL.test(copy.headline.text)) {
    copy = {
      ...copy,
      headline: { ...copy.headline, text: name, contractPaths: ["identity.productName"] },
    };
    repairs.push("headline reset to product identity");
  }

  const filterText = (text: string) => !HTML_MARK.test(text) && !isIncompleteFragment(text) && !TESTIMONIAL.test(text) && !MEDICAL.test(text);
  copy = {
    ...copy,
    faq: copy.faq.filter((item) => filterText(item.question.text) && filterText(item.answer.text)),
    sections: copy.sections
      .map((section) => ({
        ...section,
        body: section.body.filter((item) => filterText(item.text)),
        items: section.sectionType === "faq" ? [] : section.items.filter((item) => filterText(item.text.text)),
      }))
      .filter((section) => section.sectionType === "hero" || section.sectionType === "legal" || (section.sectionType === "faq" && copy.faq.length > 0) || section.body.length + section.items.length > 0),
  };
  copy = dedupeSalesCopy(copy);

  const defects = inspectContentQuality({ copy, contract: input.contract, brief: input.brief });
  return {
    status: defects.length === 0 ? (repairs.length ? "REPAIRED" : "PASS") : "BLOCKED",
    defects,
    repairs,
    copy,
  };
}
