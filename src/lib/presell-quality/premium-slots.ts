import { publicItemText } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import {
  PREMIUM_CTA_CAPTION,
  PREMIUM_CTA_LABEL,
  PREMIUM_ENGINE_ID,
  PREMIUM_ENGINE_VERSION,
} from "@/lib/presell-quality/premium-design";

export type PremiumIconName = "leaf" | "truck" | "clock" | "shield" | "card" | "help" | "package";

export type IngredientCardModel = {
  name: string;
  detail: string | null;
};

export type FulfillmentCardModel = {
  kind: "DISPATCH" | "DELIVERY" | "PAYMENT" | "RETURNS";
  title: string;
  body: string;
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
  evidenceChips: string[];
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

export function fulfillmentCardsFrom(model: V4Model): FulfillmentCardModel[] {
  const trust = model.blueprint.sections.find((item) => item.sectionType === "trust");
  const lines = [
    ...(trust?.items ?? []).map((item) => clean(item.text.text)),
    ...(trust?.body ?? []).map((item) => clean(item.text)),
    ...model.copy.faq.map((item) => clean(item.answer.text)),
  ].filter(Boolean);
  const grouped = new Map<FulfillmentCardModel["kind"], string[]>();
  const seen = new Set<string>();
  for (const line of lines) {
    const kind = kindOf(line);
    if (!kind) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const current = grouped.get(kind) ?? [];
    if (current.some((item) => item.includes(line) || line.includes(item))) continue;
    current.push(line);
    grouped.set(kind, current);
  }
  const order: FulfillmentCardModel["kind"][] = ["DISPATCH", "DELIVERY", "RETURNS", "PAYMENT"];
  return order.flatMap((kind) => {
    const body = grouped.get(kind);
    if (!body?.length) return [];
    return [
      {
        kind,
        title: fulfillmentTitle(kind),
        body: body.join(" "),
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

export function evidenceChipsFrom(model: V4Model, slots: Pick<PremiumSlots, "guarantee" | "fulfillment">): string[] {
  const chips: string[] = [];
  if (slots.guarantee.days) chips.push(`${slots.guarantee.days}-day seller-stated refund terms`);
  if (slots.fulfillment.some((item) => item.kind === "DISPATCH")) chips.push("Seller-stated dispatch window");
  if (slots.fulfillment.some((item) => item.kind === "DELIVERY")) chips.push("Estimated delivery, not a guaranteed arrival");
  if (slots.fulfillment.some((item) => item.kind === "PAYMENT")) chips.push("Seller-stated payment terms");
  if (model.copy.faq.length) chips.push("Source questions answered");
  return chips.slice(0, 4);
}

export function premiumSlotsFromModel(model: V4Model): PremiumSlots {
  const ingredients = ingredientCardsFrom(model);
  const fulfillment = fulfillmentCardsFrom(model);
  const guarantee = guaranteeViewFrom(model);
  const usage = (model.blueprint.sections.find((item) => item.sectionType === "how_it_works")?.items ?? []).map((item) =>
    clean(item.text.text),
  ).filter(Boolean);
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
    headline: clean(model.copy.headline.text) || model.contract.identity.productName,
    subheadline: model.copy.subheadline ? clean(model.copy.subheadline.text) : null,
    introduction: clean(model.copy.introduction.text) || null,
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
