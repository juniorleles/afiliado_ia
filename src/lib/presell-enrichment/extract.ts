import {
  cautionStatementsFrom,
  firstSentences,
  isActualCaution,
  isFactualGuarantee,
  isFeatureStatement,
  isIngredientIdentityName,
  isOperationalFulfillmentCopy,
  isPointerOrReferenceCopy,
  isPromotionalOrCta,
  isQuestionHeading,
  isUsageInstruction,
  isUsefulDescription,
  normalizeUsageInstruction,
} from "@/lib/import-heuristics";
import { splitEmbeddedQa } from "@/lib/faq-field-promotion";
import { parseSpecificationLine } from "@/lib/specification-text";
import {
  cleanHtmlText,
  extractListItems,
  extractParagraphs,
  extractTaggedTexts,
  stripHiddenMarkup,
} from "@/lib/source-html";
import type { EnrichmentSource, StructuredRecord } from "@/lib/product-enrichment/types";
import type { ExtractedPresellItem, PresellSemanticField } from "@/lib/presell-enrichment/types";
import { isCharacteristicNotBenefit } from "@/lib/presell-enrichment/classify";

const MAX_OVERVIEW = 280;
const TESTIMONIAL = /\b(verified buyer|testimonial|★★|five stars|i tried this and)\b/i;
const PRICE_MARK = /[$€£]\s*\d|\b\d+\s*%\s*off\b/;
const AFFILIATE_PROGRAM =
  /\b(epc|clickbank|copywriters?|vsl crafted|massive income|top affiliates|autoship|hopid|a-list copy)\b/i;

function isAffiliateProgramSource(url: string): boolean {
  return /affiliate/i.test(url);
}

function clipOverview(text: string): string {
  return firstSentences(text, 2).slice(0, MAX_OVERVIEW).trim();
}

function isDirectionalInstruction(text: string): boolean {
  const normalized = normalizeUsageInstruction(text);
  if (isUsageInstruction(text) || isUsageInstruction(normalized)) return true;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length < 12 || t.length > 400 || isPromotionalOrCta(t)) return false;
  return /^(apply|massage|spread|charge|clip|place|insert|connect|pair|attach)\b/i.test(t);
}

function isSourceOverview(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 24 || t.length > 400) return false;
  if (isPromotionalOrCta(t) || PRICE_MARK.test(t) || TESTIMONIAL.test(t) || AFFILIATE_PROGRAM.test(t)) return false;
  if (isOperationalFulfillmentCopy(t) || isPointerOrReferenceCopy(t)) return false;
  if (isUsefulDescription(t)) return true;
  return /\b(is a|is an|supplied as|formulated as|sold as)\b/i.test(t) || /\b(in a|with a)\b/i.test(t);
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueItems(items: ExtractedPresellItem[]): ExtractedPresellItem[] {
  const seen = new Set<string>();
  const out: ExtractedPresellItem[] = [];
  for (const item of items) {
    const key = `${item.field}|${keyOf(item.question ?? "")}|${keyOf(item.text)}|${item.name ?? ""}`;
    if (!item.text.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const a = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
    if (a?.[1]) return cleanHtmlText(a[1]);
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"));
    if (b?.[1]) return cleanHtmlText(b[1]);
  }
  return undefined;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(match[1] ?? "null"));
    } catch {
      /* malformed JSON-LD is not evidence */
    }
  }
  return out;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenJsonLd(item));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  if (Array.isArray(graph)) return [record, ...graph.flatMap((item) => flattenJsonLd(item))];
  return [record];
}

function headingBlocks(html: string): Array<{ title: string; body: string }> {
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = [...html.matchAll(re)];
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < matches.length; i += 1) {
    const title = cleanHtmlText(matches[i][2] ?? "");
    if (!title) continue;
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = matches[i + 1]?.index ?? html.length;
    out.push({ title, body: html.slice(start, end) });
  }
  return out;
}

function classifyHeading(title: string): PresellSemanticField | "other" {
  const t = title.toLowerCase();
  if (isQuestionHeading(title) || /\b(faq|frequently asked)\b/.test(t)) return "FAQ";
  if (/\b(ingredients?|composition|components?|materials?|supplement facts|what's inside|whats inside)\b/.test(t)) return "INGREDIENTS";
  if (/\b(specifications?|tech specs|key specs|compatibility|what's included|whats included)\b/.test(t)) return "SPECIFICATIONS";
  if (/\b(how to (use|apply|take)|directions?|usage|suggested use|instructions|recommended use)\b/.test(t)) return "HOW_TO_USE";
  if (/\b(how it works|how this works)\b/.test(t)) return "HOW_IT_WORKS";
  if (/\b(warnings?|cautions?|precautions?|side effects|safety information|considerations)\b/.test(t)) return "CAUTIONS";
  if (/\b(guarantee|warranty|refund|money[- ]back)\b/.test(t)) return "WARRANTY_OR_GUARANTEE";
  if (/\b(features?|highlights|characteristics)\b/.test(t)) return "FEATURES";
  if (/\b(benefits?|why choose|advantages?)\b/.test(t)) return "SELLER_CLAIMS";
  if (/\b(about|overview|what it is|product details)\b/.test(t)) return "PRODUCT_OVERVIEW";
  return "other";
}

function item(
  field: PresellSemanticField,
  text: string,
  source: EnrichmentSource,
  extra?: Partial<ExtractedPresellItem>,
): ExtractedPresellItem | null {
  const clean = (extra?.text ?? text).replace(/\s+/g, " ").trim();
  if (!clean || TESTIMONIAL.test(clean) || AFFILIATE_PROGRAM.test(clean)) return null;
  return {
    field,
    text: clean,
    url: source.url,
    collectedAt: source.retrievedAt ?? null,
    evidenceType: extra?.evidenceType ?? "HTML",
    extractionMode: extra?.extractionMode ?? source.extractionMode ?? "HTTP",
    pageCategory: source.pageCategory,
    question: extra?.question,
    name: extra?.name,
    value: extra?.value,
    unit: extra?.unit,
    notes: extra?.notes,
  };
}

function fromJsonLd(source: EnrichmentSource, html: string): ExtractedPresellItem[] {
  const out: ExtractedPresellItem[] = [];
  for (const block of jsonLdBlocks(html).flatMap(flattenJsonLd)) {
    const type = String(block["@type"] ?? "");
    if (/FAQPage/i.test(type)) {
      const entities = Array.isArray(block.mainEntity) ? block.mainEntity : [];
      for (const entity of entities) {
        if (!entity || typeof entity !== "object") continue;
        const row = entity as Record<string, unknown>;
        const question = String(row.name ?? "").trim();
        const accepted = row.acceptedAnswer;
        const answer =
          accepted && typeof accepted === "object"
            ? String((accepted as Record<string, unknown>).text ?? "").trim()
            : "";
        const next = item("FAQ", answer, source, { question, evidenceType: "JSON_LD" });
        if (next && question) out.push(next);
      }
    }
    if (/Product/i.test(type)) {
      const description = String(block.description ?? "").trim();
      if (description) {
        const overview = item("PRODUCT_OVERVIEW", clipOverview(description), source, { evidenceType: "JSON_LD" });
        if (overview) out.push(overview);
      }
      const brand = block.brand;
      if (brand && typeof brand === "object") {
        const name = String((brand as Record<string, unknown>).name ?? "").trim();
        const next = name ? item("SOURCE_REFERENCES", name, source, { evidenceType: "JSON_LD" }) : null;
        if (next) out.push(next);
      }
      const props = Array.isArray(block.additionalProperty) ? block.additionalProperty : [];
      for (const prop of props) {
        if (!prop || typeof prop !== "object") continue;
        const row = prop as Record<string, unknown>;
        const name = String(row.name ?? "").trim();
        const value = String(row.value ?? "").trim();
        if (!name || !value) continue;
        const next = item("SPECIFICATIONS", `${name}: ${value}`, source, { name, value, evidenceType: "JSON_LD" });
        if (next) out.push(next);
      }
    }
  }
  return out;
}

function faqFromBlock(title: string, body: string, source: EnrichmentSource): ExtractedPresellItem[] {
  const out: ExtractedPresellItem[] = [];
  const push = (question: string, answer: string) => {
    const q = question.replace(/\s+/g, " ").trim();
    const a = firstSentences(answer, 2);
    if (!q || !a || a.length < 8) return;
    if (isPromotionalOrCta(q) || isPromotionalOrCta(a) || PRICE_MARK.test(a)) return;
    const next = item("FAQ", a, source, { question: q });
    if (next) out.push(next);
  };

  for (const match of body.matchAll(/<details[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    push(cleanHtmlText(match[1] ?? ""), cleanHtmlText(match[2] ?? ""));
  }
  for (const match of body.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    push(cleanHtmlText(match[1] ?? ""), cleanHtmlText(match[2] ?? ""));
  }
  for (const match of body.matchAll(/<h([3-6])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-6]|$)/gi)) {
    const question = cleanHtmlText(match[2] ?? "");
    const answers = extractParagraphs(match[3] ?? "");
    if (isQuestionHeading(question) && answers[0]) push(question, answers[0]);
  }

  const paragraphs = extractParagraphs(body);
  const lists = extractListItems(body);
  if (isQuestionHeading(title)) {
    const answers = paragraphs.length ? paragraphs : lists;
    if (answers[0]) push(title, answers[0]);
  }
  for (const row of [...lists, ...paragraphs]) {
    const split = splitEmbeddedQa(row);
    if (split.question) push(split.question, split.answer);
  }
  for (let i = 0; i < paragraphs.length; i += 1) {
    const current = paragraphs[i];
    const next = paragraphs[i + 1];
    if (isQuestionHeading(current) && next && !isQuestionHeading(next)) {
      push(current, next);
      i += 1;
    }
  }
  return out;
}

function isPolicyOrLegalPage(source: EnrichmentSource): boolean {
  const category = source.pageCategory ?? "";
  if (/PRIVACY|TERMS/.test(category)) return true;
  return /\/(privacy|terms|disclaimer|references)(\/|\.php|$)/i.test(source.url);
}

export function extractPresellItemsFromHtml(source: EnrichmentSource): ExtractedPresellItem[] {
  if (!source.html) return [];
  if (isAffiliateProgramSource(source.url)) return [];
  const html = stripHiddenMarkup(source.html);
  const policyPage = isPolicyOrLegalPage(source);
  const out: ExtractedPresellItem[] = [];

  const og = metaContent(html, ["og:description", "description"]);
  if (!policyPage && og && isSourceOverview(og) && !isPromotionalOrCta(og) && !PRICE_MARK.test(og)) {
    const next = item("PRODUCT_OVERVIEW", clipOverview(og), source, { evidenceType: "META" });
    if (next) out.push(next);
  }

  out.push(...fromJsonLd(source, source.html));

  for (const heading of extractTaggedTexts(html, "h1")) {
    if (/\bis (a|an)\b/i.test(heading) && isUsefulDescription(heading)) {
      const next = item("PRODUCT_PURPOSE", clipOverview(heading), source);
      if (next) out.push(next);
    }
  }

  for (const block of headingBlocks(html)) {
    const kind = classifyHeading(block.title);
    const lists = extractListItems(block.body);
    const paragraphs = extractParagraphs(block.body);
    if (kind === "FAQ") {
      out.push(...faqFromBlock(block.title, block.body, source));
      continue;
    }
    if (kind === "PRODUCT_OVERVIEW") {
      if (policyPage) continue;
      for (const p of paragraphs) {
        if (!isSourceOverview(p) || isPromotionalOrCta(p)) continue;
        const next = item("PRODUCT_OVERVIEW", clipOverview(p), source);
        if (next) out.push(next);
        break;
      }
      continue;
    }
    if (kind === "INGREDIENTS") {
      for (const row of lists) {
        if (!isIngredientIdentityName(row) || /\b(formula|blend|support\w*)\b/i.test(row)) continue;
        const next = item("INGREDIENTS", row, source);
        if (next) out.push(next);
      }
      continue;
    }
    if (kind === "SPECIFICATIONS") {
      for (const row of lists) {
        const parsed = parseSpecificationLine(row) ?? (/\d/.test(row) ? { name: row, value: row } : null);
        if (!parsed) continue;
        const next = item("SPECIFICATIONS", parsed.value === parsed.name ? row : `${parsed.name}: ${parsed.value}`, source, {
          name: parsed.name,
          value: parsed.value,
          unit: "unit" in parsed ? parsed.unit : undefined,
        });
        if (next) out.push(next);
      }
      continue;
    }
    if (kind === "HOW_TO_USE" || kind === "HOW_IT_WORKS") {
      for (const row of [...lists, ...paragraphs.slice(0, 4)]) {
        if (!isDirectionalInstruction(row)) continue;
        const next = item(kind, normalizeUsageInstruction(row), source);
        if (next) out.push(next);
      }
      continue;
    }
    if (kind === "CAUTIONS") {
      for (const row of [...lists, ...paragraphs]) {
        for (const caution of cautionStatementsFrom(row)) {
          const next = item("CAUTIONS", caution, source);
          if (next) out.push(next);
        }
      }
      continue;
    }
    if (kind === "WARRANTY_OR_GUARANTEE") {
      for (const row of [...lists, ...paragraphs]) {
        if (!isFactualGuarantee(row)) continue;
        const next = item("WARRANTY_OR_GUARANTEE", firstSentences(row, 2), source);
        if (next) out.push(next);
      }
      continue;
    }
    if (kind === "FEATURES") {
      for (const row of lists.filter(isFeatureStatement)) {
        const field: PresellSemanticField = isCharacteristicNotBenefit(row) ? "FEATURES" : "SELLER_CLAIMS";
        const next = item(field, row, source);
        if (next) out.push(next);
      }
      continue;
    }
    if (kind === "SELLER_CLAIMS") {
      for (const row of [...lists, ...paragraphs.slice(0, 4)]) {
        const next = item("SELLER_CLAIMS", firstSentences(row, 1), source);
        if (next) out.push(next);
      }
    }
  }

  for (const p of extractParagraphs(html).slice(0, 24)) {
    if (policyPage) break;
    if (isQuestionHeading(p)) continue;
    if (isActualCaution(p)) {
      for (const caution of cautionStatementsFrom(p)) {
        const next = item("CAUTIONS", caution, source);
        if (next) out.push(next);
      }
    }
    if (isDirectionalInstruction(p)) {
      const next = item("HOW_TO_USE", normalizeUsageInstruction(p), source);
      if (next) out.push(next);
    }
    if (!out.some((row) => row.field === "PRODUCT_OVERVIEW") && isSourceOverview(p) && !isPromotionalOrCta(p) && !PRICE_MARK.test(p)) {
      const next = item("PRODUCT_OVERVIEW", clipOverview(p), source);
      if (next) out.push(next);
    }
  }

  return uniqueItems(out);
}

export function extractPresellItemsFromRecords(source: EnrichmentSource): ExtractedPresellItem[] {
  const out: ExtractedPresellItem[] = [];
  for (const record of source.records ?? []) {
    const text = (record.text ?? record.value ?? "").trim();
    const map: Record<string, PresellSemanticField> = {
      description: "PRODUCT_OVERVIEW",
      feature: "FEATURES",
      component: "INGREDIENTS",
      specification: "SPECIFICATIONS",
      usage: "HOW_TO_USE",
      caution: "CAUTIONS",
      faq: "FAQ",
      guarantee: "WARRANTY_OR_GUARANTEE",
      manufacturer: "SOURCE_REFERENCES",
    };
    const field = map[record.field];
    if (!field) continue;
    if (field === "FAQ" && record.question && text) {
      const next = item("FAQ", text, source, { question: record.question, evidenceType: "STRUCTURED_RECORD" });
      if (next) out.push(next);
      continue;
    }
    if (field === "SPECIFICATIONS" && record.name && (record.value || text)) {
      const value = record.value || text;
      const next = item("SPECIFICATIONS", `${record.name}: ${value}`, source, {
        name: record.name,
        value,
        unit: record.unit,
        evidenceType: "STRUCTURED_RECORD",
      });
      if (next) out.push(next);
      continue;
    }
    if (!text) continue;
    const next = item(field, text, source, { evidenceType: "STRUCTURED_RECORD" });
    if (next) out.push(next);
  }
  return uniqueItems(out);
}

export function extractPresellItems(source: EnrichmentSource): ExtractedPresellItem[] {
  return uniqueItems([...extractPresellItemsFromHtml(source), ...extractPresellItemsFromRecords(source)]);
}

export function presellRecordsFromSource(source: EnrichmentSource): StructuredRecord[] {
  const records: StructuredRecord[] = [];
  for (const item of extractPresellItemsFromHtml(source)) {
    if (item.field === "FAQ" && item.question) {
      records.push({ field: "faq", question: item.question, text: item.text });
      continue;
    }
    if (item.field === "PRODUCT_OVERVIEW" || item.field === "PRODUCT_PURPOSE") {
      records.push({ field: "description", text: item.text });
      continue;
    }
    if (item.field === "FEATURES" || item.field === "DIFFERENTIATORS") {
      records.push({ field: "feature", text: item.text });
      continue;
    }
    if (item.field === "INGREDIENTS") {
      records.push({ field: "component", text: item.text });
      continue;
    }
    if (item.field === "SPECIFICATIONS") {
      records.push({ field: "specification", name: item.name ?? item.text, value: item.value ?? item.text, unit: item.unit });
      continue;
    }
    if (item.field === "HOW_TO_USE" || item.field === "HOW_IT_WORKS") {
      records.push({ field: "usage", text: item.text });
      continue;
    }
    if (item.field === "CAUTIONS") {
      records.push({ field: "caution", text: item.text });
      continue;
    }
    if (item.field === "WARRANTY_OR_GUARANTEE") {
      records.push({ field: "guarantee", text: item.text });
    }
  }
  return records;
}
