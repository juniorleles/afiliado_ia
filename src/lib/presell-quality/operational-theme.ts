import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";

export const OPERATIONAL_THEMES = [
  "SHIPPING",
  "DELIVERY",
  "RETURNS",
  "REFUND",
  "COMMERCIAL_TERMS",
  "QUANTITY",
  "PRODUCT_FORMAT",
  "SELLER_CONTACT",
  "USAGE",
  "INGREDIENTS",
  "DESCRIPTION",
  "GUARANTEE",
  "WARNINGS",
  "BENEFITS",
  "TESTIMONIAL",
  "CLINICAL",
  "PRICING",
  "MANUFACTURER",
  "OTHER",
] as const;
export type OperationalTheme = (typeof OPERATIONAL_THEMES)[number];

const GAP_THEMES: Record<string, OperationalTheme[]> = {
  quantity: ["QUANTITY"],
  shipping: ["SHIPPING", "DELIVERY"],
  returnsProcess: ["RETURNS", "REFUND"],
  sellerContact: ["SELLER_CONTACT"],
  productFormat: ["PRODUCT_FORMAT"],
  faq: [],
  warnings: ["WARNINGS"],
  benefits: ["BENEFITS"],
  testimonials: ["TESTIMONIAL"],
  clinicalProof: ["CLINICAL"],
  manufacturer: ["MANUFACTURER"],
  pricing: ["PRICING"],
  description: ["DESCRIPTION"],
  ingredients: ["INGREDIENTS"],
  howItWorks: ["USAGE"],
  guarantee: ["GUARANTEE"],
};

export function classifyOperationalThemes(text: string, field = ""): OperationalTheme[] {
  const value = `${field} ${text}`.replace(/\s+/g, " ").trim();
  const lower = value.toLowerCase();
  const found = new Set<OperationalTheme>();
  if (hasQuantity(lower)) found.add("QUANTITY");
  if (hasProductFormat(lower)) found.add("PRODUCT_FORMAT");
  if (hasSellerContact(lower)) found.add("SELLER_CONTACT");
  if (/\b(return|rma|send .+ back|proof of purchase|good physical condition)\b/i.test(lower)) found.add("RETURNS");
  if (/\brefund|money[- ]back|original (method of )?payment|credit card\b/i.test(lower)) found.add("REFUND");
  if (/\b(ship|shipping|usps|carrier|fulfillment|process(ing)? time|order processing|customs)\b/i.test(lower)) found.add("SHIPPING");
  if (/\b(deliver|delivery|transit|destination countr)\b/i.test(lower)) found.add("DELIVERY");
  if (/\b(cancel|not responsible|cannot be held liable|24 hours)\b/i.test(lower)) found.add("COMMERCIAL_TERMS");
  if (/\b(under the tongue|dropper|how to (use|take)|hold for)\b/i.test(lower)) found.add("USAGE");
  if (field === "ingredients" || /\b(ingredient|proprietary blend)\b/i.test(lower)) found.add("INGREDIENTS");
  if (field === "description") found.add("DESCRIPTION");
  if (field === "guarantee" || /\b(60[- ]day|money[- ]back guarantee)\b/i.test(lower)) found.add("GUARANTEE");
  if (field === "warnings" || /\b(consult|pregnant|do not exceed)\b/i.test(lower)) found.add("WARNINGS");
  if (/\b(clinically proven|blood sugar|weight loss|treat |cure |prevent )\b/i.test(lower)) found.add("BENEFITS");
  if (/\b(i (tried|used|bought)|star review|testimonial)\b/i.test(lower)) found.add("TESTIMONIAL");
  if (/\b(clinical trial|peer[- ]reviewed|published study)\b/i.test(lower)) found.add("CLINICAL");
  if (field === "pricing" || /\b(price|\$\d+|usd \d+)\b/i.test(lower)) found.add("PRICING");
  if (field === "manufacturer" || /\bmanufactured by\b/i.test(lower)) found.add("MANUFACTURER");
  if (!found.size) found.add("OTHER");
  return [...found];
}

export function primaryOperationalTheme(text: string, field = ""): OperationalTheme {
  const themes = classifyOperationalThemes(text, field);
  const order: OperationalTheme[] = [
    "RETURNS",
    "REFUND",
    "SHIPPING",
    "DELIVERY",
    "COMMERCIAL_TERMS",
    "QUANTITY",
    "PRODUCT_FORMAT",
    "SELLER_CONTACT",
    "USAGE",
    "GUARANTEE",
    "WARNINGS",
    "BENEFITS",
    "TESTIMONIAL",
    "CLINICAL",
    "PRICING",
    "MANUFACTURER",
    "INGREDIENTS",
    "DESCRIPTION",
    "OTHER",
  ];
  return order.find((theme) => themes.includes(theme)) ?? "OTHER";
}

export function candidateSupportsGap(gapField: string, candidate: {
  field: string;
  extractedValue?: string;
  text?: string;
  originalExcerpt?: string;
}): boolean {
  if (candidate.field === gapField) return true;
  const text = `${candidate.extractedValue ?? candidate.text ?? ""} ${candidate.originalExcerpt ?? ""}`;
  const themes = classifyOperationalThemes(text, candidate.field);
  const required = GAP_THEMES[gapField];
  if (!required) return false;
  if (!required.length) return candidate.field === gapField;
  return required.some((theme) => themes.includes(theme));
}

export function operationalTitle(theme: OperationalTheme, text: string): string {
  const titles: Record<OperationalTheme, string> = {
    SHIPPING: "Seller shipping condition",
    DELIVERY: "Seller delivery condition",
    RETURNS: "Seller return procedure",
    REFUND: "Seller refund condition",
    COMMERCIAL_TERMS: "Seller commercial condition",
    QUANTITY: "Pack quantity",
    PRODUCT_FORMAT: "Product format",
    SELLER_CONTACT: "Seller contact channel",
    USAGE: "Usage instruction",
    INGREDIENTS: "Ingredient statement",
    DESCRIPTION: "Product description",
    GUARANTEE: "Guarantee statement",
    WARNINGS: "Warning",
    BENEFITS: "Benefit claim",
    TESTIMONIAL: "Testimonial",
    CLINICAL: "Clinical claim",
    PRICING: "Price",
    MANUFACTURER: "Manufacturer identity",
    OTHER: "Operational note",
  };
  const first = text.replace(/\s+/g, " ").trim().slice(0, 88);
  return first ? `${titles[theme]}` : titles[theme];
}

export function operationalSummary(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const sentence = compact.split(/(?<=[.!?])\s/)[0] || compact;
  return sentence.slice(0, 180);
}

export function operationalPageUse(theme: OperationalTheme): string {
  if (theme === "SHIPPING" || theme === "DELIVERY") {
    return "May appear in a seller-stated shipping section after human approval. Not a delivery promise.";
  }
  if (theme === "RETURNS" || theme === "REFUND" || theme === "GUARANTEE") {
    return "May appear in a seller-stated returns section after human approval. Does not replace the accepted guarantee.";
  }
  if (theme === "COMMERCIAL_TERMS") {
    return "May appear as a seller-stated commercial condition after human approval.";
  }
  if (theme === "SELLER_CONTACT") {
    return "May appear as a seller-stated contact channel after human approval.";
  }
  if (theme === "QUANTITY" || theme === "PRODUCT_FORMAT" || theme === "USAGE") {
    return "May restate an approved usage or format fact only. Do not invent pack size.";
  }
  return "Not eligible for automatic page placement.";
}

export function operationalConditions(text: string, theme: OperationalTheme): string[] {
  const conditions: string[] = ["Seller-stated. Not independently verified.", "Not a manufacturer confirmation."];
  if (/\bholiday/i.test(text)) conditions.push("Holiday delays are disclosed.");
  if (/\binvalid|incomplete|incorrect address/i.test(text)) conditions.push("Applies when address or payment data is invalid.");
  if (/\bcustoms/i.test(text)) conditions.push("Customs delay is destination-specific.");
  if (/\b60 days|sixty/i.test(text)) conditions.push("Time window is limited to the stated period.");
  if (/\byou (pay|will have to pay)|at your cost/i.test(text)) conditions.push("Buyer pays return shipping.");
  if (/\bgood physical condition/i.test(text)) conditions.push("Returned goods must be undamaged.");
  if (theme === "REFUND" && /\boriginal/i.test(text)) conditions.push("Refund returns to the original payment method.");
  return conditions;
}

export function buildOperationalReviewCard(candidate: PreparedReviewCandidate): {
  candidateId: string;
  theme: OperationalTheme;
  title: string;
  summary: string;
  originalExcerpt: string;
  sourceHost: string;
  sourceUrl: string;
  declarationType: string;
  conditions: string[];
  risk: string;
  pageUse: string;
  approvalState: string;
  clusterKey: string;
} {
  const theme = primaryOperationalTheme(candidate.extractedValue, candidate.field);
  return {
    candidateId: candidate.candidateId,
    theme,
    title: operationalTitle(theme, candidate.extractedValue),
    summary: operationalSummary(candidate.extractedValue),
    originalExcerpt: candidate.originalExcerpt,
    sourceHost: candidate.sourceHost,
    sourceUrl: candidate.sourceUrl,
    declarationType: candidate.sourceClass === "SELLER" || candidate.sourceClass === "AFFILIATE_RESOURCE" ? "SELLER_STATED" : candidate.sourceClass,
    conditions: operationalConditions(candidate.extractedValue, theme),
    risk: candidate.riskClass,
    pageUse: operationalPageUse(theme),
    approvalState: candidate.state,
    clusterKey: theme,
  };
}

function hasQuantity(lower: string): boolean {
  if (/\b(return|refund|rma|include all bottles|empty, full|bonus|gifted)\b/.test(lower)) return false;
  if (/\b(business days?|processing time)\b/.test(lower)) return false;
  return /\b(\d+|one|two|three|six)\s*(bottles?|capsules?|servings?|softgels?)\b/.test(lower)
    || /\b(serving size|net wt|pack of \d+|count per (bottle|serving))\b/.test(lower);
}

function hasProductFormat(lower: string): boolean {
  return /\b(liquid drops?|dropper|sublingual|capsule|softgel|tablet)\b/.test(lower);
}

function hasSellerContact(lower: string): boolean {
  if (/\breturn address\b/.test(lower)) return false;
  if (/\bemail us back\b/.test(lower) && /\brma\b/.test(lower)) return false;
  const obfuscatedOnly = /\[email protected\]/.test(lower) && !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(lower.replace(/\[email protected\]/g, ""));
  if (obfuscatedOnly) return false;
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(lower)
    || /\b(\+?\d[\d .-]{7,}\d)\b/.test(lower)
    || /\b(customer service|support hours|call us at|phone)\b/.test(lower);
}
