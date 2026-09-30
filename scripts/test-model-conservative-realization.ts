// npx tsx scripts/test-model-conservative-realization.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { deterministicFaqQuestion, validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import {
  evaluateSlotGeneration,
  slotFillSchema,
  type SlotFill,
} from "../src/lib/ai/slot-generation.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { LINT_THRESHOLDS } from "../src/lib/policy-linter-thresholds.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function expectedMax(sourceWords: number, ceiling: number): number {
  if (sourceWords <= 0) return Math.min(ceiling, 8);
  const allowance = Math.max(2, Math.ceil(sourceWords * 0.35));
  return Math.min(ceiling, sourceWords + allowance);
}

const recovered = applyGenericFaqRecovery(
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
      "utf8",
    ),
  ) as ProductFacts,
);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const byType = (type: string) => slotPlan.slots.filter((slot) => slot.type === type);
const overview = byType("OVERVIEW")[0]!;
const features = byType("FEATURE");
const faqs = byType("FAQ");
const usageFaq = faqs.find((slot) => slot.semanticAuthority === "USAGE" || slot.topic === "usage")!;
const guaranteeFaq = faqs.find((slot) => slot.semanticAuthority === "GUARANTEE" || slot.topic === "guarantee")!;

assert(plan.generationRoute === "MODEL", "recovered route stays MODEL");
assert(overview.slotId === "S003", "S003 is the overview slot");
assert(features[0]?.slotId === "S004" && features[1]?.slotId === "S005", "S004 and S005 are the feature slots");
assert(!slotPlan.slots.some((slot) => slot.type === "FINAL_THOUGHTS"), "FINAL_THOUGHTS stays omitted");

const featureCeiling = Math.max(24, Math.floor(plan.wordBudget.features / features.length));
const budgets: Array<{ label: string; slot: EvidenceSlot; before: number }> = [
  { label: "S003", slot: overview, before: plan.wordBudget.overview },
  { label: "S004", slot: features[0]!, before: featureCeiling },
  { label: "S005", slot: features[1]!, before: featureCeiling },
];
for (const item of budgets) {
  const sourceWords = words(item.slot.evidence.map((entry) => entry.value).join(" "));
  console.log(`${item.label}_SOURCE_WORDS=${sourceWords}`);
  console.log(`${item.label}_MAX_WORDS_BEFORE=${item.before}`);
  console.log(`${item.label}_MAX_WORDS_AFTER=${item.slot.maxWords}`);
  assert(sourceWords > 0, `${item.label} has projected source words`);
  assert(item.slot.maxWords === expectedMax(sourceWords, item.before), `${item.label} maxWords follows source density`);
  assert(item.slot.maxWords < item.before, `${item.label} budget is tighter than the coverage ceiling`);
  assert(item.slot.maxWords >= sourceWords, `${item.label} budget still fits the authorized source`);
}
for (const slot of faqs) {
  const sourceWords = words(slot.evidence.map((entry) => entry.value).join(" "));
  console.log(`${slot.slotId}_FAQ_SOURCE_WORDS=${sourceWords}`);
  console.log(`${slot.slotId}_FAQ_MAX_WORDS_BEFORE=${plan.wordBudget.faqAnswer}`);
  console.log(`${slot.slotId}_FAQ_MAX_WORDS_AFTER=${slot.maxWords}`);
  assert(slot.maxWords === expectedMax(sourceWords, plan.wordBudget.faqAnswer), `${slot.slotId} FAQ budget follows source density`);
  assert(slot.maxWords <= plan.wordBudget.faqAnswer, `${slot.slotId} FAQ budget does not grow`);
}

const thin = emptyProductFacts("Thin Product", "https://example.test/thin", "IMPORTED");
thin.description = "Thin Product supports daytime comfort.";
thin.confidence.description = "DIRECT_SOURCE";
thin.confidence.features = "NOT_FOUND";
thin.confidence.ingredientsOrComponents = "NOT_FOUND";
thin.confidence.usageInformation = "NOT_FOUND";
thin.confidence.cautions = "NOT_FOUND";
thin.confidence.pricingInformation = "NOT_FOUND";
thin.confidence.guaranteeInformation = "NOT_FOUND";
thin.confidence.manufacturer = "NOT_FOUND";
thin.importQuality = "PARTIAL";
const thinPlan = createGenerationPlan(thin);
const thinSlots = createEvidenceSlotPlan(thin);
const thinOverview = thinSlots.slots.find((slot) => slot.type === "OVERVIEW")!;
assert(thinPlan.generationRoute === "DETERMINISTIC_THIN", "thin route unchanged");
assert(thinOverview.maxWords === thinPlan.wordBudget.overview, "thin overview budget is not capped");

const prompt = buildPrompt({ facts: recovered, productName: recovered.productName, sourceUrl: recovered.sourceUrl });
assert(prompt.system.includes("CONSERVATIVE_LINGUISTIC_REALIZATION"), "MODEL role is conservative realization");
assert(!prompt.system.includes("copywriter"), "MODEL prompt does not assign a copywriter role");
assert(prompt.user.includes("FAQ QUESTION FAQ"), "MODEL prompt assigns FAQ questions in code");
const schema = JSON.stringify(slotFillSchema(slotPlan));
assert(!schema.includes('"question"'), "MODEL schema does not ask for a question");

const raw = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/web-anatomy-lab/v1/controlled-rich-replay-v3/generation-raw.json"), "utf8"),
) as { fills: SlotFill[]; ctaLabel: string };
const v3 = evaluateSlotGeneration(
  { variants: [{ cta: { label: raw.ctaLabel }, slots: raw.fills }] },
  recovered,
  recovered.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);

function hits(fragment: string, code: string, reasonPart: string) {
  return v3.structuralViolations.filter(
    (item) =>
      item.code === code &&
      item.reason.includes(reasonPart) &&
      (item.text.includes(fragment) || item.reason.includes(fragment)),
  );
}

assert(hits("aims to help", "MODEL_WORDING_CONSTRAINT_VIOLATION", "NEW_PURPOSE").length > 0, "S003 NEW_PURPOSE stays blocked");
assert(hits("work together", "MODEL_WORDING_CONSTRAINT_VIOLATION", "NEW_SYNERGY").length > 0, "S005 NEW_SYNERGY stays blocked");
assert(
  v3.structuralViolations.some(
    (item) =>
      item.code === "PROPOSITION_BINDING_VIOLATION" &&
      item.reason === "UNAUTHORIZED_RELATIONSHIP" &&
      /relates to/i.test(item.text),
  ),
  "FAQ002 unsupported relationship stays blocked",
);
assert(
  hits("How does Joint Genesis support joint function?", "QUESTION_SEMANTICS", "UNSUPPORTED_FACTUAL_PRESUPPOSITION").length > 0,
  "FAQ001 semantic expansion stays blocked",
);
assert(
  hits("different in its approach", "MODEL_WORDING_CONSTRAINT_VIOLATION", "NEW_EVALUATION").length > 0,
  "FAQ002 differentiation framing stays blocked",
);
assert(
  hits("What return policy applies?", "QUESTION_SEMANTICS", "UNSUPPORTED_GUARANTEE_PRESUPPOSITION").length > 0,
  "FAQ004 unauthorized presupposition stays blocked",
);
assert(
  !v3.structuralViolations.some((item) => item.reason.includes("required FINAL_THOUGHTS block is missing")),
  "structure failure is not a missing FINAL_THOUGHTS block",
);
console.log("V3_STRUCTURE_CODES=" + [...new Set(v3.structuralViolations.map((item) => item.code))].join(","));
assert(!v3.page?.blocks.some((block) => block.type === "FINAL_THOUGHTS"), "hydrated V3 page omits FINAL_THOUGHTS");
assert(
  (v3.inspectionCopy.body.match(/^## /gm) || []).length >= LINT_THRESHOLDS.content.minHeadingsWarn,
  "proposition wording hydrates into informational headings",
);

const sections = lintCampaign({
  id: 0,
  name: recovered.productName,
  slug: "slot-eval",
  headline: v3.inspectionCopy.headline,
  body: v3.inspectionCopy.body,
  ctaLabel: v3.inspectionCopy.ctaLabel,
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
}).findings.find((item) => item.ruleId === "content.sections");
console.log("CONTENT_SECTIONS_STATUS=" + (sections?.status || "MISSING"));
console.log("CONTENT_SECTIONS_EVIDENCE=" + (sections?.evidence || ""));
assert(sections?.status === "pass", "hydrated planned sections satisfy the existing content.sections rule");
assert(LINT_THRESHOLDS.content.minHeadingsWarn === 2, "content.sections threshold is unchanged");

function supportOf(slot: EvidenceSlot): string {
  return slot.evidence.map((item) => item.value).join("\n");
}

function ask(slot: EvidenceSlot, question: string) {
  return validateFaqQuestion({
    question,
    topic: slot.topic,
    field: slot.evidence[0]?.field,
    semanticAuthority: slot.semanticAuthority,
    authorizedTopics: [slot.topic],
    slotId: slot.slotId,
    closedTopics: plan.closedTopics,
    supportText: supportOf(slot),
    productName: recovered.productName,
  });
}

const usageQuestion = deterministicFaqQuestion(usageFaq, recovered.productName)!;
const guaranteeQuestion = deterministicFaqQuestion(guaranteeFaq, recovered.productName)!;
console.log("USAGE_SAFE_FIXTURE=" + usageQuestion);
console.log("GUARANTEE_SAFE_FIXTURE=" + guaranteeQuestion);
assert(ask(usageFaq, usageQuestion).semanticResult === "PASS", "deterministic usage question passes validateFaqQuestion");
assert(ask(guaranteeFaq, guaranteeQuestion).semanticResult === "PASS", "deterministic guarantee question passes validateFaqQuestion");
assert(ask(usageFaq, "How does Joint Genesis support joint function?").semanticResult === "FAIL", "usage slot still rejects the expanded question");
assert(ask(guaranteeFaq, "What return policy applies?").semanticResult === "FAIL", "guarantee slot still rejects the presupposing question");
assert(
  ask(features[0]!, "What makes Joint Genesis different in its approach?").semanticResult === "FAIL" ||
    validateModelWordingConstraint({
      generated: "What makes Joint Genesis different in its approach?",
      slot: faqs.find((slot) => slot.topic === "features")!,
    }).violations.some((item) => item.violationType === "NEW_EVALUATION" || item.violationType === "NEW_COMPARISON"),
  "feature FAQ still rejects the differentiation question",
);

function sourceFill(slot: EvidenceSlot, question?: string): SlotFill {
  const ids = propositionsForSlot(slot).map((item) => item.propositionId);
  const wording = slot.evidence.map((item) => item.value.trim()).join(" ");
  if (slot.type === "FAQ") {
    return {
      slotId: slot.slotId,
      question,
      answerPropositions: [{ propositionIds: ids, wording }],
    };
  }
  return { slotId: slot.slotId, propositions: [{ propositionIds: ids, wording }] };
}

const conceptual =
  "Joint Genesis uses five targeted ingredients to support lubrication, flexibility, and comfortable movement.";
const conceptualFills = slotPlan.slots.map((slot) => {
  if (slot.slotId !== overview.slotId) {
    return slot.type === "FAQ"
      ? sourceFill(slot, deterministicFaqQuestion(slot, recovered.productName) || undefined)
      : sourceFill(slot);
  }
  const ids = propositionsForSlot(slot).map((item) => item.propositionId);
  return { slotId: slot.slotId, propositions: [{ propositionIds: ids, wording: conceptual }] };
});
const conceptualEval = evaluateSlotGeneration(
  { variants: [{ cta: { label: "Learn More" }, slots: conceptualFills }] },
  recovered,
  recovered.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
const conceptualHits = conceptualEval.structuralViolations.filter((item) => item.text.includes("uses five targeted"));
console.log(
  "CONCEPTUAL_S003=" + (conceptualHits.length === 0 ? "PASS" : conceptualHits.map((item) => `${item.code}:${item.reason}`).join(" | ")),
);
assert(conceptualHits.length === 0, "conceptual S003 realization passes existing validators");

const safeFills = slotPlan.slots.map((slot) => {
  if (slot.type !== "FAQ") return sourceFill(slot);
  return sourceFill(slot, deterministicFaqQuestion(slot, recovered.productName) || undefined);
});
const safe = evaluateSlotGeneration(
  { variants: [{ cta: { label: "Learn More" }, slots: safeFills }] },
  recovered,
  recovered.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
if (safe.structuralViolations.length > 0) {
  for (const item of safe.structuralViolations) console.log(`SAFE_VIOLATION ${item.code} ${item.reason.slice(0, 180)}`);
}
assert(safe.structuralViolations.length === 0, "source-close realization passes existing validators");
assert(
  !/work together/i.test(safeFills.find((fill) => fill.slotId === "S005")?.propositions?.[0]?.wording || ""),
  "S005 safe fixture does not add work together",
);

function pageBound(question: string, binding: Omit<FaqAuthorityBinding, "question" | "closedTopics">) {
  return validateGrounding(question, recovered, {
    faqAuthorities: [{ ...binding, question, closedTopics: plan.closedTopics }],
  });
}
const usagePage = pageBound(usageQuestion, {
  field: usageFaq.evidence[0]!.field,
  topic: usageFaq.topic,
  semanticAuthority: usageFaq.semanticAuthority,
  authorizedTopics: [usageFaq.topic],
  supportText: supportOf(usageFaq),
});
const guaranteePage = pageBound(guaranteeQuestion, {
  field: guaranteeFaq.evidence[0]!.field,
  topic: guaranteeFaq.topic,
  semanticAuthority: guaranteeFaq.semanticAuthority,
  authorizedTopics: [guaranteeFaq.topic],
  supportText: supportOf(guaranteeFaq),
});
assert(usagePage.status === "GROUNDED", "FAQ usage safe fixture is page-level supported");
assert(guaranteePage.status === "GROUNDED", "FAQ guarantee safe fixture is page-level supported");

console.log("MODEL_CONSERVATIVE_REALIZATION_V1=PASS");
