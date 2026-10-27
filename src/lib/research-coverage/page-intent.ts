import type { CoverageSlot, PageIntent } from "@/lib/research-coverage/types";

type IntentRule = {
  intent: PageIntent;
  pattern: RegExp;
};

const RULES: IntentRule[] = [
  { intent: "SHIPPING", pattern: /\b(shipping|delivery|fulfillment|dispatch)\b/i },
  { intent: "REFUNDS", pattern: /\b(refunds?|returns?)\b/i },
  { intent: "PRICING", pattern: /\b(pricing|price-list|price list|cost)\b/i },
  { intent: "GUARANTEE_TERMS", pattern: /\b(guarantee|warranty|money[- ]back)\b/i },
  { intent: "INGREDIENTS_OR_SPECIFICATIONS", pattern: /\b(ingredients?|composition|supplement[- ]facts|specifications?|specs)\b/i },
  { intent: "USAGE_INSTRUCTIONS", pattern: /\b(directions?|how[- ]to|usage|how to use)\b/i },
  { intent: "CAUTIONS", pattern: /\b(cautions?|warnings?|safety)\b/i },
  { intent: "FAQ", pattern: /\b(faq|faqs|frequently asked)\b/i },
  { intent: "CONTACT", pattern: /\b(contact|contact-us|customer service)\b/i },
  { intent: "LEGAL", pattern: /\b(privacy|terms|disclaimer|cookies?|legal|references)\b/i },
  { intent: "PRODUCT_DETAILS", pattern: /\b(product|about|details)\b/i },
];

const HINT_NOTE = "Page intent is a fetch-priority hint. It is not evidence that the page is accurate.";

export function classifyPageIntent(input: {
  url: string;
  anchorText?: string;
  title?: string;
}): { intent: PageIntent; confidence: "HIGH" | "MEDIUM" | "LOW"; signals: string[]; notes: string[] } {
  const path = safePath(input.url);
  const anchor = (input.anchorText ?? "").replace(/\s+/g, " ").trim();
  const title = (input.title ?? "").replace(/\s+/g, " ").trim();
  const notes = [HINT_NOTE];
  const hits: Array<{ intent: PageIntent; source: string }> = [];

  for (const rule of RULES) {
    if (rule.pattern.test(path)) hits.push({ intent: rule.intent, source: "path" });
    if (anchor && rule.pattern.test(anchor)) hits.push({ intent: rule.intent, source: "anchor" });
    if (title && rule.pattern.test(title)) hits.push({ intent: rule.intent, source: "title" });
  }

  if (!hits.length) {
    return { intent: "OTHER", confidence: "LOW", signals: ["no-intent-signal"], notes };
  }

  const counts = new Map<PageIntent, Set<string>>();
  for (const hit of hits) {
    const set = counts.get(hit.intent) ?? new Set<string>();
    set.add(hit.source);
    counts.set(hit.intent, set);
  }
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1].size !== a[1].size) return b[1].size - a[1].size;
    return PAGE_INTENT_ORDER.indexOf(a[0]) - PAGE_INTENT_ORDER.indexOf(b[0]);
  });
  const [intent, sources] = ranked[0] ?? ["OTHER", new Set<string>()];
  const confidence = sources.size >= 3 ? "HIGH" : sources.size === 2 ? "MEDIUM" : "LOW";
  return {
    intent,
    confidence,
    signals: [...sources].map((source) => `${intent}:${source}`),
    notes,
  };
}

const PAGE_INTENT_ORDER: PageIntent[] = [
  "PRICING",
  "SHIPPING",
  "REFUNDS",
  "GUARANTEE_TERMS",
  "INGREDIENTS_OR_SPECIFICATIONS",
  "USAGE_INSTRUCTIONS",
  "CAUTIONS",
  "FAQ",
  "PRODUCT_DETAILS",
  "CONTACT",
  "OTHER",
  "LEGAL",
];

export function intentFillsSlots(intent: PageIntent): CoverageSlot[] {
  switch (intent) {
    case "PRICING":
      return ["price", "commercial"];
    case "SHIPPING":
    case "REFUNDS":
      return ["commercial"];
    case "GUARANTEE_TERMS":
      return ["guarantee"];
    case "INGREDIENTS_OR_SPECIFICATIONS":
      return ["composition"];
    case "USAGE_INSTRUCTIONS":
      return ["usage"];
    case "CAUTIONS":
      return ["cautions"];
    case "FAQ":
      return ["faq"];
    case "PRODUCT_DETAILS":
      return ["identity", "category", "features"];
    case "CONTACT":
      return ["faq"];
    default:
      return [];
  }
}

export { PAGE_INTENT_ORDER };

function safePath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}
