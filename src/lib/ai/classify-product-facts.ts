/**
 * Optional AI structuring fallback for Product Importer V2.
 *
 * Classifies supplied source text into ProductFacts. Does not research the
 * web and must not invent unsupported fields. Every kept value requires
 * evidence that appears in the source text.
 */

import {
  withImportQuality,
  type FactConfidence,
  type FactField,
  type ProductFacts,
  type SourceFact,
} from "@/lib/product-facts";
import {
  evidenceInSource,
  isFactualGuarantee,
  isFeatureStatement,
  isPromotionalOrCta,
  isUsefulDescription,
  looksLikeIngredientName,
} from "@/lib/import-heuristics";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MIN_PAGE_CHARS = 800;

export type AiFactItem = {
  value: string;
  evidence: string;
};

export type AiFactsPayload = {
  description?: AiFactItem | null;
  features?: AiFactItem[] | null;
  ingredientsOrComponents?: AiFactItem[] | null;
  usageInformation?: AiFactItem[] | null;
  cautions?: AiFactItem[] | null;
  guaranteeInformation?: AiFactItem | null;
  manufacturer?: AiFactItem | null;
};

const SYSTEM = `You classify product page text into structured fields.
Use ONLY the supplied source text.
Do not use model knowledge.
Do not infer missing ingredients, prices, guarantees, medical claims, manufacturer or usage.
If unsupported, return NOT_FOUND (null).
Return source evidence/snippet for every extracted factual field.
The evidence must be a verbatim substring of the source text.
Respond with JSON only.`;

export function shouldTryAiFallback(facts: ProductFacts, pageText: string): boolean {
  const text = pageText.replace(/\s+/g, " ").trim();
  if (text.length < MIN_PAGE_CHARS) return false;
  if (facts.importQuality === "SUFFICIENT") return false;
  const missing = [
    facts.confidence.description === "NOT_FOUND",
    facts.confidence.ingredientsOrComponents === "NOT_FOUND",
    facts.confidence.usageInformation === "NOT_FOUND",
    facts.confidence.guaranteeInformation === "NOT_FOUND",
  ].filter(Boolean).length;
  return missing >= 1;
}

export function parseAiFactsJson(raw: string): AiFactsPayload | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as AiFactsPayload;
  } catch {
    return null;
  }
}

function itemOrNull(value: unknown): AiFactItem | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.value !== "string" || typeof rec.evidence !== "string") return null;
  const v = rec.value.trim();
  const e = rec.evidence.trim();
  if (!v || !e) return null;
  return { value: v, evidence: e };
}

function itemsOrEmpty(value: unknown): AiFactItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemOrNull).filter((item): item is AiFactItem => Boolean(item));
}

function groundedItem(item: AiFactItem | null | undefined, sourceText: string, kind: "text" | "feature" | "ingredient" | "usage" | "guarantee" | "manufacturer"): AiFactItem | null {
  if (!item) return null;
  if (!evidenceInSource(item.evidence, sourceText)) return null;
  if (!evidenceInSource(item.value, sourceText) && !evidenceInSource(item.value, item.evidence)) return null;
  if (isPromotionalOrCta(item.value)) return null;
  if (kind === "feature" && !isFeatureStatement(item.value)) return null;
  if (kind === "ingredient" && !looksLikeIngredientName(item.value)) return null;
  if (kind === "guarantee" && !isFactualGuarantee(item.value) && !isFactualGuarantee(item.evidence)) return null;
  if (kind === "text" && !isUsefulDescription(item.value) && item.value.length < 40) return null;
  return item;
}

export function mergeAiFacts(facts: ProductFacts, payload: AiFactsPayload | null, sourceText: string): ProductFacts {
  if (!payload) return facts;
  const next: ProductFacts = {
    ...facts,
    confidence: { ...facts.confidence },
    sourceSnippets: [...facts.sourceSnippets],
    importWarnings: [...facts.importWarnings],
  };
  let used = false;
  const mark = (field: FactField, value: string, evidence: string) => {
    used = true;
    next.confidence[field] = "AI_SOURCE_CLASSIFICATION";
    next.sourceSnippets.push(aiSnippet(field, evidence || value, facts.sourceUrl));
  };

  if (facts.confidence.description === "NOT_FOUND") {
    const item = groundedItem(itemOrNull(payload.description), sourceText, "text");
    if (item) {
      next.description = item.value;
      mark("description", item.value, item.evidence);
    }
  }

  if (facts.confidence.features === "NOT_FOUND") {
    const items = itemsOrEmpty(payload.features)
      .map((item) => groundedItem(item, sourceText, "feature"))
      .filter((item): item is AiFactItem => Boolean(item))
      .slice(0, 8);
    if (items.length > 0) {
      next.features = items.map((item) => item.value);
      for (const item of items) mark("features", item.value, item.evidence);
    }
  }

  if (facts.confidence.ingredientsOrComponents === "NOT_FOUND") {
    const items = itemsOrEmpty(payload.ingredientsOrComponents)
      .map((item) => groundedItem(item, sourceText, "ingredient"))
      .filter((item): item is AiFactItem => Boolean(item))
      .slice(0, 12);
    if (items.length > 0) {
      next.ingredientsOrComponents = items.map((item) => item.value);
      for (const item of items) mark("ingredientsOrComponents", item.value, item.evidence);
    }
  }

  if (facts.confidence.usageInformation === "NOT_FOUND") {
    const items = itemsOrEmpty(payload.usageInformation)
      .map((item) => groundedItem(item, sourceText, "usage"))
      .filter((item): item is AiFactItem => Boolean(item))
      .slice(0, 6);
    if (items.length > 0) {
      next.usageInformation = items.map((item) => item.value);
      for (const item of items) mark("usageInformation", item.value, item.evidence);
    }
  }

  if (facts.confidence.cautions === "NOT_FOUND") {
    const items = itemsOrEmpty(payload.cautions)
      .map((item) => groundedItem(item, sourceText, "text"))
      .filter((item): item is AiFactItem => Boolean(item))
      .slice(0, 6);
    if (items.length > 0) {
      next.cautions = items.map((item) => item.value);
      for (const item of items) mark("cautions", item.value, item.evidence);
    }
  }

  if (facts.confidence.guaranteeInformation === "NOT_FOUND") {
    const item = groundedItem(itemOrNull(payload.guaranteeInformation), sourceText, "guarantee");
    if (item) {
      next.guaranteeInformation = item.value;
      mark("guaranteeInformation", item.value, item.evidence);
    }
  }

  if (facts.confidence.manufacturer === "NOT_FOUND") {
    const item = groundedItem(itemOrNull(payload.manufacturer), sourceText, "manufacturer");
    if (item && item.value.split(/\s+/).length <= 8) {
      next.manufacturer = item.value;
      mark("manufacturer", item.value, item.evidence);
    }
  }

  if (used) {
    next.importWarnings = [
      ...next.importWarnings,
      "Some fields were classified from supplied source text by AI. This is not AI-generated product research.",
    ];
  }
  return withImportQuality(next);
}

function aiSnippet(field: string, text: string, sourceUrl: string): SourceFact {
  return { field, text, sourceUrl, confidence: "AI_SOURCE_CLASSIFICATION" as FactConfidence };
}

export async function classifyMissingFactsWithAi(
  facts: ProductFacts,
  sourceText: string,
  operatorProductName: string,
): Promise<ProductFacts> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return facts;

  const user = [
    `Operator product name: ${operatorProductName || facts.productName || "(none)"}`,
    `Source URL (do not fetch; context only): ${facts.sourceUrl || "(none)"}`,
    "",
    "SOURCE TEXT:",
    sourceText.slice(0, 12_000),
    "",
    `Return JSON: {"description":{"value":string,"evidence":string}|null,"features":[{"value":string,"evidence":string}],"ingredientsOrComponents":[{"value":string,"evidence":string}],"usageInformation":[{"value":string,"evidence":string}],"cautions":[{"value":string,"evidence":string}],"guaranteeInformation":{"value":string,"evidence":string}|null,"manufacturer":{"value":string,"evidence":string}|null}`,
    "Use null or [] when NOT_FOUND. Never invent.",
  ].join("\n");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) return facts;
  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) return facts;
  const parsed = parseAiFactsJson(textBlock.text);
  return mergeAiFacts(facts, parsed, sourceText);
}
