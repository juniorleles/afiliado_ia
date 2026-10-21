import type { TrafficPolicyStatus } from "@/lib/affiliate-program";
import type { Campaign } from "@/lib/campaigns";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { restoredDescription } from "@/lib/landing-composer/present";
import { isHttpUrl } from "@/lib/editor-layers";
import { isCopyEligibleImageProvenance, type ProductFacts } from "@/lib/product-facts";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument } from "@/lib/product-showcase/editorial";
import { buildProductShowcase, type ProductShowcaseModel, type ShowcaseCta } from "@/lib/product-showcase/model";
import { presentationGuidance } from "@/lib/product-showcase/presentation-order";

/** The presell is the only channel this template may send to the affiliate hop. */
export type ShowcaseChannel = "presell";

export type ShowcaseField = { id: string; effective: string; modified?: boolean };

const DEMO_ASSET = /(?:^|\/)demo-assets(?:\/|$)/i;
const EDUCATIONAL_LABEL = /^continue with this educational page\.?$/i;

export function isDemoAssetSrc(src: string): boolean {
  return DEMO_ASSET.test(src.trim());
}

export function presentationUsesShowcase(value: string | null | undefined): boolean {
  return value === "PRODUCT_SHOWCASE_PREMIUM_V1";
}

export function officialCampaignImage(
  campaign: Pick<Campaign, "productImageSrc" | "productImageProvenance" | "headline">,
): { src: string; alt: string } | null {
  const src = campaign.productImageSrc?.trim() ?? "";
  if (!src || isDemoAssetSrc(src)) return null;
  if (!isCopyEligibleImageProvenance(campaign.productImageProvenance ?? undefined)) return null;
  const name = campaign.headline.trim() || "Product";
  return { src, alt: `${name} product image` };
}

/** Authorized label, http(s) hop, and the presell channel. No invented button. */
export function presellShowcaseCta(label: string, href: string, channel: ShowcaseChannel | null): ShowcaseCta | null {
  if (channel !== "presell") return null;
  const cleanLabel = label.trim();
  const cleanHref = href.trim();
  if (!cleanLabel || EDUCATIONAL_LABEL.test(cleanLabel)) return null;
  if (!isHttpUrl(cleanHref) || /^javascript:/i.test(cleanHref) || /^data:/i.test(cleanHref)) return null;
  if (isDemoAssetSrc(cleanHref)) return null;
  return { label: cleanLabel, href: cleanHref };
}

function bulletLines(value: string): string[] {
  return value.split("\n").map((line) => line.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

export function applyAuthorizedOverrides(document: LandingDocument, fields: readonly ShowcaseField[] | undefined): LandingDocument {
  if (!fields || fields.length === 0) return document;
  const modified = new Map(fields.filter((field) => field.modified).map((field) => [field.id, field.effective]));
  if (modified.size === 0) return document;
  const sections = document.sections.map((section) => {
    if (section.sectionId === "hero") {
      const content = { ...section.content };
      if (modified.has("hero.headline")) content.headline = modified.get("hero.headline");
      if (modified.has("hero.subheadline")) content.subheadline = modified.get("hero.subheadline");
      return { ...section, content };
    }
    if (section.sectionId === "cta" && modified.has("hero.cta")) {
      return { ...section, content: { ...section.content, label: modified.get("hero.cta") } };
    }
    const override = modified.get(`document.${section.sectionId}`);
    if (override == null) return section;
    const lines = bulletLines(override);
    if (section.sectionId === "benefits") return { ...section, content: { ...section.content, fromFacts: lines } };
    if (section.sectionId === "ingredients") return { ...section, content: { ...section.content, names: lines } };
    if (section.sectionId === "guarantee") return { ...section, content: { ...section.content, text: lines[0] ?? "" } };
    if (section.sectionId === "problem") return { ...section, content: { ...section.content, cautions: lines } };
    if (section.sectionId === "solution") return { ...section, content: { ...section.content, features: lines, ingredients: [] } };
    if (section.sectionId === "faq") {
      const items: Array<{ question: string; answer: string }> = [];
      for (let index = 0; index < lines.length; index += 2) {
        const question = lines[index] ?? "";
        const answer = lines[index + 1] ?? "";
        if (question && answer) items.push({ question, answer });
      }
      return { ...section, content: { ...section.content, items } };
    }
    return section;
  });
  return { ...document, sections };
}

export function presellHopAllowed(href: string): boolean {
  return presellShowcaseCta("Open", href, "presell") !== null;
}

export function adaptLandingToShowcase(
  campaign: Campaign,
  document: LandingDocument,
  options: {
    fields?: readonly ShowcaseField[];
    channel: ShowcaseChannel | null;
    siteName: string;
    affiliateDisclosure: string;
    healthDisclaimer?: string | null;
    review?: { heading: string; paragraphs: readonly string[] } | null;
    footerLinks: Array<{ href: string; label: string }>;
    ppc?: { brandPpc?: TrafficPolicyStatus | null; genericSearchPpc?: TrafficPolicyStatus | null } | null;
    /** Stored strategy approach id. Guides section order only. */
    strategyApproach?: string | null;
    /**
     * Hero image from the ProductAssets contract (approved, stored, documented). It takes
     * precedence over the campaign's attached image. Null or absent keeps the previous path.
     */
    approvedImage?: { src: string; alt: string } | null;
  },
): ProductShowcaseModel {
  const patched = applyAuthorizedOverrides(document, options.fields);
  const hero = patched.sections.find((section) => section.sectionId === "hero");
  const clipped = typeof hero?.content.subheadline === "string" ? hero.content.subheadline : "";
  const ctaField = options.fields?.find((field) => field.id === "hero.cta");
  const label = ctaField?.modified ? ctaField.effective : campaign.ctaLabel;
  const model = buildProductShowcase(patched, {
    description: restoredDescription(campaign.sourceFactsJson, clipped),
    // undefined keeps the pre-contract path for callers that do not resolve ProductAssets. A resolved contract,
    // including null, is final: an image outside it never renders.
    image: options.approvedImage !== undefined ? options.approvedImage : officialCampaignImage(campaign),
    cta: presellShowcaseCta(label, campaign.affiliateUrl, options.channel),
    mode: "facts",
    siteName: options.siteName,
    affiliateDisclosure: options.affiliateDisclosure,
    healthDisclaimer: options.healthDisclaimer,
    review: options.review,
    footerLinks: options.footerLinks,
  });
  const facts = storedProductFacts(campaign.sourceFactsJson);
  const adaptivePlan = buildAdaptivePlan({
    facts,
    approvedPackshot: model.image,
    cta: model.cta,
    ppc: options.ppc ?? null,
  });
  return {
    ...model,
    adaptivePlan,
    presentation: presentationGuidance(options.strategyApproach),
    editorial: buildEditorialDocument({
      facts,
      plan: adaptivePlan,
      affiliateDisclosure: options.affiliateDisclosure,
      healthDisclaimer: options.healthDisclaimer,
    }),
  };
}

function storedProductFacts(json: string | null | undefined): ProductFacts | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as ProductFacts;
    if (!parsed || typeof parsed !== "object" || !parsed.confidence) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fieldValue(fields: readonly ShowcaseField[], id: string): string {
  return fields.find((field) => field.id === id)?.effective ?? "";
}

/** Live builder fields, still passed through the same presentation filter. */
export function showcaseFromBuilderFields(
  fields: readonly ShowcaseField[],
  options: {
    siteName: string;
    affiliateDisclosure: string;
    healthDisclaimer?: string | null;
    review?: { heading: string; paragraphs: readonly string[] } | null;
    footerLinks: Array<{ href: string; label: string }>;
    cta: ShowcaseCta | null;
  },
): ProductShowcaseModel {
  const faqLines = bulletLines(fieldValue(fields, "document.faq"));
  const faqItems: Array<{ question: string; answer: string }> = [];
  for (let index = 0; index < faqLines.length; index += 2) {
    const question = faqLines[index] ?? "";
    const answer = faqLines[index + 1] ?? "";
    if (question && answer) faqItems.push({ question, answer });
  }
  const document: LandingDocument = {
    version: 1,
    campaignId: 0,
    language: "en",
    generatedAt: "2026-10-15T00:00:00.000Z",
    sections: [
      { sectionId: "hero", content: { headline: fieldValue(fields, "hero.headline"), subheadline: fieldValue(fields, "hero.subheadline") }, warnings: [] },
      { sectionId: "benefits", content: { fromFacts: bulletLines(fieldValue(fields, "document.benefits")) }, warnings: [] },
      { sectionId: "ingredients", content: { names: bulletLines(fieldValue(fields, "document.ingredients")) }, warnings: [] },
      { sectionId: "solution", content: { features: bulletLines(fieldValue(fields, "document.solution")), ingredients: [] }, warnings: [] },
      { sectionId: "guarantee", content: { text: bulletLines(fieldValue(fields, "document.guarantee"))[0] ?? "" }, warnings: [] },
      { sectionId: "problem", content: { cautions: bulletLines(fieldValue(fields, "document.problem")) }, warnings: [] },
      { sectionId: "faq", content: { items: faqItems }, warnings: [] },
      { sectionId: "cta", content: { label: fieldValue(fields, "hero.cta") }, warnings: [] },
    ],
    seo: null,
    schema: null,
    metadata: { approachId: null, compositionTimeMs: 0, inputFingerprint: "builder-preview", cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
  return buildProductShowcase(document, {
    cta: options.cta,
    mode: "facts",
    siteName: options.siteName,
    affiliateDisclosure: options.affiliateDisclosure,
    healthDisclaimer: options.healthDisclaimer,
    review: options.review,
    footerLinks: options.footerLinks,
  });
}
