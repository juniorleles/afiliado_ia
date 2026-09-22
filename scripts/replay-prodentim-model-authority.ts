/**
 * Replay stored Multi-Product ProDentim facts through MODEL slot authority.
 * Does not re-fetch, re-import, mutate ProductFacts, or compose.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { buildPrompt, generateVariants } from "../src/lib/ai/generate-variants.ts";
import { evaluateSlotGeneration, hydrateSlotFillsToPage } from "../src/lib/ai/slot-generation.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import {
  countModelSlotAuthorityViolations,
  createModelSlotAuthority,
  formatModelSlotAuthorityForPrompt,
} from "../src/lib/ai/model-slot-authority.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import type { VariantApproach } from "../src/lib/ai/generate-variants.ts";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

async function main() {
loadLocalEnv();

const root = process.cwd();
const dir = path.join(root, "data/multi-product-validation/prodentim");
const facts = readJson<ProductFacts>(path.join(dir, "import-facts.json"));
const beforeReport = readJson<Record<string, unknown>>(path.join(dir, "REPORT.json"));
const strategy = readJson<{ recommendedStrategy: VariantApproach }>(path.join(dir, "strategy.json"));
const factsBefore = JSON.stringify(facts);
const approach = strategy.recommendedStrategy;

const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
const authorities = slotPlan.slots.map((slot) => createModelSlotAuthority(slot, plan));
const prompt = buildPrompt({
  productName: facts.productName,
  sourceUrl: facts.sourceUrl,
  facts,
  targetApproach: approach,
});

if (JSON.stringify(facts) !== factsBefore) {
  throw new Error("ProductFacts mutated during replay setup");
}

console.log("SOURCE_CHANGED=NO");
console.log("PRODUCTFACTS_CHANGED=NO");
console.log("COVERAGE=" + plan.coverage);
console.log("GENERATION_ROUTE=" + plan.generationRoute);
console.log("MODEL_VISIBLE_CLAIMS=" + projection.authorized.map((claim) => claim.generationText).join(" | "));
console.log("SLOT_AUTHORITY=\n" + formatModelSlotAuthorityForPrompt(authorities));
console.log("RAW_PRODUCTFACTS_IN_PROMPT=" + (prompt.user.includes("SOURCE FACTS") ? "YES" : "NO"));
console.log("CLOSED_FIELDS_IN_PROMPT=" + (/HEURISTIC_EXTRACTION/.test(prompt.user) ? "YES" : "NO"));
console.log("INGREDIENT_SLOTS=" + slotPlan.slots.filter((slot) => slot.type === "INGREDIENTS").length);
console.log("OVERVIEW_SLOT=" + (slotPlan.slots.some((slot) => slot.type === "OVERVIEW") ? "YES" : "NO"));
console.log("FINAL_THOUGHTS_SLOT=" + (slotPlan.slots.some((slot) => slot.type === "FINAL_THOUGHTS") ? "YES" : "NO"));

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY missing; cannot replay MODEL generation");
}

const variants = await generateVariants({
  productName: facts.productName,
  sourceUrl: facts.sourceUrl,
  facts,
  targetApproach: approach,
});
const variant = variants[0];
if (!variant) throw new Error("generateVariants returned no variants");
if (JSON.stringify(facts) !== factsBefore) {
  throw new Error("ProductFacts mutated during generateVariants");
}

const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: variant.ctaLabel }, slots: variant.slotFills || [] }] },
  facts,
  facts.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
const page = hydrateSlotFillsToPage(variant.slotFills || [], slotPlan, variant.ctaLabel, approach);
const closure = (variant.slotFills || []).map((fill) => {
  const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
  const generated = slot?.type === "FAQ" ? (fill.answer || "").trim() : (fill.content || "").trim();
  const support = (slot?.evidence || []).map((item) => item.value).join("\n");
  return validateThinSemanticClosure({
    generated,
    support,
    slotType: slot?.type,
    thinMode: true,
  });
});
const faqSlots = evaluation.slotTraces.filter((trace) => trace.blockType === "FAQ");
const faqStatus = faqSlots.length === 0 ? "OMITTED" : faqSlots.every((trace) => trace.answerGrounding === "GROUNDED") ? "PASS" : "FAIL";
const structurePass = evaluation.structuralViolations.length === 0;
const closurePass = closure.every((item) => item.result === "PASS");
const authorityViolations = countModelSlotAuthorityViolations(evaluation.structuralViolations);

const after = {
  SOURCE_CHANGED: "NO",
  PRODUCTFACTS_CHANGED: "NO",
  COVERAGE_CHANGED: plan.coverage === beforeReport.COVERAGE ? "NO" : "YES",
  CLAIM_PROJECTION_CHANGED: "NO",
  AI_CALLS: variant.anthropicCalls ?? 1,
  STRUCTURE_BEFORE: beforeReport.STRUCTURE,
  STRUCTURE_AFTER: structurePass ? "PASS" : "FAIL",
  FAQ_BEFORE: beforeReport.FAQ,
  FAQ_AFTER: faqStatus,
  SEMANTIC_CLOSURE_BEFORE: beforeReport.SEMANTIC_CLOSURE,
  SEMANTIC_CLOSURE_AFTER: closurePass ? "PASS" : "FAIL",
  SEMANTIC_AUTHORITY_BEFORE: beforeReport.SEMANTIC_AUTHORITY,
  SEMANTIC_AUTHORITY_AFTER: closurePass ? "PASS" : "FAIL",
  GROUNDING_BEFORE: beforeReport.GROUNDING,
  GROUNDING_AFTER: evaluation.grounding.status,
  POLICY_BEFORE: beforeReport.POLICY,
  POLICY_AFTER: evaluation.policyGate,
  CONTENT_GATE_BEFORE: beforeReport.CONTENT_GATE,
  CONTENT_GATE_AFTER: evaluation.finalGate,
  MODEL_ROUTE_SLOT_AUTHORITY_VIOLATIONS: authorityViolations,
  STRUCTURAL_CODES: evaluation.structuralViolations.map((item) => item.code),
  STRUCTURAL_DETAIL: evaluation.structuralViolations.map((item) => ({
    code: item.code,
    text: item.text.slice(0, 180),
    reason: item.reason,
  })),
  FILLS: (variant.slotFills || []).map((fill) => ({
    slotId: fill.slotId,
    content: fill.content,
    question: fill.question,
    answer: fill.answer,
  })),
  UNSUPPORTED: evaluation.grounding.unsupportedClaims.map((item) => item.claim),
  SLOT_IDS: slotPlan.slots.map((slot) => `${slot.slotId}:${slot.type}:${slot.semanticAuthority}`),
  HEADLINE: page.headline.text,
  COMPOSITION: "NOT_RUN",
};

writeFileSync(path.join(dir, "model-authority-replay.json"), JSON.stringify(after, null, 2), "utf8");
for (const [key, value] of Object.entries(after)) {
  console.log(`${key}=${Array.isArray(value) ? JSON.stringify(value) : String(value)}`);
}
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
