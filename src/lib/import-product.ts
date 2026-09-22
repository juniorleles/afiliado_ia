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
  withImportQuality,
  type FactConfidence,
  type FactField,
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
  isProductLikeName,
  isPromotionalHeading,
  isPromotionalOrCta,
  isQuestionHeading,
  isSectionLabel,
  isUsageInstruction,
  isUsageQuestion,
  isUsefulDescription,
  normalizeUsageInstruction,
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

function extractBoldPhrases(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi)) {
    const text = cleanText(m[1]);
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

function extractIngredientsFromSection(body: string): string[] {
  const bold = extractBoldPhrases(body).filter(looksLikeIngredientName);
  if (bold.length > 0) return take(bold, MAX_ITEMS);

  const cards: string[] = [];
  for (const m of body.matchAll(/<(?:h3|p)[^>]*>([\s\S]*?)<\/(?:h3|p)>/gi)) {
    const text = cleanText(m[1]);
    if (looksLikeIngredientName(text) && text.split(/\s+/).length <= 6) {
      cards.push(text);
    }
  }
  if (cards.length > 0) return take(cards, MAX_ITEMS);

  const lists = extractListItems(body).filter((item) => looksLikeIngredientName(item) && item.split(/\s+/).length <= 8);
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
  const cleaned = stripNoise(html);
  const pageText = pagePlainText(cleaned);
  const facts = emptyProductFacts("", sourceUrl, "IMPORTED");
  facts.importWarnings = [];
  facts.confidence.productName = "NOT_FOUND";

  const name = chooseProductName(cleaned, pageText, options.operatorProductName);
  if (name.name) {
    facts.productName = name.name;
    facts.confidence.productName = name.confidence;
    facts.sourceSnippets.push(snippet("productName", name.name, sourceUrl, name.confidence));
  }

  const sections = headingSections(cleaned);
  const description = chooseDescription(cleaned, facts.productName, sections);
  if (description) {
    facts.description = description.value;
    facts.confidence.description = description.confidence;
    facts.sourceSnippets.push(snippet("description", facts.description, sourceUrl, description.confidence));
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
            facts.sourceSnippets.push(snippet("description", facts.description, sourceUrl, "HEURISTIC_EXTRACTION"));
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
          facts.sourceSnippets.push(snippet("faq", item, sourceUrl, "DIRECT_SOURCE"));
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

  facts.features = take(features.filter(isFeatureStatement));
  facts.ingredientsOrComponents = take(ingredients.filter(looksLikeIngredientName));
  const usageTaken = take(usageRows.map((row) => row.value));
  facts.usageInformation = usageTaken;
  facts.cautions = take(cautions.flatMap((c) => cautionStatementsFrom(c)));
  if (pricing) facts.pricingInformation = clip(pricing, 240);
  if (guarantee) facts.guaranteeInformation = clip(guarantee, 240);
  if (manufacturer && !isSectionLabel(manufacturer)) facts.manufacturer = clip(manufacturer, 120);

  if (facts.features.length > 0) {
    facts.confidence.features = "DIRECT_SOURCE";
    for (const item of facts.features) {
      facts.sourceSnippets.push(snippet("features", item, sourceUrl, "DIRECT_SOURCE"));
    }
  }

  setListConfidence(facts, "ingredientsOrComponents", facts.ingredientsOrComponents, sourceUrl);
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
        }),
      );
    }
  }
  setListConfidence(facts, "cautions", facts.cautions, sourceUrl);
  setScalarConfidence(facts, "pricingInformation", facts.pricingInformation, sourceUrl);
  setScalarConfidence(
    facts,
    "guaranteeInformation",
    facts.guaranteeInformation,
    sourceUrl,
    facts.guaranteeInformation ? "DIRECT_SOURCE" : "NOT_FOUND",
  );
  setScalarConfidence(facts, "manufacturer", facts.manufacturer, sourceUrl);

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

function setListConfidence(
  facts: ProductFacts,
  field: FactField,
  values: string[],
  sourceUrl: string,
) {
  if (values.length === 0) {
    facts.confidence[field] = "NOT_FOUND";
    return;
  }
  facts.confidence[field] = "DIRECT_SOURCE";
  for (const item of values) {
    facts.sourceSnippets.push(snippet(field, item, sourceUrl, "DIRECT_SOURCE"));
  }
}

function setScalarConfidence(
  facts: ProductFacts,
  field: FactField,
  value: string | undefined,
  sourceUrl: string,
  confidence: FactConfidence = "DIRECT_SOURCE",
) {
  if (!value) {
    facts.confidence[field] = "NOT_FOUND";
    return;
  }
  facts.confidence[field] = confidence;
  facts.sourceSnippets.push(snippet(field, value, sourceUrl, confidence));
}

function snippet(
  field: string,
  text: string,
  sourceUrl: string,
  confidence: FactConfidence,
  extra?: { question?: string; context?: string },
): SourceFact {
  return {
    field,
    text,
    sourceUrl,
    confidence,
    ...(extra?.question ? { question: extra.question } : {}),
    ...(extra?.context ? { context: extra.context } : {}),
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

export function checkRobotsRules(robotsText: string, path: string): boolean {
  const lines = robotsText.split("\n").map((l) => l.trim());
  let inWildcardGroup = false;
  let disallowed = false;

  for (const line of lines) {
    if (/^user-agent:\s*\*\s*$/i.test(line)) {
      inWildcardGroup = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inWildcardGroup = false;
      continue;
    }
    if (inWildcardGroup && /^disallow:/i.test(line)) {
      const rule = line.split(":").slice(1).join(":").trim();
      if (rule !== "" && path.startsWith(rule)) {
        disallowed = true;
      }
    }
  }

  return !disallowed;
}

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
  const text = pagePlainText(stripNoise(html));
  let resolved = pinned;
  if (shouldTryAiFallback(pinned, text)) {
    try {
      resolved = pinOperatorProductName(
        await classifyMissingFactsWithAi(pinned, text, options.operatorProductName || pinned.productName),
        options.operatorProductName,
      );
    } catch {
      pinned.importWarnings = [
        ...pinned.importWarnings,
        "AI source classification was skipped after an error; deterministic extraction was kept.",
      ];
      resolved = withImportQuality(pinned);
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
