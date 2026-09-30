/**
 * Text catalog for the LP Builder content editor.
 * Generated copy is projected into a landing-page document, then resolved.
 * This module does not read ProductFacts and does not regenerate a page.
 */

import type { PresellPage, PresellSection } from "@/lib/presell-page";
import { type BuilderGroup, type RenderedBuilderContent } from "@/lib/builder-content";
import {
  LP_SECTION_TARGETS,
  createOverrideAudit,
  resolveLandingPage,
  type LandingPageDocument,
  type LandingPageOverride,
  type LpSectionTarget,
} from "@/lib/lp-builder/index";

export { BUILDER_GROUPS, type BuilderGroup } from "@/lib/builder-content";

export const CONTENT_LIMITS = {
  headline: 180,
  subheadline: 320,
  cta: 80,
  title: 160,
  description: 2000,
  long: 4000,
  question: 300,
  answer: 2000,
} as const;

export type ContentLimitKind = keyof typeof CONTENT_LIMITS;

export type ContentField = {
  id: string;
  group: BuilderGroup;
  section: string;
  label: string;
  kind: ContentLimitKind;
  generated: string;
};

export type ContentContext = {
  disclosure: string;
  footer: string;
  pricing: Array<{ title: string; description: string }>;
  shipping: string;
};

export type StoredContentOverride = {
  fieldId: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

const NAV_HREFS: Record<string, string> = {
  overview: "#overview",
  features: "#features",
  usage: "#usage",
  faq: "#faq",
};

const GROUP_FOR_SECTION: Record<string, BuilderGroup> = {
  features: "features",
  ingredients: "ingredients",
  faq: "faq",
  guarantee: "guarantee",
  considerations: "warnings",
  overview: "footer",
  usage: "footer",
  pros: "footer",
  quickSummary: "footer",
};

const UNSAFE_HTML = /<\s*\/?\s*(script|iframe|object|embed|link|meta|style)\b|javascript\s*:|\son\w+\s*=/i;
const TAGS = /<[^>]*>/g;
const URL_IN_TEXT = /\bhttps?:\/\/\S*/gi;

export function sanitizeRichText(value: string): string {
  return value.replace(TAGS, "").replace(/\u0000/g, "").trim();
}

export function contentHasUnsafeHtml(value: string): boolean {
  return UNSAFE_HTML.test(value);
}

export function brokenUrls(value: string): string[] {
  const found = value.match(URL_IN_TEXT) ?? [];
  const bad: string[] = [];
  for (const raw of found) {
    const candidate = raw.replace(/[),.;]+$/g, "");
    try {
      const url = new URL(candidate);
      const allowed = url.protocol === "http:" || url.protocol === "https:";
      const named = url.hostname === "localhost" || url.hostname.includes(".");
      if (!allowed || !named) bad.push(candidate);
    } catch {
      bad.push(candidate);
    }
  }
  return bad;
}

function field(input: ContentField): ContentField {
  return input;
}

function sectionTitle(section: PresellSection): ContentField {
  return field({
    id: `section.${section.id}.title`,
    group: GROUP_FOR_SECTION[section.id] ?? "footer",
    section: section.id,
    label: `Section title · ${section.title || section.id}`,
    kind: "title",
    generated: section.title,
  });
}

function itemFields(
  group: BuilderGroup,
  section: string,
  index: number,
  title: string,
  description: string,
  titleLabel: string,
  descriptionLabel: string,
): ContentField[] {
  return [
    field({
      id: `${section}.item.${index}.title`,
      group,
      section,
      label: `${titleLabel} ${index + 1}`,
      kind: "title",
      generated: title,
    }),
    field({
      id: `${section}.item.${index}.description`,
      group,
      section,
      label: `${descriptionLabel} ${index + 1}`,
      kind: "description",
      generated: description,
    }),
  ];
}

function pairsFromSection(section: PresellSection | undefined): Array<{ title: string; description: string }> {
  if (!section) return [];
  if (section.cards.length > 0) {
    return section.cards.map((card) => ({ title: card.title, description: card.body }));
  }
  if (section.bullets.length > 0) {
    return section.bullets.map((bullet) => ({ title: bullet, description: "" }));
  }
  return section.paragraphs.filter((paragraph) => paragraph.trim()).map((paragraph) => ({ title: paragraph, description: "" }));
}

function joinedBody(section: PresellSection | undefined): string {
  if (!section) return "";
  return [...section.paragraphs, ...section.bullets, ...section.cards.map((card) => [card.title, card.body].filter(Boolean).join("\n"))]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function visible(page: PresellPage, id: PresellSection["id"]): PresellSection | undefined {
  return page.sections.find((section) => section.id === id && section.visible);
}

export function projectContentFields(page: PresellPage, context: ContentContext): ContentField[] {
  const fields: ContentField[] = [
    field({ id: "hero.headline", group: "hero", section: "hero", label: "Headline", kind: "headline", generated: page.hero.headline }),
    field({ id: "hero.subheadline", group: "hero", section: "hero", label: "Subheadline", kind: "subheadline", generated: page.hero.subheadline }),
    field({ id: "hero.cta", group: "hero", section: "hero", label: "CTA", kind: "cta", generated: page.ctaLabel }),
    field({ id: "hero.disclaimer", group: "hero", section: "hero", label: "Hero disclaimer", kind: "long", generated: "" }),
  ];

  const features = visible(page, "features");
  if (features) fields.push(sectionTitle(features));
  pairsFromSection(features).forEach((item, index) => {
    fields.push(...itemFields("features", "features", index, item.title, item.description, "Feature title", "Feature description"));
  });

  const ingredients = visible(page, "ingredients");
  if (ingredients) fields.push(sectionTitle(ingredients));
  pairsFromSection(ingredients).forEach((item, index) => {
    fields.push(...itemFields("ingredients", "ingredients", index, item.title, item.description, "Ingredient title", "Ingredient description"));
  });

  const plans = context.pricing.length > 0 ? context.pricing : [{ title: "", description: "" }];
  fields.push(field({ id: "section.pricing.title", group: "pricing", section: "pricing", label: "Section title · Pricing", kind: "title", generated: "Pricing" }));
  plans.forEach((plan, index) => {
    fields.push(...itemFields("pricing", "pricing", index, plan.title, plan.description, "Plan title", "Plan description"));
  });
  fields.push(field({ id: "pricing.cta", group: "pricing", section: "pricing", label: "CTA", kind: "cta", generated: page.ctaLabel }));

  const faq = visible(page, "faq");
  if (faq) fields.push(sectionTitle(faq));
  (faq?.faq ?? []).forEach((item, index) => {
    fields.push(
      field({ id: `faq.item.${index}.question`, group: "faq", section: "faq", label: `Question ${index + 1}`, kind: "question", generated: item.question }),
      field({ id: `faq.item.${index}.answer`, group: "faq", section: "faq", label: `Answer ${index + 1}`, kind: "answer", generated: item.answer }),
    );
  });

  const guarantee = visible(page, "guarantee");
  if (guarantee) fields.push(sectionTitle(guarantee));
  fields.push(field({ id: "guarantee.body", group: "guarantee", section: "guarantee", label: "Guarantee", kind: "long", generated: joinedBody(guarantee) }));
  fields.push(field({ id: "returns.body", group: "guarantee", section: "returns", label: "Returns", kind: "long", generated: "" }));
  fields.push(field({ id: "shipping.body", group: "guarantee", section: "shipping", label: "Shipping", kind: "long", generated: context.shipping }));

  const warnings = visible(page, "considerations");
  if (warnings) fields.push(sectionTitle(warnings));
  fields.push(field({ id: "warnings.body", group: "warnings", section: "warnings", label: "Warnings", kind: "long", generated: joinedBody(warnings) }));

  fields.push(field({ id: "manufacturer.body", group: "manufacturer", section: "manufacturer", label: "Manufacturer", kind: "long", generated: "" }));

  fields.push(field({ id: "footer.disclosure", group: "footer", section: "footer", label: "Disclosure", kind: "long", generated: context.disclosure }));
  fields.push(field({ id: "footer.body", group: "footer", section: "footer", label: "Footer", kind: "long", generated: context.footer }));
  fields.push(field({ id: "closing.cta", group: "footer", section: "footer", label: "Closing CTA", kind: "cta", generated: page.ctaLabel }));

  for (const section of page.sections) {
    if (!GROUP_FOR_SECTION[section.id] || section.id === "features" || section.id === "ingredients" || section.id === "faq" || section.id === "guarantee" || section.id === "considerations") {
      continue;
    }
    if (!section.visible) continue;
    fields.push(sectionTitle(section));
  }

  for (const [id, href] of Object.entries(NAV_HREFS)) {
    const section = page.sections.find((item) => item.id === id && item.visible);
    if (!section) continue;
    fields.push(field({
      id: `nav.${id}`,
      group: "footer",
      section: "footer",
      label: `Navigation label · ${href}`,
      kind: "title",
      generated: section.title,
    }));
  }

  return fields;
}

export function projectLooseFields(input: { headline: string; subheadline: string; ctaLabel: string; disclosure: string; footer: string }): ContentField[] {
  return [
    field({ id: "hero.headline", group: "hero", section: "hero", label: "Headline", kind: "headline", generated: input.headline }),
    field({ id: "hero.subheadline", group: "hero", section: "hero", label: "Subheadline", kind: "subheadline", generated: input.subheadline }),
    field({ id: "hero.cta", group: "hero", section: "hero", label: "CTA", kind: "cta", generated: input.ctaLabel }),
    field({ id: "hero.disclaimer", group: "hero", section: "hero", label: "Hero disclaimer", kind: "long", generated: "" }),
    field({ id: "closing.cta", group: "footer", section: "footer", label: "Closing CTA", kind: "cta", generated: input.ctaLabel }),
    field({ id: "footer.disclosure", group: "footer", section: "footer", label: "Disclosure", kind: "long", generated: input.disclosure }),
    field({ id: "footer.body", group: "footer", section: "footer", label: "Footer", kind: "long", generated: input.footer }),
    field({ id: "guarantee.body", group: "guarantee", section: "guarantee", label: "Guarantee", kind: "long", generated: "" }),
    field({ id: "returns.body", group: "guarantee", section: "returns", label: "Returns", kind: "long", generated: "" }),
    field({ id: "shipping.body", group: "guarantee", section: "shipping", label: "Shipping", kind: "long", generated: "" }),
    field({ id: "warnings.body", group: "warnings", section: "warnings", label: "Warnings", kind: "long", generated: "" }),
    field({ id: "manufacturer.body", group: "manufacturer", section: "manufacturer", label: "Manufacturer", kind: "long", generated: "" }),
  ];
}

function asTarget(section: string): LpSectionTarget {
  return (LP_SECTION_TARGETS as readonly string[]).includes(section) ? (section as LpSectionTarget) : "footer";
}

export function contentDocument(fields: readonly ContentField[]): LandingPageDocument {
  const sections = new Map<string, LandingPageDocument["sections"][number]>();
  for (const item of fields) {
    let section = sections.get(item.section);
    if (!section) {
      section = { id: item.section, target: asTarget(item.section), heading: item.section, visible: true, components: [] };
      sections.set(item.section, section);
    }
    section.components.push({
      id: item.id,
      role: item.kind === "cta" ? "button" : item.kind === "headline" ? "headline" : "text",
      text: item.generated,
      items: [],
      assetId: null,
      visible: true,
    });
  }
  return {
    sections: [...sections.values()],
    theme: { colors: {}, typography: {}, spacing: {} },
    assets: [],
    layout: { width: "", alignment: "start" },
  };
}

export function contentOverridePayload(rows: readonly StoredContentOverride[]): LandingPageOverride {
  return {
    components: rows.map((row) => ({
      ...createOverrideAudit({ actor: row.updatedBy, at: row.updatedAt, version: row.version }),
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      componentId: row.fieldId,
      text: row.value,
    })),
  };
}

export function effectiveTextMap(fields: readonly ContentField[], rows: readonly StoredContentOverride[]): Map<string, string> {
  const generated = contentDocument(fields);
  const effective = resolveLandingPage(generated, contentOverridePayload(rows));
  const texts = new Map<string, string>();
  for (const section of effective.sections) {
    for (const component of section.components) texts.set(component.id, component.text);
  }
  return texts;
}

export type ResolvedContentField = ContentField & {
  override: string | null;
  effective: string;
  modified: boolean;
};

export function resolveContentFields(fields: readonly ContentField[], rows: readonly StoredContentOverride[]): ResolvedContentField[] {
  const stored = new Map(rows.map((row) => [row.fieldId, row]));
  const effective = effectiveTextMap(fields, rows);
  return fields.map((item) => {
    const row = stored.get(item.id);
    return {
      ...item,
      override: row?.value ?? null,
      effective: effective.get(item.id) ?? item.generated,
      modified: Boolean(row),
    };
  });
}

function duplicateMessage(label: string, values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return `Duplicate ${label}.`;
    seen.add(key);
  }
  return null;
}

export function validateContentChange(
  fields: readonly ResolvedContentField[],
  fieldId: string,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const current = fields.find((item) => item.id === fieldId);
  if (!current) return { ok: false, error: "Unknown field." };
  if (contentHasUnsafeHtml(raw)) return { ok: false, error: "Unsafe HTML." };
  const value = sanitizeRichText(raw);
  if (!value) return { ok: false, error: "Value is empty." };
  if (value.length > CONTENT_LIMITS[current.kind]) return { ok: false, error: `Maximum length is ${CONTENT_LIMITS[current.kind]} characters.` };
  const urls = brokenUrls(value);
  if (urls.length > 0) return { ok: false, error: "Broken URL." };
  if (current.kind === "cta" && (/\bhttps?:\/\//i.test(value) || value.length < 2)) return { ok: false, error: "Invalid CTA." };

  const next = fields.map((item) => (item.id === fieldId ? { ...item, effective: value } : item));
  if (/^features\.item\.\d+\.title$/.test(fieldId)) {
    const titles = next.filter((item) => /^features\.item\.\d+\.title$/.test(item.id)).map((item) => item.effective);
    const duplicateFeature = duplicateMessage("feature", titles);
    if (duplicateFeature) return { ok: false, error: duplicateFeature };
  }
  if (/^faq\.item\.\d+\.question$/.test(fieldId)) {
    const questions = next.filter((item) => /^faq\.item\.\d+\.question$/.test(item.id)).map((item) => item.effective);
    const duplicateFaq = duplicateMessage("FAQ", questions);
    if (duplicateFaq) return { ok: false, error: duplicateFaq };
  }
  return { ok: true, value };
}

function modified(fields: readonly ResolvedContentField[], id: string): boolean {
  return fields.some((item) => item.id === id && item.modified);
}

function textOf(fields: readonly ResolvedContentField[], id: string, fallback = ""): string {
  return fields.find((item) => item.id === id)?.effective ?? fallback;
}

function indexes(fields: readonly ResolvedContentField[], pattern: RegExp): number[] {
  const found = new Set<number>();
  for (const item of fields) {
    const match = item.id.match(pattern);
    if (match) found.add(Number(match[1]));
  }
  return [...found].sort((left, right) => left - right);
}

function anyModified(fields: readonly ResolvedContentField[], ids: string[]): boolean {
  return ids.some((id) => modified(fields, id));
}

function replaceSectionBody(section: PresellSection, body: string): void {
  section.paragraphs = body.split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
  section.bullets = [];
  section.cards = [];
  section.faq = [];
}

function applyPairs(
  section: PresellSection,
  items: Array<{ title: string; description: string }>,
): void {
  if (section.cards.length > 0) {
    section.cards = items.map((item) => ({ title: item.title, body: item.description }));
    return;
  }
  if (section.bullets.length > 0) {
    section.bullets = items.map((item) => (item.description.trim() ? `${item.title}\n${item.description.trim()}` : item.title));
    return;
  }
  section.paragraphs = items.map((item) => [item.title, item.description].filter((part) => part.trim()).join("\n"));
}

export function applyEffectiveContent(page: PresellPage, fields: readonly ResolvedContentField[]): PresellPage & { builderContent?: RenderedBuilderContent } {
  if (!fields.some((item) => item.modified)) return page;
  const next = structuredClone(page) as PresellPage & { builderContent?: RenderedBuilderContent };
  const content: RenderedBuilderContent = {};

  if (modified(fields, "hero.headline")) next.hero.headline = textOf(fields, "hero.headline");
  if (modified(fields, "hero.subheadline")) next.hero.subheadline = textOf(fields, "hero.subheadline");
  if (modified(fields, "hero.cta")) next.ctaLabel = textOf(fields, "hero.cta");
  if (modified(fields, "hero.disclaimer")) content.heroDisclaimer = textOf(fields, "hero.disclaimer");

  const originalCta = page.ctaLabel;
  const closing = textOf(fields, "closing.cta", originalCta);
  if (modified(fields, "closing.cta") || (modified(fields, "hero.cta") && closing !== next.ctaLabel)) content.closingCta = closing;
  if (modified(fields, "pricing.cta")) content.pricingCta = textOf(fields, "pricing.cta");
  if (modified(fields, "section.pricing.title")) content.pricingTitle = textOf(fields, "section.pricing.title");

  for (const item of fields) {
    if (!item.modified || !item.id.startsWith("section.")) continue;
    const sectionId = item.id.split(".")[1];
    const section = next.sections.find((candidate) => candidate.id === sectionId);
    if (section) section.title = item.effective;
  }

  const featureIndexes = indexes(fields, /^features\.item\.(\d+)\./);
  if (anyModified(fields, featureIndexes.flatMap((index) => [`features.item.${index}.title`, `features.item.${index}.description`]))) {
    const section = next.sections.find((candidate) => candidate.id === "features");
    if (section) {
      applyPairs(section, featureIndexes.map((index) => ({
        title: textOf(fields, `features.item.${index}.title`),
        description: textOf(fields, `features.item.${index}.description`),
      })));
    }
  }

  const ingredientIndexes = indexes(fields, /^ingredients\.item\.(\d+)\./);
  if (anyModified(fields, ingredientIndexes.flatMap((index) => [`ingredients.item.${index}.title`, `ingredients.item.${index}.description`]))) {
    const section = next.sections.find((candidate) => candidate.id === "ingredients");
    if (section) {
      applyPairs(section, ingredientIndexes.map((index) => ({
        title: textOf(fields, `ingredients.item.${index}.title`),
        description: textOf(fields, `ingredients.item.${index}.description`),
      })));
    }
  }

  const faqIndexes = indexes(fields, /^faq\.item\.(\d+)\./);
  if (anyModified(fields, faqIndexes.flatMap((index) => [`faq.item.${index}.question`, `faq.item.${index}.answer`]))) {
    const section = next.sections.find((candidate) => candidate.id === "faq");
    if (section) {
      section.faq = faqIndexes.map((index) => ({
        question: textOf(fields, `faq.item.${index}.question`),
        answer: textOf(fields, `faq.item.${index}.answer`),
      }));
    }
  }

  if (modified(fields, "guarantee.body")) {
    const section = next.sections.find((candidate) => candidate.id === "guarantee");
    if (section) replaceSectionBody(section, textOf(fields, "guarantee.body"));
  }
  if (modified(fields, "warnings.body")) {
    const section = next.sections.find((candidate) => candidate.id === "considerations");
    if (section) replaceSectionBody(section, textOf(fields, "warnings.body"));
    else content.warnings = textOf(fields, "warnings.body");
  }

  const pricingIndexes = indexes(fields, /^pricing\.item\.(\d+)\./);
  if (anyModified(fields, pricingIndexes.flatMap((index) => [`pricing.item.${index}.title`, `pricing.item.${index}.description`]))) {
    content.pricing = pricingIndexes.map((index) => ({
      title: textOf(fields, `pricing.item.${index}.title`),
      description: textOf(fields, `pricing.item.${index}.description`),
    }));
  }

  if (modified(fields, "returns.body")) content.returns = textOf(fields, "returns.body");
  if (modified(fields, "shipping.body")) content.shipping = textOf(fields, "shipping.body");
  if (modified(fields, "manufacturer.body")) content.manufacturer = textOf(fields, "manufacturer.body");
  if (modified(fields, "footer.disclosure")) content.disclosure = textOf(fields, "footer.disclosure");
  if (modified(fields, "footer.body")) content.footer = textOf(fields, "footer.body");

  const navFields = fields.filter((item) => item.id.startsWith("nav."));
  const sectionTitleChanged = fields.some((item) => item.modified && item.id.startsWith("section."));
  const navChanged = navFields.some((item) => item.modified);
  if (navFields.length > 0 && (sectionTitleChanged || navChanged)) {
    content.navLabels = {};
    for (const item of navFields) {
      const id = item.id.slice("nav.".length);
      const href = NAV_HREFS[id];
      if (href) content.navLabels[href] = item.effective;
    }
  }

  if (Object.keys(content).length > 0) next.builderContent = content;
  return next;
}
