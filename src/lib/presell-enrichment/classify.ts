import { isHealthEfficacyStatement } from "@/lib/ingredient-context";
import { isOperationalFulfillmentCopy, isPointerOrReferenceCopy, isPromotionalOrCta } from "@/lib/import-heuristics";
import { statementFindings } from "@/lib/product-contract/claims";
import type { EvidenceClass, EvidenceUseRestriction, PresellSemanticField } from "@/lib/presell-enrichment/types";

const TESTIMONIAL =
  /\b(verified buyer|testimonial|★★|five stars|i tried this and|changed my life|before and after)\b/i;
const PRICE_MARK = /[$€£]\s*\d|\b\d+\s*%\s*off\b|\bfree shipping\b|\bbuy \d+ get\b/i;
const MEDICAL_PROHIBITED =
  /\b(clinically proven|scientifically proven|cures?|treats?|heals?|diagnos|doctors? worldwide|erases? wrinkles|guaranteed results?|miracle)\b/i;
const AFFILIATE_PROGRAM =
  /\b(epc|clickbank|copywriters?|vsl crafted|massive income|top affiliates|autoship|hopid|a-list copy)\b/i;
const DOCTOR_ENDORSEMENT = /\b(endorsed|recommended|approved|trusted)\b.{0,40}\b(doctors?|physicians?|experts?)\b/i;
const HEALTH_OUTCOME =
  /\b(designed to address|root cause|uncontrollable|amazing formula|works so well|targets? the)\b/i;
const HEALTH_NOUN = /\b(health|healthy|bladder|urinary|immune|gut|hormone|weight|pain|disease|microbiome|pelvic)\b/i;

export function classifyEvidence(input: {
  field: PresellSemanticField;
  text: string;
  operatorAttested?: boolean;
}): { verification: EvidenceClass; restriction: EvidenceUseRestriction; notes: string[] } {
  const text = input.text.replace(/\s+/g, " ").trim();
  const notes: string[] = [];

  if (!text) {
    return { verification: "UNVERIFIED", restriction: "BLOCKED", notes: ["empty text"] };
  }
  if (/\b(toxin cleanse|clears your entire body)\b/i.test(text)) {
    return { verification: "PROHIBITED", restriction: "BLOCKED", notes: ["detox or whole-body outcome language is not restated as a fact"] };
  }
  if (input.field === "PRODUCT_OVERVIEW" && (isOperationalFulfillmentCopy(text) || isPointerOrReferenceCopy(text) || /\b(customer support agents|reply as soon as possible|every email or phone call|patients may experience|results might vary from individual|improvement faster)\b/i.test(text))) {
    return { verification: "UNVERIFIED", restriction: "BLOCKED", notes: ["support, fulfillment, pointer, or outcome-variance copy is not a product description"] };
  }
  if (TESTIMONIAL.test(text)) {
    return { verification: "UNVERIFIED", restriction: "BLOCKED", notes: ["testimonial is not independent evidence"] };
  }
  if (AFFILIATE_PROGRAM.test(text)) {
    return { verification: "PROHIBITED", restriction: "BLOCKED", notes: ["affiliate-program copy is not product evidence"] };
  }
  if (PRICE_MARK.test(text)) {
    return {
      verification: "SELLER_STATED",
      restriction: "NOT_PERMANENT",
      notes: ["promotional price or offer is not treated as a permanent fact"],
    };
  }
  if (isPromotionalOrCta(text) && input.field !== "WARRANTY_OR_GUARANTEE") {
    const operationalFaq =
      input.field === "FAQ" &&
      isOperationalFulfillmentCopy(text) &&
      !/\b(buy now|add to cart|click here|clicking here|order now)\b/i.test(text);
    if (!operationalFaq) {
      return { verification: "PROHIBITED", restriction: "BLOCKED", notes: ["promotional or CTA copy is not restated as a fact"] };
    }
    notes.push("Seller-stated billing or fulfillment FAQ is not treated as a checkout CTA.");
  }
  if (DOCTOR_ENDORSEMENT.test(text) || HEALTH_OUTCOME.test(text) || (HEALTH_NOUN.test(text) && /\b(address|target|support|help|endorsed)\b/i.test(text))) {
    return { verification: "PROHIBITED", restriction: "BLOCKED", notes: ["health or endorsement language is not restated as a fact"] };
  }
  if (MEDICAL_PROHIBITED.test(text) || isHealthEfficacyStatement(text)) {
    return { verification: "PROHIBITED", restriction: "BLOCKED", notes: ["medical or efficacy claim is not restated as a fact"] };
  }

  const findings = statementFindings(text, input.field === "WARRANTY_OR_GUARANTEE" || input.field === "CAUTIONS" ? "OPERATIONAL" : "PROMOTIONAL");
  if (findings.some((item) => item.category === "HEALTH_CLAIM" || item.category === "RESULT_PROMISE" || item.category === "ABSOLUTE_PROMISE" || item.category === "UNATTRIBUTED_AUTHORITY" || item.category === "SUPERLATIVE")) {
    return {
      verification: "PROHIBITED",
      restriction: "BLOCKED",
      notes: findings.map((item) => item.rule),
    };
  }

  if (input.field === "SELLER_CLAIMS" || PRICE_MARK.test(text)) {
    if (PRICE_MARK.test(text)) {
      notes.push("promotional price or offer is not treated as a permanent fact");
      return { verification: "SELLER_STATED", restriction: "NOT_PERMANENT", notes };
    }
    notes.push("seller claim is kept with attribution and is not an independent fact");
    return { verification: "SELLER_STATED", restriction: findings.length ? "BLOCKED" : "ATTRIBUTED_ONLY", notes };
  }

  if (input.operatorAttested && (input.field === "PRODUCT_PURPOSE" || input.field === "PRODUCT_OVERVIEW")) {
    return { verification: "VERIFIED_PRODUCT_FACT", restriction: "PUBLISHABLE", notes: ["operator-attested identity"] };
  }

  if (findings.length > 0) {
    return { verification: "PROHIBITED", restriction: "BLOCKED", notes: findings.map((item) => item.rule) };
  }

  return {
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    notes: ["DIRECT_SOURCE means the source said it; it is not independent verification"],
  };
}

export function isCharacteristicNotBenefit(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (/\b(helps?|supports?|improves?|boosts?|promotes?|prevents?|reduces?|relieves?)\b/i.test(t)) return false;
  return t.length >= 8;
}
