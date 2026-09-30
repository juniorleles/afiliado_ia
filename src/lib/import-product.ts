/**
 * Product importer V2 — Phase 3 (corrective patch).
 *
 * Deterministic HTML heuristics for real marketing/VSL pages. Checks
 * robots.txt before fetching and never bypasses a disallow. Does not invent
 * missing fields.
 *
 * extractProductFacts / checkRobotsRules are pure. importProductFromUrl
 * is the only network function (optional AI classification is a second step).
 */

import {
  emptyProductFacts,
  IMPORT_QUALITY_GAPS,
  withImportQuality,
  type FactConfidence,
  type FactField,
  type OfferFact,
  type ProductFacts,
  type SourceFact,
} from "@/lib/product-facts";
import {
  firstSentences,
  cautionStatementsFrom,
  isCautionQuestion,
  isFaqContainerHeading,
  isFeatureStatement,
  isFactualGuarantee,
  isGuaranteeQuestion,
  isProductAttributeChip,
  isProductLikeName,
  isMixtureCaption,
  isPromotionalHeading,
  isPromotionalOrCta,
  isQuestionHeading,
  isSectionLabel,
  isUsageInstruction,
  isUsageQuestion,
  isUsefulDescription,
  normalizeUsageInstruction,
  looksLikeHeadlineOrSlogan,
  looksLikeIngredientName,
  namesSimilar,
  selectFactualGuarantee,
  stripGenericTitleSuffix,
} from "@/lib/import-heuristics";
import {
  applyGenericFaqRecovery,
  promotionsFromFaqPairs,
  splitEmbeddedQa,
  type FaqQaPair,
} from "@/lib/faq-field-promotion";
import { classifyMissingFactsWithAi, shouldTryAiFallback } from "@/lib/ai/classify-product-facts";
import { extractProductImage, materializeProductImage } from "@/lib/product-image";
import { acquireBestProductAsset } from "@/lib/assets/acquire";
import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { logEvent } from "@/lib/logger";
import { checkRobotsRules } from "@/lib/robots";
import { htmlWithoutPageStructure, classifyContentBoundaries, isStructuralClass, sectionOwning, type ContentSection } from "@/lib/content-boundary";
import { extractIngredientContextFromHtml, isIngredientIdentityLabel } from "@/lib/ingredient-context";
import { extractExplicitProductFormat } from "@/lib/operational-evidence";
import { expandFirstPartySources } from "@/lib/first-party-source-expansion";
import { classifyImportFailure, looksLikePrimaryHttpBlockError, shouldTriggerNameDiscovery } from "@/lib/source-resolution/block";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/source-resolution/http";
import { importJobSignal, setImportStage } from "@/lib/source-resolution/progress";
import { createSourceResolutionSearch, getSearchProviderStatus } from "@/lib/source-resolution/provider";
import { productNameFromUrlPath } from "@/lib/source-resolution/queries";
import { discoverByProductName } from "@/lib/source-resolution/resolve";
import { PRIMARY_SOURCE_TIMEOUT_MS, ROBOTS_CHECK_TIMEOUT_MS } from "@/lib/source-resolution/timeouts";
import type { FetchImpl, PrimaryBlockReason, SearchFn, SearchProviderStatus } from "@/lib/source-resolution/types";

const USER_AGENT = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";
const MAX_ITEMS = 12;
const MAX_ITEM_LENGTH = 300;
const MAX_DESCRIPTION = 500;
const SECTION_BODY_CAP = 8000;

export type ExtractedProduct = {
  name: string | null;
  bullets: string[];
};

export type ExtractOptions = {
  operatorProductName?: string;
};

export type ImportDependencies = {
  fetchImpl?: FetchImpl;
  searchWeb?: SearchFn;
  importId?: string;
  signal?: AbortSignal;
  startedAt?: number;
  primaryFetchMs?: number;
};

type HeadingKind =
  | "features"
  | "ingredients"
  | "usage"
  | "cautions"
  | "pricing"
  | "guarantee"
  | "manufacturer"
  | "faq"
  | "about"
  | "other";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanText(html: string): string {
  return decodeHtmlEntities(stripTags(html)).trim();
}

function stripNoise(html: string): string {
  return html
    // Commented-out markup is not visible to any reader of the source page, so it is not evidence.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<section[^>]*class=["'][^"']*nav[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, " ")
    .replace(/<ul[^>]*class=["'][^"']*menu[^"']*["'][^>]*>[\s\S]*?<\/ul>/gi, " ");
}

function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const a = html.match(
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    );
    if (a?.[1]) return decodeHtmlEntities(a[1]).trim();
    const b = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"),
    );
    if (b?.[1]) return decodeHtmlEntities(b[1]).trim();
  }
  return undefined;
}

function allHeadings(html: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  for (const m of html.matchAll(re)) {
    const text = cleanText(m[1]);
    if (text) out.push(text);
  }
  return out;
}

function pagePlainText(html: string): string {
  return cleanText(html).slice(0, 20_000);
}

function classifyHeading(text: string): HeadingKind {
  const t = text.toLowerCase();
  if (isQuestionHeading(text) || /\b(faq|frequently asked)\b/.test(t)) return "faq";
  if (
    /\b(?:(?:key|active|main|core|listed)\s+)?ingredients?\b/i.test(t) ||
    /\b(what's inside|whats inside|composition|components?|materials?|supplement facts)\b/.test(t) ||
    /\byou['’]?ll find\b/.test(t) ||
    /^inside\b/.test(t)
  ) {
    return "ingredients";
  }
  if (/\b(how it works|how to use|directions?|usage|suggested use|instructions|recommended use)\b/.test(t)) {
    return "usage";
  }
  if (/\b(warnings?|cautions?|precautions?|side effects|safety information)\b/.test(t)) {
    return "cautions";
  }
  if (/\b(price|pricing|cost|msrp)\b/.test(t) && !isQuestionHeading(text)) return "pricing";
  if (/\b(guarantee|warranty|refund|money[- ]back)\b/.test(t)) return "guarantee";
  if (/\b(manufacturer|made by|manufactured by|about (the )?brand|about (the )?company)\b/.test(t)) {
    return "manufacturer";
  }
  if (/\b(features?|benefits?|key specs|specifications|what's included|whats included|highlights)\b/.test(t)) {
    return "features";
  }
  if (/^about\b/.test(t) && !/\b(brand|company|manufacturer)\b/.test(t)) return "about";
  return "other";
}

function extractListItems(html: string): string[] {
  const items: string[] = [];
  const listBlocks = html.matchAll(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const block of listBlocks) {
    const inner = block[2];
    if (isNavLikeList(inner)) continue;
    const liMatches = inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    for (const m of liMatches) {
      const text = cleanText(m[1]);
      if (text.length > 0 && text.length <= MAX_ITEM_LENGTH) {
        items.push(text);
      }
      if (items.length >= MAX_ITEMS) return items;
    }
  }
  return items;
}

function extractParagraphs(html: string, minLength = 20): string[] {
  const out: string[] = [];
  const matches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of matches) {
    const text = cleanText(m[1]);
    if (text.length >= minLength && text.length <= MAX_ITEM_LENGTH) {
      out.push(text);
    }
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Rows of short attribute labels ("Natural Formula · Non-GMO · Gluten Free") are
 * explicit product characteristics, but they carry no heading and are too short
 * to read as feature sentences, so no section branch ever sees them.
 *
 * A run is only trusted when at least three consecutive labels are separated by
 * markup alone: any other visible text between them means this is prose, a price
 * box or a testimonial card, not an attribute row.
 */
function extractAttributeChipRuns(html: string): string[] {
  // Generous raw window: indentation inflates the markup, the label itself stays short.
  const CHIP_TAG = /<(p|span|h4|h5|h6|li|div)[^>]*>([^<]{1,400})<\/\1>/gi;
  const found: string[] = [];
  let run: string[] = [];
  let cursor = -1;
  const flush = () => {
    if (run.length >= 3) found.push(...run);
    run = [];
  };
  for (const match of html.matchAll(CHIP_TAG)) {
    const text = cleanText(match[2]);
    const start = match.index ?? 0;
    const between = cursor >= 0 ? html.slice(cursor, start) : "";
    if (cursor >= 0 && cleanText(between).length > 0) flush();
    if (!text || !isProductAttributeChip(text)) {
      flush();
      cursor = start + match[0].length;
      continue;
    }
    run.push(text);
    cursor = start + match[0].length;
  }
  flush();
  return take(found, MAX_ITEMS);
}

function extractBoldPhrases(html: string): string[] {
  const out: string[] = [];
  // The tag name must be exactly b or strong. `<br>` is a line break.
  for (const m of html.matchAll(/<(b|strong)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const text = cleanText(m[2]);
    if (text) out.push(text);
  }
  return out;
}

const NAV_WORDS =
  /^(home|about|contact|cart|shop|login|menu|privacy|terms|blog|account|search|facebook|twitter|instagram|youtube|faq|ingredients?)$/i;

function isNavLikeList(listInnerHtml: string): boolean {
  const items: string[] = [];
  const liMatches = listInnerHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  for (const m of liMatches) {
    items.push(cleanText(m[1]));
  }
  if (items.length === 0) return false;

  const short = items.filter((i) => i.length > 0 && i.length < 22);
  const linkOnly = (listInnerHtml.match(/<li[^>]*>\s*<a\b/gi) ?? []).length;
  const navHits = items.filter((i) => NAV_WORDS.test(i) || /^about\s+/i.test(i)).length;
  const hashLinks = (listInnerHtml.match(/<a[^>]+href=["']#[^"']+["']/gi) ?? []).length;

  if (items.length >= 3 && hashLinks >= Math.max(2, items.length - 1)) return true;
  if (navHits >= Math.max(2, Math.ceil(items.length / 2))) return true;
  if (items.length >= 4 && short.length === items.length && linkOnly >= items.length - 1) return true;
  if (items.length >= 5 && short.length >= items.length - 1) return true;
  return false;
}

function take(items: string[], max = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function clip(text: string, max = MAX_DESCRIPTION): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function headingSections(html: string): Array<{ title: string; kind: HeadingKind; body: string }> {
  const sections: Array<{ title: string; kind: HeadingKind; body: string }> = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const found: Array<{ index: number; end: number; title: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      title: cleanText(match[2]),
    });
  }
  for (let i = 0; i < found.length; i += 1) {
    const current = found[i];
    if (!current.title) continue;
    const bodyEnd = i + 1 < found.length ? found[i + 1].index : html.length;
    const rawBody = html.slice(current.end, bodyEnd);
    sections.push({
      title: current.title,
      kind: classifyHeading(current.title),
      body: rawBody.length > SECTION_BODY_CAP ? rawBody.slice(0, SECTION_BODY_CAP) : rawBody,
    });
  }
  return sections;
}

const CURRENCY_ONLY = /^(?:[$€£]\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:usd|eur|gbp))$/i;
const INGREDIENT_CARD_LIMIT = 24;

type ParsedHeading = {
  level: number;
  title: string;
  index: number;
  end: number;
  openTag: string;
};

function parseHeadings(html: string): ParsedHeading[] {
  const out: ParsedHeading[] = [];
  const opens = [...html.matchAll(/<h([1-6])([^>]*)>/gi)];
  for (let i = 0; i < opens.length; i += 1) {
    const match = opens[i];
    const level = Number(match[1]);
    const index = match.index ?? 0;
    const openEnd = index + match[0].length;
    const nextIndex = opens[i + 1]?.index ?? html.length;
    const closeRel = html.slice(openEnd, nextIndex).search(new RegExp(`</h${level}>`, "i"));
    const titleEnd = closeRel >= 0 ? openEnd + closeRel : nextIndex;
    const title = cleanText(html.slice(openEnd, titleEnd));
    if (!title) continue;
    out.push({
      level,
      title,
      index,
      end: titleEnd,
      openTag: match[2] ?? "",
    });
  }
  return out;
}

function headingIsStruck(heading: ParsedHeading): boolean {
  return /line-through/i.test(heading.openTag);
}

function isPackageLabel(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return false;
  if (isQuestionHeading(t) || isPromotionalOrCta(t) || isPromotionalHeading(t)) return false;
  if (classifyHeading(t) !== "other") return false;
  if (CURRENCY_ONLY.test(t)) return false;
  if (/^(total|subtotal|savings|save|value|was|regular|msrp|retail|bonus|free)\b/i.test(t)) return false;
  if (/\b(total|savings|msrp|retail|bonus)\b/i.test(t) && /[$€£]|\d/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (!/[a-z]/i.test(t)) return false;
  return true;
}

function isComponentCardTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 90) return false;
  if (isQuestionHeading(t) || isPromotionalOrCta(t) || isPromotionalHeading(t)) return false;
  if (isMixtureCaption(t) || !isIngredientIdentityLabel(t)) return false;
  if (classifyHeading(t) !== "other") return false;
  if (CURRENCY_ONLY.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 10) return false;
  if (!/[a-z]/i.test(t)) return false;
  if (looksLikeHeadlineOrSlogan(t) && !/[&,]|\(/.test(t)) return false;
  return true;
}

function isBenefitCardTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length < 3 || t.length > 140) return false;
  if (isQuestionHeading(t) || isPromotionalOrCta(t)) return false;
  if (/\bbonus\b/i.test(t)) return false;
  if (CURRENCY_ONLY.test(t)) return false;
  if (classifyHeading(t) !== "other") return false;
  const words = t.split(/\s+/);
  if (words.length > 14) return false;
  if (!/[a-z]/i.test(t)) return false;
  return true;
}

function firstParagraph(html: string): string | undefined {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) return undefined;
  const text = cleanText(match[1] ?? "");
  return text || undefined;
}

type IngredientRegion = { start: number; end: number; contentStart: number };

function ingredientRegions(html: string, headings: ParsedHeading[]): IngredientRegion[] {
  const regions: IngredientRegion[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    if (current.level < 2 || current.level > 5) continue;
    if (classifyHeading(current.title) !== "ingredients") continue;
    let end = html.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      const next = headings[j];
      if (next.level < current.level) {
        end = next.index;
        break;
      }
      if (next.level === current.level) {
        const kind = classifyHeading(next.title);
        const continuesCards = kind === "other" && isComponentCardTitle(next.title);
        if (!continuesCards) {
          end = next.index;
          break;
        }
      }
    }
    regions.push({ start: current.index, end, contentStart: current.end });
  }
  return regions;
}

function collectNamedIngredientCards(
  html: string,
  headings: ParsedHeading[],
): { names: string[]; ranges: IngredientRegion[] } {
  const ranges = ingredientRegions(html, headings);
  const names: string[] = [];
  for (const region of ranges) {
    names.push(...extractIngredientsFromSection(html.slice(region.contentStart, region.end)));
    for (let i = 0; i < headings.length; i += 1) {
      const heading = headings[i];
      if (heading.index < region.contentStart || heading.index >= region.end) continue;
      if (heading.level < 3) continue;
      if (!isComponentCardTitle(heading.title)) continue;
      const next = headings[i + 1];
      const boundary = next && next.index < region.end ? next.index : region.end;
      const paragraph = firstParagraph(html.slice(heading.end, boundary));
      if (!paragraph || paragraph.length < 12) continue;
      names.push(heading.title);
    }
  }
  return { names, ranges };
}

export type SameCardIngredientVisual = {
  sourceUrl: string;
  assetUrl: string;
  sourceSection: string;
  associatedFactType: "ingredient";
  associatedFactValue: string;
  associationMethod: "same-card";
};

function resolveCardImageUrl(src: string, pageUrl: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:") || /\.svg(?:\?|$)/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, pageUrl || undefined);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function imageUrlsBeforeHeading(slice: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const img of slice.matchAll(/<img\b[^>]*>/gi)) {
    const src = img[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const url = resolveCardImageUrl(src, pageUrl);
    if (url && !found.includes(url)) found.push(url);
  }
  return found;
}

/**
 * An ingredient image is kept only when it sits in the same card as one
 * component heading. The heading is the fact. The filename is not.
 */
export function extractSameCardIngredientVisuals(html: string, sourceUrl: string): SameCardIngredientVisual[] {
  const bounded = htmlWithoutPageStructure(html);
  const headings = parseHeadings(bounded);
  const regions = ingredientRegions(bounded, headings);
  const visuals: SameCardIngredientVisual[] = [];
  for (const region of regions) {
    const regionHeading = headings.find((heading) => heading.index === region.start);
    const inRegion = headings.filter((heading) => heading.index >= region.contentStart && heading.index < region.end);
    for (let i = 0; i < inRegion.length; i += 1) {
      const heading = inRegion[i];
      if (heading.level < 3 || !isComponentCardTitle(heading.title)) continue;
      const windowStart = i === 0 ? region.contentStart : inRegion[i - 1].end;
      const urls = imageUrlsBeforeHeading(bounded.slice(windowStart, heading.index), sourceUrl);
      if (urls.length !== 1) continue;
      let sourceSection = regionHeading?.title ?? "";
      for (let j = i - 1; j >= 0; j -= 1) {
        if (inRegion[j].level < heading.level) {
          sourceSection = inRegion[j].title;
          break;
        }
      }
      visuals.push({
        sourceUrl,
        assetUrl: urls[0],
        sourceSection,
        associatedFactType: "ingredient",
        associatedFactValue: heading.title,
        associationMethod: "same-card",
      });
    }
  }
  return visuals;
}

function collectBenefitCards(
  html: string,
  headings: ParsedHeading[],
  ranges: IngredientRegion[],
): string[] {
  const inIngredientRegion = (index: number) => ranges.some((region) => index >= region.start && index < region.end);
  const cards: string[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const parent = headings[i];
    if (parent.level > 3) continue;
    const kind = classifyHeading(parent.title);
    if (kind === "faq" || kind === "ingredients" || kind === "pricing" || kind === "guarantee" || kind === "usage" || kind === "cautions" || kind === "manufacturer") {
      continue;
    }
    if (/\bbonus\b/i.test(parent.title) || CURRENCY_ONLY.test(parent.title) || isPackageLabel(parent.title)) continue;
    if (/^(total|subtotal|savings|save|value|was|regular|msrp|retail)\b/i.test(parent.title)) continue;
    let bodyEnd = html.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j].level <= parent.level && headings[j].level <= 3) {
        bodyEnd = headings[j].index;
        break;
      }
    }
    const found: string[] = [];
    for (let j = i + 1; j < headings.length; j += 1) {
      const card = headings[j];
      if (card.index >= bodyEnd) break;
      if (card.level < 4 || card.level > 6) continue;
      if (inIngredientRegion(card.index)) continue;
      if (!isBenefitCardTitle(card.title)) continue;
      const next = headings[j + 1];
      const boundary = next && next.index < bodyEnd ? next.index : bodyEnd;
      const paragraph = firstParagraph(html.slice(card.end, boundary));
      if (!paragraph || !isFeatureStatement(paragraph)) continue;
      if (/^(savings|total|subtotal|was|msrp)\b/i.test(paragraph)) continue;
      found.push(paragraph);
    }
    if (kind === "features" || found.length >= 2) cards.push(...found);
  }
  return cards;
}

const POPULARITY_LINE = /^(?:best seller|most popular|best value|recommended|most savings)$/i;
const QUANTITY_LINE = /^\d{1,4}\s+[A-Za-z][A-Za-z-]{2,24}$/;

function offerContinuation(title: string): boolean {
  if (CURRENCY_ONLY.test(title)) return true;
  if (/^(total|subtotal|savings|save|value|was|regular|msrp|retail|bonus)\b/i.test(title)) return true;
  return /shipping/i.test(title) && title.length <= 80;
}

function elementAlwaysHidden(attrs: string): boolean {
  if (/\bopacity-0\b/i.test(attrs)) return true;
  if (/\bvisually-hidden\b|\bsr-only\b/i.test(attrs)) return true;
  if (/\bhidden\b/i.test(attrs) && !/\baria-hidden\b/i.test(attrs)) return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[^\d.]|$)/i.test(attrs)) return true;
  if (/\bd-none\b/i.test(attrs) && !/\bd-(?:sm|md|lg|xl|xxl)-(?:block|flex|grid|inline)/i.test(attrs)) return true;
  return false;
}

function stripAlwaysHidden(html: string): string {
  return html.replace(/<(p|div|span|li|h[1-6]|small)\b([^>]*)>[\s\S]*?<\/\1>/gi, (full, _tag, attrs) =>
    elementAlwaysHidden(attrs ?? "") ? "" : full,
  );
}

function visibleOfferLines(html: string): string[] {
  const text = decodeHtmlEntities(
    stripAlwaysHidden(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(lines)];
}

function singleLine(lines: string[], test: (line: string) => boolean): string | undefined {
  const found = [...new Set(lines.filter(test))];
  return found.length === 1 ? found[0] : undefined;
}

function offerImageUrl(cardHtml: string, pageUrl: string): string | undefined {
  const visible = stripAlwaysHidden(cardHtml);
  const found: string[] = [];
  for (const img of visible.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const src = img[1] ?? "";
    const tag = img[0];
    if (/\.svg(?:\?|$)/i.test(src)) continue;
    if (/payment|cart|badge|seal|icon|logo|lock|secure|visa|mastercard|amex|paypal|guarantee/i.test(`${src} ${tag}`)) {
      continue;
    }
    try {
      const url = new URL(src, pageUrl || undefined);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      found.push(url.toString());
    } catch {
      continue;
    }
  }
  return found.length === 1 ? found[0] : undefined;
}

function collectOfferPrices(
  headings: ParsedHeading[],
  html: string,
  sourceUrl: string,
): { summary?: string; visible: boolean; offers: OfferFact[] } {
  const parts: string[] = [];
  const anchors: Array<{ label: string; heading: ParsedHeading; price: ParsedHeading; unitPrice: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < headings.length; i += 1) {
    const price = headings[i];
    if (headingIsStruck(price) || !CURRENCY_ONLY.test(price.title)) continue;
    let labelHeading: ParsedHeading | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const candidate = headings[j];
      if (headingIsStruck(candidate) && CURRENCY_ONLY.test(candidate.title)) continue;
      if (CURRENCY_ONLY.test(candidate.title)) continue;
      if (/^(total|subtotal|savings|save|value|was|regular|msrp|retail)\b/i.test(candidate.title)) continue;
      if (isPackageLabel(candidate.title)) labelHeading = candidate;
      break;
    }
    if (!labelHeading) continue;
    const key = labelHeading.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const next = headings[i + 1];
    const between = html.slice(price.end, next ? next.index : price.end + 180);
    const unit = cleanText(between).match(/^per\s+[a-z]+/i)?.[0];
    const unitPrice = unit ? `${price.title} ${unit}` : price.title;
    parts.push(`${labelHeading.title} ${unitPrice}`);
    anchors.push({ label: labelHeading.title, heading: labelHeading, price, unitPrice });
  }
  const drafts = anchors.map((anchor, index) => {
    const nextStart = anchors[index + 1]?.heading.index ?? html.length;
    let boundary = nextStart;
    for (const heading of headings) {
      if (heading.index <= anchor.price.end) continue;
      if (heading.index >= boundary) break;
      if (heading.level > anchor.heading.level) continue;
      if (offerContinuation(heading.title) || headingIsStruck(heading)) continue;
      boundary = heading.index;
      break;
    }
    const slice = html.slice(anchor.heading.end, boundary);
    const lines = visibleOfferLines(slice);
    const struck = headings.filter(
      (heading) =>
        heading.index > anchor.heading.index &&
        heading.index < boundary &&
        headingIsStruck(heading) &&
        CURRENCY_ONLY.test(heading.title),
    );
    const draft: OfferFact = {
      packageName: anchor.label,
      unitPrice: anchor.unitPrice,
      sourceUrl,
      confidence: "DIRECT_SOURCE",
    };
    const quantity = singleLine(lines, (line) => QUANTITY_LINE.test(line));
    const totalPrice = singleLine(lines, (line) => /^total:\s*\S+/i.test(line));
    const savings = singleLine(lines, (line) => /^savings:\s*\S+/i.test(line));
    const shipping = singleLine(lines, (line) => /shipping/i.test(line) && line.length <= 90);
    const bonuses = singleLine(
      lines,
      (line) => line.length <= 48 && /\bfree\b/i.test(line) && !/shipping/i.test(line) && !POPULARITY_LINE.test(line),
    );
    const popularityLabel = singleLine(lines, (line) => POPULARITY_LINE.test(line));
    const imageUrl = offerImageUrl(slice, sourceUrl);
    if (quantity) draft.quantity = quantity;
    if (totalPrice) draft.totalPrice = totalPrice;
    if (struck.length === 1) draft.originalPrice = struck[0].title;
    if (savings) draft.savings = savings;
    if (shipping) draft.shipping = shipping;
    if (bonuses) draft.bonuses = bonuses;
    if (popularityLabel) draft.popularityLabel = popularityLabel;
    if (imageUrl) draft.imageUrl = imageUrl;
    return draft;
  });
  if (drafts.length >= 2) {
    const earlier = drafts.slice(0, -1);
    const tailKeys = ["totalPrice", "savings", "shipping", "bonuses"] as const;
    const last = drafts[drafts.length - 1];
    for (const key of tailKeys) {
      if (last[key] && !earlier.some((offer) => offer[key])) delete last[key];
    }
  }
  if (parts.length === 0) return { visible: false, offers: [] };
  return { summary: parts.join("; "), visible: true, offers: drafts };
}

function chooseProductName(
  html: string,
  _pageText: string,
  operatorProductName?: string,
): { name: string; confidence: FactConfidence } | { name: null; confidence: "NOT_FOUND" } {
  const operator = operatorProductName?.trim();
  const og = metaContent(html, ["og:title"]);
  const titleRaw = allHeadings(html, "title")[0];
  const titleCore = titleRaw ? stripGenericTitleSuffix(titleRaw) : "";
  const h1s = allHeadings(html, "h1");

  if (
    operator &&
    operator.length >= 2 &&
    !isPromotionalOrCta(operator) &&
    !isPromotionalHeading(operator)
  ) {
    const inOg = Boolean(og && namesSimilar(og, operator) && !isPromotionalHeading(og));
    const inTitle = Boolean(titleCore && namesSimilar(titleCore, operator) && !isPromotionalHeading(titleCore));
    // Operator-attested identity is MANUAL (copy-eligible). DIRECT_SOURCE is
    // reserved for an explicit source title/og match. Page mentions do not
    // upgrade a guessed heading extract to DIRECT_SOURCE.
    const confidence: FactConfidence = inOg || inTitle ? "DIRECT_SOURCE" : "MANUAL";
    return { name: operator, confidence };
  }

  if (og && isProductLikeName(og, operator)) {
    return { name: og, confidence: "DIRECT_SOURCE" };
  }
  for (const h1 of h1s) {
    if (isProductLikeName(h1, operator)) {
      return { name: h1, confidence: "DIRECT_SOURCE" };
    }
  }
  if (titleCore && isProductLikeName(titleCore, operator)) {
    return { name: titleCore, confidence: "DIRECT_SOURCE" };
  }
  if (titleRaw && isProductLikeName(titleRaw, operator)) {
    return { name: titleRaw, confidence: "DIRECT_SOURCE" };
  }
  return { name: null, confidence: "NOT_FOUND" };
}

function chooseDescription(
  html: string,
  productName: string,
  sections: Array<{ title: string; kind: HeadingKind; body: string }>,
): { value: string; confidence: FactConfidence } | null {
  const meta = metaContent(html, ["og:description", "description"]);
  if (meta && isUsefulDescription(meta)) {
    return { value: clip(meta), confidence: "DIRECT_SOURCE" };
  }

  const name = productName.trim();
  const candidates: Array<{ value: string; confidence: FactConfidence }> = [];

  for (const section of sections) {
    if (section.kind !== "about" && section.kind !== "other" && section.kind !== "features") continue;
    const paragraphs = extractParagraphs(section.body, 40);
    for (const p of paragraphs) {
      if (!isUsefulDescription(p)) continue;
      if (name && !namesSimilar(p, name) && !p.toLowerCase().includes(name.toLowerCase()) && p.length < 80) {
        continue;
      }
      candidates.push({ value: clip(p), confidence: "HEURISTIC_EXTRACTION" });
    }
  }

  const loose = extractParagraphs(html, 40);
  for (const p of loose) {
    if (!isUsefulDescription(p)) continue;
    if (name && p.toLowerCase().includes(name.toLowerCase())) {
      candidates.unshift({ value: clip(p), confidence: "HEURISTIC_EXTRACTION" });
      break;
    }
    if (/\b(is a|is an|is the|unique blend|designed to|specially designed)\b/i.test(p)) {
      candidates.push({ value: clip(p), confidence: "HEURISTIC_EXTRACTION" });
    }
  }

  return candidates[0] ?? null;
}

function isCardLabelText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").replace(/[:]+$/g, "").trim();
  return isIngredientIdentityLabel(t) && !isMixtureCaption(t);
}

/**
 * A name is an ingredient only when the element is the card label and a list
 * or description follows it. Bold words inside a sentence are not a name.
 */
function extractStructuralIngredientLabels(body: string): string[] {
  const names: string[] = [];
  const matches = [...body.matchAll(/<(p|h[3-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const text = cleanText(match[2]).replace(/[:]+$/g, "").trim();
    if (!isCardLabelText(text)) continue;
    const bolds = extractBoldPhrases(match[2]).map((item) => item.replace(/[:]+$/g, "").trim());
    if (bolds.length > 1) continue;
    if (bolds.length === 1 && bolds[0].toLowerCase() !== text.toLowerCase()) continue;
    const end = (match.index ?? 0) + match[0].length;
    const next = matches.slice(i + 1).find((item) => isCardLabelText(cleanText(item[2])));
    const window = body.slice(end, next?.index ?? body.length);
    const hasList = /<(?:ul|ol)\b/i.test(window);
    const follow = firstParagraph(window);
    const hasStatement = Boolean(follow && follow.length >= 12 && !isCardLabelText(follow));
    if (!hasList && !hasStatement) continue;
    names.push(text);
  }
  return names;
}

function extractIngredientsFromSection(body: string): string[] {
  const cards = extractStructuralIngredientLabels(body);
  if (cards.length > 0) return take(cards, MAX_ITEMS);

  const lists = extractListItems(body).filter(
    (item) => isIngredientIdentityLabel(item) && item.split(/\s+/).length <= 8,
  );
  if (lists.length > 0) return take(lists, MAX_ITEMS);

  const paragraphs = extractParagraphs(body, 20);
  const fromProse: string[] = [];
  for (const p of paragraphs) {
    if (!/\b(includes?|contains?|made with|along with|formula)\b/i.test(p)) continue;
    const parts = p
      .split(/\s*(?:,|;| and |\.)\s*/i)
      .map((part) =>
        part
          .replace(/\b(includes?|contains?|made with|along with|the formula)\b/gi, "")
          .replace(/[.:]+$/g, "")
          .replace(/^(the|a|an)\s+/i, "")
          .trim(),
      )
      .filter((part) => looksLikeIngredientName(part));
    fromProse.push(...parts);
  }
  return take(fromProse, MAX_ITEMS);
}

function pickGuarantee(title: string, body: string): string | undefined {
  const paragraphs = extractParagraphs(body, 12);
  const lists = extractListItems(body);
  return selectFactualGuarantee([...paragraphs, ...lists, title]);
}

function extractFaqQaPairsFromHtml(title: string, body: string): FaqQaPair[] {
  const pairs: FaqQaPair[] = [];
  const seen = new Set<string>();
  const push = (question: string, answer: string) => {
    const q = question.replace(/\s+/g, " ").trim();
    const a = answer.replace(/\s+/g, " ").trim();
    if (!a) return;
    const key = `${q.toLowerCase()}::${a.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ question: q, answer: a });
  };

  for (const match of body.matchAll(/<details[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    push(cleanText(match[1]), cleanText(match[2]));
  }
  for (const match of body.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    push(cleanText(match[1]), cleanText(match[2]));
  }

  const listItems = extractListItems(body);
  const paragraphs = extractParagraphs(body, 8);
  const container =
    isFaqContainerHeading(title) || /\b(faq|frequently asked|questions?\s*(and|&)\s*answers?)\b/i.test(title);

  if (!container && isQuestionHeading(title)) {
    const answers = paragraphs.length > 0 ? paragraphs : listItems;
    if (answers.length > 0) {
      for (const answer of answers) push(title, answer);
    } else {
      const plain = cleanText(body);
      if (plain) push(title, plain);
    }
    return pairs;
  }

  for (const item of listItems) {
    const split = splitEmbeddedQa(item);
    push(split.question, split.answer);
  }

  for (let i = 0; i < paragraphs.length; i += 1) {
    const current = paragraphs[i];
    const next = paragraphs[i + 1];
    if (isQuestionHeading(current) && next && !isQuestionHeading(next)) {
      push(current, next);
      i += 1;
      continue;
    }
    const split = splitEmbeddedQa(current);
    push(split.question, split.answer);
  }

  return pairs;
}

export function extractProductFacts(html: string, sourceUrl = "", options: ExtractOptions = {}): ProductFacts {
  const cleaned = htmlWithoutPageStructure(stripNoise(html));
  const boundarySections = classifyContentBoundaries(html);
  const boundary = { html, sections: boundarySections };
  const pageText = pagePlainText(cleaned);
  const facts = emptyProductFacts("", sourceUrl, "IMPORTED");
  facts.importWarnings = [];
  facts.confidence.productName = "NOT_FOUND";

  const name = chooseProductName(cleaned, pageText, options.operatorProductName);
  if (name.name) {
    facts.productName = name.name;
    facts.confidence.productName = name.confidence;
    facts.sourceSnippets.push(snippet("productName", name.name, sourceUrl, name.confidence, { boundary }));
  }

  const sections = headingSections(cleaned);
  const description = chooseDescription(cleaned, facts.productName, sections);
  if (description) {
    facts.description = description.value;
    facts.confidence.description = description.confidence;
    facts.sourceSnippets.push(snippet("description", facts.description, sourceUrl, description.confidence, { boundary }));
  }

  const features: string[] = [];
  const ingredients: string[] = [];
  const usageRows: Array<{ value: string; evidence: string; question?: string }> = [];
  const cautions: string[] = [];
  const guaranteeCandidates: string[] = [];
  let pricing: string | undefined;
  let manufacturer: string | undefined;
  let recognizedFaq = false;

  const pushUsage = (raw: string, question?: string) => {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const normalized = normalizeUsageInstruction(trimmed);
    if (!isUsageInstruction(trimmed) && !isUsageInstruction(normalized)) return;
    usageRows.push({ value: normalized, evidence: trimmed, question });
  };

  for (const section of sections) {
    const listItems = extractListItems(section.body);
    const paragraphs = extractParagraphs(section.body);

    switch (section.kind) {
      case "features":
        features.push(...listItems.filter(isFeatureStatement));
        if (listItems.filter(isFeatureStatement).length === 0) {
          features.push(...paragraphs.filter(isFeatureStatement).slice(0, 4));
        }
        break;
      case "ingredients": {
        const found = extractIngredientsFromSection(section.body);
        ingredients.push(...found);
        break;
      }
      case "usage":
        for (const item of listItems) pushUsage(item);
        if (usageRows.length === 0) {
          for (const p of paragraphs.slice(0, 4)) pushUsage(p);
        }
        break;
      case "cautions":
        cautions.push(...listItems.flatMap((item) => cautionStatementsFrom(item)));
        if (listItems.length === 0) {
          cautions.push(...paragraphs.flatMap((item) => cautionStatementsFrom(item)).slice(0, 4));
        }
        break;
      case "pricing":
        pricing = listItems[0] || paragraphs[0] || cleanText(section.body).slice(0, 200) || undefined;
        if (pricing && isPromotionalOrCta(pricing) && !/\$/.test(pricing)) pricing = undefined;
        break;
      case "guarantee": {
        const picked = pickGuarantee(section.title, section.body);
        if (picked) guaranteeCandidates.push(picked);
        break;
      }
      case "manufacturer": {
        const candidate = listItems[0] || paragraphs[0];
        if (candidate && !isSectionLabel(candidate) && !isPromotionalOrCta(candidate)) {
          manufacturer = candidate;
        }
        break;
      }
      case "about":
        for (const p of paragraphs.filter(isFeatureStatement).slice(0, 3)) {
          if (!facts.description && isUsefulDescription(p)) {
            facts.description = clip(p);
            facts.confidence.description = "HEURISTIC_EXTRACTION";
            facts.sourceSnippets.push(snippet("description", facts.description, sourceUrl, "HEURISTIC_EXTRACTION", { boundary }));
          }
        }
        break;
      case "faq": {
        recognizedFaq = true;
        const pairs = extractFaqQaPairsFromHtml(section.title, section.body);
        const rawItems = listItems.length > 0 ? listItems : paragraphs;
        const toStore =
          rawItems.length > 0
            ? rawItems
            : pairs.map((pair) => (pair.question ? `${pair.question} ${pair.answer}` : pair.answer));
        for (const item of toStore) {
          facts.sourceSnippets.push(snippet("faq", item, sourceUrl, "DIRECT_SOURCE", { boundary }));
        }
        const promo = promotionsFromFaqPairs(pairs);
        for (const row of promo.usage) pushUsage(row.evidence, row.question);
        for (const row of promo.guarantee) guaranteeCandidates.push(row.evidence);
        if (!manufacturer && promo.manufacturer[0]) manufacturer = promo.manufacturer[0].value;
        for (const message of promo.schemaRelationshipLimitations) {
          if (!facts.importWarnings.includes(message)) facts.importWarnings.push(message);
        }
        if (isUsageQuestion(section.title)) {
          for (const p of paragraphs) pushUsage(p, section.title);
          if (usageRows.length === 0) {
            for (const p of paragraphs) pushUsage(firstSentences(p, 2), section.title);
          }
        }
        if (isCautionQuestion(section.title)) {
          cautions.push(...paragraphs.flatMap((item) => cautionStatementsFrom(item)).slice(0, 2));
        }
        if (isGuaranteeQuestion(section.title)) {
          const picked = pickGuarantee(section.title, section.body);
          if (picked) guaranteeCandidates.push(picked);
        }
        break;
      }
      default:
        break;
    }
  }

  if (usageRows.length === 0) {
    for (const p of extractParagraphs(cleaned, 20)) {
      pushUsage(p);
    }
  }
  for (const p of extractParagraphs(cleaned, 20)) {
    if (isFactualGuarantee(p)) guaranteeCandidates.push(p);
  }
  const guarantee = selectFactualGuarantee(guaranteeCandidates);

  const parsedHeadings = parseHeadings(cleaned);
  const structuralIngredients = collectNamedIngredientCards(cleaned, parsedHeadings);
  ingredients.push(...structuralIngredients.names);
  const benefitCards = collectBenefitCards(cleaned, parsedHeadings, structuralIngredients.ranges);
  features.push(...benefitCards);
  const offerPrices = collectOfferPrices(parsedHeadings, cleaned, sourceUrl);
  if (!pricing && offerPrices.summary) pricing = offerPrices.summary;
  if (offerPrices.offers.length > 0) facts.offerFacts = offerPrices.offers;

  features.push(...extractAttributeChipRuns(cleaned));
  const identityIngredients = ingredients.filter(isIngredientIdentityLabel);
  const structuralNames = structuralIngredients.names.filter(isComponentCardTitle);
  facts.ingredientsOrComponents = take([...identityIngredients, ...structuralNames], INGREDIENT_CARD_LIMIT);
  // A component list is also a run of short labels; the same value must not be
  // reported twice under two different meanings.
  const componentValues = new Set(facts.ingredientsOrComponents.map((item) => item.trim().toLowerCase()));
  const structureLabels = new Set(
    boundarySections
      .filter((section) => isStructuralClass(section.classification))
      .flatMap((section) => section.labels.map((label) => label.trim().toLowerCase())),
  );
  facts.features = take(
    features.filter((item) => {
      const key = item.trim().toLowerCase();
      if (structureLabels.has(key) && item.trim().split(/\s+/).length <= 6) return false;
      return !componentValues.has(key) && (isFeatureStatement(item) || isProductAttributeChip(item));
    }),
  );
  const usageTaken = take(usageRows.map((row) => row.value));
  facts.usageInformation = usageTaken;
  facts.cautions = take(cautions.flatMap((c) => cautionStatementsFrom(c)));
  if (pricing) facts.pricingInformation = clip(pricing, 240);
  if (guarantee) facts.guaranteeInformation = clip(guarantee, 240);
  if (manufacturer && !isSectionLabel(manufacturer)) facts.manufacturer = clip(manufacturer, 120);

  facts.ingredientContext = extractIngredientContextFromHtml(
    cleaned,
    facts.ingredientsOrComponents,
    sourceUrl,
    { sourcePageCategory: "PRIMARY" },
  );
  for (const entry of facts.ingredientContext) {
    facts.sourceSnippets.push({
      field: "ingredientContext",
      text: entry.statement,
      sourceUrl: entry.sourceUrl,
      confidence: entry.provenance,
      sourcePageCategory: entry.sourcePageCategory,
      sourceUnit: entry.sourceUnit,
      sourceLocation: entry.sourceLocation,
      retrievedAt: entry.retrievedAt,
    });
  }

  const formatPool = [
    ...facts.usageInformation,
    ...usageRows.map((row) => row.evidence),
    ...extractParagraphs(cleaned, 12),
  ];
  facts.productFormat = extractExplicitProductFormat(formatPool, sourceUrl, { sourcePageCategory: "PRIMARY" });
  if (facts.productFormat) {
    facts.sourceSnippets.push({
      field: "productFormat",
      text: facts.productFormat.statement,
      sourceUrl: facts.productFormat.sourceUrl,
      confidence: facts.productFormat.provenance,
      sourcePageCategory: facts.productFormat.sourcePageCategory,
      sourceUnit: facts.productFormat.sourceUnit,
      sourceLocation: facts.productFormat.sourceLocation,
    });
  }

  if (facts.features.length > 0) {
    facts.confidence.features = "DIRECT_SOURCE";
    for (const item of facts.features) {
      facts.sourceSnippets.push(snippet("features", item, sourceUrl, "DIRECT_SOURCE", { boundary }));
    }
  }

  setListConfidence(facts, "ingredientsOrComponents", facts.ingredientsOrComponents, sourceUrl, boundary);
  if (facts.usageInformation.length === 0) {
    facts.confidence.usageInformation = "NOT_FOUND";
  } else {
    facts.confidence.usageInformation = "DIRECT_SOURCE";
    for (const value of facts.usageInformation) {
      const row = usageRows.find((item) => item.value === value);
      const evidence = row?.evidence ?? value;
      facts.sourceSnippets.push(
        snippet("usageInformation", evidence, sourceUrl, "DIRECT_SOURCE", {
          question: row?.question,
          context: row?.question ? "faq" : undefined,
          boundary,
        }),
      );
    }
  }
  setListConfidence(facts, "cautions", facts.cautions, sourceUrl, boundary);
  setScalarConfidence(facts, "pricingInformation", facts.pricingInformation, sourceUrl, "DIRECT_SOURCE", boundary);
  if (facts.confidence.pricingInformation === "DIRECT_SOURCE") {
    for (const offer of facts.offerFacts ?? []) {
      const phrases = [
        offer.quantity,
        offer.totalPrice,
        offer.originalPrice,
        offer.savings,
        offer.shipping,
        offer.bonuses,
        offer.popularityLabel,
      ].filter((phrase): phrase is string => Boolean(phrase));
      for (const phrase of phrases) {
        facts.sourceSnippets.push(snippet("pricingInformation", phrase, sourceUrl, "DIRECT_SOURCE", { boundary }));
      }
    }
  } else {
    facts.offerFacts = undefined;
  }
  setScalarConfidence(
    facts,
    "guaranteeInformation",
    facts.guaranteeInformation,
    sourceUrl,
    facts.guaranteeInformation ? "DIRECT_SOURCE" : "NOT_FOUND",
    boundary,
  );
  setScalarConfidence(facts, "manufacturer", facts.manufacturer, sourceUrl, "DIRECT_SOURCE", boundary);

  if (facts.guaranteeInformation && /\d+\s*-?\s*day/i.test(facts.guaranteeInformation)) {
    facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
    for (let i = facts.sourceSnippets.length - 1; i >= 0; i -= 1) {
      if (facts.sourceSnippets[i].field === "guaranteeInformation") {
        facts.sourceSnippets[i] = { ...facts.sourceSnippets[i], confidence: "DIRECT_SOURCE" };
        break;
      }
    }
  }

  if (!facts.description) {
    facts.importWarnings.push("Description could not be reliably extracted.");
  }
  if (facts.confidence.pricingInformation === "NOT_FOUND") {
    facts.importWarnings.push("Pricing could not be reliably extracted.");
  }
  if (facts.confidence.manufacturer === "NOT_FOUND") {
    facts.importWarnings.push("Manufacturer not identified.");
  }
  if (facts.confidence.ingredientsOrComponents === "NOT_FOUND") {
    facts.importWarnings.push("Ingredients / components were not found.");
  }
  const keptIngredients = new Set(facts.ingredientsOrComponents.map((item) => item.trim().toLowerCase()));
  const missedIngredientCards = structuralNames.filter((name) => !keptIngredients.has(name.trim().toLowerCase()));
  if (structuralNames.length > 0 && facts.ingredientsOrComponents.length === 0 && missedIngredientCards.length > 0) {
    facts.importWarnings.push(IMPORT_QUALITY_GAPS.ingredients);
  }
  if (benefitCards.length > 0 && facts.features.length === 0) {
    facts.importWarnings.push(IMPORT_QUALITY_GAPS.features);
  }
  if (offerPrices.visible && facts.confidence.pricingInformation === "NOT_FOUND") {
    facts.importWarnings.push(IMPORT_QUALITY_GAPS.pricing);
  }
  if (recognizedFaq) {
    facts.importWarnings.push("FAQ section recognized; snippets stored as source facts, not copied as the presell.");
  }

  const useful =
    facts.features.length +
    facts.ingredientsOrComponents.length +
    facts.usageInformation.length +
    (facts.description ? 1 : 0);
  if (!facts.productName && useful === 0) {
    facts.importWarnings.push("Almost no product information found. Fill MANUAL PRODUCT FACTS before generating.");
  }

  facts.importWarnings = [...new Set(facts.importWarnings)];
  const image = extractProductImage(html, sourceUrl);
  if (image) {
    facts.productImageUrl = image.url;
    facts.productImageProvenance = image.provenance;
  }
  return applyGenericFaqRecovery(withImportQuality(pinOperatorProductName(facts, options.operatorProductName)));
}

function boundaryMeta(html: string, sections: ContentSection[], text: string): { sourceUnit: string; sourceLocation: string } {
  const needle = text.replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();
  const lower = html.toLowerCase();
  let from = 0;
  let fallback: ContentSection | undefined;
  while (needle && from < lower.length) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    const owner = sectionOwning(sections, at);
    if (owner && !isStructuralClass(owner.classification)) return located(owner);
    fallback = owner ?? fallback;
    from = at + Math.max(needle.length, 1);
  }
  return located(fallback);
}

function located(owner: ContentSection | undefined): { sourceUnit: string; sourceLocation: string } {
  return {
    sourceUnit: owner?.labels.find((label) => label.trim())?.slice(0, 120) || "document",
    sourceLocation: owner && !isStructuralClass(owner.classification) ? owner.classification : "PRODUCT_CONTENT",
  };
}
function setListConfidence(
  facts: ProductFacts,
  field: FactField,
  values: string[],
  sourceUrl: string,
  boundary?: { html: string; sections: ContentSection[] },
) {
  if (values.length === 0) {
    facts.confidence[field] = "NOT_FOUND";
    return;
  }
  facts.confidence[field] = "DIRECT_SOURCE";
  for (const item of values) {
    facts.sourceSnippets.push(snippet(field, item, sourceUrl, "DIRECT_SOURCE", { boundary }));
  }
}

function setScalarConfidence(
  facts: ProductFacts,
  field: FactField,
  value: string | undefined,
  sourceUrl: string,
  confidence: FactConfidence = "DIRECT_SOURCE",
  boundary?: { html: string; sections: ContentSection[] },
) {
  if (!value) {
    facts.confidence[field] = "NOT_FOUND";
    return;
  }
  facts.confidence[field] = confidence;
  facts.sourceSnippets.push(snippet(field, value, sourceUrl, confidence, { boundary }));
}

function snippet(
  field: string,
  text: string,
  sourceUrl: string,
  confidence: FactConfidence,
  extra?: {
    question?: string;
    context?: string;
    boundary?: { html: string; sections: ContentSection[] };
  },
): SourceFact {
  const place = extra?.boundary ? boundaryMeta(extra.boundary.html, extra.boundary.sections, text) : undefined;
  return {
    field,
    text,
    sourceUrl,
    confidence,
    ...(extra?.question ? { question: extra.question } : {}),
    ...(extra?.context ? { context: extra.context } : {}),
    ...(place ? { sourceUnit: place.sourceUnit, sourceLocation: place.sourceLocation } : {}),
  };
}

/** Phase 8 compatibility: name + feature bullets only. */
export function extractProductInfo(html: string): ExtractedProduct {
  const facts = extractProductFacts(html);
  return {
    name: facts.productName || null,
    bullets: facts.features,
  };
}

export { checkRobotsRules } from "@/lib/robots";

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt de ${new URL(url).host} proíbe acesso a este caminho — não vou contornar isso.`);
    this.name = "RobotsDisallowedError";
  }
}

export class ImportFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFetchError";
  }
}

export class ImportBlockedError extends Error {
  readonly reason: PrimaryBlockReason;
  readonly needsProductName: boolean;
  constructor(reason: PrimaryBlockReason, message: string, needsProductName = false) {
    super(message);
    this.name = "ImportBlockedError";
    this.reason = reason;
    this.needsProductName = needsProductName;
  }
}

async function isAllowedByRobots(
  targetUrl: string,
  fetchImpl: FetchImpl = fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

  let robotsText: string;
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      robotsUrl,
      { headers: { "user-agent": USER_AGENT } },
      ROBOTS_CHECK_TIMEOUT_MS,
      signal,
    );
    if (!res.ok) return true;
    robotsText = await res.text();
  } catch (err) {
    if (signal?.aborted) throw err;
    return true;
  }

  return checkRobotsRules(robotsText, url.pathname);
}

export async function importProductFromUrl(
  targetUrl: string,
  options: ExtractOptions = {},
  deps: ImportDependencies = {},
): Promise<ProductFacts> {
  assertSafeOutboundUrl(targetUrl);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const signal = deps.signal || importJobSignal(deps.importId);
  const startedAt = Date.now();
  setImportStage(deps.importId, "Checking primary source...");
  logEvent("INFO", "IMPORT", "PRIMARY_FETCH_START", { runId: deps.importId, url: targetUrl });
  const allowed = await isAllowedByRobots(targetUrl, fetchImpl, signal);
  if (!allowed) {
    return recoverBlockedPrimarySource(targetUrl, "ROBOTS_BLOCKED", options, { ...deps, signal, startedAt, primaryFetchMs: Date.now() - startedAt });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      targetUrl,
      { headers: { "user-agent": USER_AGENT }, cache: "no-store" },
      PRIMARY_SOURCE_TIMEOUT_MS,
      signal,
    );
  } catch (err) {
    if (signal?.aborted) {
      throw new ImportFetchError("Import cancelled.");
    }
    if (err instanceof FetchTimeoutError) {
      return recoverBlockedPrimarySource(targetUrl, "ANTI_BOT_BLOCKED", options, {
        ...deps,
        signal,
        startedAt,
        primaryFetchMs: Date.now() - startedAt,
      });
    }
    throw new ImportFetchError(
      `Não consegui acessar a URL: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
    );
  }

  const body = await response.text();
  const primaryFetchMs = Date.now() - startedAt;
  const block =
    classifyImportFailure({ status: response.status, body }) ||
    (Number(response.status) === 403 ? "HTTP_403" : null) ||
    (Number(response.status) === 401 ? "ACCESS_DENIED" : null);
    logEvent("INFO", "IMPORT", "PRIMARY_FETCH_END", {
      runId: deps.importId,
      url: targetUrl,
      status: response.status,
      durationMs: primaryFetchMs,
      block: block || null,
    });
    if (block && shouldTriggerNameDiscovery(block)) {
    logEvent("INFO", "IMPORT", "PRIMARY_BLOCKED", { runId: deps.importId, url: targetUrl, reason: block, status: response.status });
    setImportStage(deps.importId, block === "HTTP_403" ? "Primary source returned HTTP 403." : `Primary source blocked (${block}).`);
    return recoverBlockedPrimarySource(targetUrl, block, options, { ...deps, signal, startedAt, primaryFetchMs });
  }

  if (!response.ok) {
    throw new ImportFetchError(`A página respondeu HTTP ${response.status} — não deu pra importar.`);
  }

  return finalizeExtractedPage(body, targetUrl, options);
}

export async function recoverBlockedPrimarySource(
  targetUrl: string,
  reason: PrimaryBlockReason,
  options: ExtractOptions = {},
  deps: ImportDependencies = {},
): Promise<ProductFacts> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const signal = deps.signal || importJobSignal(deps.importId);
  const operatorName = options.operatorProductName?.trim() || "";
  const productName = operatorName || productNameFromUrlPath(targetUrl) || "";
  logEvent("INFO", "IMPORT", "SOURCE_RESOLUTION_START", {
    runId: deps.importId,
    url: targetUrl,
    reason,
    productName: productName || null,
    operatorNamePriority: Boolean(operatorName),
  });
  if (!productName) {
    throw new ImportBlockedError(
      reason,
      `Primary source unavailable (${reason}). Enter the product name to search the web. The original URL was not bypassed.`,
      true,
    );
  }
  const provider = deps.searchWeb
    ? {
        search: deps.searchWeb,
        status: {
          ...getSearchProviderStatus(),
          configured: true,
          realWebSearchAvailable: true,
          name: getSearchProviderStatus().name,
        } satisfies SearchProviderStatus,
      }
    : createSourceResolutionSearch(fetchImpl, signal);
  const discovered = await discoverByProductName({
    productName,
    originalUrl: targetUrl,
    blockReason: reason,
    fetchImpl,
    searchWeb: provider.search,
    searchProvider: provider.status,
    isAllowedByRobots: (url, inner) => isAllowedByRobots(url, fetchImpl, inner || signal),
    extractFacts: (html, url) => extractProductFacts(html, url, {}),
    signal,
    importId: deps.importId,
    startedAt: deps.startedAt,
    primaryFetchMs: deps.primaryFetchMs,
  });
  return attachLocalProductImage(discovered);
}

export function isRecoverablePrimaryImportError(error: unknown): boolean {
  return looksLikePrimaryHttpBlockError(error);
}

async function finalizeExtractedPage(html: string, targetUrl: string, options: ExtractOptions): Promise<ProductFacts> {
  const facts = extractProductFacts(html, targetUrl, options);
  const pinned = pinOperatorProductName(facts, options.operatorProductName);
  let expanded = pinned;
  try {
    expanded = (await expandFirstPartySources(pinned, html, targetUrl)).facts;
  } catch {
    expanded = pinned;
  }
  const text = pagePlainText(htmlWithoutPageStructure(stripNoise(html)));
  let resolved = expanded;
  if (shouldTryAiFallback(expanded, text)) {
    try {
      resolved = pinOperatorProductName(
        await classifyMissingFactsWithAi(expanded, text, options.operatorProductName || expanded.productName),
        options.operatorProductName,
      );
    } catch {
      expanded.importWarnings = [
        ...expanded.importWarnings,
        "AI source classification was skipped after an error; deterministic extraction was kept.",
      ];
      resolved = withImportQuality(expanded);
    }
  }
  return attachLocalProductImage(resolved, html, targetUrl);
}

async function attachLocalProductImage(facts: ProductFacts, html?: string, sourceUrl?: string): Promise<ProductFacts> {
  if (html && sourceUrl) {
    const acquired = await acquireBestProductAsset(html, sourceUrl);
    if (acquired.selected) {
      return {
        ...facts,
        productImageUrl: acquired.selected.localPath,
        productImageProvenance: "DIRECT_SOURCE",
      };
    }
  }
  if (!facts.productImageUrl) return facts;
  const stored = await materializeProductImage(facts.productImageUrl, facts.productImageProvenance);
  if (!stored) return facts;
  return { ...facts, productImageUrl: stored.src, productImageProvenance: stored.provenance };
}

export function pinOperatorProductName(facts: ProductFacts, operatorProductName?: string): ProductFacts {
  const operator = operatorProductName?.trim();
  if (!operator || operator.length < 2) return facts;
  if (isPromotionalOrCta(operator) || isPromotionalHeading(operator)) return facts;
  if (facts.productName === operator) return facts;
  return withImportQuality({
    ...facts,
    productName: operator,
    confidence: {
      ...facts.confidence,
      productName: facts.confidence.productName === "NOT_FOUND" ? "MANUAL" : facts.confidence.productName,
    },
  });
}
