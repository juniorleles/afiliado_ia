/**
 * Structured presell page model + deterministic composer.
 *
 * AI prose is reorganized into sections. Missing facts omit components.
 * No ratings, testimonials, pricing, or manufacturer are invented.
 */

import { parseMarkdown } from "@/lib/markdown";
import { clipAtWordBoundary, labeledSplit } from "@/lib/presell-display";
import {
  getConsumerCopyEligibleFacts,
  isCopyEligibleImageProvenance,
  type ProductFacts,
} from "@/lib/product-facts";
import type { Variant } from "@/lib/ai/generate-variants";
import { validateGrounding, composePublicationGate, type GroundingResult } from "@/lib/ai/grounding-validator";
import { lintCampaign, type PublicationGate } from "@/lib/policy-linter";
import type { Campaign } from "@/lib/campaigns";
import { authorizedVariantCopy, compositionFactFirewall } from "@/lib/composition-fact-firewall";

export const PAGE_TEMPLATES = ["REVIEW", "BUYER_GUIDE", "EDITORIAL"] as const;
export type PageTemplateId = (typeof PAGE_TEMPLATES)[number];

export const IMAGE_PROVENANCE = ["DIRECT_SOURCE", "MANUAL", "PLACEHOLDER", "NOT_FOUND"] as const;
export type ImageProvenance = (typeof IMAGE_PROVENANCE)[number];

export const SECTION_IDS = [
  "quickSummary",
  "overview",
  "features",
  "ingredients",
  "usage",
  "pros",
  "considerations",
  "guarantee",
  "faq",
] as const;
export type PresellSectionId = (typeof SECTION_IDS)[number];

export type PresellImage = {
  src: string;
  alt: string;
  provenance: ImageProvenance;
};

export type PresellFaqItem = { question: string; answer: string };

export type PresellSection = {
  id: PresellSectionId;
  title: string;
  visible: boolean;
  paragraphs: string[];
  bullets: string[];
  cards: Array<{ title: string; body: string }>;
  faq: PresellFaqItem[];
};

export type OmittedComponent = { component: string; reason: string };

export type PresellPage = {
  version: 1;
  template: PageTemplateId;
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    summary: string;
    highlights: string[];
    image: PresellImage;
  };
  sections: PresellSection[];
  ctaLabel: string;
  omitted: OmittedComponent[];
  /** Duration display derived only from copy-eligible guarantee evidence. */
  guaranteeDaysDisplay: string | null;
};

export const TEMPLATE_META: Record<
  PageTemplateId,
  { label: string; badge: string; blurb: string }
> = {
  REVIEW: {
    label: "Review",
    badge: "Review",
    blurb: "Product overview, facts, ingredients, usage, pros, guarantee, FAQ.",
  },
  BUYER_GUIDE: {
    label: "Buyer Guide",
    badge: "Buying Guide",
    blurb: "Buying considerations first, then formulation, usage, and FAQ.",
  },
  EDITORIAL: {
    label: "Editorial",
    badge: "Editorial",
    blurb: "Softer article layout with explanatory sections and a quieter CTA rhythm.",
  },
};

const SECTION_ORDER: Record<PageTemplateId, PresellSectionId[]> = {
  REVIEW: ["quickSummary", "ingredients", "usage", "features", "overview", "pros", "considerations", "guarantee", "faq"],
  BUYER_GUIDE: ["quickSummary", "overview", "ingredients", "usage", "features", "considerations", "pros", "guarantee", "faq"],
  EDITORIAL: ["ingredients", "usage", "features", "overview", "considerations", "faq", "guarantee"],
};

export const FACT_SECTION_IDS: PresellSectionId[] = ["ingredients", "usage", "features"];

const SECTION_TITLES: Record<PresellSectionId, string> = {
  quickSummary: "Quick Summary",
  overview: "Overview",
  features: "Key Features",
  ingredients: "Ingredients / Components",
  usage: "How to Use",
  pros: "Pros",
  considerations: "Things to Consider",
  guarantee: "Guarantee",
  faq: "FAQ",
};

function clip(text: string, max: number): string {
  return clipAtWordBoundary(text, max);
}

function firstSentences(text: string, n = 1): string {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return parts.slice(0, n).join(" ");
}

function isMechanismHeading(title: string): boolean {
  if (/how to use|how to take|suggested use/.test(title)) return false;
  return (
    /\bhow it works\b/.test(title) ||
    /\bmechanism\b/.test(title) ||
    /how the formula works/.test(title) ||
    /how .{0,48} works/.test(title)
  );
}

function isUsageHeading(title: string): boolean {
  if (isMechanismHeading(title)) return false;
  return /how to use|how to take|suggested use|\busage\b|\bdirections?\b|\bdosage\b/.test(title);
}

function isAudienceHeading(title: string): boolean {
  return /who may consider|who (is|it’s|it's) (this )?for|who (can|should) (use|take|consider)|ideal for|who might/.test(
    title,
  );
}

/**
 * Pricing, returns, and shipping have no public section id. They must not
 * fall through into Overview. Refund/guarantee headings are classified earlier.
 */
function isCommercialOrOperationalHeading(title: string): boolean {
  return (
    /\b(pric(?:e|ing)|msrp|\bcosts?\b)\b/.test(title) ||
    /\b(shipping|delivery|dispatch|order processing|processing time)\b/.test(title) ||
    /\b(returns?|return policy)\b/.test(title)
  );
}

/** Public for classifier tests. Mechanism headings must not fall through to Usage. */
export function classifyHeading(title: string): PresellSectionId | "skip" | "intro" {
  const t = title.toLowerCase().trim();
  if (!t) return "intro";
  if (/faq|frequently asked/.test(t)) return "faq";
  if (/ingredient|component|formulation|what's inside|whats inside/.test(t)) return "ingredients";
  if (isUsageHeading(t)) return "usage";
  if (isMechanismHeading(t)) return "overview";
  if (/^pros\b|advantages/.test(t)) return "pros";
  if (isAudienceHeading(t)) return "overview";
  if (/consider|cons\b|caution|warning/.test(t)) return "considerations";
  if (/guarantee|money-back|refund/.test(t)) return "guarantee";
  if (/feature|benefit|key/.test(t)) return "features";
  if (isCommercialOrOperationalHeading(t)) return "skip";
  if (/what is|overview|about/.test(t)) return "overview";
  if (/final thoughts|bottom line/.test(t)) return "overview";
  return "overview";
}

type HeadingGroup = { title: string; paragraphs: string[]; bullets: string[] };

function headingGroups(body: string): HeadingGroup[] {
  const blocks = parseMarkdown(body);
  const groups: HeadingGroup[] = [{ title: "", paragraphs: [], bullets: [] }];
  for (const block of blocks) {
    if (block.type === "heading") {
      groups.push({ title: block.text, paragraphs: [], bullets: [] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (block.type === "paragraph") current.paragraphs.push(block.text);
    if (block.type === "list") current.bullets.push(...block.items);
  }
  return groups.filter((g) => g.paragraphs.length || g.bullets.length || g.title);
}

function parseFaq(groups: HeadingGroup[]): PresellFaqItem[] {
  const items: PresellFaqItem[] = [];
  for (const group of groups) {
    if (classifyHeading(group.title) !== "faq") continue;
    for (const bullet of group.bullets) {
      const split = bullet.split(/\?\s+/);
      if (split.length >= 2) {
        items.push({ question: `${split[0].trim()}?`, answer: split.slice(1).join("? ").trim() });
      }
    }
    for (const paragraph of group.paragraphs) {
      const q = paragraph.match(/^(.+\?)\s+([\s\S]+)$/);
      if (q) items.push({ question: q[1].trim(), answer: q[2].trim() });
    }
  }
  return items.slice(0, 6);
}

function emptySection(id: PresellSectionId): PresellSection {
  return {
    id,
    title: SECTION_TITLES[id],
    visible: false,
    paragraphs: [],
    bullets: [],
    cards: [],
    faq: [],
  };
}

function durationDaysFromEligibleGuarantee(text: string): string | null {
  if (!text.trim()) return null;
  const match = text.match(/\b(\d+)\s*[- ]?days?\b/i);
  return match?.[1] ?? null;
}

function placeholderImage(productName: string): PresellImage {
  return {
    src: "",
    alt: productName ? `${productName} product visual placeholder` : "Product visual placeholder",
    provenance: "PLACEHOLDER",
  };
}

export function composePresellPage(input: {
  variant: Pick<Variant, "headline" | "body" | "ctaLabel" | "approach">;
  facts: ProductFacts;
  template: PageTemplateId;
}): PresellPage {
  const { variant, facts, template } = input;
  const identityName = facts.productName?.trim() || "";

  const groups = headingGroups(variant.body);
  const byId = new Map<PresellSectionId, PresellSection>();
  for (const id of SECTION_IDS) byId.set(id, emptySection(id));

  const intro = groups.find((g) => classifyHeading(g.title) === "intro") ?? groups[0];
  const overview = byId.get("overview")!;
  const introParagraphs = intro?.paragraphs ?? [];
  const [lede, ...introRest] = introParagraphs;
  overview.paragraphs.push(...introRest);
  if (intro?.bullets.length) overview.bullets.push(...intro.bullets);

  for (const group of groups) {
    const kind = classifyHeading(group.title);
    if (kind === "intro" || kind === "skip" || kind === "faq") continue;
    const section = byId.get(kind)!;
    if (group.title && kind !== "overview") section.title = group.title;
    section.paragraphs.push(...group.paragraphs);
    section.bullets.push(...group.bullets);
  }

  const features = byId.get("features")!;
  const ingredients = byId.get("ingredients")!;
  const usage = byId.get("usage")!;
  const guarantee = byId.get("guarantee")!;
  const faq = byId.get("faq")!;
  faq.faq = parseFaq(groups);

  materializeVariantDisplay(ingredients);
  materializeVariantDisplay(byId.get("considerations")!);

  const omitted: OmittedComponent[] = [];
  omitted.push({ component: "Pricing", reason: "NOT_FOUND" });
  omitted.push({ component: "Manufacturer", reason: "NOT_FOUND" });
  omitted.push({ component: "Testimonials", reason: "NOT_FOUND" });
  omitted.push({ component: "Ratings", reason: "NOT_FOUND" });
  if (!hasContent(ingredients)) omitted.push({ component: "Ingredients", reason: "NOT_IN_VARIANT" });
  if (!hasContent(usage)) omitted.push({ component: "Usage", reason: "NOT_IN_VARIANT" });
  if (!hasContent(guarantee)) omitted.push({ component: "Guarantee", reason: "NOT_IN_VARIANT" });
  if (faq.faq.length === 0) omitted.push({ component: "FAQ", reason: "NOT_IN_VARIANT" });
  if (!hasContent(features)) omitted.push({ component: "Features", reason: "NOT_IN_VARIANT" });

  const quick = byId.get("quickSummary")!;
  const highlightSource = [...features.bullets, ...features.paragraphs, ...overview.bullets, ...overview.paragraphs];
  quick.bullets = highlightSource.slice(0, 4).map((item) => clip(item, 120));

  for (const section of byId.values()) {
    section.visible = hasContent(section);
  }
  if (faq.faq.length > 0) faq.visible = true;

  const ordered = SECTION_ORDER[template]
    .map((id) => byId.get(id)!)
    .filter((section) => SECTION_ORDER[template].includes(section.id));

  const summary =
    lede ||
    overview.paragraphs[0] ||
    firstSentences(variant.body.replace(/^##.+$/gm, " "), 1) ||
    variant.headline;

  const image: PresellImage =
    facts.productImageUrl && isCopyEligibleImageProvenance(facts.productImageProvenance)
      ? {
          src: facts.productImageUrl,
          alt: identityName ? `${identityName} product image` : "Product image",
          provenance: facts.productImageProvenance === "MANUAL" ? "MANUAL" : "DIRECT_SOURCE",
        }
      : placeholderImage(identityName);

  const composedGuaranteeText = [...guarantee.paragraphs, ...guarantee.bullets].join(" ");

  return {
    version: 1,
    template,
    hero: {
      badge: TEMPLATE_META[template].badge,
      headline: variant.headline,
      subheadline: clip(firstSentences(summary, 1), 140),
      summary: clip(summary, 280),
      highlights: quick.bullets,
      image,
    },
    sections: ordered,
    ctaLabel: variant.ctaLabel,
    omitted,
    guaranteeDaysDisplay: durationDaysFromEligibleGuarantee(composedGuaranteeText),
  };
}

/** Display-only chunking of already-authorized variant copy. Never reads ProductFacts. */
function materializeVariantDisplay(section: PresellSection): void {
  const cards = [...section.cards];
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  for (const paragraph of section.paragraphs) {
    const labeled = labeledSplit(paragraph);
    if (labeled) cards.push({ title: labeled.title, body: labeled.body });
    else paragraphs.push(paragraph);
  }
  for (const bullet of section.bullets) {
    const labeled = labeledSplit(bullet);
    if (labeled) {
      cards.push({ title: labeled.title, body: labeled.body });
      continue;
    }
    if (section.id === "ingredients" && bullet.length <= 80 && !/[.!?]/.test(bullet)) {
      cards.push({ title: bullet, body: "" });
      continue;
    }
    bullets.push(bullet);
  }
  section.paragraphs = paragraphs;
  section.bullets = bullets;
  section.cards = cards;
}

function hasContent(section: PresellSection): boolean {
  return (
    section.paragraphs.some((p) => p.trim()) ||
    section.bullets.some((b) => b.trim()) ||
    section.cards.some((c) => c.title.trim()) ||
    section.faq.some((f) => f.question.trim())
  );
}

export function visibleSections(page: PresellPage): PresellSection[] {
  return page.sections.filter((section) => section.visible && hasContent(section));
}

/** Copy-eligible guarantee sentence already on the page. Never invents wording. */
export function copyEligibleGuaranteeSentence(page: PresellPage, facts?: ProductFacts | null): string {
  const section = page.sections.find((item) => item.id === "guarantee" && item.visible);
  const composed = (section?.paragraphs[0] || section?.bullets[0] || "").trim();
  if (!composed) return "";
  if (facts) {
    const eligible = getConsumerCopyEligibleFacts(facts).guaranteeInformation;
    if (!eligible) return "";
  }
  return composed;
}

/** Template display order. BUYER_GUIDE places Overview before product-fact sections. */
export function orderedVisibleSections(page: PresellPage): PresellSection[] {
  const order = SECTION_ORDER[page.template];
  const visible = visibleSections(page).filter((section) => section.id !== "quickSummary");
  return [...visible].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export function reconstructPageBody(page: PresellPage): string {
  const lines: string[] = [];
  if (page.hero.summary) lines.push(page.hero.summary, "");
  for (const section of visibleSections(page)) {
    lines.push(`## ${section.title}`, "");
    for (const paragraph of section.paragraphs) lines.push(paragraph, "");
    for (const bullet of section.bullets) lines.push(`- ${bullet}`);
    for (const card of section.cards) {
      lines.push(`- ${card.title}${card.body ? `: ${card.body}` : ""}`);
    }
    for (const item of section.faq) {
      lines.push(`- ${item.question} ${item.answer}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function consumerVisibleText(page: PresellPage): string {
  return [
    page.hero.headline,
    page.hero.subheadline,
    page.hero.summary,
    ...page.hero.highlights,
    reconstructPageBody(page),
    page.ctaLabel,
  ].join("\n");
}

export function parsePresellPage(raw: string | null | undefined): PresellPage | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as PresellPage;
    if (!parsed || parsed.version !== 1) return null;
    if (!PAGE_TEMPLATES.includes(parsed.template)) return null;
    if (!parsed.hero || !Array.isArray(parsed.sections)) return null;
    parsed.guaranteeDaysDisplay = parsed.guaranteeDaysDisplay ?? null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializePresellPage(page: PresellPage): string {
  return JSON.stringify(page);
}

export function applyProductImageToPage(page: PresellPage, image: PresellImage): PresellPage {
  return {
    ...page,
    hero: {
      ...page.hero,
      image: { ...image },
    },
  };
}

export function applyPageEdits(
  page: PresellPage,
  edits: {
    headline?: string;
    subheadline?: string;
    ctaLabel?: string;
    visibility?: Partial<Record<PresellSectionId, boolean>>;
    order?: PresellSectionId[];
  },
): PresellPage {
  const next: PresellPage = {
    ...page,
    hero: { ...page.hero },
    sections: page.sections.map((section) => ({ ...section })),
  };
  if (edits.headline?.trim()) next.hero.headline = edits.headline.trim();
  if (edits.subheadline !== undefined) next.hero.subheadline = edits.subheadline.trim();
  if (edits.ctaLabel?.trim()) next.ctaLabel = edits.ctaLabel.trim();
  if (edits.visibility) {
    for (const section of next.sections) {
      if (section.id in edits.visibility) {
        section.visible = Boolean(edits.visibility[section.id]);
      }
    }
  }
  if (edits.order && edits.order.length > 0) {
    const map = new Map(next.sections.map((section) => [section.id, section]));
    const ordered: PresellSection[] = [];
    for (const id of edits.order) {
      const section = map.get(id);
      if (section) ordered.push(section);
    }
    for (const section of next.sections) {
      if (!ordered.includes(section)) ordered.push(section);
    }
    next.sections = ordered;
  }
  return next;
}

export function validateComposedPage(
  page: PresellPage,
  facts: ProductFacts,
  affiliateUrl: string,
  authorizedCopy?: string,
): {
  grounding: GroundingResult;
  policy: PublicationGate;
  finalGate: PublicationGate;
  factualFirewall: { status: "PASS" | "FAIL"; addedFactualCopy: string[] };
} {
  const body = reconstructPageBody(page);
  const campaign = {
    id: 0,
    name: facts.productName || "draft",
    slug: "composed-draft",
    headline: page.hero.headline,
    body,
    ctaLabel: page.ctaLabel,
    affiliateUrl,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft" as const,
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
  } satisfies Campaign;
  const policy = lintCampaign(campaign).gate;
  const grounding = validateGrounding(consumerVisibleText(page), facts);
  const factualFirewall = authorizedCopy
    ? compositionFactFirewall({ authorizedCopy, composedVisible: consumerVisibleText(page) })
    : { status: "PASS" as const, addedFactualCopy: [] as string[] };
  let finalGate = composePublicationGate(policy, grounding.status);
  if (factualFirewall.status === "FAIL") finalGate = "BLOCKED";
  return {
    grounding,
    policy,
    finalGate,
    factualFirewall,
  };
}

export function authorizedCopyFromVariant(
  variant: Pick<Variant, "headline" | "body" | "ctaLabel">,
  productName?: string,
): string {
  return authorizedVariantCopy(variant, productName);
}

export function includedComponentLabels(page: PresellPage): string[] {
  const labels = ["Hero"];
  if (page.hero.highlights.length) labels.push("Quick Summary");
  for (const section of visibleSections(page)) {
    if (section.id === "quickSummary") continue;
    labels.push(section.title);
  }
  return labels;
}
