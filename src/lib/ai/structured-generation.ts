/**
 * STRUCTURED_EVIDENCE_BOUND_GENERATION
 *
 * CODE owns which factual blocks exist. The model fills authorized blocks
 * and declares evidence IDs. Evidence IDs are declarations, not proof.
 * Grounding remains the final factual validator.
 */

import {
  buildGenerationFactManifest,
  emptyProductFacts,
  type GenerationFactManifest,
  type GenerationFactManifestItem,
  type ProductFacts,
} from "@/lib/product-facts";
import { extractJsonText } from "@/lib/ai/parse-ai-json";
import {
  createGenerationPlan,
  hasUsageAuthorityLanguage,
  isCanonicalGenerationTopic,
  isKnowledgeExpansion,
  validateGenerationPlan,
  GENERATION_TOPICS,
  type GenerationBlockType,
  type GenerationPlan,
  type GenerationTopic,
} from "@/lib/ai/generation-plan";
import {
  isIngredientsFieldAssertion,
  hasCompositionPromotionLanguage,
  unsupportedRelationalExpansions,
} from "@/lib/ai/ingredient-claims";
import { validateFaqQuestion } from "@/lib/ai/faq-question-semantics";
import { semanticClosureViolations } from "@/lib/ai/semantic-closure";
import {
  composePublicationGate,
  validateGrounding,
  type GroundingResult,
} from "@/lib/ai/grounding-validator";
import { lintCampaign, type PublicationGate } from "@/lib/policy-linter";

export const STRUCTURED_CTA_LABELS = ["Learn More", "View Product Details", "Check Current Details"] as const;

export type StructuredText = {
  text: string;
  evidenceIds: string[];
};

export type StructuredFaqItem = {
  question: string;
  answer: string;
  topic: string;
  evidenceIds: string[];
};

export type StructuredBlock = {
  id: string;
  type: string;
  evidenceIds: string[];
  content: string;
  items?: StructuredFaqItem[];
};

export type StructuredGenerationPage = {
  approach?: string;
  headline: StructuredText;
  summary: StructuredText;
  blocks: StructuredBlock[];
  cta: { label: string };
};

export type StructuralViolation = {
  code: string;
  text: string;
  reason: string;
  requiredField?: string;
};

export type EvidenceTrace = {
  blockId: string;
  blockType: string;
  text: string;
  declaredEvidence: string[];
  groundingResult: GroundingResult["status"] | "NOT_RUN";
  supportedBy: string[];
  structuralResult: "PASS" | "FAIL";
  topic?: string;
  question?: string;
  answer?: string;
  declaredFields?: string[];
  unsupportedClaims?: GroundingResult["unsupportedClaims"];
  effectiveChildEvidenceUnion?: string[];
};

export type StructuredEvaluation = {
  page: StructuredGenerationPage | null;
  structuralViolations: StructuralViolation[];
  traces: EvidenceTrace[];
  adapted: { headline: string; body: string; ctaLabel: string } | null;
  inspectionCopy: { headline: string; body: string; ctaLabel: string };
  grounding: GroundingResult;
  policyGate: PublicationGate;
  finalGate: PublicationGate;
};

const BLOCK_FIELD_COMPAT: Record<string, string[]> = {
  HERO: ["productName", "description", "features"],
  OVERVIEW: ["productName", "description", "features"],
  FEATURES: ["productName", "features", "description"],
  INGREDIENTS: ["ingredientsOrComponents"],
  USAGE: ["usageInformation"],
  CAUTIONS: ["cautions"],
  PRICING: ["pricingInformation"],
  GUARANTEE: ["guaranteeInformation"],
  MANUFACTURER: ["manufacturer"],
  FINAL_THOUGHTS: ["productName", "description", "features"],
};

const FAQ_TOPIC_FIELDS: Record<string, string> = {
  identity: "productName",
  description: "description",
  features: "features",
  ingredients: "ingredientsOrComponents",
  usage: "usageInformation",
  cautions: "cautions",
  pricing: "pricingInformation",
  guarantee: "guaranteeInformation",
  manufacturer: "manufacturer",
  results_timeline: "usageInformation",
  category_classification: "description",
  background_science: "description",
};

export function faqTopicField(topic: string): string | null {
  return FAQ_TOPIC_FIELDS[topic] || null;
}

const BLOCK_HEADINGS: Record<string, string> = {
  OVERVIEW: "What Is This Product?",
  FEATURES: "Key Features",
  INGREDIENTS: "Ingredients / Components",
  USAGE: "How to Use",
  CAUTIONS: "Things to Consider",
  PRICING: "Pricing",
  GUARANTEE: "Guarantee",
  MANUFACTURER: "Manufacturer",
  FAQ: "FAQ",
  FINAL_THOUGHTS: "Final Thoughts",
};

function faqItemSchema(topics: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["question", "answer", "topic", "evidenceIds"],
    properties: {
      question: { type: "string" },
      answer: { type: "string" },
      topic: {
        type: "string",
        enum: [...topics],
        description: "Canonical OPEN topic. description cites description evidence only; features cites features only; identity cites productName only.",
      },
      evidenceIds: {
        type: "array",
        items: { type: "string" },
        description: "Required on each FAQ item. The FAQ parent is a container and may have empty evidenceIds.",
      },
    },
  };
}

function pageItemSchema(topics: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["approach", "headline", "summary", "blocks", "cta"],
    properties: {
      approach: { type: "string", enum: ["REVIEW", "EDUCATIONAL", "BUYER_GUIDE"] },
      headline: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "evidenceIds", "content"],
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            evidenceIds: {
              type: "array",
              items: { type: "string" },
              description: "Mandatory for non-FAQ blocks. FAQ parent evidenceIds may be empty; child items own evidence.",
            },
            content: { type: "string" },
            items: {
              type: "array",
              items: faqItemSchema(topics),
            },
          },
        },
      },
      cta: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string" } },
      },
    },
  };
}

export const STRUCTURED_VARIANTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      items: pageItemSchema(GENERATION_TOPICS),
    },
  },
};

export const STRUCTURED_SINGLE_JSON_SCHEMA = STRUCTURED_VARIANTS_JSON_SCHEMA;

export function structuredVariantsSchema(allowedTopics?: readonly string[]) {
  const canonical = allowedTopics?.filter((topic) => isCanonicalGenerationTopic(topic)) ?? [];
  const topics = canonical.length > 0 ? canonical : [...GENERATION_TOPICS];
  return {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: {
      variants: {
        type: "array",
        items: pageItemSchema(topics),
      },
    },
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function pushViolation(
  violations: StructuralViolation[],
  code: string,
  text: string,
  reason: string,
  requiredField?: string,
) {
  if (violations.some((item) => item.code === code && item.text === text && item.reason === reason)) return;
  violations.push({ code, text, reason, requiredField });
}

function manifestById(manifest: GenerationFactManifest): Map<string, GenerationFactManifestItem> {
  return new Map(manifest.items.map((item) => [item.id, item]));
}

function allowedTypeSet(plan: GenerationPlan): Set<string> {
  return new Set([...plan.authorizedBlocks, ...plan.optionalBlocks]);
}

function topicToField(topic: string): string | null {
  return faqTopicField(topic);
}

function impliedFaqTopic(text: string): GenerationTopic | null {
  const lower = text.toLowerCase();
  if (isIngredientsFieldAssertion(text)) return "ingredients";
  if (
    hasUsageAuthorityLanguage(text) ||
    /\b(?:how (?:do i|to) take|recommended dosage|recommended once daily|take one capsule|one dose|regimen)\b/.test(
      lower,
    )
  ) {
    return "usage";
  }
  if (/\b(?:guarantee|refund|money[\s-]?back|return policy)\b/.test(lower)) return "guarantee";
  if (/\bhow long does it take to notice results\b|\bresults timeline\b|\bexpected results\b/.test(lower)) {
    return "results_timeline";
  }
  return null;
}

function fieldIsOpen(plan: GenerationPlan, field: string): boolean {
  return plan.factualFieldsAvailable.includes(field);
}

export function factsFromEvidenceIds(
  base: ProductFacts,
  ids: string[],
  manifest: GenerationFactManifest,
): ProductFacts {
  const scoped = emptyProductFacts("", base.sourceUrl, base.origin);
  scoped.importQuality = base.importQuality;
  const byId = manifestById(manifest);
  for (const id of ids) {
    const item = byId.get(id);
    if (!item || !item.copyEligible) continue;
    const provenance = item.provenance === "OPERATOR_IDENTITY" ? "MANUAL" : item.provenance;
    if (provenance !== "DIRECT_SOURCE" && provenance !== "MANUAL") continue;
    if (item.field === "productName") {
      scoped.productName = item.value;
      scoped.confidence.productName = provenance;
    } else if (item.field === "description") {
      scoped.description = item.value;
      scoped.confidence.description = provenance;
    } else if (item.field === "features") {
      scoped.features = [...scoped.features, item.value];
      scoped.confidence.features = provenance;
    } else if (item.field === "ingredientsOrComponents") {
      scoped.ingredientsOrComponents = [...scoped.ingredientsOrComponents, item.value];
      scoped.confidence.ingredientsOrComponents = provenance;
    } else if (item.field === "usageInformation") {
      scoped.usageInformation = [...scoped.usageInformation, item.value];
      scoped.confidence.usageInformation = provenance;
    } else if (item.field === "cautions") {
      scoped.cautions = [...scoped.cautions, item.value];
      scoped.confidence.cautions = provenance;
    } else if (item.field === "pricingInformation") {
      scoped.pricingInformation = item.value;
      scoped.confidence.pricingInformation = provenance;
    } else if (item.field === "guaranteeInformation") {
      scoped.guaranteeInformation = item.value;
      scoped.confidence.guaranteeInformation = provenance;
    } else if (item.field === "manufacturer") {
      scoped.manufacturer = item.value;
      scoped.confidence.manufacturer = provenance;
    }
  }
  return scoped;
}

export function coerceStructuredPage(raw: unknown): StructuredGenerationPage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const headline = obj.headline;
  const summary = obj.summary;
  const cta = obj.cta;
  if (!headline || typeof headline !== "object" || !summary || typeof summary !== "object") return null;
  if (!cta || typeof cta !== "object") return null;
  const headlineObj = headline as Record<string, unknown>;
  const summaryObj = summary as Record<string, unknown>;
  const ctaObj = cta as Record<string, unknown>;
  if (typeof headlineObj.text !== "string" || typeof summaryObj.text !== "string") return null;
  if (typeof ctaObj.label !== "string") return null;
  if (!Array.isArray(obj.blocks)) return null;
  const blocks: StructuredBlock[] = [];
  for (const block of obj.blocks) {
    if (!block || typeof block !== "object") return null;
    const row = block as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.type !== "string" || typeof row.content !== "string") return null;
    const items = Array.isArray(row.items)
      ? row.items
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            question: typeof item.question === "string" ? item.question : "",
            answer: typeof item.answer === "string" ? item.answer : "",
            topic: typeof item.topic === "string" ? item.topic : "",
            evidenceIds: asStringArray(item.evidenceIds),
          }))
      : undefined;
    blocks.push({
      id: row.id.trim(),
      type: String(row.type).trim().toUpperCase(),
      evidenceIds: asStringArray(row.evidenceIds),
      content: row.content,
      items,
    });
  }
  return {
    approach: typeof obj.approach === "string" ? obj.approach : undefined,
    headline: { text: headlineObj.text.trim(), evidenceIds: asStringArray(headlineObj.evidenceIds) },
    summary: { text: summaryObj.text.trim(), evidenceIds: asStringArray(summaryObj.evidenceIds) },
    blocks,
    cta: { label: ctaObj.label.trim() },
  };
}

export function parseStructuredVariants(rawText: string, expectedCount = 1): StructuredGenerationPage[] {
  let jsonText = rawText;
  try {
    jsonText = extractJsonText(rawText).jsonText;
  } catch {
    throw new Error("MALFORMED_STRUCTURED_JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("MALFORMED_STRUCTURED_JSON");
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { variants?: unknown }).variants)
      ? ((parsed as { variants: unknown[] }).variants)
      : [parsed];
  if (rows.length !== expectedCount) {
    throw new Error("MALFORMED_STRUCTURED_JSON");
  }
  const pages = rows.map((row) => coerceStructuredPage(row));
  if (pages.some((page) => !page)) throw new Error("MALFORMED_STRUCTURED_JSON");
  return pages as StructuredGenerationPage[];
}

function validateEvidenceIds(
  ids: string[],
  manifest: GenerationFactManifest,
  plan: GenerationPlan,
  allowedFields: string[] | null,
  location: string,
  violations: StructuralViolation[],
) {
  const byId = manifestById(manifest);
  if (ids.length === 0) {
    pushViolation(violations, "MISSING_EVIDENCE", location, "every product-specific block requires >= 1 evidence ID");
    return;
  }
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      pushViolation(violations, "UNKNOWN_EVIDENCE", id, `unknown evidence ID in ${location}`, "evidenceIds");
      continue;
    }
    if (!item.copyEligible) {
      pushViolation(violations, "INELIGIBLE_EVIDENCE", id, `evidence ID is not copy-eligible in ${location}`, item.field);
      continue;
    }
    if (!fieldIsOpen(plan, item.field) && item.field !== "productName") {
      pushViolation(violations, "CLOSED_TOPIC", id, `evidence field ${item.field} is closed`, item.field);
    }
    if (allowedFields && !allowedFields.includes(item.field)) {
      pushViolation(
        violations,
        "INCOMPATIBLE_EVIDENCE",
        `${location}:${id}`,
        `field ${item.field} cannot authorize this block`,
        item.field,
      );
    }
  }
}

export function validateStructuredPage(
  page: StructuredGenerationPage,
  facts: ProductFacts,
): { violations: StructuralViolation[]; plan: GenerationPlan; manifest: GenerationFactManifest } {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const violations: StructuralViolation[] = [];
  const allowedTypes = allowedTypeSet(plan);
  const support = `${plan.descriptionText}\n${plan.featurePhrases.join("\n")}`;

  if (!page.headline.text.trim()) {
    pushViolation(violations, "MALFORMED", "headline", "headline text is required");
  }
  if (!page.summary.text.trim()) {
    pushViolation(violations, "MALFORMED", "summary", "summary text is required");
  }
  validateEvidenceIds(page.headline.evidenceIds, manifest, plan, BLOCK_FIELD_COMPAT.HERO, "headline", violations);
  validateEvidenceIds(page.summary.evidenceIds, manifest, plan, BLOCK_FIELD_COMPAT.HERO, "summary", violations);
  if (countWords(page.headline.text) > plan.wordBudget.headline) {
    pushViolation(violations, "WORD_BUDGET", page.headline.text, `headline exceeds ${plan.wordBudget.headline} words`);
  }
  if (countWords(page.summary.text) > plan.wordBudget.summary) {
    pushViolation(violations, "WORD_BUDGET", page.summary.text, `summary exceeds ${plan.wordBudget.summary} words`);
  }

  const seenTypes = new Set<string>();
  let hasCore = false;
  for (const block of page.blocks) {
    const type = block.type as GenerationBlockType;
    if (!allowedTypes.has(type)) {
      pushViolation(violations, "UNKNOWN_BLOCK", block.type, "block type is not authorized", type);
      continue;
    }
    if (seenTypes.has(type) && type !== "FAQ") {
      pushViolation(violations, "DUPLICATE_BLOCK", type, "duplicate unauthorized or extra block");
    }
    seenTypes.add(type);
    if (type === "OVERVIEW" || type === "FEATURES") hasCore = true;
    if (type !== "FAQ") {
      const compat = BLOCK_FIELD_COMPAT[type] || [];
      validateEvidenceIds(block.evidenceIds, manifest, plan, compat, `${type}:${block.id}`, violations);
    }
    const budget =
      type === "OVERVIEW"
        ? plan.wordBudget.overview
        : type === "FEATURES"
          ? plan.wordBudget.features
          : type === "FINAL_THOUGHTS"
            ? plan.wordBudget.finalThoughts
            : type === "INGREDIENTS"
              ? plan.wordBudget.ingredients
              : type === "USAGE"
                ? plan.wordBudget.usage
                : type === "CAUTIONS"
                  ? plan.wordBudget.cautions
                  : type === "PRICING"
                    ? plan.wordBudget.pricing
                    : type === "GUARANTEE"
                      ? plan.wordBudget.guarantee
                      : type === "MANUFACTURER"
                        ? plan.wordBudget.manufacturer
                        : 120;
    if (type !== "FAQ" && countWords(block.content) > budget) {
      pushViolation(violations, "WORD_BUDGET", block.content, `${type} exceeds ${budget} words`);
    }
    if ((type === "FEATURES" || type === "OVERVIEW" || type === "FINAL_THOUGHTS") && plan.closedTopics.includes("ingredients")) {
      if (hasCompositionPromotionLanguage(block.content)) {
        pushViolation(
          violations,
          "COMPOSITION_PROMOTION",
          block.content,
          "feature mention cannot be promoted into an ingredient-composition claim",
          "ingredientsOrComponents",
        );
      }
    }
    if ((type === "FEATURES" || type === "OVERVIEW" || type === "FINAL_THOUGHTS") && plan.closedTopics.includes("usage")) {
      if (hasUsageAuthorityLanguage(block.content)) {
        pushViolation(
          violations,
          "USAGE_PROMOTION",
          block.content,
          "feature evidence cannot authorize USAGE semantics",
          "usageInformation",
        );
      }
    }
    const planHits = validateGenerationPlan(block.content, plan).violations;
    for (const hit of planHits) {
      pushViolation(violations, "CLOSED_TOPIC", hit.text, hit.reason, hit.requiredField);
    }
    if (isKnowledgeExpansion(block.content, support)) {
      pushViolation(violations, "CLOSED_TOPIC", block.content, "background science / knowledge expansion is CLOSED", "description");
    }
    if (type !== "FAQ") {
      const blockSupport = block.evidenceIds
        .map((id) => manifest.items.find((row) => row.id === id)?.value || "")
        .filter(Boolean)
        .join("\n");
      for (const hit of unsupportedRelationalExpansions(block.content, blockSupport)) {
        pushViolation(
          violations,
          "UNSUPPORTED_RELATIONAL_EXPANSION",
          hit,
          "relationship language is not entailed by assigned projected evidence",
        );
      }
      if (plan.thinMode) {
        for (const hit of semanticClosureViolations(block.content, blockSupport, type, true)) {
          pushViolation(violations, "SEMANTIC_CLOSURE", hit.text, hit.code);
        }
      }
    }
    if (type === "FAQ") {
      const items = block.items || [];
      if (items.length > plan.wordBudget.faqItems) {
        pushViolation(violations, "WORD_BUDGET", "FAQ", `FAQ exceeds ${plan.wordBudget.faqItems} items`);
      }
      if (!plan.faqAllowed && items.length > 0) {
        pushViolation(violations, "CLOSED_TOPIC", "FAQ", "FAQ is not authorized", "faq");
      }
      for (const item of items) {
        const topicRaw = item.topic.trim();
        if (!isCanonicalGenerationTopic(topicRaw)) {
          pushViolation(
            violations,
            "INVALID_FAQ_TOPIC",
            item.question || topicRaw,
            `FAQ topic must be a canonical OPEN topic id, not free text (${topicRaw})`,
            topicRaw,
          );
        }
        const field = topicToField(topicRaw);
        const topicOpen = isCanonicalGenerationTopic(topicRaw) && plan.allowedTopics.includes(topicRaw);
        if (isCanonicalGenerationTopic(topicRaw) && (!field || !topicOpen || !fieldIsOpen(plan, field))) {
          pushViolation(
            violations,
            "CLOSED_TOPIC",
            item.question,
            `FAQ topic ${topicRaw} is not OPEN`,
            field || topicRaw,
          );
        }
        const implied = impliedFaqTopic(`${item.question} ${item.answer}`);
        if (implied && implied !== topicRaw) {
          const impliedField = topicToField(implied) || implied;
          if (plan.closedTopics.includes(implied) || !plan.allowedTopics.includes(implied)) {
            pushViolation(
              violations,
              "CLOSED_TOPIC",
              item.question,
              `FAQ question/answer requires CLOSED topic ${implied}`,
              impliedField,
            );
          } else {
            pushViolation(
              violations,
              "INCOMPATIBLE_FAQ_TOPIC",
              item.question,
              `FAQ question/answer is not compatible with declared topic ${topicRaw}`,
              impliedField,
            );
          }
        }
        validateEvidenceIds(
          item.evidenceIds,
          manifest,
          plan,
          field ? [field] : [],
          `FAQ:${item.question}`,
          violations,
        );
        if (countWords(item.answer) > plan.wordBudget.faqAnswer) {
          pushViolation(violations, "WORD_BUDGET", item.answer, `FAQ answer exceeds ${plan.wordBudget.faqAnswer} words`);
        }
        const faqSupport = item.evidenceIds
          .map((id) => manifest.items.find((row) => row.id === id)?.value || "")
          .filter(Boolean)
          .join("\n");
        const qSem = validateFaqQuestion({
          question: item.question || "",
          topic: isCanonicalGenerationTopic(topicRaw) ? topicRaw : undefined,
          authorizedTopics: isCanonicalGenerationTopic(topicRaw) ? [topicRaw] : [],
          closedTopics: plan.closedTopics,
          supportText: faqSupport,
          productName: facts.productName,
        });
        if (qSem.semanticResult === "FAIL") {
          pushViolation(
            violations,
            "QUESTION_SEMANTICS",
            item.question || "",
            qSem.failCodes.join(",") || "FAQ question failed semantic validation",
          );
        }
        const faqCopy = `${item.question} ${item.answer}`;
        for (const hit of unsupportedRelationalExpansions(faqCopy, faqSupport)) {
          pushViolation(
            violations,
            "UNSUPPORTED_RELATIONAL_EXPANSION",
            hit,
            "relationship language is not entailed by assigned projected evidence",
          );
        }
        if (plan.thinMode) {
          for (const hit of semanticClosureViolations(item.answer || "", faqSupport, "FAQ", true)) {
            pushViolation(violations, "SEMANTIC_CLOSURE", hit.text, hit.code);
          }
        }
        if (plan.closedTopics.includes("usage") && hasUsageAuthorityLanguage(faqCopy)) {
          pushViolation(
            violations,
            "USAGE_PROMOTION",
            faqCopy,
            "feature evidence cannot authorize USAGE semantics",
            "usageInformation",
          );
        }
        if (plan.closedTopics.includes("ingredients") && hasCompositionPromotionLanguage(faqCopy)) {
          pushViolation(
            violations,
            "COMPOSITION_PROMOTION",
            faqCopy,
            "feature mention cannot be promoted into an ingredient-composition claim",
            "ingredientsOrComponents",
          );
        }
        for (const hit of validateGenerationPlan(faqCopy, plan).violations) {
          pushViolation(violations, "CLOSED_TOPIC", hit.text, hit.reason, hit.requiredField);
        }
      }
    }
  }

  if (!hasCore) {
    pushViolation(violations, "MALFORMED", "blocks", "required OVERVIEW or FEATURES block is missing");
  }
  if (!seenTypes.has("FINAL_THOUGHTS")) {
    pushViolation(violations, "MALFORMED", "FINAL_THOUGHTS", "required FINAL_THOUGHTS block is missing");
  }

  const heroCopy = `${page.headline.text}\n${page.summary.text}`;
  if (plan.closedTopics.includes("usage") && hasUsageAuthorityLanguage(heroCopy)) {
    pushViolation(
      violations,
      "USAGE_PROMOTION",
      heroCopy,
      "feature evidence cannot authorize USAGE semantics",
      "usageInformation",
    );
  }
  for (const hit of validateGenerationPlan(heroCopy, plan).violations) {
    pushViolation(violations, "CLOSED_TOPIC", hit.text, hit.reason, hit.requiredField);
  }
  if (isKnowledgeExpansion(heroCopy, support)) {
    pushViolation(violations, "CLOSED_TOPIC", heroCopy, "background science / knowledge expansion is CLOSED", "description");
  }

  return { violations, plan, manifest };
}

export function adaptStructuredToVariantCopy(
  page: StructuredGenerationPage,
  plan: GenerationPlan,
): { headline: string; body: string; ctaLabel: string } {
  const allowed = allowedTypeSet(plan);
  const lines: string[] = [];
  if (page.summary.text.trim()) lines.push(page.summary.text.trim(), "");
  for (const block of page.blocks) {
    if (!allowed.has(block.type)) continue;
    const heading = BLOCK_HEADINGS[block.type];
    if (!heading) continue;
    if (block.type === "FAQ") {
      const items = (block.items || []).filter((item) => item.question.trim() && item.answer.trim());
      if (items.length === 0) continue;
      lines.push(`## ${heading}`, "");
      for (const item of items) {
        const question = item.question.trim().endsWith("?") ? item.question.trim() : `${item.question.trim()}?`;
        lines.push(`- ${question} ${item.answer.trim()}`);
      }
      lines.push("");
      continue;
    }
    if (!block.content.trim()) continue;
    lines.push(`## ${heading}`, "", block.content.trim(), "");
  }
  const cta = STRUCTURED_CTA_LABELS.includes(page.cta.label as (typeof STRUCTURED_CTA_LABELS)[number])
    ? page.cta.label
    : "Learn More";
  return {
    headline: page.headline.text.trim(),
    body: lines.join("\n").trim(),
    ctaLabel: cta,
  };
}

function mergeGrounding(results: GroundingResult[]): GroundingResult {
  const unsupported = results.flatMap((item) => item.unsupportedClaims);
  const hard = unsupported.some((item) => item.severity === "hard");
  const status = hard ? "UNGROUNDED" : unsupported.length > 0 ? "REVIEW_REQUIRED" : "GROUNDED";
  return { status, unsupportedClaims: unsupported };
}

export function evaluateStructuredPage(
  raw: unknown,
  facts: ProductFacts,
  productName: string,
  affiliateUrl: string,
): StructuredEvaluation {
  const emptyGrounding: GroundingResult = { status: "UNGROUNDED", unsupportedClaims: [] };
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {
        page: null,
        structuralViolations: [{ code: "MALFORMED", text: "", reason: "malformed JSON", requiredField: "schema" }],
        traces: [],
        adapted: null,
        inspectionCopy: { headline: productName, body: "", ctaLabel: "Learn More" },
        grounding: emptyGrounding,
        policyGate: "BLOCKED",
        finalGate: "BLOCKED",
      };
    }
  }
  const page = coerceStructuredPage(
    raw && typeof raw === "object" && "variants" in (raw as object)
      ? (raw as { variants: unknown[] }).variants[0]
      : raw,
  );
  if (!page) {
    return {
      page: null,
      structuralViolations: [{ code: "MALFORMED", text: "", reason: "malformed structured page", requiredField: "schema" }],
      traces: [],
      adapted: null,
      inspectionCopy: { headline: productName, body: "", ctaLabel: "Learn More" },
      grounding: emptyGrounding,
      policyGate: "BLOCKED",
      finalGate: "BLOCKED",
    };
  }

  const { violations, plan, manifest } = validateStructuredPage(page, facts);
  const inspectionCopy = adaptStructuredToVariantCopy(page, plan);
  const traces: EvidenceTrace[] = [];
  const scopedResults: GroundingResult[] = [];

  const heroScope = factsFromEvidenceIds(facts, [...page.headline.evidenceIds, ...page.summary.evidenceIds], manifest);
  const heroText = `${page.headline.text}\n${page.summary.text}`;
  const heroGround = validateGrounding(heroText, heroScope);
  scopedResults.push(heroGround);
  traces.push({
    blockId: "HERO",
    blockType: "HERO",
    text: heroText,
    declaredEvidence: [...page.headline.evidenceIds, ...page.summary.evidenceIds],
    groundingResult: heroGround.status,
    supportedBy: [...page.headline.evidenceIds, ...page.summary.evidenceIds],
    structuralResult: violations.some((item) => item.text.includes("headline") || item.text.includes("summary") || item.code === "MALFORMED")
      ? "FAIL"
      : "PASS",
  });

  for (const block of page.blocks) {
    if (block.type === "FAQ") {
      const items = block.items || [];
      const union = items.flatMap((item) => item.evidenceIds);
      traces.push({
        blockId: block.id,
        blockType: "FAQ",
        text: items.map((item) => `${item.question} ${item.answer}`).join("\n"),
        declaredEvidence: union,
        groundingResult: "NOT_RUN",
        supportedBy: union,
        structuralResult: violations.some(
          (item) =>
            /^FAQ:/i.test(item.text) ||
            item.text === "FAQ" ||
            item.code === "INVALID_FAQ_TOPIC" ||
            item.code === "INCOMPATIBLE_FAQ_TOPIC",
        )
          ? "FAIL"
          : "PASS",
        effectiveChildEvidenceUnion: union,
      });
      items.forEach((item, index) => {
        const itemId = `${block.id}:${index + 1}`;
        const text = `${item.question} ${item.answer}`.trim();
        const scoped = factsFromEvidenceIds(facts, item.evidenceIds, manifest);
        const ground = text ? validateGrounding(text, scoped) : { status: "GROUNDED" as const, unsupportedClaims: [] };
        scopedResults.push(ground);
        traces.push({
          blockId: itemId,
          blockType: "FAQ_ITEM",
          text,
          declaredEvidence: item.evidenceIds,
          groundingResult: ground.status,
          supportedBy: item.evidenceIds,
          structuralResult: violations.some((row) => row.text === item.question || row.text.includes(item.question))
            ? "FAIL"
            : "PASS",
          topic: item.topic,
          question: item.question,
          answer: item.answer,
          declaredFields: item.evidenceIds.map((id) => manifest.items.find((row) => row.id === id)?.field || "UNKNOWN"),
          unsupportedClaims: ground.unsupportedClaims,
        });
      });
      continue;
    }
    const text = block.content;
    const ids = block.evidenceIds;
    const scoped = factsFromEvidenceIds(facts, ids, manifest);
    const ground = text.trim() ? validateGrounding(text, scoped) : { status: "GROUNDED" as const, unsupportedClaims: [] };
    scopedResults.push(ground);
    traces.push({
      blockId: block.id,
      blockType: block.type,
      text,
      declaredEvidence: ids,
      groundingResult: ground.status,
      supportedBy: ids,
      structuralResult: violations.some((item) => item.text === block.content || item.text === block.type) ? "FAIL" : "PASS",
    });
  }

  const fullGrounding = validateGrounding(`${inspectionCopy.headline}\n${inspectionCopy.body}\n${inspectionCopy.ctaLabel}`, facts);
  const grounding = mergeGrounding([...scopedResults, fullGrounding]);
  const policy = lintCampaign({
    id: 0,
    name: productName,
    slug: "structured-eval",
    headline: inspectionCopy.headline,
    body: inspectionCopy.body,
    ctaLabel: inspectionCopy.ctaLabel,
    affiliateUrl,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  });
  const structuralFail = violations.length > 0;
  const adapted = structuralFail ? null : inspectionCopy;
  let finalGate = composePublicationGate(policy.gate, grounding.status);
  if (structuralFail) finalGate = "BLOCKED";
  return {
    page,
    structuralViolations: violations,
    traces,
    adapted,
    inspectionCopy,
    grounding,
    policyGate: policy.gate,
    finalGate,
  };
}
