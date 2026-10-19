import type { LandingDocument } from "@/lib/landing-composer/types";
import { presentLandingDocument } from "@/lib/landing-composer/present";
import type { AdaptivePresentationPlan } from "@/lib/product-showcase/adaptive-plan";

export const PRODUCT_SHOWCASE_PREMIUM_V1 = "PRODUCT_SHOWCASE_PREMIUM_V1";

export type ShowcaseImage = { src: string; alt: string };
export type ShowcaseCharacteristic = { label: string; text: string };
export type ShowcaseIngredient = { name: string; image: ShowcaseImage | null };
export type ShowcaseCta = { href: string; label: string };

export type ProductShowcaseModel = {
  template: typeof PRODUCT_SHOWCASE_PREMIUM_V1;
  mode: "facts" | "demo";
  productName: string;
  eyebrow: string | null;
  lead: string | null;
  highlights: string[];
  characteristics: ShowcaseCharacteristic[];
  format: ShowcaseCharacteristic | null;
  formatImage: ShowcaseImage | null;
  ingredients: ShowcaseIngredient[];
  ingredientPhotos: boolean;
  guarantee: { text: string; origin: "Product source" } | null;
  notices: string[];
  faq: Array<{ question: string; answer: string }>;
  review: { heading: string; paragraphs: readonly string[] } | null;
  healthDisclaimer: string | null;
  affiliateDisclosure: string;
  image: ShowcaseImage | null;
  gallery: ShowcaseImage[];
  cta: ShowcaseCta | null;
  siteName: string;
  footerLinks: Array<{ href: string; label: string }>;
  /** Internal presentation plan. Not consumer copy. */
  adaptivePlan: AdaptivePresentationPlan | null;
};

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function looseKey(value: string): string {
  return keyOf(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameHeroFact(left: string, right: string): boolean {
  const a = looseKey(left);
  const b = looseKey(right);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function characteristicLabel(value: string): string {
  if (/\b(capsule|tablet|softgel|bottle|powder|serving)\b/i.test(value)) return "Format";
  if (/\b(formula|mushroom)\b/i.test(value)) return "Formula";
  return "Stated by the product source";
}

function usableSrc(src: string): boolean {
  const value = src.trim();
  if (!value || /^javascript:/i.test(value)) return false;
  if (/^data:/i.test(value)) return /^data:image\//i.test(value);
  return true;
}

function imageOrNull(image: ShowcaseImage | null | undefined): ShowcaseImage | null {
  if (!image || !usableSrc(image.src)) return null;
  const alt = image.alt.trim();
  if (!alt) return null;
  return { src: image.src.trim(), alt };
}

function acceptedCta(cta: { href: string; label: string } | null | undefined): ShowcaseCta | null {
  if (!cta) return null;
  const label = cta.label.trim();
  const href = cta.href.trim();
  if (!label || !/^https?:\/\//i.test(href)) return null;
  return { href, label };
}

function pairIngredients(names: string[], media: Array<{ name: string; src: string; alt: string }> | undefined): ShowcaseIngredient[] {
  const list = media ?? [];
  return names.map((name) => {
    const hit = list.find((item) => keyOf(item.name) === keyOf(name));
    const image = hit ? imageOrNull({ src: hit.src, alt: hit.alt || name }) : null;
    return { name, image };
  });
}

export function buildProductShowcase(
  document: LandingDocument,
  options: {
    description?: string | null;
    image?: ShowcaseImage | null;
    gallery?: ShowcaseImage[];
    ingredientImages?: Array<{ name: string; src: string; alt: string }>;
    formatImage?: ShowcaseImage | null;
    cta?: { href: string; label: string } | null;
    mode?: "facts" | "demo";
    siteName: string;
    affiliateDisclosure: string;
    healthDisclaimer?: string | null;
    review?: { heading: string; paragraphs: readonly string[] } | null;
    footerLinks: Array<{ href: string; label: string }>;
  },
): ProductShowcaseModel {
  const presented = presentLandingDocument(document, { description: options.description });
  const overview = presented.sections.find((item) => item.kind === "overview");
  const ingredientSection = presented.sections.find((item) => item.kind === "ingredients");
  const details = presented.sections.find((item) => item.kind === "details");
  const guarantee = presented.sections.find((item) => item.kind === "guarantee");
  const important = presented.sections.find((item) => item.kind === "important");
  const faq = presented.sections.find((item) => item.kind === "faq");
  const characteristics = [
    ...(overview?.kind === "overview" ? overview.items : []),
    ...(details?.kind === "details" ? details.items : []),
  ].map((text) => ({ label: characteristicLabel(text), text }));
  const summary = presented.description;
  let eyebrow = summary && summary.length <= 90 ? summary : null;
  let lead = characteristics.find((item) => keyOf(item.text) !== keyOf(summary ?? ""))?.text ?? null;
  if (eyebrow && lead && sameHeroFact(eyebrow, lead)) {
    if (looseKey(lead).length >= looseKey(eyebrow).length) eyebrow = null;
    else lead = null;
  }
  const heroFacts = new Set([eyebrow, lead].flatMap((item) => (item ? [keyOf(item)] : [])));
  const highlights: string[] = [];
  const seen = new Set<string>();
  for (const value of characteristics.map((item) => item.text)) {
    const clean = value?.trim() ?? "";
    const key = keyOf(clean);
    if (!clean || clean.length > 90 || !key || seen.has(key) || heroFacts.has(key)) continue;
    if ((eyebrow && sameHeroFact(clean, eyebrow)) || (lead && sameHeroFact(clean, lead))) continue;
    seen.add(key);
    highlights.push(clean);
  }
  const ingredients = pairIngredients(ingredientSection?.kind === "ingredients" ? ingredientSection.names : [], options.ingredientImages);
  if (ingredients.length > 0) {
    const count = `${ingredients.length} declared ingredients`;
    const key = keyOf(count);
    if (!seen.has(key) && !heroFacts.has(key)) highlights.push(count);
  }
  const format = characteristics.find((item) => item.label === "Format") ?? null;

  return {
    template: PRODUCT_SHOWCASE_PREMIUM_V1,
    mode: options.mode ?? "facts",
    productName: presented.productName,
    eyebrow,
    lead,
    highlights,
    characteristics,
    format,
    formatImage: imageOrNull(options.formatImage),
    ingredients,
    ingredientPhotos: ingredients.length > 0 && ingredients.every((item) => item.image),
    guarantee: guarantee?.kind === "guarantee" ? { text: guarantee.text, origin: "Product source" } : null,
    notices: important?.kind === "important" ? important.items : [],
    faq: faq?.kind === "faq" ? faq.items : [],
    review: options.review ?? null,
    healthDisclaimer: options.healthDisclaimer ?? null,
    affiliateDisclosure: options.affiliateDisclosure,
    image: imageOrNull(options.image),
    gallery: (options.gallery ?? []).flatMap((item) => {
      const image = imageOrNull(item);
      return image ? [image] : [];
    }),
    cta: acceptedCta(options.cta),
    siteName: options.siteName,
    footerLinks: options.footerLinks,
    adaptivePlan: null,
  };
}
