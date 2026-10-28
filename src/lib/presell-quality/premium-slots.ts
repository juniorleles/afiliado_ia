import { publicItemText } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import {
  PREMIUM_CTA_CAPTION,
  PREMIUM_CTA_LABEL,
  PREMIUM_ENGINE_ID,
  PREMIUM_ENGINE_VERSION,
} from "@/lib/presell-quality/premium-design";
import { SSL_PLATFORM_QUALIFIER } from "@/lib/presell-quality/approved-generation-facts";

export type PremiumIconName = "leaf" | "truck" | "clock" | "shield" | "card" | "help" | "package";

export type IngredientCardModel = {
  name: string;
  detail: string | null;
};

export type FulfillmentCardModel = {
  kind: "DISPATCH" | "DELIVERY" | "PAYMENT" | "RETURNS";
  title: string;
  body: string;
  note: string | null;
  icon: PremiumIconName;
};

export type EvidenceChip = {
  label: string;
  icon: PremiumIconName;
};

export type GuaranteeView = {
  days: number | null;
  statements: string[];
};

export type FaqView = {
  question: string;
  answer: string;
};

export type PremiumSlots = {
  engineId: typeof PREMIUM_ENGINE_ID;
  engineVersion: typeof PREMIUM_ENGINE_VERSION;
  productName: string;
  headline: string;
  subheadline: string | null;
  introduction: string | null;
  packshot: { src: string; alt: string } | null;
  evidenceChips: EvidenceChip[];
  ingredients: IngredientCardModel[];
  usage: string[];
  fulfillment: FulfillmentCardModel[];
  guarantee: GuaranteeView;
  faq: FaqView[];
  cta: {
    label: string;
    caption: string;
    enabled: false;
    href: null;
  };
  disclosure: string | null;
};

const DISPATCH = /\b(24 working hours|ship (?:your |every )?order|we strive to ship|dispatch)\b/i;
const DELIVERY = /\b(5 to 10 days|fedex|ups|arrive|doorstep|carrier|deliver)\b/i;
const PAYMENT = /\b(one[- ]time payment|ssl)\b/i;
const RETURNS = /\b(return|refund|empty bottles|48 hours|minus shipping)\b/i;
const DAYS = /\b(\d{1,3})\s*-?\s*days?\b/i;

function clean(text: string): string {
  return publicItemText(text).replace(/\s+/g, " ").trim();
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function daysFromText(text: string): number | null {
  const match = text.match(DAYS);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 365 ? value : null;
}

export function presentVisitorCopy(text: string): string {
  return clean(text).replace(
    /^(?:.+?\s+)?(?:is presented by the seller as a product whose declared composition includes|has(?: a seller-declared composition that includes|, according to the seller, a declared composition that includes))\s*/i,
    "According to the seller, the declared composition includes ",
  );
}

function windowsIn(text: string): string[] {
  return [...text.matchAll(/\b\d{1,3}\s*(?:to\s+\d{1,3}\s+)?(?:working\s+)?(?:hours|days)\b/gi)].map((item) => item[0]);
}

export function compactFact(text: string, max = 48, kind?: FulfillmentCardModel["kind"]): string {
  const value = clean(text);
  if (!value) return "";
  const found = windowsIn(value).filter((item) => item.length <= max);
  if (kind === "DISPATCH") {
    const hours = found.find((item) => /hours/i.test(item));
    if (hours) return hours;
  }
  if (kind === "DELIVERY") {
    const range = found.find((item) => /to/i.test(item) && /days/i.test(item));
    if (range) return range;
  }
  if (kind === "RETURNS") {
    const days = [...found].reverse().find((item) => /days/i.test(item));
    if (days) return days;
  }
  if (kind === "PAYMENT" || /\bone[- ]time payment\b/i.test(value)) return "One-time payment";
  if (found[0]) return found[0];
  const first = firstSentences(value, 1).replace(/\.+$/, "");
  if (first.length <= max) return first;
  const clipped = first.slice(0, max).replace(/\s+\S*$/, "").replace(/[,:;.-]+$/, "");
  return clipped || first.slice(0, max);
}

export function splitUsageSentences(items: string[]): string[] {
  if (items.length !== 1) return items;
  const sentences = items[0]
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return sentences.length >= 2 && sentences.length <= 4 ? sentences : items;
}

export function joinSplitSteps(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const value = clean(item);
    if (!value) continue;
    const prev = out[out.length - 1];
    if (prev && !/[.!?]$/.test(prev) && /^[a-z]/.test(value)) {
      out[out.length - 1] = `${prev} ${value}`;
    } else {
      out.push(value);
    }
  }
  return out;
}

function firstSentences(text: string, max = 2): string {
  const parts = clean(text)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= max) return parts.join(" ");
  return parts.slice(0, max).join(" ");
}

export function ingredientCardsFrom(model: V4Model): IngredientCardModel[] {
  const section = model.blueprint.sections.find((item) => item.sectionType === "specifications");
  const rows = section?.items.length ? section.items : section?.body.map((item) => ({ text: item })) ?? [];
  const cards: IngredientCardModel[] = [];
  for (const row of rows) {
    const text = clean(row.text.text);
    if (!text) continue;
    const idx = text.indexOf(":");
    if (idx > 0 && idx <= 48) {
      cards.push({ name: text.slice(0, idx).trim(), detail: text.slice(idx + 1).trim() || null });
    } else {
      cards.push({ name: text, detail: null });
    }
  }
  return cards;
}

function fulfillmentTitle(kind: FulfillmentCardModel["kind"]): string {
  if (kind === "DISPATCH") return "Dispatch";
  if (kind === "DELIVERY") return "Delivery window";
  if (kind === "PAYMENT") return "Payment";
  return "Returns";
}

function fulfillmentIcon(kind: FulfillmentCardModel["kind"]): PremiumIconName {
  if (kind === "DISPATCH") return "clock";
  if (kind === "DELIVERY") return "truck";
  if (kind === "PAYMENT") return "card";
  return "package";
}

function kindOf(text: string): FulfillmentCardModel["kind"] | null {
  if (PAYMENT.test(text) && !RETURNS.test(text) && !DISPATCH.test(text) && !DELIVERY.test(text)) return "PAYMENT";
  if (DISPATCH.test(text) && !DELIVERY.test(text)) return "DISPATCH";
  if (DELIVERY.test(text)) return "DELIVERY";
  if (RETURNS.test(text)) return "RETURNS";
  if (PAYMENT.test(text)) return "PAYMENT";
  return null;
}

function collectFulfillmentLines(lines: string[]): Map<FulfillmentCardModel["kind"], string[]> {
  const grouped = new Map<FulfillmentCardModel["kind"], string[]>();
  const seen = new Set<string>();
  for (const line of lines) {
    const value = clean(line);
    const kind = kindOf(value);
    if (!kind || !value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const current = grouped.get(kind) ?? [];
    if (current.some((item) => item.includes(value) || value.includes(item))) continue;
    current.push(value);
    grouped.set(kind, current);
  }
  return grouped;
}

export function fulfillmentCardsFrom(model: V4Model): FulfillmentCardModel[] {
  const trust = model.blueprint.sections.find((item) => item.sectionType === "trust");
  const fromTrust = collectFulfillmentLines([
    ...(trust?.items ?? []).map((item) => item.text.text),
    ...(trust?.body ?? []).map((item) => item.text),
  ]);
  const fromFaq = collectFulfillmentLines(model.copy.faq.map((item) => item.answer.text));
  const order: FulfillmentCardModel["kind"][] = ["DISPATCH", "DELIVERY", "RETURNS", "PAYMENT"];
  return order.flatMap((kind) => {
    const preferred = fromTrust.get(kind)?.length ? fromTrust.get(kind)! : fromFaq.get(kind);
    if (!preferred?.length) return [];
    const joined = preferred.join(" ");
    const ssl = /\bssl\b/i.test(joined) ? `The seller says the page uses SSL. ${SSL_PLATFORM_QUALIFIER}` : null;
    const cleaned = joined.replace(/\bThe seller says the page uses SSL\..*$/i, "").trim() || joined;
    const body = firstSentences(cleaned, kind === "PAYMENT" || kind === "RETURNS" ? 1 : 2);
    return [
      {
        kind,
        title: fulfillmentTitle(kind),
        body,
        note: ssl,
        icon: fulfillmentIcon(kind),
      },
    ];
  });
}

export function guaranteeViewFrom(model: V4Model): GuaranteeView {
  const section = model.blueprint.sections.find((item) => item.sectionType === "guarantee");
  const statements = unique([
    ...(section?.body ?? []).map((item) => clean(item.text)),
    ...(model.contract.operational?.returns ?? []).map((item) => clean(item.statement)),
  ]);
  const days = daysFromText(statements.join(" ")) ?? daysFromText(model.copy.sections.find((item) => item.sectionType === "guarantee")?.body.map((row) => row.text).join(" ") ?? "");
  return { days, statements };
}

export function evidenceChipsFrom(model: V4Model, slots: Pick<PremiumSlots, "guarantee" | "fulfillment">): EvidenceChip[] {
  const chips: EvidenceChip[] = [];
  if (slots.guarantee.days) chips.push({ label: `${slots.guarantee.days}-day seller-stated refund`, icon: "shield" });
  const dispatch = slots.fulfillment.find((item) => item.kind === "DISPATCH");
  if (dispatch) chips.push({ label: compactFact(dispatch.body, 48, "DISPATCH") || "Seller-stated dispatch", icon: "clock" });
  const delivery = slots.fulfillment.find((item) => item.kind === "DELIVERY");
  if (delivery) chips.push({ label: compactFact(delivery.body, 48, "DELIVERY") || "Estimated delivery window", icon: "truck" });
  const payment = slots.fulfillment.find((item) => item.kind === "PAYMENT");
  if (payment) chips.push({ label: compactFact(payment.body, 48, "PAYMENT") || "Seller-stated payment terms", icon: "card" });
  if (!chips.length && model.copy.faq.length) chips.push({ label: "Source questions answered", icon: "help" });
  return chips.slice(0, 4);
}

export function premiumSlotsFromModel(model: V4Model): PremiumSlots {
  const ingredients = ingredientCardsFrom(model);
  const fulfillment = fulfillmentCardsFrom(model);
  const guarantee = guaranteeViewFrom(model);
  const how = model.blueprint.sections.find((item) => item.sectionType === "how_it_works");
  const usageSource = (how?.items.length
    ? how.items.map((item) => item.text.text)
    : (how?.body ?? []).map((item) => item.text));
  const usage = splitUsageSentences(joinSplitSteps(usageSource));
  const faq = (model.copy.faq.length
    ? model.copy.faq.map((item) => ({ question: clean(item.question.text), answer: clean(item.answer.text) }))
    : (model.blueprint.sections.find((item) => item.sectionType === "faq")?.items ?? []).map((item) => ({
        question: clean(item.title?.text ?? item.text.text),
        answer: item.title ? clean(item.text.text) : "",
      }))
  ).filter((item) => item.question && item.answer);
  return {
    engineId: PREMIUM_ENGINE_ID,
    engineVersion: PREMIUM_ENGINE_VERSION,
    productName: model.contract.identity.productName,
    headline: presentVisitorCopy(model.copy.headline.text) || model.contract.identity.productName,
    subheadline: model.copy.subheadline ? presentVisitorCopy(model.copy.subheadline.text) : null,
    introduction: presentVisitorCopy(model.copy.introduction.text) || null,
    packshot: model.commercialImage ? { src: model.commercialImage.src, alt: model.commercialImage.alt } : null,
    evidenceChips: evidenceChipsFrom(model, { guarantee, fulfillment }),
    ingredients,
    usage,
    fulfillment,
    guarantee,
    faq,
    cta: {
      label: PREMIUM_CTA_LABEL,
      caption: PREMIUM_CTA_CAPTION,
      enabled: false,
      href: null,
    },
    disclosure: model.contract.legal.affiliateDisclosure || null,
  };
}
