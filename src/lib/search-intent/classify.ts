import type { PresellMode, SearchIntent, SearchIntentClassification } from "@/lib/search-intent/types";

const INFORMATIONAL =
  /\b(what is|what are|what'?s|how (?:to|does|do|can)|ingredients?|composition|uses?|meaning|overview|o que [eé]|como (?:funciona|usar)|qu[eé] es|c[oó]mo funciona)\b/i;
const COMMERCIAL =
  /\b(reviews?|review|vs\.?|versus|compare|comparison|alternative|worth it|an[aá]lise|resenha|rese[nñ]as?)\b/i;
const TRANSACTIONAL =
  /\b(buy|price|pricing|order|discount|coupon|shop|purchase|checkout|deal|comprar|pre[cç]o|precio|oferta)\b/i;
const NAVIGATIONAL =
  /\b(official (?:web)?site|homepage|login|site oficial|p[aá]gina oficial|sito ufficiale)\b/i;

function modeFor(intent: SearchIntent): PresellMode {
  if (intent === "TRANSACTIONAL" || intent === "COMMERCIAL_INVESTIGATION") return "PRESELL_BOFU";
  return "PRESELL_EDITORIAL";
}

/**
 * Universal query classification. Brand-only or empty queries stay conservative.
 * Navigational intent never authorizes presenting this page as the official site.
 */
export function classifySearchIntent(query: string): SearchIntentClassification {
  const text = query.replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      query: text,
      intent: "INFORMATIONAL",
      mode: "PRESELL_EDITORIAL",
      confidence: "LOW",
      uncertain: true,
      signals: [],
      reason: "Empty queries stay editorial.",
    };
  }

  const hits: Array<{ intent: SearchIntent; signal: string }> = [];
  if (NAVIGATIONAL.test(text)) hits.push({ intent: "NAVIGATIONAL", signal: "official-site language" });
  if (TRANSACTIONAL.test(text)) hits.push({ intent: "TRANSACTIONAL", signal: "purchase or price language" });
  if (COMMERCIAL.test(text)) hits.push({ intent: "COMMERCIAL_INVESTIGATION", signal: "comparison or review language" });
  if (INFORMATIONAL.test(text)) hits.push({ intent: "INFORMATIONAL", signal: "definition or how-to language" });

  if (hits.length === 0) {
    return {
      query: text,
      intent: "INFORMATIONAL",
      mode: "PRESELL_EDITORIAL",
      confidence: "LOW",
      uncertain: true,
      signals: ["brand-or-product-only"],
      reason: "Ambiguous queries stay editorial. A product name alone does not authorize a buy page or an official-site claim.",
    };
  }

  const unique = [...new Set(hits.map((item) => item.intent))];
  if (unique.length > 1) {
    const conservative: SearchIntent = unique.includes("NAVIGATIONAL")
      ? "NAVIGATIONAL"
      : unique.includes("INFORMATIONAL")
        ? "INFORMATIONAL"
        : unique[0];
    return {
      query: text,
      intent: conservative,
      mode: modeFor(conservative),
      confidence: "LOW",
      uncertain: true,
      signals: hits.map((item) => item.signal),
      reason: "Mixed signals were recorded. The conservative intent was kept.",
    };
  }

  const intent = unique[0];
  return {
    query: text,
    intent,
    mode: modeFor(intent),
    confidence: "HIGH",
    uncertain: false,
    signals: hits.map((item) => item.signal),
    reason:
      intent === "NAVIGATIONAL"
        ? "The query looks for an official destination. This page is still an affiliate presell, not the manufacturer site."
        : `The query matches ${intent.toLowerCase().replace(/_/g, " ")} language.`,
  };
}

export function presellModeForIntent(intent: SearchIntent): PresellMode {
  return modeFor(intent);
}

export function searchIntentCategoryOf(input: { category?: string; productKind?: string }):
  | "SUPPLEMENT"
  | "BEAUTY"
  | "ELECTRONICS"
  | "DIGITAL_PRODUCT"
  | "GENERAL" {
  const blob = `${input.category ?? ""} ${input.productKind ?? ""}`.toLowerCase();
  if (/\b(ebook|course|software|download|digital)\b/.test(blob)) return "DIGITAL_PRODUCT";
  if (/\b(supplement|vitamin|capsule|dietary|probiotic|greens)\b/.test(blob)) return "SUPPLEMENT";
  if (/\b(earbud|headphone|electronic|wireless|battery|bluetooth|charger)\b/.test(blob)) return "ELECTRONICS";
  if (/\b(balm|serum|cream|beauty|cosmetic|skincare|lip)\b/.test(blob)) return "BEAUTY";
  return "GENERAL";
}
