/**
 * Operational context: returns/shipping evidence talks about fees, refunds and
 * where to send packages. Inside it, pricing and manufacturer are topics only
 * when the text asserts a product price or a manufacturer identity; incidental
 * vocabulary ("at your cost", "back to the manufacturer") is not an assertion.
 */

import type { GenerationTopic } from "@/lib/ai/generation-plan";

export const OPERATIONAL_EVIDENCE_FIELDS: ReadonlySet<string> = new Set(["returnsInformation", "shippingInformation"]);

/** Topics that may cross-reference each other inside authorized operational evidence. */
export const OPERATIONAL_TOPIC_FAMILY: ReadonlySet<GenerationTopic> = new Set<GenerationTopic>(["returns", "shipping"]);

/** A returns/shipping slot whose evidence is entirely authorized operational evidence. */
export function isOperationalContextSlot(slot: { topic: GenerationTopic; evidence: ReadonlyArray<{ field: string }> }): boolean {
  return (
    OPERATIONAL_TOPIC_FAMILY.has(slot.topic) &&
    slot.evidence.length > 0 &&
    slot.evidence.every((item) => OPERATIONAL_EVIDENCE_FIELDS.has(item.field))
  );
}

const PRICE_VOCABULARY = /\b(?:price|prices|pricing|priced|msrp|discount(?:s|ed)?|on sale)\b/gi;
const PRODUCT_PRICE =
  /\b(?:products?|bottles?|jars?|units?|supply|kits?|items?)\s+(?:costs?|sells? for|retails? for|is priced|are priced)\b|\bper (?:bottle|jar|unit|pack|box|kit|month|serving)\b/gi;
const COST_AMOUNT = /\bcosts?\s+(?:only\s+|just\s+)?\$\s?\d|\$\s?\d[\d.,]*\s+(?:each|apiece)\b/i;
const OPERATIONAL_SUBJECT =
  /\b(?:shipping|shipped|delivery|postage|returns?|returned|restocking|handling|refunds?|refunded|deduct\w*|fees?|surcharges?|courier|carrier)\b/i;

const MANUFACTURER_ASSERTION =
  /\b(?:manufactured|produced|formulated)\s+(?:by|in|at)\b|\b(?:products?|formula|supplement|it|bottles?)\s+(?:is|are)\s+made by\b|\b(?:manufactures|produces|makes|formulates)\s+(?:the|this|our|its|each|every)\s+(?:products?|formula|supplement|items?|bottles?)\b|\bthe manufacturer (?:of|is|behind)\b|\b(?:is|are|as) the manufacturer\b|,\s*the manufacturer\b|\bmanufacturer(?:'s)?\s+(?:identity|name|information|transparency)\b|\b(?:manufacturing|production)\s+(?:facility|facilities|plant|location)\b|\bc?gmp\b|\bfda[\s-]?(?:registered|inspected|approved)\b/gi;
const MADE_IN_PLACE = /\b[Mm]ade in (?:the )?[A-Z][A-Za-z.]+/g;

function clauses(text: string): string[] {
  return text
    .split(/[.;!?]|,|\s(?:and|but|while)\s/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].map((m) => m[0]);
}

const OFFER_PRICE_FRAME =
  /\b(?:current|sale|regular|package|unit|total|offer|retail|list)\s+prices?\b|\bprices?\s+(?:is|are)\s+\$\s?\d|\b(?:priced|pricing)\b/i;

/**
 * Reimbursement uses "price" as the amount being returned, not as an offer.
 * A clause that also states a commercial price is not reimbursement-only.
 */
function isRefundBasisPriceClause(clause: string): boolean {
  const reimbursement =
    /\b(?:refund(?:s|ed|ing)?|reimburse(?:s|d|ment)?|refundable)\b/i.test(clause) &&
    /\b(?:prices?|purchase price|amount paid)\b/i.test(clause);
  return reimbursement && !isCommercialOfferClause(clause);
}

function isCommercialOfferClause(clause: string): boolean {
  if (matches(clause, PRODUCT_PRICE).length > 0) return true;
  if (new RegExp(COST_AMOUNT.source, COST_AMOUNT.flags).test(clause) && !OPERATIONAL_SUBJECT.test(clause)) return true;
  if (OFFER_PRICE_FRAME.test(clause) && /\$\s?\d/.test(clause)) return true;
  if (/\bmsrp\b|\bon sale\b|\bdiscounts?\b|\bdiscounted\b/i.test(clause)) return true;
  return false;
}

/** Product-price assertions inside operational text. Operational fees are not product pricing. */
export function operationalPricingAssertions(text: string): string[] {
  const hits: string[] = [];
  for (const clause of clauses(text)) {
    for (const hit of matches(clause, PRICE_VOCABULARY)) {
      if (/^prices?$/i.test(hit) && isRefundBasisPriceClause(clause)) continue;
      hits.push(hit);
    }
    hits.push(...matches(clause, PRODUCT_PRICE));
    if (new RegExp(COST_AMOUNT.source, COST_AMOUNT.flags).test(clause) && !OPERATIONAL_SUBJECT.test(clause)) hits.push(clause);
  }
  return hits;
}

/** Manufacturer identity/description assertions inside operational text. */
export function operationalManufacturerAssertions(text: string): string[] {
  return [...matches(text, MANUFACTURER_ASSERTION), ...matches(text, MADE_IN_PLACE)];
}
