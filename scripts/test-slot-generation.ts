// npx tsx scripts/test-slot-generation.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { createGenerationPlan, hasUsageAuthorityLanguage } from "../src/lib/ai/generation-plan.ts";
import {
  createEvidenceSlotPlan,
  formatEvidenceSlotPlanForPrompt,
} from "../src/lib/ai/evidence-slot-plan.ts";
import {
  adaptSlotFillsToVariantCopy,
  evaluateSlotGeneration,
  hydrateSlotFillsToPage,
  parseSlotFills,
  slotFillSchema,
  validateSlotFills,
  type SlotFill,
} from "../src/lib/ai/slot-generation.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { formatGenerationPlanForPrompt } from "../src/lib/ai/generation-plan.ts";
import { formatFactsForPrompt } from "../src/lib/product-facts.ts";
import {
  CLAIM_CLASS_COMPOSITION_PROMOTION,
  CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT,
  classifyIngredientLanguage,
  hasCompositionPromotionLanguage,
} from "../src/lib/ai/ingredient-claims.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function thinFacts() {
  const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
  facts.description =
    "See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients, daily use and a 180-day vendor";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = [
    "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises. Its strongest benefit story connects a clearly defined mechanism—supporting synovial-fluid quality—with practical goals such as bending, walking, exercising and handling daily tasks with greater confidence.",
    "The ingredients also give the formula broader support through antioxidants, botanical inflammatory-response compounds and enhanced nutrient absorption. Together, those features create a multi-angle daily formula that is still simple enough to take once each morning.",
  ];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.confidence.ingredientsOrComponents = "NOT_FOUND";
  facts.confidence.usageInformation = "NOT_FOUND";
  facts.confidence.cautions = "NOT_FOUND";
  facts.confidence.pricingInformation = "NOT_FOUND";
  facts.guaranteeInformation = "Read the full refund policy";
  facts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
  facts.confidence.manufacturer = "NOT_FOUND";
  facts.importQuality = "PARTIAL";
  return facts;
}

function wrap(fills: SlotFill[], cta = "View Product Details") {
  return { variants: [{ cta: { label: cta }, slots: fills }] };
}

const facts = thinFacts();
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest);
const required = slotPlan.slots.filter((slot) => slot.required);
const faqSlots = slotPlan.slots.filter((slot) => slot.type === "FAQ");
const featureSlots = slotPlan.slots.filter((slot) => slot.type === "FEATURE");
const descFaq = faqSlots.find((slot) => slot.topic === "description");
const featFaq = faqSlots.find((slot) => slot.topic === "features");

assert(required.every((slot) => slot.allowedEvidenceIds.length > 0), "required slots have code-assigned evidence");
assert(featureSlots.length === 2, "one FEATURE slot per feature evidence ID");
assert(featureSlots[0]!.allowedEvidenceIds.join() !== featureSlots[1]!.allowedEvidenceIds.join(), "feature slots are not mixed");
assert(descFaq?.allowedEvidenceIds.join() === "F002", "E: description FAQ slot is F002 only");
assert(featFaq?.allowedEvidenceIds.join() === "F003", "F: features FAQ slot is F003 only");
assert(slotPlan.slots.every((slot) => slot.preserveSemanticRelationships), "PRESERVE_SEMANTIC_RELATIONSHIPS on every slot");
assert(featureSlots.every((slot) => slot.semanticAuthority === "FEATURE_DESCRIPTION"), "feature slots are FEATURE_DESCRIPTION not USAGE");

const schema = JSON.stringify(slotFillSchema(slotPlan));
assert(!schema.includes("evidenceIds"), "G: schema does not ask the model for evidenceIds");
assert(schema.includes('"additionalProperties":false'), "slot schema additionalProperties false");
assert(!schema.includes("minItems"), "slot schema omits minItems");

const validFills = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/valid-thin-slot-fills.json"), "utf8"),
) as { cta: { label: string }; slots: SlotFill[] };
const validEval = evaluateSlotGeneration(wrap(validFills.slots, validFills.cta.label), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(validEval.structuralViolations.length === 0, "U: valid slot fixture STRUCTURAL PASS");
assert(
  validEval.slotTraces.filter((item) => item.blockType !== "FAQ" || item.text).every((item) => item.groundingResult === "GROUNDED"),
  "V: valid slot fixture SLOT-SCOPED GROUNDING PASS",
);
assert(validEval.grounding.status === "GROUNDED", "W: valid slot fixture GLOBAL GROUNDED");
assert(validEval.policyGate === "READY", "X: valid slot fixture POLICY READY");
assert(validEval.finalGate === "READY", "Y: valid slot fixture CONTENT READY");

const unknown = evaluateSlotGeneration(wrap([{ slotId: "S999", content: "Nope" }, ...validFills.slots]), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(unknown.structuralViolations.some((item) => item.code === "UNKNOWN_SLOT"), "A: unknown slot BLOCKED");
assert(unknown.finalGate === "BLOCKED", "A: unknown slot cannot be READY");

const dup = evaluateSlotGeneration(
      wrap([...validFills.slots, { slotId: "S001", content: "Joint Genesis" }]),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(dup.structuralViolations.some((item) => item.code === "DUPLICATE_SLOT"), "B: duplicate slot BLOCKED");

const missing = evaluateSlotGeneration(
  wrap(validFills.slots.filter((item) => item.slotId !== "S001")),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(missing.structuralViolations.some((item) => item.code === "MISSING_REQUIRED_SLOT"), "C: required slot missing BLOCKED");

const hydrated = hydrateSlotFillsToPage(validFills.slots, slotPlan, "View Product Details");
assert(hydrated.headline.evidenceIds.join() === slotPlan.slots.find((slot) => slot.type === "HEADLINE")!.allowedEvidenceIds.join(), "D: model cannot change headline evidence IDs");
assert(
  hydrated.blocks.find((block) => block.type === "FAQ")?.items?.[0]?.evidenceIds.join() === "F002",
  "D: FAQ evidence remains code-assigned",
);
assert(!JSON.stringify(validFills.slots).includes("evidenceIds"), "G: model output has no evidenceIds and is valid");

const morningSlot = featureSlots[1]!;
const morningOk = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "once each morning" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(!morningOk.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "H: once each morning eligible for Grounding");

const takeOnce = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "take once each morning" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(takeOnce.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "I: take once each morning BLOCKED USAGE_PROMOTION");

const regimen = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "once-daily regimen" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(regimen.finalGate === "BLOCKED", "J: once-daily regimen BLOCKED");

const antioxidantOk = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "The ingredients also give the formula broader support through antioxidants." } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(!antioxidantOk.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "K: antioxidant feature relationship eligible");

const includes = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "includes antioxidants" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(includes.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "L: includes antioxidants BLOCKED COMPOSITION_PROMOTION");
assert(classifyIngredientLanguage("includes antioxidants") === CLAIM_CLASS_COMPOSITION_PROMOTION, "L: class is COMPOSITION_PROMOTION");

const contains = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "contains antioxidants" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(contains.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "M: contains antioxidants BLOCKED");

const formulated = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === morningSlot.slotId ? { slotId: item.slotId, content: "formulated with antioxidants" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(formulated.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "N: formulated with antioxidants BLOCKED");

assert(classifyIngredientLanguage("five targeted ingredients") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT, "O: five targeted ingredients is generic");
assert(
  !validateGrounding("five targeted ingredients", facts).unsupportedClaims.some((item) => item.claimClass === "NAMED_INGREDIENT"),
  "O: generic restatement eligible",
);

assert(validateGrounding("The ingredients work together to provide broader support.", facts).status !== "GROUNDED", "P: ingredients work together BLOCKED");
assert(validateGrounding("synergistic ingredients", facts).status !== "GROUNDED", "Q: synergistic ingredients BLOCKED");
assert(validateGrounding("Synovial fluid is the lubricating substance found in joints.", facts).status === "UNGROUNDED", "R: external synovial science BLOCKED");

const guarantee = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S006" ? { slotId: "S006", content: "There is a 180-day refund." } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(guarantee.finalGate === "BLOCKED", "S: guarantee promotion BLOCKED");

const absence = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S003" ? { slotId: "S003", content: "Ingredient names are not disclosed in the available documentation." } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(absence.finalGate === "BLOCKED", "T: missing-field commentary BLOCKED");

const adapted = adaptSlotFillsToVariantCopy(validFills.slots, slotPlan, "View Product Details", facts);
assert(adapted.body.includes("Joint Genesis is designed for steady joint wellness"), "adapter groups feature slots");
assert(!adapted.body.includes("F001"), "adapter adds no evidence IDs");
assert(!/ingredient names are not disclosed/i.test(adapted.body), "adapter adds no absence commentary");

const beforePrompt = `${formatFactsForPrompt(facts)}\n${formatGenerationPlanForPrompt(plan)}`;
const afterPrompt = buildPrompt({ productName: facts.productName, facts }).user;
console.log("PROMPT_CHARS_BEFORE=" + beforePrompt.length);
console.log("PROMPT_CHARS_AFTER=" + afterPrompt.length);
assert(afterPrompt.includes("EVIDENCE SLOT PLAN"), "production prompt includes Evidence Slot Plan");
assert(afterPrompt.includes("Do not return evidenceIds") || afterPrompt.includes("CODE_OWNS_EVIDENCE_ASSIGNMENT"), "prompt states code owns evidence");

const run06 = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/controlled-ready-05b-structured.json"), "utf8"),
) as { raw?: string };
const run06Raw = readFileSync(
  path.join(process.cwd(), "data/controlled-ready-06/2026-09-20-controlled-ready-06/generation-raw.json"),
  "utf8",
);
const run06Copy = JSON.parse(run06Raw).raw as string;
assert(run06Copy.includes("F002\",\"F003\"") || run06Copy.includes('"F002","F003"'), "RUN06 fixture unmodified still has description FAQ + F003");
assert(hasUsageAuthorityLanguage("take once each morning"), "RUN06 take once remains USAGE_PROMOTION");
assert(hasCompositionPromotionLanguage("includes antioxidants"), "RUN06 includes antioxidants is COMPOSITION_PROMOTION");
assert(
  descFaq && !descFaq.allowedEvidenceIds.includes("F003"),
  "RUN06 CROSS_FIELD_FAQ would be impossible: description FAQ slot cannot receive F003",
);
console.log("RUN06_REPLAY CROSS_FIELD_FAQ=ARCHITECTURE_PREVENTS TAKE_ONCE=FAIL INCLUDES_ANTIOXIDANTS=FAIL FINAL_RESULT=FAIL");
assert(Boolean(run06.raw), "unrelated 05B fixture left unmodified");

console.log("MODEL_CHOOSES_EVIDENCE=NO MODEL_CHOOSES_FAQ_TOPIC=NO");
console.log("\nTodos os testes de evidence slot generation passaram.");
