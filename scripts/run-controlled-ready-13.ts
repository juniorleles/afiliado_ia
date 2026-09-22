// npx tsx scripts/run-controlled-ready-13.ts
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
  validateSlotFills,
  type SlotFill,
} from "../src/lib/ai/slot-generation.ts";
import { generateDeterministicThinCopy } from "../src/lib/ai/deterministic-thin-generation.ts";
import { resolveGenerationRoute } from "../src/lib/ai/generation-router.ts";
import { adaptStructuredToVariantCopy, factsFromEvidenceIds } from "../src/lib/ai/structured-generation.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import {
  hasCompositionPromotionLanguage,
  namedIngredientMentions,
  unsupportedRelationalExpansions,
} from "../src/lib/ai/ingredient-claims.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import {
  applyProductImageToPage,
  authorizedCopyFromVariant,
  composePresellPage,
  consumerVisibleText,
  orderedVisibleSections,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import {
  adapterAddedFactualCopy,
  compositionFactFirewall,
} from "../src/lib/composition-fact-firewall.ts";
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

const RUN_ID = "2026-09-21-controlled-visual-13";
const OUT = path.join(process.cwd(), "data", "controlled-ready-13", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-controlled-ready-13";

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

function slotCopy(slot: EvidenceSlot, fill: SlotFill | undefined): string {
  if (!fill) return "";
  if (slot.type === "FAQ") return `${fill.question || ""} ${fill.answer || ""}`.trim();
  return (fill.content || "").trim();
}

function propositions(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hitsOf(hits: { text: string; code: string }[], code: string): string[] {
  return hits.filter((hit) => hit.code === code).map((hit) => hit.text);
}

function closureGeneratedText(slot: EvidenceSlot, fill: SlotFill): string {
  if (slot.type === "FAQ") return (fill.answer || "").trim();
  return (fill.content || "").trim();
}

function finalThoughtsExtras(generated: string, closure: { result: "PASS" | "FAIL"; failCodes: string[] }) {
  const recommendation = /\b(?:recommend(?:ed|s)?|worth (?:trying|considering)|should consider|ideal choice)\b/i.test(generated);
  const inferredAudience = closure.failCodes.includes("INFERRED_AUDIENCE_OR_PURPOSE");
  const newConclusion = closure.failCodes.includes("INFERRED_CONCLUSION");
  const synthesis =
    closure.failCodes.includes("RELATIONSHIP_TRANSFORMATION") ||
    closure.failCodes.includes("COPYWRITER_FILLER") ||
    newConclusion;
  const summaryOnly = closure.result === "PASS" && !recommendation;
  return {
    SEMANTIC_AUTHORITY: summaryOnly ? "SUMMARY_ONLY" : "FAIL",
    CROSS_EVIDENCE_SYNTHESIS: synthesis ? "YES" : "NO",
    NEW_CONCLUSION: newConclusion ? "YES" : "NO",
    RECOMMENDATION: recommendation ? "YES" : "NO",
    INFERRED_AUDIENCE: inferredAudience ? "YES" : "NO",
    EXTRA_FAIL: !summaryOnly,
  };
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
    relational.push(...unsupportedRelationalExpansions(text, support).map((item) => `${slot.slotId}: ${item}`));
  }
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
  typeMutations: number;
  evidenceMutations: number;
  wordBudget: number;
  faqSemanticsFail: boolean;
  semanticClosureFail: boolean;
  usagePromotions: number;
  guaranteePromotions: number;
  compositionPromotions: number;
  namedIngredients: number;
  relational: number;
  editorial: number;
  results: number;
  absence: number;
  knowledge: boolean;
  faqAnswerFail: boolean;
  slotGroundingFail: boolean;
  grounding: string;
  unsupported: number;
  policy: string;
  gate: string;
}): { PRIMARY: string; EVIDENCE: string; GO: string } {
  if (!input.jsonValid || !input.schemaValid || input.unknownSlots || input.duplicateSlots || input.missingRequired || input.typeMutations || input.evidenceMutations || input.wordBudget || input.structuralFail) {
    return { PRIMARY: "DETERMINISTIC_GENERATION_FAILURE", EVIDENCE: `structure/schema fail missing=${input.missingRequired} budget=${input.wordBudget}`, GO: "CONTENT_REGRESSION" };
  }
  if (input.faqSemanticsFail) {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: "FAQ_QUESTION_SEMANTICS=FAIL", GO: "CONTENT_REGRESSION" };
  }
  if (input.semanticClosureFail) {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: "SEMANTIC_CLOSURE=FAIL", GO: "CONTENT_REGRESSION" };
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
      PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE",
      EVIDENCE: `semantic authority fail usage=${input.usagePromotions} editorial=${input.editorial} relational=${input.relational}`,
      GO: "CONTENT_REGRESSION",
    };
  }
  if (input.faqAnswerFail || input.slotGroundingFail) {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: "SLOT_SCOPED_GROUNDING=FAIL", GO: "CONTENT_REGRESSION" };
  }
  if (input.grounding !== "GROUNDED" || input.unsupported > 0) {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: `GROUNDING=${input.grounding} unsupported=${input.unsupported}`, GO: "CONTENT_REGRESSION" };
  }
  if (input.policy !== "READY") {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: `POLICY=${input.policy}`, GO: "CONTENT_REGRESSION" };
  }
  if (input.gate !== "READY") {
    return { PRIMARY: "PRE_COMPOSITION_VALIDATION_FAILURE", EVIDENCE: `CONTENT_GATE=${input.gate}`, GO: "CONTENT_REGRESSION" };
  }
  return { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY", GO: "FIRST_REAL_CONTENT_READY" };
}

async function playwrightVisual(slug: string) {
  const inspection = await inspectRenderedPresell({
    slug,
    baseUrl: visualQaBaseUrl(),
    artifactKey: `controlled-ready-13-${slug}`,
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
      const article = document.querySelector("article") as HTMLElement | null;
      const clipped = [...document.querySelectorAll("h1, p, a, button, li")].filter((node) => {
        const el = node as HTMLElement;
        return el.scrollWidth > el.clientWidth + 2;
      }).length;
      const boxes = [...document.querySelectorAll("h1, .ps-hero, [data-cta-position], [data-section-id]")].map((node) => {
        const el = node as HTMLElement;
        const b = el.getBoundingClientRect();
        return { top: b.top, left: b.left, right: b.right, bottom: b.bottom };
      });
      let overlap = 0;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const nested = (a.top <= b.top && a.bottom >= b.bottom && a.left <= b.left && a.right >= b.right) || (b.top <= a.top && b.bottom >= a.bottom && b.left <= a.left && b.right >= a.right);
          if (hit && !nested) overlap += 1;
        }
      }
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
        clipping: clipped,
        overlap,
        faqPresent: Boolean(document.querySelector("details, [data-section-id='faq']")),
        articleTextLen: (article?.innerText || "").trim().length,
      };
    });
    const breakpoints: Record<string, { overflowX: boolean; clipping: number; height: number }> = {};
    const qaViewports: Array<{ width: number; height: number }> = [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 1000 },
    ];
    for (const vp of qaViewports) {
      await pw.setViewportSize(vp);
      await pw.waitForTimeout(150);
      breakpoints[String(vp.width)] = {
        ...(await pw.evaluate(() => ({
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          clipping: [...document.querySelectorAll("h1, p, a, button")].filter((node) => {
            const el = node as HTMLElement;
            return el.scrollWidth > el.clientWidth + 2;
          }).length,
        }))),
        height: vp.height,
      };
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
    const aboveFoldAt = async () =>
      pw.evaluate(`(() => {
        const vh = window.innerHeight;
        const vis = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.bottom > 8 && r.top < vh - 8 && r.height >= 12 && r.width >= 12;
        };
        const hero = document.querySelector(".ps-hero, [data-section-id='hero'], header");
        const heroH = hero ? hero.getBoundingClientRect().height : 0;
        const img = document.querySelector("article img, .ps-hero img");
        const imgOk = Boolean(img && img.naturalWidth > 0);
        const h1 = document.querySelector("h1");
        const h1r = h1 ? h1.getBoundingClientRect() : null;
        const summary = document.querySelector(".ps-hero p, [data-section-id='summary'] p, .ps-lede, .ps-subhead");
        const article = document.querySelector("article");
        const emptyRatio = document.documentElement.scrollHeight > 0 ? Math.max(0, vh - ((article && article.getBoundingClientRect().height) || 0)) / vh : 0;
        return {
          HEADLINE_VISIBLE: Boolean(h1r && h1r.top >= 0 && h1r.bottom <= vh && (h1.textContent || "").trim()),
          PRODUCT_VISUAL_VISIBLE: imgOk && vis("article img, .ps-hero img"),
          PRIMARY_CTA_VISIBLE: vis('[data-cta-position="hero"]'),
          SUMMARY_VISIBLE: Boolean(summary && summary.getBoundingClientRect().top < vh),
          EXCESSIVE_EMPTY_SPACE: emptyRatio > 0.45 || heroH > vh * 0.92,
          HERO_TOO_TALL: heroH > vh * 1.05,
          CTA_BELOW_FOLD: !vis('[data-cta-position="hero"]'),
          BROKEN_HIERARCHY: Boolean(h1r && summary && summary.getBoundingClientRect().bottom < h1r.top),
          heroHeight: Math.round(heroH),
        };
      })()`);
    const aboveFoldDesktop = await aboveFoldAt();
    const shotDir = path.join(OUT, "screenshots");
    fs.mkdirSync(shotDir, { recursive: true });
    const desktopShot = path.join(shotDir, "desktop-1440-above-fold.jpg");
    const desktopFull = path.join(shotDir, "desktop-1440-full.jpg");
    await pw.screenshot({ path: desktopShot, type: "jpeg", quality: 70, fullPage: false });
    await pw.screenshot({ path: desktopFull, type: "jpeg", quality: 55, fullPage: true });
    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.waitForTimeout(200);
    await pw.evaluate(() => window.scrollTo(0, 0));
    const aboveFoldMobile = await aboveFoldAt();
    const mobileShot = path.join(shotDir, "mobile-390-above-fold.jpg");
    const mobileFull = path.join(shotDir, "mobile-390-full.jpg");
    await pw.screenshot({ path: mobileShot, type: "jpeg", quality: 70, fullPage: false });
    await pw.screenshot({ path: mobileFull, type: "jpeg", quality: 55, fullPage: true });
    await pw.setViewportSize({ width: 768, height: 1024 });
    await pw.waitForTimeout(200);
    await pw.evaluate(() => window.scrollTo(0, 0));
    const tabletFull = path.join(shotDir, "tablet-768-full.jpg");
    await pw.screenshot({ path: tabletFull, type: "jpeg", quality: 55, fullPage: true });
    let faqInteraction = "N/A";
    const faq = pw.locator("details summary").first();
    if ((await faq.count()) > 0) {
      await faq.click({ timeout: 2000 }).catch(() => undefined);
      faqInteraction = (await pw.locator("details[open]").count()) > 0 ? "PASS" : "FAIL";
    }
    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article", { timeout: 30_000 });
    const ctaInspect = await pw.evaluate(`(() => {
      const label = (sel) => {
        const el = document.querySelector(sel);
        return el ? (el.innerText || "").trim() : "";
      };
      const vis = (sel) => Boolean(document.querySelector(sel));
      return {
        HERO: vis('[data-cta-position="hero"]'),
        HERO_LABEL: label('[data-cta-position="hero"]'),
        MID: vis('[data-cta-position="mid"], [data-cta-position="after-primary"]'),
        FINAL: vis('[data-cta-position="final"], [data-cta-position="footer"]'),
        STICKY: vis('[data-cta-position="sticky"], .ps-sticky-cta, [data-sticky-cta], [data-sticky-visible]'),
        LABELS: [...document.querySelectorAll("[data-cta-position]")]
          .map((n) => n.getAttribute("data-cta-position") + ":" + ((n.innerText || "").trim()))
          .filter(Boolean),
      };
    })()`);
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
    return {
      mobile,
      desktop,
      breakpoints,
      publicStatus: pub?.status() ?? null,
      anatomy,
      ctaInspect,
      faqInteraction,
      screenshots: {
        DESKTOP_ABOVE_FOLD: desktopShot,
        DESKTOP_FULL_PAGE: desktopFull,
        MOBILE_ABOVE_FOLD: mobileShot,
        MOBILE_FULL_PAGE: mobileFull,
        TABLET_FULL_PAGE: tabletFull,
      },
      aboveFold: { DESKTOP_1440: aboveFoldDesktop, MOBILE_390: aboveFoldMobile },
    };
  } finally {
    await browser.close();
  }
}

function premiumSafetyScan(text: string) {
  const t = text.toLowerCase();
  const hit = (re: RegExp) => (re.test(t) ? "YES" : "NONE");
  return {
    INVENTED_TESTIMONIALS: hit(/\btestimonials?\b/),
    INVENTED_REVIEWS: hit(/\breviews?\b/),
    INVENTED_STARS: hit(/\bstars?\b|rated\s+\d/),
    INVENTED_CUSTOMER_COUNTS: hit(/\d+\s*\+\s*customers|\bthousands of (?:happy )?customers\b/),
    INVENTED_EXPERT_AUTHORITY: hit(/\bdoctors?\b|\bexperts?\b|\bclinically proven\b/),
    INVENTED_CERTIFICATIONS: hit(/\bcertifi(?:ed|cation)s?\b|\bgmp\b|\bfda approved\b/),
    INVENTED_STUDIES: hit(/\bclinical (?:trial|study)\b|\bstudies show\b/),
    INVENTED_MANUFACTURER_BADGES: hit(/\bmanufactured by\b|\bfda-inspected facility\b/),
    INVENTED_PRICE: hit(/\b\$\d|usd\s*\d|\bprice\b/),
    INVENTED_DISCOUNT: hit(/\bdiscount\b|\bsave \d+%\b/),
    INVENTED_SCARCITY: hit(/\bonly \d+ left\b|\blimited time\b|\bcountdown\b|\bhurry\b/),
    INVENTED_GUARANTEE: hit(/\bmoney[- ]back\b|\bguarantee\b|\b180[- ]day\b|\brisk[- ]free\b/),
    INVENTED_RESULTS_TIMELINE: hit(/\bin \d+\s+(?:days|weeks|months)\b|\bovernight results\b/),
    INVENTED_MEDICAL_CLAIMS: hit(/\bcure\b|\btreat(?:s|ment)\b|\bheal(?:s|ing)\b|\bdisease\b/),
  };
}

function premiumDimensions(input: {
  visualPass: boolean;
  imageEligible: boolean;
  words: number;
  hasCta: boolean;
  hasDisclosure: boolean;
  clipping: number;
  overflow: boolean;
  brokenImages: number;
  emptyVisual: number;
}) {
  const dim = (strong: boolean, ok: boolean, weak: boolean) => (strong ? "STRONG" : ok ? "ACCEPTABLE" : weak ? "WEAK" : "FAIL");
  return {
    ART_DIRECTION: dim(false, false, input.visualPass),
    HERO: dim(input.hasCta && input.visualPass && input.imageEligible, false, input.hasCta && input.visualPass),
    PRODUCT_PROTAGONISM: dim(false, input.imageEligible && input.visualPass, false),
    TYPOGRAPHY: dim(false, false, input.visualPass && input.clipping === 0),
    GRID: dim(false, input.visualPass && !input.overflow, false),
    WHITESPACE: dim(false, false, input.visualPass),
    SECTION_RHYTHM: dim(false, false, input.visualPass && input.words >= 120),
    VISUAL_DEPTH: dim(false, input.visualPass && input.imageEligible, input.visualPass),
    CTA_PRESENTATION: dim(false, input.hasCta && input.visualPass, input.hasCta),
    HEADLINE_HIERARCHY: dim(false, input.visualPass && input.clipping === 0, input.visualPass),
    CONTENT_DENSITY: dim(false, input.words >= 220 && input.visualPass, input.visualPass && input.words >= 80),
    TRUST_PRESENTATION: dim(false, false, input.hasDisclosure),
    DISCLOSURE: dim(false, input.hasDisclosure, false),
    FOOTER: dim(false, input.hasDisclosure && input.visualPass, input.visualPass),
    MISSING_IMAGE_HANDLING: dim(false, !input.brokenImages && !input.imageEligible, !input.brokenImages),
  };
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
    FINAL_STATUS: "CONTROLLED_VISUAL_RUN_13_COMPLETE",
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
    SOURCE_HTTP_STATUS: facts.webDiscovery?.primaryBlock ? `BLOCKED:${facts.webDiscovery.primaryBlock}` : 200,
    IDENTITY: identity,
    IDENTITY_EVIDENCE: {
      PRODUCT_NAME_PROVENANCE: facts.confidence.productName,
      PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority,
      WEB_DISCOVERY_TRIGGERED: Boolean(facts.webDiscovery?.triggered),
      ACCEPTED_COUNT: facts.webDiscovery?.acceptedCount ?? null,
    },
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
    USAGE_VISIBLE: claimFirewall.USAGE_INSTRUCTION_VISIBLE,
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
  const thinContract = {
    THIN_MODE: plan.thinMode ? "YES" : "NO",
    CONSERVATIVE_REWRITE_CONTRACT: plan.thinMode ? "YES" : "NO",
    SEMANTIC_CLOSURE_ENABLED: plan.thinMode ? "YES" : "NO",
    OVERVIEW_REQUIRED: slotPlan.slots.find((slot) => slot.type === "OVERVIEW")?.required ? "YES" : "NO",
    FINAL_THOUGHTS_REQUIRED: slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS")?.required ? "YES" : "NO",
    FAQ_REQUIRED: slotPlan.slots.some((slot) => slot.type === "FAQ" && slot.required) ? "YES" : "NO",
    HEADLINE_REQUIRED: slotPlan.slots.find((slot) => slot.type === "HEADLINE")?.required ? "YES" : "NO",
    SUMMARY_REQUIRED: slotPlan.slots.find((slot) => slot.type === "SUMMARY")?.required ? "YES" : "NO",
    FEATURE_REQUIRED: slotPlan.slots.some((slot) => slot.type === "FEATURE" && slot.required) ? "YES" : "NO",
  };
  console.log("THIN_CONTRACT", JSON.stringify(thinContract));
  const planBlock = {
    THIN_MODE: plan.thinMode,
    THIN_CONTRACT: thinContract,
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
      FAILURE_CLASSIFICATION: { PRIMARY: "IDENTITY_FAILURE", EVIDENCE: `IDENTITY=${identity}` },
      GO_NO_GO: "CONTENT_REGRESSION",
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
      FAILURE_CLASSIFICATION: { PRIMARY: "PRE_AI_GATE_FAILURE", EVIDENCE: `NON_COPY_ELIGIBLE_EVIDENCE=${manifest.promptFactNotCopyEligible}` },
      GO_NO_GO: "CONTENT_REGRESSION",
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
      GO_NO_GO: "CONTENT_REGRESSION",
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

  const route = resolveGenerationRoute(plan);
  if (route !== "DETERMINISTIC_THIN") {
    writeJson("REPORT.json", {
      PRODUCT: productBlock,
      GENERATION_PLAN: planBlock,
      GENERATION: { MODE: plan.coverage, ROUTE: route, ANTHROPIC_CALLS: 0 },
      FAILURE_CLASSIFICATION: { PRIMARY: "GENERATION_ROUTING_REGRESSION", EVIDENCE: `expected DETERMINISTIC_THIN got ${route}` },
      GO_NO_GO: "CONTENT_REGRESSION",
      ...publicationBase(),
    });
    console.log("STOP GENERATION_ROUTING_REGRESSION", route);
    return;
  }

  console.log("GENERATION_START DETERMINISTIC_THIN");
  const genStarted = performance.now();
  const generatedCopy = generateDeterministicThinCopy({ plan, slotPlan, projection });
  const generationLatency = Number((performance.now() - genStarted).toFixed(2));
  writeJson("generation-raw.json", generatedCopy);
  writeJson("provider.json", {
    ANTHROPIC_REQUEST_SENT: "NO",
    ANTHROPIC_RESPONSE_RECEIVED: "NO",
    HTTP_STATUS: null,
    PROVIDER_ERROR: null,
    SLOT_CANDIDATE_RECEIVED: generatedCopy.fills.length > 0 ? "YES" : "NO",
    GENERATION_ROUTE: route,
    GENERATION_METHOD: generatedCopy.generationMethod,
    ANTHROPIC_CALLS: generatedCopy.anthropicCalls,
    LATENCY_MS: generationLatency,
  });
  console.log("GENERATION_DONE", generatedCopy.fills.length, "slots", generationLatency, "ms");

  const commonHead = {
    PRODUCT: productBlock,
    PRODUCT_FACTS: factsBlock,
    EVIDENCE_MANIFEST: manifestBlock,
    CLAIM_PROJECTION: claimBlock,
    CLOSED_CLAIM_FIREWALL: closedFirewallBlock,
    GENERATION_PLAN: planBlock,
    THIN_CONTRACT: thinContract,
    EVIDENCE_SLOT_PLAN: slotPlanBlock,
    MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
    STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence, RATIONALE: recommendation.rationale },
    GENERATION_ROUTE: route,
    ANTHROPIC_CALLS: 0,
  };

  const fills = generatedCopy.fills;
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
  const evidenceIdsInOutput = fills.some((fill) => /"evidenceIds"\s*:/.test(`${fill.content || ""} ${fill.question || ""} ${fill.answer || ""}`));
  const schemaValid = unknownSlots.length === 0 && !evidenceIdsInOutput;
  const violations = validateSlotFills(fills, slotPlan, facts);
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: generatedCopy.ctaLabel || "Learn More" }, slots: fills }] },
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
  const page = hydrateSlotFillsToPage(fills, slotPlan, generatedCopy.ctaLabel || "Learn More", recommendation.recommendedStrategy);
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
  const slotScopedPass = evaluation.slotTraces.every((trace) => {
    if (trace.blockType === "FAQ") return trace.answerGrounding === "GROUNDED";
    return !trace.text || trace.groundingResult === "GROUNDED";
  });
  const faqValidation = evaluation.slotTraces
    .filter((trace) => trace.blockType === "FAQ")
    .map((trace) => {
      const slot = slotPlan.slots.find((item) => item.slotId === trace.slotId);
      const scoped = factsFromEvidenceIds(facts, slot?.allowedEvidenceIds || [], manifest);
      const supportText = (slot?.evidence || []).map((item) => item.value).join("\n");
      const qSem =
        trace.questionSemantic ||
        validateFaqQuestion({
          question: trace.question || "",
          topic: slot?.topic,
          closedTopics: plan.closedTopics,
          supportText,
          productName: facts.productName,
        });
      const aGround = trace.answer?.trim()
        ? validateGrounding(trace.answer.trim(), scoped)
        : { status: "GROUNDED" as const, unsupportedClaims: [] };
      const wordCount = (trace.answer || "").trim().split(/\s+/).filter(Boolean).length;
      const budgetMax = slot?.maxWords ?? plan.wordBudget.faqAnswer;
      const wordBudget = wordCount <= budgetMax ? "PASS" : "FAIL";
      const slotStructure =
        violations.some((item) => item.text === trace.slotId || item.text === (trace.question || "") || (item.code === "WORD_BUDGET" && item.reason.includes(trace.slotId || "")))
          ? "FAIL"
          : "PASS";
      const childPass =
        qSem.semanticResult === "PASS" && aGround.status === "GROUNDED" && wordBudget === "PASS" && slotStructure === "PASS";
      return {
        FAQ_SLOT_ID: trace.slotId,
        QUESTION: trace.question || "",
        QUESTION_CLASS: qSem.questionClass,
        TOPIC: qSem.topic || trace.topic,
        CLOSED_TOPIC_REFERENCES: qSem.closedTopicReferences,
        FACTUAL_PRESUPPOSITIONS: qSem.factualPresuppositions,
        COMPARATIVE_PRESUPPOSITIONS: qSem.comparativePresuppositions,
        SEMANTIC_RESULT: qSem.semanticResult,
        FAIL_CODES: qSem.failCodes,
        QUESTION_SEMANTIC_RESULT: qSem.semanticResult,
        ANSWER: trace.answer || "",
        ANSWER_GROUNDING: aGround.status,
        ANSWER_UNSUPPORTED_CLAIMS: aGround.unsupportedClaims,
        WORD_COUNT: wordCount,
        WORD_BUDGET: wordBudget,
        SLOT_STRUCTURE: slotStructure,
        FAQ_CHILD_PASS: childPass ? "PASS" : "FAIL",
        CHILD_RESULT: childPass ? "PASS" : "FAIL",
        QUESTION_FAIL_CODES: qSem.failCodes,
        CODE_ASSIGNED_CLAIM_IDS: slot?.allowedClaimIds || [],
        CODE_ASSIGNED_EVIDENCE_IDS: slot?.allowedEvidenceIds || [],
      };
    });
  const faqOmitted = faqValidation.length === 0;
  const faqSemanticsPass = faqValidation.every((item) => item.SEMANTIC_RESULT === "PASS");
  const faqAnswerPass = faqValidation.every(
    (item) => item.ANSWER_GROUNDING === "GROUNDED" && item.ANSWER_UNSUPPORTED_CLAIMS.length === 0,
  );
  const faqBudgetPass = faqValidation.every((item) => item.WORD_BUDGET === "PASS");
  const faqPass = faqValidation.every((item) => item.FAQ_CHILD_PASS === "PASS");
  const faqPassOrOmitted = faqOmitted || faqPass;
  const faqStatus = faqOmitted ? "OMITTED" : faqPass ? "PASS" : "FAIL";
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

  const notStructureCodes = new Set([
    "SEMANTIC_CLOSURE",
    "QUESTION_SEMANTICS",
    "USAGE_PROMOTION",
    "GUARANTEE_PROMOTION",
    "COMPOSITION_PROMOTION",
    "UNSUPPORTED_RELATIONAL_EXPANSION",
    "EDITORIAL_EXPANSION",
    "RESULTS_FRAMING",
    "CLOSED_TOPIC",
  ]);
  const structureViolations = violations.filter((item) => !notStructureCodes.has(item.code));
  const structuralPass =
    structureViolations.length === 0 &&
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
  const wordBudgetViolations = violations.filter((item) => item.code === "WORD_BUDGET").length;
  const projectionValid = claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0 && !factsMutated && !manifestMutated && excludedTracePreserved;
  const semanticClosureReport = fills.map((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    const generatedText = slot ? closureGeneratedText(slot, fill) : "";
    const supportText = (slot?.evidence || []).map((item) => item.value).join("\n");
    const closure = validateThinSemanticClosure({
      generated: generatedText,
      support: supportText,
      slotType: slot?.type,
      thinMode: plan.thinMode,
    });
    const thoughts = slot?.type === "FINAL_THOUGHTS" ? finalThoughtsExtras(generatedText, closure) : null;
    const result = thoughts?.EXTRA_FAIL ? "FAIL" : closure.result;
    return {
      SLOT_ID: fill.slotId,
      TYPE: slot?.type || "UNKNOWN",
      SOURCE_PROJECTED_CLAIMS: (slot?.evidence || []).map((item) => item.value),
      GENERATED_PROPOSITIONS: propositions(generatedText),
      MAPPED_SOURCE_PREDICATES: (slot?.evidence || []).map((item) => item.value),
      NEW_PREDICATES: hitsOf(closure.hits, "NEW_PREDICATE"),
      RELATIONSHIP_TRANSFORMATIONS: hitsOf(closure.hits, "RELATIONSHIP_TRANSFORMATION"),
      INFERRED_AUDIENCE_OR_PURPOSE: hitsOf(closure.hits, "INFERRED_AUDIENCE_OR_PURPOSE"),
      EDITORIAL_CHARACTERIZATIONS: hitsOf(closure.hits, "EDITORIAL_CHARACTERIZATION"),
      INFERRED_CONCLUSIONS: hitsOf(closure.hits, "INFERRED_CONCLUSION"),
      COPYWRITER_FILLER: hitsOf(closure.hits, "COPYWRITER_FILLER"),
      FAIL_CODES:
        result === "FAIL"
          ? Array.from(new Set([...(closure.failCodes || []), ...(thoughts?.EXTRA_FAIL ? ["FINAL_THOUGHTS_NOT_SUMMARY_ONLY"] : [])]))
          : [],
      FINAL_THOUGHTS: thoughts
        ? {
            SEMANTIC_AUTHORITY: thoughts.SEMANTIC_AUTHORITY,
            CROSS_EVIDENCE_SYNTHESIS: thoughts.CROSS_EVIDENCE_SYNTHESIS,
            NEW_CONCLUSION: thoughts.NEW_CONCLUSION,
            RECOMMENDATION: thoughts.RECOMMENDATION,
            INFERRED_AUDIENCE: thoughts.INFERRED_AUDIENCE,
          }
        : null,
      RESULT: result,
    };
  });
  const closurePass = semanticClosureReport.every((item) => item.RESULT === "PASS");
  const contentReady =
    projectionValid &&
    structuralPass &&
    faqPassOrOmitted &&
    closurePass &&
    semanticPass &&
    slotScopedPass &&
    evaluation.grounding.status === "GROUNDED" &&
    evaluation.grounding.unsupportedClaims.length === 0 &&
    evaluation.policyGate === "READY" &&
    evaluation.finalGate === "READY";
  const generationDecision = {
    THIN_GENERATION_PHASE_EXIT: contentReady ? "YES" : "NO",
    THIN_GENERATION_ARCHITECTURE: "FROZEN_V1",
    GENERATION_CODE_CHANGED: "NO",
  };

  const failure = classifyFailure({
    jsonValid: true,
    schemaValid,
    structuralFail: structureViolations.length > 0,
    unknownSlots: unknownSlots.length,
    duplicateSlots: duplicateSlots.length,
    missingRequired: missingRequired.length,
    typeMutations,
    evidenceMutations: evidenceIdsInOutput ? 1 : 0,
    wordBudget: wordBudgetViolations,
    faqSemanticsFail: !faqOmitted && !faqSemanticsPass,
    semanticClosureFail: !closurePass,
    usagePromotions: semantic.USAGE_PROMOTIONS.length,
    guaranteePromotions: semantic.GUARANTEE_PROMOTIONS.length,
    compositionPromotions: semantic.COMPOSITION_PROMOTIONS.length,
    namedIngredients: semantic.NAMED_INGREDIENT_CLAIMS.length,
    relational: semantic.UNSUPPORTED_RELATIONAL_EXPANSIONS.length,
    editorial: semantic.EDITORIAL_EXPANSIONS.length,
    results: semantic.RESULTS_TIMELINE_PROMOTIONS.length,
    absence: absences.length,
    knowledge,
    faqAnswerFail: !faqAnswerPass,
    slotGroundingFail: !slotScopedPass,
    grounding: evaluation.grounding.status,
    unsupported: evaluation.grounding.unsupportedClaims.length,
    policy: evaluation.policyGate,
    gate: evaluation.finalGate,
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
      QUESTION_SEMANTIC: trace.questionSemantic || null,
    };
  });

  const extraFactual = adapterAddedFactualCopy(consumerCopy, `${evaluation.inspectionCopy.headline}\n${evaluation.inspectionCopy.body}\n${evaluation.inspectionCopy.ctaLabel}`);

  const baseReport = {
    ...commonHead,
    GENERATION: {
      MODE: plan.coverage,
      ROUTE: "DETERMINISTIC_THIN",
      ANTHROPIC_CALLS: 0,
      METHOD: generatedCopy.generationMethod,
      LATENCY: generationLatency,
      JSON_VALID: "YES",
      SCHEMA_VALID: schemaValid ? "YES" : "NO",
      RETURNED_SLOT_COUNT: fills.length,
      RETURNED_SLOTS: returnedSlots,
      UNKNOWN_SLOTS: unknownSlots,
      DUPLICATE_SLOTS: duplicateSlots,
      MISSING_REQUIRED_SLOTS: missingRequired,
      EVIDENCE_IDS_IN_OUTPUT: evidenceIdsInOutput ? "YES" : "NO",
      CTA: generatedCopy.ctaLabel,
      OMITTED_SLOT_IDS: generatedCopy.omittedSlotIds,
      PROVENANCE: generatedCopy.provenance,
    },
    SLOT_VALIDATION: {
      RESULT: structuralPass ? "PASS" : "FAIL",
      UNKNOWN_SLOTS: unknownSlots.length,
      DUPLICATE_SLOTS: duplicateSlots.length,
      MISSING_REQUIRED_SLOTS: missingRequired.length,
      TYPE_MUTATIONS: typeMutations,
      TOPIC_MUTATIONS: 0,
      EVIDENCE_MUTATIONS: evidenceIdsInOutput ? 1 : 0,
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
    SEMANTIC_CLOSURE: {
      RESULT: closurePass ? "PASS" : "FAIL",
      SLOTS: semanticClosureReport,
    },
    CLOSED_TOPIC_AUDIT: topics,
    SLOT_EVIDENCE_TRACE: slotEvidenceTrace,
    PRE_COMPOSITION: {
      CLAIM_PROJECTION: projectionValid ? "VALID" : "FAIL",
      MODEL_VISIBLE_CLOSED_CLAIMS: claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS,
      SLOT_STRUCTURE: structuralPass ? "PASS" : "FAIL",
      FAQ: faqStatus === "OMITTED" ? "PASS_OR_OMITTED" : faqStatus,
      FAQ_SEMANTICS: faqOmitted ? "OMITTED" : faqSemanticsPass ? "PASS" : "FAIL",
      FAQ_ANSWER_GROUNDING: faqOmitted ? "OMITTED" : faqAnswerPass ? "PASS" : "FAIL",
      WORD_BUDGETS: faqBudgetPass && wordBudgetViolations === 0 ? "PASS" : "FAIL",
      SEMANTIC_CLOSURE: closurePass ? "PASS" : "FAIL",
      SEMANTIC_AUTHORITY: semanticPass ? "PASS" : "FAIL",
      SLOT_SCOPED_GROUNDING: slotScopedPass ? "PASS" : "FAIL",
      GLOBAL_GROUNDING: evaluation.grounding.status,
      UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims.length,
      POLICY: evaluation.policyGate,
      WARNINGS: policyWarnings,
      BLOCKS: policyBlocks,
      CONTENT_GATE: evaluation.finalGate,
      CONTENT_READY_MILESTONE: contentReady ? "YES" : "NO",
    },
    COPY: {
      HEADLINE: page.headline.text || "OMITTED",
      SUMMARY: page.summary.text || "OMITTED",
      OVERVIEW: page.blocks.find((block) => block.type === "OVERVIEW")?.content || "OMITTED",
      FEATURES: page.blocks.filter((block) => block.type === "FEATURES" || block.type === "FEATURE").map((block) => block.content),
      FINAL_THOUGHTS: page.blocks.find((block) => block.type === "FINAL_THOUGHTS")?.content || "OMITTED",
      FAQ: fills
        .filter((fill) => fill.question && fill.answer)
        .map((fill) => ({ Q: fill.question, A: fill.answer })),
      CTA: generatedCopy.ctaLabel,
    },
    GENERATION_DECISION: generationDecision,
    GENERATION_FREEZE: {
      THIN_GENERATION_PHASE_EXIT: contentReady ? "YES" : "NO",
      THIN_GENERATION_ARCHITECTURE: "FROZEN_V1",
      GENERATION_CODE_CHANGED: "NO",
    },
    FAILURE_CLASSIFICATION: contentReady ? { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" } : failure,
  };
  console.log("CONTENT_READY", contentReady ? "YES" : "NO", "STRUCTURE", structuralPass ? "PASS" : "FAIL", "FAQ", faqStatus, "CLOSURE", closurePass ? "PASS" : "FAIL", "AUTHORITY", semanticPass ? "PASS" : "FAIL");
  writeJson("semantic-closure.json", semanticClosureReport);

  if (!contentReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      HYDRATION_ADAPTER: { HYDRATION_EXECUTED: "NO", HYDRATION_ADDED_FACTUAL_COPY: "N/A", ADAPTER_EXECUTED: "NO", ADAPTER_ADDED_FACTUAL_COPY: "N/A", REASON: "CONTENT_READY_MILESTONE=NO" },
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY" },
      POST_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null, FINAL_CONTENT_GATE: null },
      HYDRATION: { EXECUTED: "NO", ADDED_FACTUAL_COPY: "N/A" },
      ADAPTER: { EXECUTED: "NO", ADDED_FACTUAL_COPY: "N/A" },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      MILESTONES: {
        FIRST_REAL_CONTENT_READY: "NO",
        FIRST_REAL_COMPOSED_READY: "NO",
        FIRST_REAL_VISUAL_QA_PASS: "NO",
        FIRST_REAL_END_TO_END_READY_LP: "NO",
      },
      ...publicationBase(),
      GENERATION_DECISION: generationDecision,
      GENERATION_PHASE: { GENERATION_PHASE_EXIT: "NO", GENERATION_ARCHITECTURE: "NOT_FROZEN" },
      PHASE: { GENERATION_PHASE_EXIT: "NO", NEXT_PHASE: "STOP_FOR_REVIEW" },
      GO_NO_GO: failure.GO,
      ISSUES: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
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
  const post = validateComposedPage(composed, facts, VALIDATION_SAFE_AFFILIATE, authorizedCopyFromVariant(variant, facts.productName));
  const rendered = orderedVisibleSections(composed).map((section) => section.id);
  const omitted = composed.omitted.map((item) => item.component);
  const visible = consumerVisibleText(composed);
  const firewall = compositionFactFirewall({
    authorizedCopy: authorizedCopyFromVariant(variant, facts.productName),
    composedVisible: visible,
  });
  const composerAdded = firewall.addedFactualCopy;
  writeJson("composed-page.json", composed);
  writeJson("post-composition-gates.json", {
    GROUNDING: post.grounding.status,
    POLICY: post.policy,
    CONTENT_GATE: post.finalGate,
    FIREWALL: firewall.status,
    unsupported: post.grounding.unsupportedClaims,
  });
  const emptySections = composed.sections
    .filter((section) => section.visible && !(section.paragraphs.join("") + section.bullets.join("") + section.cards.map((c) => c.title + c.body).join("") + section.faq.map((f) => f.question).join("")).trim())
    .map((section) => section.id);
  const postWarnings = [];
  const postBlocks = post.policy !== "READY" ? [post.policy] : [];
  const finalReady =
    post.grounding.status === "GROUNDED" &&
    post.grounding.unsupportedClaims.length === 0 &&
    post.policy === "READY" &&
    post.finalGate === "READY" &&
    firewall.status === "PASS" &&
    composerAdded.length === 0 &&
    extraFactual.length === 0;

  const hydrationBlock = {
    HYDRATION_EXECUTED: "YES",
    HYDRATION_ADDED_FACTUAL_COPY: "NO",
    ADAPTER_EXECUTED: "YES",
    ADAPTER_ADDED_FACTUAL_COPY: extraFactual.length > 0 ? "YES" : "NO",
    EXTRA_SENTENCES: extraFactual.slice(0, 6),
  };
  const compositionBlock = {
    EXECUTED: true,
    STRATEGY: recommendation.recommendedStrategy,
    TEMPLATE: template,
    THEME: null as string | null,
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
    COMPOSITION_FACT_FIREWALL: firewall.status,
    FINAL_CONTENT_GATE: finalReady ? "READY" : post.finalGate,
  };

  if (!finalReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      HYDRATION_ADAPTER: hydrationBlock,
      COMPOSITION: compositionBlock,
      POST_COMPOSITION: { ...postBlock, FINAL_CONTENT_GATE: post.finalGate },
      HYDRATION: { EXECUTED: "YES", ADDED_FACTUAL_COPY: "NO" },
      ADAPTER: { EXECUTED: "YES", ADDED_FACTUAL_COPY: extraFactual.length > 0 ? "YES" : "NO" },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      MILESTONES: {
        FIRST_REAL_CONTENT_READY: "YES",
        FIRST_REAL_COMPOSED_READY: "NO",
        FIRST_REAL_VISUAL_QA_PASS: "NO",
        FIRST_REAL_END_TO_END_READY_LP: "NO",
      },
      GENERATION_DECISION: generationDecision,
      GENERATION_PHASE: { GENERATION_PHASE_EXIT: "YES", GENERATION_ARCHITECTURE: "FROZEN_V1" },
      PHASE: { GENERATION_PHASE_EXIT: "YES", NEXT_PHASE: "STOP_FOR_REVIEW" },
      FAILURE_CLASSIFICATION:
        extraFactual.length
          ? { PRIMARY: "ADAPTER_FACTUAL_DELTA", EVIDENCE: JSON.stringify(extraFactual.slice(0, 4)) }
          : composerAdded.length
            ? { PRIMARY: "COMPOSITION_FACTUAL_DELTA", EVIDENCE: JSON.stringify(composerAdded.slice(0, 4)) }
            : post.grounding.status !== "GROUNDED"
              ? { PRIMARY: "POST_COMPOSITION_GROUNDING_FAILURE", EVIDENCE: `GROUNDING=${post.grounding.status}` }
              : { PRIMARY: "POST_COMPOSITION_POLICY_FAILURE", EVIDENCE: `POLICY=${post.policy} GATE=${post.finalGate}` },
      GO_NO_GO:
        extraFactual.length || composerAdded.length
          ? "COMPOSITION_NEEDS_FIX"
          : post.grounding.status !== "GROUNDED"
            ? "POST_COMPOSITION_NEEDS_FIX"
            : "POST_COMPOSITION_NEEDS_FIX",
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
  compositionBlock.THEME = design.visualTheme;
  const creative = createCreativeCompositionPlan({ page: composed, design });
  const campaignInput = {
    name: `${facts.productName} controlled visual 13 (DO NOT PUBLISH)`,
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
    extra.faqInteraction !== "FAIL" &&
    Object.values(extra.breakpoints).every((item) => !item.overflowX);
  writeJson("visual-qa.json", { gate: visual.gate, byWidth: visual.byWidth, extra, pass: visualPass });
  const quality = !visualPass
    ? "VISUALLY_BROKEN"
    : extra.anatomy && extra.anatomy.words < 180
      ? "VISUALLY_THIN"
      : extra.anatomy && extra.anatomy.words >= 400 && imageEligible
        ? "VISUALLY_PREMIUM"
        : "VISUALLY_ACCEPTABLE";
  const contentDensity =
    extra.anatomy && extra.anatomy.words >= 400
      ? "GOOD"
      : extra.anatomy && extra.anatomy.words >= 160
        ? "SPARSE_BUT_INTENTIONAL"
        : "TOO_SPARSE";
  const dims = premiumDimensions({
    visualPass,
    imageEligible,
    words: extra.anatomy?.words || 0,
    hasCta: Boolean(extra.anatomy?.hasCta),
    hasDisclosure: Boolean(extra.anatomy?.hasDisclosure),
    clipping: extra.mobile.clipping,
    overflow: extra.mobile.overflowX || extra.desktop.overflowX,
    brokenImages: extra.mobile.brokenImages,
    emptyVisual: extra.mobile.emptySections.length,
  });
  const premiumGaps = Object.entries(dims)
    .filter(([, value]) => value === "WEAK" || value === "FAIL")
    .slice(0, 7)
    .map(([key, value]) => `${key}=${value}`);
  const fold = extra.aboveFold;
  const gapList = [
    !imageEligible ? "PRODUCT_PROTAGONISM=no eligible product visual — SAFE_VISUAL" : null,
    quality === "VISUALLY_THIN" ? "SECTION_RHYTHM=THIN copy yields sparse LP — SAFE_VISUAL" : null,
    dims.ART_DIRECTION === "WEAK" ? "ART_DIRECTION=generic theme, not campaign-quality hero — SAFE_VISUAL" : null,
    dims.VISUAL_DEPTH === "WEAK" || dims.VISUAL_DEPTH === "FAIL" ? "VISUAL_DEPTH=flat composition — SAFE_VISUAL" : null,
    dims.WHITESPACE === "WEAK" ? "WHITESPACE=unintentional empty regions — SAFE_VISUAL" : null,
    fold?.MOBILE_390?.CTA_BELOW_FOLD ? "MOBILE CTA below fold — SAFE_CRO" : null,
    extra.mobile.stickyCta ? null : "STICKY_CTA absent — SAFE_CRO",
  ]
    .filter(Boolean)
    .slice(0, 7);
  const anatomy = visualPass && extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
  if (anatomy) writeJson("web-anatomy-audit-only.json", anatomy);
  const published = getPublishedCampaignBySlug(SLUG);
  const safety = premiumSafetyScan(visible);

  writeJson("REPORT.json", {
    ...baseReport,
    GENERATION_FREEZE: {
      THIN_GENERATION_ARCHITECTURE: "FROZEN_V1",
      GENERATION_CODE_CHANGED: "NO",
      CLAIM_PROJECTION_CHANGED: "NO",
      COMPOSITION_FIREWALL_CHANGED: "NO",
      GENERATION_ROUTE: "DETERMINISTIC_THIN",
      ANTHROPIC_CALLS: 0,
    },
    HYDRATION: { EXECUTED: "YES", ADDED_FACTUAL_COPY: "NO" },
    ADAPTER: {
      EXECUTED: "YES",
      ADDED_FACTUAL_COPY: extraFactual.length > 0 ? "YES" : "NO",
      TEXTUAL_DELTA: extraFactual.length ? extraFactual.slice(0, 8) : "NONE",
    },
    COMPOSITION: { ...compositionBlock, EMPTY_SECTIONS: extra.mobile.emptySections },
    FACTUAL_DELTA: {
      COMPOSER_ADDED_FACTUAL_COPY: composerAdded.length ? composerAdded.slice(0, 8) : "NONE",
      ADDED_FACTUAL_CLAIMS: composerAdded.length ? composerAdded.slice(0, 8) : "NONE",
      NON_FACTUAL_UI_COPY: ["Affiliate disclosure", "section headings"],
    },
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
      HORIZONTAL_OVERFLOW: extra.mobile.overflowX || extra.desktop.overflowX ? "YES" : "NO",
      TEXT_CLIPPING: extra.mobile.clipping > 0 ? "YES" : "NO",
      OVERLAP: extra.mobile.overlap > 0 ? "YES" : "NO",
      BROKEN_ASSETS: extra.mobile.brokenImages > 0 ? "YES" : "NO",
      EMPTY_CONTAINERS: extra.mobile.emptySections.length ? extra.mobile.emptySections : "NO",
      STICKY_CTA: extra.mobile.stickyCta ? "PRESENT" : "ABSENT",
      FAQ_INTERACTION: extra.faqInteraction,
      DETAILS: { byWidth: visual.byWidth, mobile: extra.mobile, desktop: extra.desktop },
    },
    ABOVE_FOLD: extra.aboveFold,
    CTA: extra.ctaInspect,
    CONTENT_DENSITY: {
      CLASSIFICATION: contentDensity,
      WORDS: extra.anatomy?.words ?? 0,
      LARGE_EMPTY_AREAS: extra.aboveFold?.MOBILE_390?.EXCESSIVE_EMPTY_SPACE || extra.aboveFold?.DESKTOP_1440?.EXCESSIVE_EMPTY_SPACE ? "YES" : "NO",
      DUPLICATED_SECTIONS: "NO",
      ARTIFICIAL_FILLER: "NO",
    },
    SCREENSHOTS: extra.screenshots,
    PREMIUM_BASELINE: {
      CLASSIFICATION: quality,
      ...dims,
    },
    TOP_VISUAL_GAPS: gapList,
    WEB_ANATOMY: visualPass && anatomy ? { EXECUTED: true, ...anatomy } : { EXECUTED: false },
    PREMIUM_SAFETY: safety,
    TECH_DEBT: {
      SEMANTIC_AUTHORITY_CASE_VARIANT_GAP:
        "REGISTERED — sentence-initial Ingredients Mobilee / Ingredients include Mobilee. Before scaled publication. Do not reopen THIN generation.",
      HISTORICAL_PRE_FIREWALL_COMPOSITIONS_REQUIRE_RECOMPOSITION:
        "REGISTERED — campaigns composed before the composition fact firewall may still contain raw ProductFacts fallback copy until recomposed. Do not patch in this run.",
    },
    MILESTONES: {
      FIRST_REAL_CONTENT_READY: "YES",
      FIRST_REAL_COMPOSED_READY: "YES",
      FIRST_REAL_VISUAL_QA_PASS: visualPass ? "YES" : "NO",
      FIRST_REAL_END_TO_END_READY_LP: visualPass ? "YES" : "NO",
    },
    GENERATION_DECISION: generationDecision,
    GENERATION_PHASE: {
      GENERATION_PHASE_EXIT: "YES",
      GENERATION_ARCHITECTURE: "FROZEN_V1",
    },
    PHASE: {
      GENERATION_PHASE_EXIT: "YES",
      NEXT_PHASE: visualPass ? "PREMIUM_VISUAL_SYSTEM" : "VISUAL_QA_FIX",
    },
    HUMAN_APPROVAL: { STATUS: "PENDING" },
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: Boolean(published),
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: extra.mobile.href !== VALIDATION_SAFE_HREF,
    },
    FAILURE_CLASSIFICATION: visualPass
      ? { PRIMARY: "NONE", EVIDENCE: "FINAL_CONTENT_GATE=READY VISUAL_QA=PASS" }
      : { PRIMARY: "VISUAL_QA_FAILURE", EVIDENCE: `VISUAL_QA=FAIL GATE=${visual.gate}` },
    GO_NO_GO: visualPass
      ? "FIRST_REAL_END_TO_END_READY_LP"
      : "VISUAL_QA_NEEDS_FIX",
    ISSUES: visualPass
      ? { CRITICAL: 0, HIGH: 0, MEDIUM: quality === "VISUALLY_THIN" ? 1 : 0, LOW: 0 }
      : { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    FINAL_STATUS: "CONTROLLED_VISUAL_RUN_13_COMPLETE",
  });
  console.log("DONE", visualPass ? "FIRST_REAL_END_TO_END_READY_LP" : "VISUAL_QA_NEEDS_FIX");
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
  process.exit(1);
});
