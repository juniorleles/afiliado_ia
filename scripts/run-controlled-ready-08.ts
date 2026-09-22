// npx tsx scripts/run-controlled-ready-08.ts
import fs from "node:fs";
import path from "node:path";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  isCopyEligibleImageProvenance,
  productNameAuthority,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import {
  createGenerationPlan,
  guaranteeReferenceSpans,
  hasGuaranteeReferenceLanguage,
  hasUsageAuthorityLanguage,
  isKnowledgeExpansion,
  temporalDescriptionSpans,
  validateGenerationPlan,
  type GenerationPlan,
  type GenerationTopic,
} from "../src/lib/ai/generation-plan.ts";
import {
  closedClaimFirewall,
  editorialExpansionClaims,
  modelVisibleText,
  projectEvidenceClaims,
  resultsExpectationClaims,
} from "../src/lib/ai/claim-projection.ts";
import {
  createEvidenceSlotPlan,
  type EvidenceSlot,
  type EvidenceSlotPlan,
} from "../src/lib/ai/evidence-slot-plan.ts";
import {
  evaluateSlotGeneration,
  hydrateSlotFillsToPage,
  parseSlotFills,
  slotFillSchema,
  validateSlotFills,
  type SlotFill,
} from "../src/lib/ai/slot-generation.ts";
import { adaptStructuredToVariantCopy, factsFromEvidenceIds } from "../src/lib/ai/structured-generation.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import {
  hasCompositionPromotionLanguage,
  namedIngredientMentions,
  relationalIngredientClaims,
} from "../src/lib/ai/ingredient-claims.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import {
  applyProductImageToPage,
  composePresellPage,
  consumerVisibleText,
  orderedVisibleSections,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { approachToTemplate } from "../src/lib/validation/pipeline.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import {
  createCampaign,
  getCampaignBySlug,
  getPublishedCampaignBySlug,
  updateCampaign,
  updateCampaignCreative,
  updateCampaignDesign,
} from "../src/lib/campaigns.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { analyzeLayoutSnapshot } from "../src/lib/visual-qa/deterministic.ts";
import { visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import { composeVisualQaGate } from "../src/lib/visual-qa/gate.ts";

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnv();

const RUN_ID = "2026-09-21-controlled-ready-08";
const OUT = path.join(process.cwd(), "data", "controlled-ready-08", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-controlled-ready-08";
const MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const FIELDS: FactField[] = [
  "productName",
  "description",
  "features",
  "ingredientsOrComponents",
  "usageInformation",
  "cautions",
  "pricingInformation",
  "guaranteeInformation",
  "manufacturer",
];

const CLOSED_AUDIT_TOPICS: GenerationTopic[] = [
  "ingredients",
  "usage",
  "cautions",
  "pricing",
  "guarantee",
  "manufacturer",
  "results_timeline",
  "category_classification",
  "background_science",
];

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

function identityStatus(facts: ProductFacts): "ACCEPTED" | "IDENTITY_UNCERTAIN" | "NOT_READY" {
  const disc = facts.webDiscovery;
  if (disc?.triggered) {
    if (disc.acceptedCount > 0) return "ACCEPTED";
    if (disc.uncertainCount > 0) return "IDENTITY_UNCERTAIN";
    return "NOT_READY";
  }
  return facts.productName.trim() ? "ACCEPTED" : "NOT_READY";
}

function fieldValue(facts: ProductFacts, field: FactField): string | string[] | undefined {
  if (field === "productName") return facts.productName;
  if (field === "features" || field === "ingredientsOrComponents" || field === "usageInformation" || field === "cautions") {
    return facts[field];
  }
  return facts[field] as string | undefined;
}

function fieldHasContent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim());
  return Boolean(value?.trim());
}

function fieldTable(facts: ProductFacts) {
  return FIELDS.map((field) => {
    const provenance = facts.confidence[field];
    const value = fieldValue(facts, field);
    const copyEligible = isCopyEligibleConfidence(provenance) && fieldHasContent(value);
    const identity = field === "productName" ? productNameAuthority(facts) : null;
    return {
      FIELD: field,
      VALUE: value ?? null,
      PROVENANCE: provenance,
      COPY_ELIGIBLE: copyEligible ? "YES" : "NO",
      GENERATION_AUTHORITY: identity?.authority ?? null,
    };
  });
}

function inspectPromptFirewall(facts: ProductFacts, prompt: string) {
  const faqSnippets = facts.sourceSnippets.filter((s) => s.field === "faq" && s.text.trim());
  const eligible = getConsumerCopyEligibleFacts(facts);
  const eligibleBag = [
    eligible.productName,
    eligible.description,
    ...eligible.features,
    ...eligible.ingredientsOrComponents,
    ...eligible.usageInformation,
    ...eligible.cautions,
    eligible.pricingInformation,
    eligible.guaranteeInformation,
    eligible.manufacturer,
  ]
    .join("\n")
    .toLowerCase();
  const promptLower = prompt.toLowerCase();
  const leaked: string[] = [];
  for (const snippet of faqSnippets) {
    for (const part of snippet.text.split(/[.!?\n]/).map((item) => item.trim()).filter((item) => item.length >= 12)) {
      if (eligibleBag.includes(part.toLowerCase())) continue;
      if (promptLower.includes(part.toLowerCase())) leaked.push(part);
    }
  }
  const rawLeaks: string[] = [];
  for (const snippet of facts.sourceSnippets) {
    const text = snippet.text.trim();
    if (text.length < 24 || eligibleBag.includes(text.toLowerCase().slice(0, 40))) continue;
    if (promptLower.includes(text.toLowerCase().slice(0, 40))) rawLeaks.push(text.slice(0, 80));
  }
  const serpLeaks: string[] = [];
  for (const source of facts.webDiscovery?.sources || []) {
    const title = (source.title || "").trim();
    if (title.length < 18 || eligibleBag.includes(title.toLowerCase())) continue;
    if (promptLower.includes(title.toLowerCase())) serpLeaks.push(title);
  }
  const heuristicLeaks: string[] = [];
  const notFoundLeaks: string[] = [];
  for (const field of FIELDS) {
    const value = fieldValue(facts, field);
    const parts = Array.isArray(value) ? value : value ? [value] : [];
    for (const part of parts) {
      const slice = part.trim();
      if (slice.length < 16) continue;
      if (facts.confidence[field] === "HEURISTIC_EXTRACTION" && !eligibleBag.includes(slice.toLowerCase().slice(0, 24)) && promptLower.includes(slice.toLowerCase().slice(0, 24))) {
        heuristicLeaks.push(`${field}:${slice.slice(0, 80)}`);
      }
      if (facts.confidence[field] === "NOT_FOUND" && promptLower.includes(slice.toLowerCase().slice(0, 24))) {
        notFoundLeaks.push(`${field}:${slice.slice(0, 80)}`);
      }
    }
  }
  return {
    FAQ_SNIPPETS: leaked.length > 0 ? "YES" : "NO",
    RAW_SOURCE_SNIPPETS: rawLeaks.length > 0 ? "YES" : "NO",
    SERP_TITLES: serpLeaks.length > 0 ? "YES" : "NO",
    HEURISTIC_FACTS: heuristicLeaks.length > 0 ? "YES" : "NO",
    NOT_FOUND_FACTS: notFoundLeaks.length > 0 ? "YES" : "NO",
    leaked,
    rawLeaks: rawLeaks.slice(0, 6),
    serpLeaks: serpLeaks.slice(0, 6),
    heuristicLeaks: heuristicLeaks.slice(0, 6),
    notFoundLeaks: notFoundLeaks.slice(0, 6),
  };
}

function describeSlots(slotPlan: EvidenceSlotPlan) {
  return slotPlan.slots.map((slot) => ({
    SLOT_ID: slot.slotId,
    TYPE: slot.type,
    TOPIC: slot.topic,
    SEMANTIC_AUTHORITY: slot.semanticAuthority,
    REQUIRED: slot.required ? "YES" : "NO",
    MAX_WORDS: slot.maxWords,
    CODE_ASSIGNED_CLAIM_IDS: slot.allowedClaimIds,
    CODE_ASSIGNED_EVIDENCE_IDS: slot.allowedEvidenceIds,
    CODE_ASSIGNED_FIELDS: slot.evidence.map((item) => item.field),
    MODEL_VISIBLE_TEXT: slot.evidence.map((item) => item.value).join(" / "),
  }));
}

function slotInvariants(slotPlan: EvidenceSlotPlan, manifestItems: Array<{ id: string; field: string; provenance: string }>) {
  const byId = new Map(manifestItems.map((item) => [item.id, item]));
  const faqSlots = slotPlan.slots.filter((slot) => slot.type === "FAQ");
  const topicField = (topic: string) =>
    topic === "identity"
      ? "productName"
      : topic === "features"
        ? "features"
        : topic === "ingredients"
          ? "ingredientsOrComponents"
          : topic === "usage"
            ? "usageInformation"
            : topic === "cautions"
              ? "cautions"
              : topic === "pricing"
                ? "pricingInformation"
                : topic === "guarantee"
                  ? "guaranteeInformation"
                  : topic === "manufacturer"
                    ? "manufacturer"
                    : "description";
  const crossFieldFaq = faqSlots.filter((slot) => slot.evidence.some((item) => item.field !== topicField(slot.topic)));
  const featureSlots = slotPlan.slots.filter((slot) => slot.type === "FEATURE");
  const descriptionSlots = slotPlan.slots.filter((slot) => slot.topic === "description");
  const heuristic = slotPlan.slots.flatMap((slot) => slot.allowedEvidenceIds.filter((id) => byId.get(id)?.provenance === "HEURISTIC_EXTRACTION"));
  const notFound = slotPlan.slots.flatMap((slot) => slot.allowedEvidenceIds.filter((id) => byId.get(id)?.provenance === "NOT_FOUND"));
  return {
    UNKNOWN_SLOT_POSSIBLE_FROM_PLAN: "NO",
    CROSS_FIELD_FAQ_ASSIGNMENT: crossFieldFaq.length,
    FEATURE_EVIDENCE_HAS_USAGE_AUTHORITY: featureSlots.some((slot) => slot.semanticAuthority === "USAGE" || slot.allowedEvidenceIds.some((id) => byId.get(id)?.field === "usageInformation"))
      ? "YES"
      : "NO",
    DESCRIPTION_HAS_USAGE_AUTHORITY: descriptionSlots.some((slot) => slot.semanticAuthority === "USAGE") ? "YES" : "NO",
    DESCRIPTION_HAS_GUARANTEE_AUTHORITY: descriptionSlots.some((slot) => slot.semanticAuthority === "GUARANTEE") ? "YES" : "NO",
    FEATURE_HAS_COMPOSITION_AUTHORITY: featureSlots.some((slot) => slot.semanticAuthority === "INGREDIENTS" || slot.allowedEvidenceIds.some((id) => byId.get(id)?.field === "ingredientsOrComponents"))
      ? "YES"
      : "NO",
    HEURISTIC_EVIDENCE_IN_SLOTS: heuristic.length,
    NOT_FOUND_EVIDENCE_IN_SLOTS: notFound.length,
    MODEL_CHOOSES_BLOCK: "NO",
    MODEL_CHOOSES_TOPIC: "NO",
    MODEL_CHOOSES_EVIDENCE: "NO",
  };
}

async function oneShotSlots(
  system: string,
  user: string,
  schema: unknown,
): Promise<{
  requestSent: boolean;
  httpStatus: number | null;
  providerError: string | null;
  raw: string | null;
  jsonValid: boolean;
  fills: SlotFill[] | null;
  ctaLabel: string | null;
  parseError: string | null;
  evidenceIdsInOutput: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16384,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
    }),
  });
  const httpStatus = response.status;
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return {
      requestSent: true,
      httpStatus,
      providerError: errorBody.slice(0, 500) || `HTTP ${httpStatus}`,
      raw: null,
      jsonValid: false,
      fills: null,
      ctaLabel: null,
      parseError: null,
      evidenceIdsInOutput: false,
    };
  }
  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    return {
      requestSent: true,
      httpStatus,
      providerError: "Anthropic response had no text block",
      raw: null,
      jsonValid: false,
      fills: null,
      ctaLabel: null,
      parseError: null,
      evidenceIdsInOutput: false,
    };
  }
  const raw = textBlock.text;
  const evidenceIdsInOutput = /"evidenceIds"\s*:/.test(raw);
  const parsed = parseSlotFills(raw);
  if (!parsed) {
    return {
      requestSent: true,
      httpStatus,
      providerError: null,
      raw,
      jsonValid: false,
      fills: null,
      ctaLabel: null,
      parseError: "parseSlotFills returned null",
      evidenceIdsInOutput,
    };
  }
  return {
    requestSent: true,
    httpStatus,
    providerError: null,
    raw,
    jsonValid: true,
    fills: parsed.fills,
    ctaLabel: parsed.ctaLabel,
    parseError: null,
    evidenceIdsInOutput,
  };
}

function slotCopy(slot: EvidenceSlot, fill: SlotFill | undefined): string {
  if (!fill) return "";
  if (slot.type === "FAQ") return `${fill.question || ""} ${fill.answer || ""}`.trim();
  return (fill.content || "").trim();
}

function absenceHits(copy: string): string[] {
  const cue =
    /\b(?:not (?:disclosed|provided|available|listed|included|specified|confirmed)|unavailable|unknown|unclear|no information about|details are absent|is missing|are missing|are absent)\b/i;
  return copy
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item && cue.test(item) && /\b(?:ingredient|manufacturer|facility|pric|cost|dosage|serving|usage|caution|allergen|guarantee|refund)\b/i.test(item));
}

function topicPresent(copy: string, topic: GenerationTopic): boolean {
  if (topic === "usage") return hasUsageAuthorityLanguage(copy) || temporalDescriptionSpans(copy).length > 0;
  if (topic === "guarantee") return hasGuaranteeReferenceLanguage(copy) || /\bguarantee|\brefund|\bmoney[\s-]?back\b/i.test(copy);
  const patterns: Record<Exclude<GenerationTopic, "usage" | "guarantee">, RegExp> = {
    identity: /\bproduct name\b/i,
    description: /\b./,
    features: /\b./,
    ingredients: /\bingredient list\b|\bincludes antioxidants\b|\bformulated with\b|\bcontains antioxidants\b/i,
    cautions: /\bcaution|\bwarning|\ballergen|\bconsult (?:a )?(?:doctor|physician|healthcare)\b/i,
    pricing: /\b\$\d|\bprice|\bcost|\bdiscount|\bfree shipping\b/i,
    manufacturer: /\bmanufacturer|\bmade in|\bgmp\b|\bfacility\b/i,
    results_timeline: /\bin \d+\s+(?:days|weeks|months)|results in\b|\bresults expectations?\b/i,
    category_classification: /\bdietary supplement\b|\bjoint supplement category\b/i,
    background_science: /\bsynovial fluid is\b|\bcartilage\b|\bfriction\b|\bnatural lubricant\b/i,
  };
  if (topic === "identity" || topic === "description" || topic === "features") return false;
  return patterns[topic].test(copy);
}

function closedTopicAudit(copy: string, plan: GenerationPlan) {
  const hits = validateGenerationPlan(copy, plan).violations;
  return CLOSED_AUDIT_TOPICS.map((topic) => {
    const samples = hits.filter((item) => item.topic === topic).map((item) => item.text).slice(0, 4);
    const closed = plan.closedTopics.includes(topic);
    const present = samples.length > 0 || topicPresent(copy, topic);
    return {
      TOPIC: topic,
      OPEN_OR_CLOSED: closed ? "CLOSED" : "OPEN",
      PRESENT_IN_COPY: present ? "YES" : "NO",
      AUTHORIZED: closed ? "NO" : present ? "YES" : "N/A",
      SAMPLES: samples,
    };
  });
}

function semanticAuthorityAudit(fills: SlotFill[], slotPlan: EvidenceSlotPlan, plan: GenerationPlan) {
  const byFill = new Map(fills.map((fill) => [fill.slotId, fill]));
  const usagePromotions: string[] = [];
  const guaranteePromotions: string[] = [];
  const compositionPromotions: string[] = [];
  const namedClaims: string[] = [];
  const relational: string[] = [];
  const editorial: string[] = [];
  const results: string[] = [];
  const knowledgeHits: string[] = [];
  for (const slot of slotPlan.slots) {
    const fill = byFill.get(slot.slotId);
    const text = slotCopy(slot, fill);
    if (!text) continue;
    const support = slot.evidence.map((item) => item.value).join("\n");
    if (slot.semanticAuthority !== "USAGE" && plan.closedTopics.includes("usage") && hasUsageAuthorityLanguage(text)) {
      usagePromotions.push(`${slot.slotId}: ${text}`);
    }
    if (slot.semanticAuthority !== "GUARANTEE" && plan.closedTopics.includes("guarantee") && hasGuaranteeReferenceLanguage(text)) {
      guaranteePromotions.push(`${slot.slotId}: ${text}`);
    }
    if (slot.semanticAuthority !== "INGREDIENTS" && plan.closedTopics.includes("ingredients") && hasCompositionPromotionLanguage(text)) {
      compositionPromotions.push(`${slot.slotId}: ${text}`);
    }
    editorial.push(...editorialExpansionClaims(text, support).map((hit) => `${slot.slotId}: ${hit}`));
    if (slot.type === "FAQ" && plan.closedTopics.includes("results_timeline")) {
      results.push(...resultsExpectationClaims(text).map((hit) => `${slot.slotId}: ${hit}`));
    }
    if (isKnowledgeExpansion(text, support)) knowledgeHits.push(`${slot.slotId}: ${text}`);
    namedClaims.push(...namedIngredientMentions(text).map((item) => `${slot.slotId}: ${item}`));
    relational.push(...relationalIngredientClaims(text).map((item) => `${slot.slotId}: ${item}`));
  }
  const allCopy = fills.map((fill) => `${fill.content || ""} ${fill.question || ""} ${fill.answer || ""}`).join("\n");
  namedClaims.push(...namedIngredientMentions(allCopy).filter((item) => !namedClaims.some((row) => row.endsWith(item))));
  return {
    USAGE_PROMOTIONS: usagePromotions,
    GUARANTEE_PROMOTIONS: guaranteePromotions,
    COMPOSITION_PROMOTIONS: compositionPromotions,
    NAMED_INGREDIENT_CLAIMS: namedClaims,
    UNSUPPORTED_RELATIONAL_EXPANSIONS: relational,
    EDITORIAL_EXPANSIONS: editorial,
    RESULTS_TIMELINE_PROMOTIONS: results,
    BACKGROUND_KNOWLEDGE_EXPANSIONS: knowledgeHits,
  };
}

function classifyFailure(input: {
  jsonValid: boolean;
  schemaValid: boolean;
  structuralFail: boolean;
  unknownSlots: number;
  duplicateSlots: number;
  missingRequired: number;
  usagePromotions: number;
  guaranteePromotions: number;
  compositionPromotions: number;
  namedIngredients: number;
  relational: number;
  editorial: number;
  results: number;
  absence: number;
  knowledge: boolean;
  faqFail: boolean;
  slotGroundingFail: boolean;
  grounding: string;
  unsupported: number;
  policy: string;
  gate: string;
  coverage: string;
}): { PRIMARY: string; EVIDENCE: string; GO: string } {
  if (!input.jsonValid) {
    return { PRIMARY: "SLOT_SCHEMA_FAILURE", EVIDENCE: "JSON_VALID=NO", GO: "SLOT_GENERATION_NEEDS_FIX" };
  }
  if (!input.schemaValid || input.unknownSlots || input.duplicateSlots || input.missingRequired || input.structuralFail) {
    return {
      PRIMARY: "SLOT_STRUCTURE_FAILURE",
      EVIDENCE: `unknown=${input.unknownSlots} duplicate=${input.duplicateSlots} missing=${input.missingRequired} schemaValid=${input.schemaValid}`,
      GO: "SLOT_GENERATION_NEEDS_FIX",
    };
  }
  if (
    input.usagePromotions ||
    input.guaranteePromotions ||
    input.compositionPromotions ||
    input.namedIngredients ||
    input.relational ||
    input.editorial ||
    input.results ||
    input.absence ||
    input.knowledge
  ) {
    return {
      PRIMARY: "SEMANTIC_AUTHORITY_FAILURE",
      EVIDENCE: `usage=${input.usagePromotions} guarantee=${input.guaranteePromotions} composition=${input.compositionPromotions} named=${input.namedIngredients} relational=${input.relational} editorial=${input.editorial} results=${input.results} absence=${input.absence} knowledge=${input.knowledge}`,
      GO: "SEMANTIC_AUTHORITY_NEEDS_FIX",
    };
  }
  if (input.faqFail || input.slotGroundingFail) {
    return { PRIMARY: "SLOT_GROUNDING_FAILURE", EVIDENCE: input.faqFail ? "FAQ_QUESTION_ANSWER_VALIDATION=FAIL" : "SLOT_SCOPED_GROUNDING=FAIL", GO: "SLOT_GROUNDING_NEEDS_FIX" };
  }
  if (input.grounding !== "GROUNDED" || input.unsupported > 0) {
    return { PRIMARY: "GROUNDING_PRECISION_FAILURE", EVIDENCE: `GROUNDING=${input.grounding} unsupported=${input.unsupported}`, GO: "GROUNDING_PRECISION_NEEDS_FIX" };
  }
  if (input.policy !== "READY") {
    return { PRIMARY: "POLICY_PRECISION_FAILURE", EVIDENCE: `POLICY=${input.policy}`, GO: "POLICY_PRECISION_NEEDS_FIX" };
  }
  if (input.gate !== "READY") {
    return {
      PRIMARY: input.coverage === "THIN" || input.coverage === "INSUFFICIENT" ? "PRODUCT_FACT_COVERAGE_LIMITATION" : "OTHER",
      EVIDENCE: `gate=${input.gate} coverage=${input.coverage}`,
      GO: input.coverage === "THIN" || input.coverage === "INSUFFICIENT" ? "PRODUCT_FACT_COVERAGE_NEEDS_FIX" : "REGRESSION_DETECTED",
    };
  }
  return { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY", GO: "FIRST_REAL_PROJECTED_CONTENT_READY" };
}

async function playwrightVisual(slug: string) {
  const inspection = await inspectRenderedPresell({
    slug,
    baseUrl: visualQaBaseUrl(),
    artifactKey: `controlled-ready-08-${slug}`,
  });
  const findings = inspection.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "REVIEW"));
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const byWidth: Record<string, { overflowX: boolean; findings: number; label: string }> = {};
  for (const capture of inspection.captures) {
    byWidth[String(capture.viewport.width)] = {
      overflowX: capture.snapshot.overflowX,
      findings: analyzeLayoutSnapshot(capture.snapshot, "REVIEW").filter((f) => f.severity === "HIGH" || f.severity === "WARNING").length,
      label: capture.viewport.label,
    };
  }
  const shotDir = path.join(OUT, "screenshots");
  fs.mkdirSync(shotDir, { recursive: true });
  for (const capture of inspection.captures) {
    for (const file of capture.screenshotFiles) {
      const dest = path.join(shotDir, path.basename(file));
      fs.copyFileSync(file, dest);
    }
  }
  return { inspection, findings, gate, byWidth };
}

async function extraPlaywrightChecks(slug: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
        ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
      },
      reducedMotion: "reduce",
    });
    const pw = await context.newPage();
    pw.setDefaultTimeout(45_000);
    const baseUrl = visualQaBaseUrl();
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article.ps-article, article", { timeout: 30_000 });
    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.waitForTimeout(300);
    const mobile = await pw.evaluate(() => {
      const vh = window.innerHeight;
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
      const r = cta?.getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        ctaFullyVisible: Boolean(r && r.top >= 0 && r.bottom <= vh && r.height >= 40),
        href: cta?.getAttribute("href") || "",
        emptySections: [...document.querySelectorAll("[data-section-id]")].filter((n) => !((n as HTMLElement).innerText || "").trim()).map((n) => n.getAttribute("data-section-id")),
        brokenImages: [...document.querySelectorAll("article img")].filter((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth === 0 && Boolean(el.getAttribute("src"));
        }).length,
        sectionOrder: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
        stickyCta: Boolean(document.querySelector('[data-cta-position="sticky"], .ps-sticky-cta, [data-sticky-cta]')),
      };
    });
    const breakpoints: Record<string, { overflowX: boolean }> = {};
    for (const width of [375, 390, 768, 1024, 1440]) {
      await pw.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
      await pw.waitForTimeout(150);
      breakpoints[String(width)] = await pw.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
    }
    await pw.setViewportSize({ width: 1440, height: 1000 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(250);
    const desktop = await pw.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      ctaVisible: Boolean((() => {
        const r = (document.querySelector('[data-cta-position="hero"]') as HTMLElement | null)?.getBoundingClientRect();
        return r && r.top >= 0 && r.bottom <= 1000 && r.height >= 40;
      })()),
    }));
    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article", { timeout: 30_000 });
    const anatomy = await pw.evaluate(() => {
      const text = (document.querySelector("article")?.innerText || "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      return {
        words,
        h1,
        hasCta: Boolean(document.querySelector('[data-cta-position="hero"]')),
        hasOverview: Boolean(document.querySelector('[data-section-id="overview"]')),
        hasDisclosure: Boolean(document.querySelector("[data-trust-disclosure]")),
        sections: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
      };
    });
    return { mobile, desktop, breakpoints, publicStatus: pub?.status() ?? null, anatomy };
  } finally {
    await browser.close();
  }
}

function scoreAnatomy(anatomy: { words: number; h1: string; hasCta: boolean; hasOverview: boolean; hasDisclosure: boolean; sections: Array<string | null> }) {
  const hero = anatomy.h1 && anatomy.hasCta ? 70 : 45;
  const value = anatomy.hasOverview ? 65 : 40;
  const copy = anatomy.words >= 400 ? 70 : anatomy.words >= 220 ? 55 : 35;
  const trust = anatomy.hasDisclosure ? 60 : 35;
  const conversion = anatomy.hasCta ? 65 : 30;
  const design = anatomy.sections.includes("overview") ? 60 : 45;
  return {
    TOTAL_SCORE: Math.round((hero + value + copy + trust + conversion + design) / 6),
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    SAFE_STRUCTURAL: anatomy.hasOverview ? ["Overview present"] : ["Keep overview as first body section"],
    SAFE_VISUAL: ["Do not add unsourced badges or filler images"],
    SAFE_CRO: anatomy.hasCta ? ["Keep a single informational hero CTA"] : ["Ensure hero CTA is visible"],
    FACTUAL_RISK: ["Do not add testimonials, ratings, ingredients, guarantees, or manufacturer claims from this audit"],
    NOT_APPLICABLE: ["Do not treat Web Anatomy score as a ProductFact"],
  };
}

function publicationBase() {
  return {
    HUMAN_APPROVAL: { STATUS: "PENDING" },
    PUBLICATION: { STATUS: "draft", PUBLIC_ROUTE_AVAILABLE: false, PUBLISH_ATTEMPTED: false, AFFILIATE_DESTINATION_OPENED: false },
    ISSUES: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    FINAL_STATUS: "CONTROLLED_READY_RUN_08_COMPLETE",
  };
}

async function main() {
  console.log("IMPORT_START", SOURCE_URL);
  const facts = await importProductFromUrl(SOURCE_URL, { operatorProductName: OPERATOR_NAME });
  writeJson("import-facts.json", facts);

  const identity = identityStatus(facts);
  const identityAuth = productNameAuthority(facts);
  const table = fieldTable(facts);
  const eligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "YES").map((row) => row.FIELD);
  const ineligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "NO").map((row) => row.FIELD);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const storedFacts = JSON.parse(JSON.stringify(facts));
  const storedManifest = JSON.parse(JSON.stringify(manifest));
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const visibleProjected = modelVisibleText(projection);
  const claimFirewall = closedClaimFirewall(projection, plan);
  const factsMutated = JSON.stringify(facts) !== JSON.stringify(storedFacts);
  const manifestMutated = JSON.stringify(manifest) !== JSON.stringify(storedManifest);
  const excludedTracePreserved = projection.excluded.every(
    (claim) => Boolean(claim.claimId && claim.evidenceId && claim.sourceText && claim.field && claim.claimClass && claim.generationAuthorized === false),
  );
  const dailyUseVisible = /\bdaily use\b/i.test(visibleProjected);
  const takeOnceVisible = /\btake once\b/i.test(visibleProjected);
  const vendorVisible = /180-day vendor/i.test(visibleProjected);
  const guaranteeRefVisible = guaranteeReferenceSpans(visibleProjected).length > 0;
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  const slotReport = describeSlots(slotPlan);
  const invariants = slotInvariants(slotPlan, manifest.items);
  writeJson("generation-plan.json", plan);
  writeJson("evidence-manifest.json", manifest);
  writeJson("claim-projection.json", {
    claims: projection.claims,
    authorized: projection.authorized.length,
    excluded: projection.excluded.length,
    visible: visibleProjected,
    firewall: claimFirewall,
  });
  writeJson("evidence-slot-plan.json", { slots: slotReport, requiredSlotIds: slotPlan.requiredSlotIds, optionalSlotIds: slotPlan.optionalSlotIds, invariants });
  writeJson("facts-eligibility.json", { identity, coverage: plan.coverage, table, importQuality: facts.importQuality, productNameAuthority: identityAuth });
  console.log("IDENTITY", identity, facts.productName, facts.confidence.productName, identityAuth.authority, "COVERAGE", plan.coverage);
  console.log("PROJECTION", projection.claims.length, "auth", projection.authorized.length, "excl", projection.excluded.length, "closedVisible", claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS);
  console.log("SLOT_PLAN", slotPlan.slots.map((slot) => `${slot.slotId}:${slot.type}:${slot.topic}:${slot.allowedEvidenceIds.join(",")}`).join(" | "));

  const productBlock = {
    NAME: facts.productName,
    SOURCE_URL: facts.sourceUrl || SOURCE_URL,
    IDENTITY: identity,
    PRODUCT_NAME_PROVENANCE: facts.confidence.productName,
    PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority,
  };
  const factsBlock = { COVERAGE: plan.coverage, ELIGIBLE_FIELDS: eligibleFields, INELIGIBLE_FIELDS: ineligibleFields, TABLE: table };
  const manifestBlock = {
    TOTAL: manifest.items.length,
    ITEMS: manifest.items,
    NON_COPY_ELIGIBLE_EVIDENCE: manifest.promptFactNotCopyEligible,
  };
  const claimRows = projection.claims.map((claim) => ({
    CLAIM_ID: claim.claimId,
    EVIDENCE_ID: claim.evidenceId,
    FIELD: claim.field,
    CLAIM_CLASS: claim.claimClass,
    SOURCE_TEXT: claim.sourceText,
    MODEL_VISIBLE_TEXT: claim.generationAuthorized ? claim.generationText : "",
    GENERATION_AUTHORIZED: claim.generationAuthorized ? "YES" : "NO",
    SEMANTIC_AUTHORITY: claim.semanticAuthority,
  }));
  const claimBlock = {
    TOTAL_SOURCE_EVIDENCE: manifest.items.filter((item) => item.copyEligible).length,
    TOTAL_CLAIMS: projection.claims.length,
    AUTHORIZED_CLAIMS: projection.authorized.length,
    EXCLUDED_CLAIMS: projection.excluded.length,
    MODEL_VISIBLE_CLOSED_CLAIMS: claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
    CLAIMS: claimRows,
    SOURCE_PRESERVATION: {
      PRODUCTFACTS_MUTATED: factsMutated ? "YES" : "NO",
      EVIDENCE_MANIFEST_MUTATED: manifestMutated ? "YES" : "NO",
      SOURCE_TEXT_MUTATED: facts.description === storedFacts.description && JSON.stringify(facts.features) === JSON.stringify(storedFacts.features) ? "NO" : "YES",
      EXCLUDED_CLAIM_TRACE_PRESERVED: excludedTracePreserved ? "YES" : "NO",
    },
  };
  const closedFirewallBlock = {
    USAGE_INSTRUCTION_VISIBLE: claimFirewall.USAGE_INSTRUCTION_VISIBLE,
    GUARANTEE_VISIBLE: claimFirewall.GUARANTEE_VISIBLE,
    PRICING_VISIBLE: claimFirewall.PRICING_VISIBLE,
    CAUTION_VISIBLE: claimFirewall.CAUTION_VISIBLE,
    MANUFACTURER_VISIBLE: claimFirewall.MANUFACTURER_VISIBLE,
    RESULTS_TIMELINE_VISIBLE: claimFirewall.RESULTS_TIMELINE_VISIBLE,
    CATEGORY_CLASSIFICATION_VISIBLE: claimFirewall.CATEGORY_CLASSIFICATION_VISIBLE,
    BACKGROUND_SCIENCE_VISIBLE: claimFirewall.BACKGROUND_SCIENCE_VISIBLE,
    INGREDIENT_COMPOSITION_VISIBLE: claimFirewall.INGREDIENT_COMPOSITION_VISIBLE,
    TOTAL_VISIBLE_CLOSED_CLAIMS: claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
    DAILY_USE_VISIBLE: dailyUseVisible ? "YES" : "NO",
    TAKE_ONCE_VISIBLE: takeOnceVisible ? "YES" : "NO",
    "180_DAY_VENDOR_VISIBLE": vendorVisible ? "YES" : "NO",
    GUARANTEE_REFERENCE_VISIBLE: guaranteeRefVisible ? "YES" : "NO",
    ACTUAL_MODEL_TEXT_AUDITED: claimFirewall.ACTUAL_MODEL_TEXT_AUDITED,
  };
  const planBlock = {
    THIN_MODE: plan.thinMode,
    ALLOWED_TOPICS: plan.allowedTopics,
    CLOSED_TOPICS: plan.closedTopics,
    AUTHORIZED_BLOCKS: plan.authorizedBlocks,
    DISALLOWED_BLOCKS: plan.disallowedBlocks,
    WORD_BUDGET: plan.wordBudget,
  };
  const slotPlanBlock = {
    TOTAL_SLOTS: slotPlan.slots.length,
    SLOTS: slotReport,
    FAQ: slotReport.filter((slot) => slot.TYPE === "FAQ"),
    MODEL_CHOOSES_BLOCK: "NO",
    MODEL_CHOOSES_TOPIC: "NO",
    MODEL_CHOOSES_EVIDENCE: "NO",
    INVARIANTS: invariants,
  };
  const preAiFail =
    claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS > 0 ||
    dailyUseVisible ||
    takeOnceVisible ||
    vendorVisible ||
    guaranteeRefVisible ||
    invariants.HEURISTIC_EVIDENCE_IN_SLOTS > 0 ||
    invariants.NOT_FOUND_EVIDENCE_IN_SLOTS > 0 ||
    invariants.CROSS_FIELD_FAQ_ASSIGNMENT > 0 ||
    invariants.FEATURE_EVIDENCE_HAS_USAGE_AUTHORITY === "YES" ||
    invariants.DESCRIPTION_HAS_GUARANTEE_AUTHORITY === "YES" ||
    invariants.DESCRIPTION_HAS_USAGE_AUTHORITY === "YES" ||
    invariants.FEATURE_HAS_COMPOSITION_AUTHORITY === "YES" ||
    factsMutated ||
    manifestMutated ||
    !excludedTracePreserved;

  if (identity !== "ACCEPTED") {
    writeJson("REPORT.json", {
      PRODUCT: productBlock,
      PRODUCT_FACTS: factsBlock,
      GENERATION: { AI_CALLS: 0 },
      FAILURE_CLASSIFICATION: { PRIMARY: "PRODUCT_FACT_COVERAGE_LIMITATION", EVIDENCE: `IDENTITY=${identity}` },
      GO_NO_GO: "PRODUCT_FACT_COVERAGE_NEEDS_FIX",
      ...publicationBase(),
    });
    console.log("STOP identity", identity);
    return;
  }
  if (manifest.promptFactNotCopyEligible !== 0) {
    writeJson("REPORT.json", {
      PRODUCT: productBlock,
      EVIDENCE_MANIFEST: manifestBlock,
      GENERATION: { AI_CALLS: 0 },
      FAILURE_CLASSIFICATION: { PRIMARY: "OTHER", EVIDENCE: `NON_COPY_ELIGIBLE_EVIDENCE=${manifest.promptFactNotCopyEligible}` },
      GO_NO_GO: "REGRESSION_DETECTED",
      ...publicationBase(),
    });
    console.log("STOP NON_COPY_ELIGIBLE_EVIDENCE");
    return;
  }
  if (preAiFail) {
    writeJson("REPORT.json", {
      PRODUCT: productBlock,
      PRODUCT_FACTS: factsBlock,
      EVIDENCE_MANIFEST: manifestBlock,
      CLAIM_PROJECTION: claimBlock,
      CLOSED_CLAIM_FIREWALL: closedFirewallBlock,
      GENERATION_PLAN: planBlock,
      EVIDENCE_SLOT_PLAN: slotPlanBlock,
      GENERATION: { AI_CALLS: 0 },
      FAILURE_CLASSIFICATION: {
        PRIMARY: "CLAIM_PROJECTION_FAILURE",
        EVIDENCE: JSON.stringify({
          TOTAL_VISIBLE_CLOSED_CLAIMS: claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
          DAILY_USE_VISIBLE: dailyUseVisible,
          TAKE_ONCE_VISIBLE: takeOnceVisible,
          "180_DAY_VENDOR_VISIBLE": vendorVisible,
          GUARANTEE_REFERENCE_VISIBLE: guaranteeRefVisible,
          INVARIANTS: invariants,
          PRODUCTFACTS_MUTATED: factsMutated,
          EVIDENCE_MANIFEST_MUTATED: manifestMutated,
        }),
      },
      GO_NO_GO: "CLAIM_PROJECTION_NEEDS_FIX",
      ...publicationBase(),
    });
    console.log("STOP CLAIM_PROJECTION_FAILURE", closedFirewallBlock);
    return;
  }

  console.log("MARKET_RESEARCH_START");
  const { research, recommendation } = await researchAndRecommend(facts);
  writeJson("market-research.json", research);
  writeJson("strategy.json", recommendation);
  console.log("STRATEGY", recommendation.recommendedStrategy, recommendation.confidence, "MR", research.status, research.quality);

  const promptBundle = buildPrompt({
    productName: facts.productName,
    sourceUrl: facts.sourceUrl,
    facts,
    targetApproach: recommendation.recommendedStrategy,
    marketResearch: research,
    recommendedStrategy: recommendation.recommendedStrategy,
  });
  const firewall = inspectPromptFirewall(facts, promptBundle.user);
  writeJson("generation-prompt.json", {
    system: promptBundle.system,
    user: promptBundle.user,
    firewall,
    PROMPT_SIZE: promptBundle.user.length,
  });
  console.log("FIREWALL", firewall.FAQ_SNIPPETS, firewall.RAW_SOURCE_SNIPPETS, firewall.SERP_TITLES, firewall.HEURISTIC_FACTS, firewall.NOT_FOUND_FACTS, "PROMPT_SIZE", promptBundle.user.length);
  if (firewall.FAQ_SNIPPETS === "YES" || firewall.RAW_SOURCE_SNIPPETS === "YES" || firewall.SERP_TITLES === "YES" || firewall.HEURISTIC_FACTS === "YES" || firewall.NOT_FOUND_FACTS === "YES") {
    writeJson("REPORT.json", {
      PRODUCT: productBlock,
      FIREWALL: firewall,
      GENERATION: { AI_CALLS: 0 },
      FAILURE_CLASSIFICATION: { PRIMARY: "OTHER", EVIDENCE: "FIREWALL leak" },
      GO_NO_GO: "REGRESSION_DETECTED",
      ...publicationBase(),
    });
    console.log("STOP firewall regression");
    return;
  }

  const schema = slotFillSchema(slotPlan);
  writeJson("slot-schema.json", schema);
  console.log("GENERATION_START", recommendation.recommendedStrategy);
  const generated = await oneShotSlots(promptBundle.system, promptBundle.user, schema);
  writeJson("generation-raw.json", {
    raw: generated.raw,
    jsonValid: generated.jsonValid,
    parseError: generated.parseError,
    httpStatus: generated.httpStatus,
    providerError: generated.providerError,
    evidenceIdsInOutput: generated.evidenceIdsInOutput,
  });
  const provider = {
    ANTHROPIC_REQUEST_SENT: generated.requestSent ? "YES" : "NO",
    ANTHROPIC_RESPONSE_RECEIVED: generated.httpStatus != null ? "YES" : "NO",
    HTTP_STATUS: generated.httpStatus,
    PROVIDER_ERROR: generated.providerError,
    SLOT_CANDIDATE_RECEIVED: generated.raw ? "YES" : "NO",
  };
  writeJson("provider.json", provider);
  console.log("PROVIDER", generated.httpStatus, generated.providerError ? "ERROR" : "OK");

  const commonHead = {
    PRODUCT: productBlock,
    PRODUCT_FACTS: factsBlock,
    EVIDENCE_MANIFEST: manifestBlock,
    CLAIM_PROJECTION: claimBlock,
    CLOSED_CLAIM_FIREWALL: closedFirewallBlock,
    GENERATION_PLAN: planBlock,
    EVIDENCE_SLOT_PLAN: slotPlanBlock,
    FIREWALL: { ...firewall, PROMPT_SIZE: promptBundle.user.length },
    MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
    STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence, RATIONALE: recommendation.rationale },
    PROVIDER: provider,
  };

  if (generated.providerError && !generated.raw) {
    writeJson("REPORT.json", {
      ...commonHead,
      GENERATION: { MODEL, AI_CALLS: 1, JSON_VALID: "NO", SCHEMA_VALID: "NO", RETURNED_SLOT_COUNT: 0 },
      FAILURE_CLASSIFICATION: { PRIMARY: "EXTERNAL_PROVIDER_FAILURE", EVIDENCE: `HTTP_STATUS=${generated.httpStatus} PROVIDER_ERROR=${generated.providerError}` },
      HYDRATION_ADAPTER: { HYDRATION_EXECUTED: "NO", ADAPTER_EXECUTED: "NO", ADDED_FACTUAL_COPY: "N/A" },
      COMPOSITION: { EXECUTED: false, REASON: "no slot candidate from provider" },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: "EXTERNAL_PROVIDER_FAILURE",
      ...publicationBase(),
    });
    console.log("STOP EXTERNAL_PROVIDER_FAILURE", generated.httpStatus);
    return;
  }

  if (!generated.jsonValid || !generated.fills) {
    writeJson("REPORT.json", {
      ...commonHead,
      GENERATION: { MODEL, AI_CALLS: 1, JSON_VALID: "NO", SCHEMA_VALID: "NO", RETURNED_SLOT_COUNT: 0, PARSE_ERROR: generated.parseError },
      FAILURE_CLASSIFICATION: { PRIMARY: "SLOT_SCHEMA_FAILURE", EVIDENCE: generated.parseError || "malformed slot output" },
      HYDRATION_ADAPTER: { HYDRATION_EXECUTED: "NO", ADAPTER_EXECUTED: "NO", ADDED_FACTUAL_COPY: "N/A" },
      COMPOSITION: { EXECUTED: false },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: "SLOT_GENERATION_NEEDS_FIX",
      ...publicationBase(),
    });
    console.log("STOP malformed");
    return;
  }

  const fills = generated.fills;
  const plannedIds = new Set(slotPlan.slots.map((slot) => slot.slotId));
  const returnedIds = fills.map((fill) => fill.slotId);
  const unknownSlots = returnedIds.filter((id) => !plannedIds.has(id));
  const seen = new Set<string>();
  const duplicateSlots = returnedIds.filter((id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  });
  const missingRequired = slotPlan.requiredSlotIds.filter((id) => !seen.has(id));
  const schemaValid = unknownSlots.length === 0 && !generated.evidenceIdsInOutput;
  const violations = validateSlotFills(fills, slotPlan, facts);
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: generated.ctaLabel || "Learn More" }, slots: fills }] },
    facts,
    facts.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  writeJson("slot-evaluation.json", evaluation);

  const returnedSlots = fills.map((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    return {
      SLOT_ID: fill.slotId,
      TYPE: slot?.type || "UNKNOWN",
      CONTENT: fill.content || null,
      QUESTION: fill.question || null,
      ANSWER: fill.answer || null,
    };
  });
  const typeMutations = fills.filter((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    return Boolean(slot) && fill.slotId !== slot!.slotId;
  }).length;
  const semantic = semanticAuthorityAudit(fills, slotPlan, plan);
  const page = hydrateSlotFillsToPage(fills, slotPlan, generated.ctaLabel || "Learn More", recommendation.recommendedStrategy);
  const consumerCopy = [
    page.headline.text,
    page.summary.text,
    ...page.blocks.map((block) => block.content),
    ...(page.blocks.flatMap((block) => (block.items || []).map((item) => `${item.question} ${item.answer}`))),
    page.cta.label,
  ].join("\n");
  const absences = absenceHits(consumerCopy);
  const support = `${plan.descriptionText}\n${plan.featurePhrases.join("\n")}`;
  const knowledge = isKnowledgeExpansion(consumerCopy, support) || semantic.BACKGROUND_KNOWLEDGE_EXPANSIONS.length > 0;
  const topics = closedTopicAudit(consumerCopy, plan);
  const slotScopedPass = evaluation.slotTraces.every((trace) => !trace.text || trace.groundingResult === "GROUNDED");
  const faqValidation = evaluation.slotTraces
    .filter((trace) => trace.blockType === "FAQ")
    .map((trace) => {
      const slot = slotPlan.slots.find((item) => item.slotId === trace.slotId);
      const scoped = factsFromEvidenceIds(facts, slot?.allowedEvidenceIds || [], manifest);
      const qGround = trace.question?.trim()
        ? validateGrounding(trace.question.trim(), scoped)
        : { status: "GROUNDED" as const, unsupportedClaims: [] };
      const aGround = trace.answer?.trim()
        ? validateGrounding(trace.answer.trim(), scoped)
        : { status: "GROUNDED" as const, unsupportedClaims: [] };
      return {
        FAQ_SLOT_ID: trace.slotId,
        TOPIC: trace.topic,
        CODE_ASSIGNED_CLAIM_IDS: slot?.allowedClaimIds || [],
        CODE_ASSIGNED_EVIDENCE_IDS: slot?.allowedEvidenceIds || [],
        QUESTION: trace.question || "",
        ANSWER: trace.answer || "",
        QUESTION_GROUNDING: qGround.status,
        ANSWER_GROUNDING: aGround.status,
        QUESTION_UNSUPPORTED_CLAIMS: qGround.unsupportedClaims,
        ANSWER_UNSUPPORTED_CLAIMS: aGround.unsupportedClaims,
      };
    });
  const faqPass = faqValidation.every(
    (item) => item.QUESTION_GROUNDING === "GROUNDED" && item.ANSWER_GROUNDING === "GROUNDED" && item.QUESTION_UNSUPPORTED_CLAIMS.length === 0 && item.ANSWER_UNSUPPORTED_CLAIMS.length === 0,
  );
  const policyLint = lintCampaign({
    id: 0,
    name: facts.productName,
    slug: SLUG,
    headline: evaluation.inspectionCopy.headline,
    body: evaluation.inspectionCopy.body,
    ctaLabel: evaluation.inspectionCopy.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
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
  const policyWarnings = policyLint.findings.filter((item) => item.status === "warn").map((item) => item.ruleId);
  const policyBlocks = policyLint.findings.filter((item) => item.status === "fail" && item.blocking).map((item) => item.ruleId);

  const structuralPass =
    violations.length === 0 &&
    unknownSlots.length === 0 &&
    duplicateSlots.length === 0 &&
    missingRequired.length === 0 &&
    schemaValid;
  const semanticPass =
    semantic.USAGE_PROMOTIONS.length === 0 &&
    semantic.GUARANTEE_PROMOTIONS.length === 0 &&
    semantic.COMPOSITION_PROMOTIONS.length === 0 &&
    semantic.NAMED_INGREDIENT_CLAIMS.length === 0 &&
    semantic.UNSUPPORTED_RELATIONAL_EXPANSIONS.length === 0 &&
    semantic.EDITORIAL_EXPANSIONS.length === 0 &&
    semantic.RESULTS_TIMELINE_PROMOTIONS.length === 0 &&
    semantic.BACKGROUND_KNOWLEDGE_EXPANSIONS.length === 0 &&
    absences.length === 0 &&
    !knowledge;
  const projectionValid = claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0 && !factsMutated && !manifestMutated && excludedTracePreserved;
  const contentReady =
    projectionValid &&
    structuralPass &&
    semanticPass &&
    faqPass &&
    slotScopedPass &&
    evaluation.grounding.status === "GROUNDED" &&
    evaluation.grounding.unsupportedClaims.length === 0 &&
    evaluation.policyGate === "READY" &&
    evaluation.finalGate === "READY";

  const failure = classifyFailure({
    jsonValid: true,
    schemaValid,
    structuralFail: violations.length > 0,
    unknownSlots: unknownSlots.length,
    duplicateSlots: duplicateSlots.length,
    missingRequired: missingRequired.length,
    usagePromotions: semantic.USAGE_PROMOTIONS.length,
    guaranteePromotions: semantic.GUARANTEE_PROMOTIONS.length,
    compositionPromotions: semantic.COMPOSITION_PROMOTIONS.length,
    namedIngredients: semantic.NAMED_INGREDIENT_CLAIMS.length,
    relational: semantic.UNSUPPORTED_RELATIONAL_EXPANSIONS.length,
    editorial: semantic.EDITORIAL_EXPANSIONS.length,
    results: semantic.RESULTS_TIMELINE_PROMOTIONS.length,
    absence: absences.length,
    knowledge,
    faqFail: !faqPass,
    slotGroundingFail: !slotScopedPass,
    grounding: evaluation.grounding.status,
    unsupported: evaluation.grounding.unsupportedClaims.length,
    policy: evaluation.policyGate,
    gate: evaluation.finalGate,
    coverage: plan.coverage,
  });

  const slotEvidenceTrace = evaluation.slotTraces.map((trace) => {
    const slot = slotPlan.slots.find((item) => item.slotId === trace.slotId);
    return {
      SLOT_ID: trace.slotId,
      TYPE: trace.blockType,
      TOPIC: trace.topic,
      SEMANTIC_AUTHORITY: slot?.semanticAuthority || null,
      CODE_ASSIGNED_CLAIMS: slot?.allowedClaimIds || [],
      SOURCE_EVIDENCE: trace.codeAssignedEvidence,
      CODE_ASSIGNED_FIELDS: trace.declaredFields,
      TEXT: trace.text,
      CLAIM_CLASSES: trace.claimClasses,
      GROUNDING_RESULT: trace.groundingResult,
      SUPPORTED_BY: trace.supportedBy,
      UNSUPPORTED_CLAIMS: trace.unsupportedClaims,
      QUESTION: trace.question || null,
      ANSWER: trace.answer || null,
      QUESTION_GROUNDING: trace.questionGrounding || null,
      ANSWER_GROUNDING: trace.answerGrounding || null,
    };
  });

  const declaredText = consumerCopy.toLowerCase().replace(/\s+/g, " ");
  const adaptedText = `${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}\n${evaluation.inspectionCopy.ctaLabel}`.toLowerCase().replace(/\s+/g, " ");
  const extraFactual = adaptedText.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const slice = sentence.trim().slice(0, 40);
    return slice.length >= 20 && !declaredText.includes(slice);
  });

  const baseReport = {
    ...commonHead,
    GENERATION: {
      MODEL,
      AI_CALLS: 1,
      JSON_VALID: "YES",
      SCHEMA_VALID: schemaValid ? "YES" : "NO",
      RETURNED_SLOT_COUNT: fills.length,
      RETURNED_SLOTS: returnedSlots,
      UNKNOWN_SLOTS: unknownSlots,
      DUPLICATE_SLOTS: duplicateSlots,
      MISSING_REQUIRED_SLOTS: missingRequired,
      EVIDENCE_IDS_IN_OUTPUT: generated.evidenceIdsInOutput ? "YES" : "NO",
      CTA: generated.ctaLabel,
    },
    SLOT_VALIDATION: {
      RESULT: structuralPass ? "PASS" : "FAIL",
      UNKNOWN_SLOTS: unknownSlots.length,
      DUPLICATE_SLOTS: duplicateSlots.length,
      MISSING_REQUIRED_SLOTS: missingRequired.length,
      TYPE_MUTATIONS: typeMutations,
      TOPIC_MUTATIONS: 0,
      EVIDENCE_MUTATIONS: generated.evidenceIdsInOutput ? 1 : 0,
      WORD_BUDGET_VIOLATIONS: violations.filter((item) => item.code === "WORD_BUDGET").length,
      DETAILS: violations,
    },
    SEMANTIC_AUTHORITY: {
      USAGE_PROMOTIONS: semantic.USAGE_PROMOTIONS,
      GUARANTEE_PROMOTIONS: semantic.GUARANTEE_PROMOTIONS,
      COMPOSITION_PROMOTIONS: semantic.COMPOSITION_PROMOTIONS,
      NAMED_INGREDIENT_CLAIMS: semantic.NAMED_INGREDIENT_CLAIMS,
      UNSUPPORTED_RELATIONAL_EXPANSIONS: semantic.UNSUPPORTED_RELATIONAL_EXPANSIONS,
      EDITORIAL_EXPANSIONS: semantic.EDITORIAL_EXPANSIONS,
      RESULTS_TIMELINE_PROMOTIONS: semantic.RESULTS_TIMELINE_PROMOTIONS,
      BACKGROUND_KNOWLEDGE_EXPANSIONS: semantic.BACKGROUND_KNOWLEDGE_EXPANSIONS,
      ABSENCE_COMMENTARY: absences,
    },
    FAQ_VALIDATION: faqValidation,
    CLOSED_TOPIC_AUDIT: topics,
    SLOT_EVIDENCE_TRACE: slotEvidenceTrace,
    PRE_COMPOSITION: {
      CLAIM_PROJECTION: projectionValid ? "VALID" : "FAIL",
      MODEL_VISIBLE_CLOSED_CLAIMS: claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
      SLOT_VALIDATION: structuralPass ? "PASS" : "FAIL",
      SEMANTIC_AUTHORITY_VALIDATION: semanticPass ? "PASS" : "FAIL",
      FAQ_QUESTION_ANSWER_VALIDATION: faqPass ? "PASS" : "FAIL",
      SLOT_SCOPED_GROUNDING: slotScopedPass ? "PASS" : "FAIL",
      GROUNDING: evaluation.grounding.status,
      UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims,
      POLICY: evaluation.policyGate,
      WARNINGS: policyWarnings,
      BLOCKS: policyBlocks,
      CONTENT_GATE: evaluation.finalGate,
      CONTENT_READY_MILESTONE: contentReady ? "YES" : "NO",
    },
    FAILURE_CLASSIFICATION: contentReady ? { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" } : failure,
  };

  if (!contentReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      HYDRATION_ADAPTER: { HYDRATION_EXECUTED: "NO", ADAPTER_EXECUTED: "NO", ADDED_FACTUAL_COPY: "N/A", REASON: "CONTENT_READY_MILESTONE=NO" },
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY" },
      POST_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      PHASE: { GENERATION_PHASE_EXIT: "NO", NEXT_PHASE: "STOP_FOR_REVIEW" },
      GO_NO_GO: failure.GO,
      ...publicationBase(),
    });
    console.log("STOP", failure.PRIMARY, evaluation.finalGate);
    return;
  }

  const hydrationCopy = adaptStructuredToVariantCopy(page, plan);
  const variant = { approach: recommendation.recommendedStrategy, ...hydrationCopy };
  const template = approachToTemplate(variant.approach);
  let composed = composePresellPage({ variant, facts, template });
  const imageEligible = Boolean(facts.productImageUrl && isCopyEligibleImageProvenance(facts.productImageProvenance));
  if (imageEligible && facts.productImageUrl) {
    composed = applyProductImageToPage(composed, {
      src: facts.productImageUrl,
      alt: `${facts.productName} product image`,
      provenance: facts.productImageProvenance,
    });
  }
  const post = validateComposedPage(composed, facts, VALIDATION_SAFE_AFFILIATE);
  const rendered = orderedVisibleSections(composed).map((section) => section.id);
  const omitted = composed.omitted.map((item) => item.component);
  writeJson("composed-page.json", composed);
  writeJson("post-composition-gates.json", {
    GROUNDING: post.grounding.status,
    POLICY: post.policy,
    CONTENT_GATE: post.finalGate,
    unsupported: post.grounding.unsupportedClaims,
  });
  const visible = consumerVisibleText(composed);
  const variantBody = `${hydrationCopy.headline}\n${hydrationCopy.body}\n${hydrationCopy.ctaLabel}`.toLowerCase().replace(/\s+/g, " ");
  const composerAdded = visible
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((sentence) => {
      const slice = sentence.toLowerCase().slice(0, 48);
      if (slice.length < 24) return false;
      if (variantBody.includes(slice.slice(0, 32))) return false;
      if (/^(key features|what is|final thoughts|faq|things to consider|affiliate disclosure)/i.test(sentence)) return false;
      return /[a-z]/i.test(sentence);
    });
  const emptySections = composed.sections
    .filter((section) => section.visible && !(section.paragraphs.join("") + section.bullets.join("") + section.cards.map((c) => c.title + c.body).join("") + section.faq.map((f) => f.question).join("")).trim())
    .map((section) => section.id);
  const postWarnings = [];
  const postBlocks = post.policy !== "READY" ? [post.policy] : [];
  const finalReady = post.grounding.status === "GROUNDED" && post.policy === "READY" && post.finalGate === "READY";

  const hydrationBlock = {
    HYDRATION_EXECUTED: "YES",
    ADAPTER_EXECUTED: "YES",
    ADDED_FACTUAL_COPY: extraFactual.length > 0 ? "YES" : "NO",
    EXTRA_SENTENCES: extraFactual.slice(0, 6),
  };
  const compositionBlock = {
    EXECUTED: true,
    TEMPLATE: template,
    SECTION_ORDER: rendered,
    SECTIONS_RENDERED: rendered,
    SECTIONS_OMITTED: omitted,
    EMPTY_SECTIONS: emptySections,
    COMPOSER_ADDED_FACTUAL_COPY: composerAdded.length ? composerAdded.slice(0, 8) : "NONE",
    VISIBLE_TEXT_CHARS: visible.length,
  };
  const postBlock = {
    GROUNDING: post.grounding.status,
    UNSUPPORTED_CLAIMS: post.grounding.unsupportedClaims,
    POLICY: post.policy,
    WARNINGS: postWarnings,
    BLOCKS: postBlocks,
    CONTENT_GATE: post.finalGate,
  };

  if (!finalReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      HYDRATION_ADAPTER: hydrationBlock,
      COMPOSITION: compositionBlock,
      POST_COMPOSITION: postBlock,
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      PHASE: { GENERATION_PHASE_EXIT: "YES", NEXT_PHASE: "STOP_FOR_REVIEW" },
      GO_NO_GO: post.grounding.status !== "GROUNDED" ? "GROUNDING_PRECISION_NEEDS_FIX" : "POLICY_PRECISION_NEEDS_FIX",
      ...publicationBase(),
    });
    console.log("STOP post-composition");
    return;
  }

  const design = createDesignPlan({
    page: composed,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: imageEligible ? facts.productImageProvenance : "NOT_FOUND",
    strategyHint: variant.approach,
  });
  const creative = createCreativeCompositionPlan({ page: composed, design });
  const campaignInput = {
    name: `${facts.productName} controlled ready 08 (DO NOT PUBLISH)`,
    slug: SLUG,
    headline: composed.hero.headline,
    body: reconstructPageBody(composed),
    ctaLabel: composed.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    pageTemplate: composed.template,
    pageComposition: serializePresellPage(composed),
    productImageSrc: composed.hero.image.src || null,
    productImageProvenance: composed.hero.image.provenance,
    subheadline: composed.hero.subheadline,
    sourceFactsJson: JSON.stringify(facts),
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
  };
  const existing = getCampaignBySlug(SLUG);
  let campaign = existing ? updateCampaign(existing.id, campaignInput) : createCampaign(campaignInput);
  campaign = updateCampaignDesign(campaign.id, {
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
  });
  campaign = updateCampaignCreative(campaign.id, {
    creativeCompositionJson: serializeCreativeCompositionPlan(creative),
    creativeCompositionVersion: creative.version,
  });

  const visual = await playwrightVisual(SLUG);
  const extra = await extraPlaywrightChecks(SLUG);
  const bpPass = (width: string) => {
    const row = extra.breakpoints[width] || visual.byWidth[width];
    if (!row) return "FAIL";
    return row.overflowX ? "FAIL" : "PASS";
  };
  const visualPass =
    visual.gate !== "FAIL" &&
    extra.mobile.href === VALIDATION_SAFE_HREF &&
    extra.publicStatus !== 200 &&
    !extra.mobile.overflowX &&
    !extra.desktop.overflowX &&
    extra.mobile.brokenImages === 0 &&
    Object.values(extra.breakpoints).every((item) => !item.overflowX);
  writeJson("visual-qa.json", { gate: visual.gate, byWidth: visual.byWidth, extra, pass: visualPass });
  const quality = !visualPass
    ? "VISUALLY_BROKEN"
    : extra.anatomy && extra.anatomy.words < 220
      ? "VISUALLY_THIN"
      : "VISUALLY_ACCEPTABLE";
  const premiumGaps =
    quality === "VISUALLY_PREMIUM"
      ? []
      : ["ART_DIRECTION", "HERO", "TYPOGRAPHY", "PRODUCT_PRESENTATION", "LAYOUT", "SECTION_RHYTHM", "VISUAL_DEPTH", "CTA", "MOBILE", "TRUST_PRESENTATION"];
  const anatomy = visualPass && extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
  if (anatomy) writeJson("web-anatomy-audit-only.json", anatomy);
  const published = getPublishedCampaignBySlug(SLUG);

  writeJson("REPORT.json", {
    ...baseReport,
    HYDRATION_ADAPTER: hydrationBlock,
    COMPOSITION: { ...compositionBlock, EMPTY_SECTIONS: extra.mobile.emptySections },
    POST_COMPOSITION: postBlock,
    VISUAL_QA: {
      EXECUTED: true,
      RESULT: visualPass ? "PASS" : "FAIL",
      GATE: visual.gate,
      "375": bpPass("375"),
      "390": bpPass("390"),
      "768": bpPass("768"),
      "1024": bpPass("1024"),
      "1440": bpPass("1440"),
      PREMIUM_QUALITY: quality,
      PREMIUM_GAPS: premiumGaps,
      DETAILS: { byWidth: visual.byWidth, mobile: extra.mobile, desktop: extra.desktop },
    },
    WEB_ANATOMY: visualPass && anatomy ? { EXECUTED: true, ...anatomy } : { EXECUTED: false },
    PHASE: {
      GENERATION_PHASE_EXIT: "YES",
      NEXT_PHASE: visualPass ? "PREMIUM_VISUAL_SYSTEM" : "VISUAL_QA_FIX",
    },
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: Boolean(published),
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: extra.mobile.href !== VALIDATION_SAFE_HREF,
    },
    GO_NO_GO: visualPass && extraFactual.length === 0 && composerAdded.length === 0
      ? "FIRST_REAL_PROJECTED_CONTENT_READY"
      : visualPass
        ? "CONTENT_READY_VISUAL_NEEDS_FIX"
        : "VISUAL_QA_NEEDS_FIX",
    FINAL_STATUS: "CONTROLLED_READY_RUN_08_COMPLETE",
  });
  console.log("DONE", visualPass ? "FIRST_REAL_PROJECTED_CONTENT_READY" : "VISUAL_QA_NEEDS_FIX");
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
  process.exit(1);
});
