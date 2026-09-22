// npx tsx scripts/test-claim-projection.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest, formatFactsForPrompt } from "../src/lib/product-facts.ts";
import { createGenerationPlan, formatGenerationPlanForPrompt, hasUsageAuthorityLanguage } from "../src/lib/ai/generation-plan.ts";
import {
  closedClaimFirewall,
  editorialExpansionClaims,
  modelVisibleText,
  projectEvidenceClaims,
  resultsExpectationClaims,
  type ClaimUnit,
} from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration, validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { hasCompositionPromotionLanguage } from "../src/lib/ai/ingredient-claims.ts";
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
const storedFacts = JSON.parse(JSON.stringify(facts)) as ReturnType<typeof thinFacts>;
const storedFeatures = JSON.parse(JSON.stringify(facts.features)) as string[];
const storedDescription = facts.description;
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const storedManifest = JSON.parse(JSON.stringify(manifest));
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
const visible = modelVisibleText(projection);
const firewall = closedClaimFirewall(projection, plan);
const f002 = projection.claims.filter((claim) => claim.evidenceId === "F002");
const f003 = projection.claims.filter((claim) => claim.evidenceId === "F003");
const f004 = projection.claims.filter((claim) => claim.evidenceId === "F004");
const f002Projected = f002.filter((c) => c.generationAuthorized).map((c) => c.generationText).join(" ");

assert(manifest.items.length === 4, "thin manifest still has four copy-eligible evidence items");
assert(projection.claims.length > 0, "claims were projected");
assert(projection.authorized.length > 0, "some claims remain authorized");
assert(projection.excluded.some((claim) => claim.claimClass === "USAGE_INSTRUCTION"), "usage instruction claims are excluded");
assert(JSON.stringify(facts.features) === JSON.stringify(storedFeatures), "C: stored feature evidence unchanged");
assert(facts.description === storedDescription, "C: stored description unchanged");
assert(facts.confidence.features === "DIRECT_SOURCE", "C: provenance unchanged");
assert(facts.guaranteeInformation === "Read the full refund policy", "C: heuristic guarantee remains stored");

assert(!visible.toLowerCase().includes("take once each morning"), "B: take once each morning is not model-visible");
assert(!/\btake once\b/i.test(visible), "usage-instruction take once is not model-visible");
assert(!visible.toLowerCase().includes("read the full refund policy"), "Q: heuristic guarantee not model-visible");
assert(firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "T: model-visible closed claim count is 0");
assert(firewall.USAGE_INSTRUCTION_VISIBLE === 0, "USAGE_INSTRUCTION_VISIBLE=0");
assert(firewall.GUARANTEE_VISIBLE === 0, "Q: GUARANTEE_VISIBLE=0");
assert(firewall.INGREDIENT_COMPOSITION_VISIBLE === 0, "H: composition authority not granted");

const safeOnly = emptyProductFacts("Safe Cream", "https://example.com/cream", "MANUAL");
safeOnly.description = "A daily moisturizer for dry skin.";
safeOnly.confidence.description = "DIRECT_SOURCE";
safeOnly.features = ["Absorbs quickly without a greasy finish."];
safeOnly.confidence.features = "DIRECT_SOURCE";
const safeProj = projectEvidenceClaims(safeOnly);
assert(
  safeProj.authorized.some((claim) => claim.generationText.includes("Absorbs quickly without a greasy finish")),
  "A: safe feature sentence is projected",
);

assert(
  f002.some((claim) => claim.claimClass === "TEMPORAL_DESCRIPTION" && !claim.generationAuthorized),
  "D: daily use is temporal description without instructional authority",
);
assert(
  !f002.filter((claim) => claim.generationAuthorized).some((claim) => /\bdaily use\b/i.test(claim.generationText)),
  "D: daily use is not in authorized generation text",
);
assert(
  f004.some((claim) => claim.claimClass === "USAGE_INSTRUCTION" && !claim.generationAuthorized),
  "B: F004 usage span classified USAGE_INSTRUCTION and excluded",
);
assert(
  f004.some((claim) => claim.claimClass === "ANTIOXIDANT_REFERENCE" && claim.generationAuthorized && !claim.compositionAuthority),
  "G: antioxidant feature relationship may project without composition authority",
);

const validFills = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/valid-thin-projected-slot-fills.json"), "utf8"),
) as { cta: { label: string }; slots: SlotFill[] };
const validEval = evaluateSlotGeneration(
  wrap(validFills.slots, validFills.cta.label),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(validEval.structuralViolations.length === 0, "U: valid projected fixture STRUCTURAL PASS");
assert(
  validEval.slotTraces.every((item) => !item.text || item.groundingResult === "GROUNDED"),
  "V: valid projected fixture SLOT-SCOPED GROUNDING PASS",
);
assert(validEval.grounding.status === "GROUNDED", "W: valid projected fixture GLOBAL GROUNDED");
assert(validEval.policyGate === "READY", "X: valid projected fixture POLICY READY");
assert(validEval.finalGate === "READY", "Y: valid projected fixture CONTENT READY");
const faqTraces = validEval.slotTraces.filter((item) => item.blockType === "FAQ");
assert(
  faqTraces.every(
    (item) =>
      (item.questionSemantic?.semanticResult === "PASS" || item.questionGrounding === "GROUNDED") &&
      item.answerGrounding === "GROUNDED",
  ),
  "N: FAQ question semantic PASS and answer grounded",
);

const takenDaily = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S002" ? { slotId: "S002", content: "taken daily" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(takenDaily.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "E: taken daily BLOCKED");
assert(hasUsageAuthorityLanguage("taken daily"), "E: taken daily is usage language");

const takeDaily = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S002" ? { slotId: "S002", content: "take daily" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(takeDaily.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "F: take daily BLOCKED");

const includes = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S005" ? { slotId: "S005", content: "includes antioxidants" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(includes.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "I: includes antioxidants BLOCKED");
assert(hasCompositionPromotionLanguage("includes antioxidants"), "I: class remains composition promotion");

const contains = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S005" ? { slotId: "S005", content: "contains antioxidants" } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(contains.structuralViolations.some((item) => item.code === "COMPOSITION_PROMOTION"), "J: contains antioxidants BLOCKED");

const editorial = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S003" ? { slotId: "S003", content: "A straightforward approach to joint wellness." } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(editorial.structuralViolations.some((item) => item.code === "EDITORIAL_EXPANSION"), "K: straightforward editorial BLOCKED");
assert(editorialExpansionClaims("A straightforward approach", "lubrication flexibility").length > 0, "K: editorial helper detects straightforward");

const convenient = evaluateSlotGeneration(
  wrap(validFills.slots.map((item) => (item.slotId === "S003" ? { slotId: "S003", content: "A convenient joint formula." } : item))),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(convenient.structuralViolations.some((item) => item.code === "EDITORIAL_EXPANSION"), "L: convenient editorial BLOCKED");

const resultsFaq = evaluateSlotGeneration(
  wrap(
    validFills.slots.map((item) =>
      item.slotId === "FAQ002"
        ? {
            slotId: "FAQ002",
            question: "What results expectations does Joint Genesis describe?",
            answer: "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises.",
          }
        : item,
    ),
  ),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(resultsFaq.structuralViolations.some((item) => item.code === "RESULTS_FRAMING"), "M: results expectations FAQ BLOCKED");
assert(resultsExpectationClaims("What results expectations does it describe?").length > 0, "M: results helper detects the framing");

const qFail = evaluateSlotGeneration(
  wrap(
    validFills.slots.map((item) =>
      item.slotId === "FAQ002"
        ? {
            slotId: "FAQ002",
            question: "What results expectations should buyers have?",
            answer: "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises.",
          }
        : item,
    ),
  ),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(qFail.finalGate === "BLOCKED", "O: FAQ question ungrounded/results framing is BLOCKED");

assert(
  projection.authorized.every((claim) => Boolean(claim.evidenceId) && Boolean(claim.sourceText) && Boolean(claim.claimId)),
  "P: projected claims retain original evidence trace",
);
assert(
  slotPlan.slots.every((slot) => slot.allowedClaimIds.length > 0 && slot.allowedEvidenceIds.length > 0),
  "P: slots consume projected claim IDs with original evidence IDs",
);

const prompt = buildPrompt({ productName: facts.productName, facts }).user;
assert(!prompt.toLowerCase().includes("take once each morning"), "model prompt hides take once each morning");
assert(!prompt.includes("Read the full refund policy"), "R: heuristic guarantee not in generation prompt");
assert(prompt.includes("PROJECTED CLAIMS") || /projected claims/i.test(prompt), "generation prompt consumes projected claims");

const beforePrompt = `${formatFactsForPrompt(facts)}\n${formatGenerationPlanForPrompt(plan)}`;
console.log("PROMPT_CHARS_BEFORE=" + beforePrompt.length);
console.log("PROMPT_CHARS_AFTER=" + prompt.length);
console.log(
  "CLAIM_COUNTS TOTAL=" +
    projection.claims.length +
    " AUTHORIZED=" +
    projection.authorized.length +
    " EXCLUDED=" +
    projection.excluded.length,
);
console.log("F002_PROJECTED=" + f002.filter((c) => c.generationAuthorized).map((c) => c.generationText).join(" | "));
console.log("F003_PROJECTED=" + f003.filter((c) => c.generationAuthorized).map((c) => c.generationText).join(" | "));
console.log("F004_PROJECTED=" + f004.filter((c) => c.generationAuthorized).map((c) => c.generationText).join(" | "));

const run07 = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/controlled-ready-07/2026-09-21-controlled-ready-07/generation-raw.json"), "utf8"),
) as { raw: string };
assert(run07.raw.includes("taken daily"), "RUN07 fixture unmodified still has taken daily");
assert(run07.raw.includes("take once each morning"), "RUN07 fixture unmodified still has take once");
assert(run07.raw.includes("straightforward daily approach"), "RUN07 fixture unmodified still has editorial S003");
assert(run07.raw.includes("results expectations"), "RUN07 fixture unmodified still has FAQ002 results framing");
const run07Eval = evaluateSlotGeneration(run07.raw, facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(run07Eval.structuralViolations.some((item) => item.code === "USAGE_PROMOTION" && /taken daily/i.test(item.text)), "RUN07 S002 taken daily FAIL");
assert(run07Eval.structuralViolations.some((item) => item.code === "EDITORIAL_EXPANSION"), "RUN07 S003 editorial FAIL");
assert(run07Eval.structuralViolations.some((item) => item.code === "USAGE_PROMOTION" && /take once each morning/i.test(item.text)), "RUN07 S005/S006 take once FAIL");
assert(run07Eval.structuralViolations.some((item) => item.code === "RESULTS_FRAMING"), "RUN07 FAQ002 results expectations FAIL");
assert(run07Eval.finalGate !== "READY", "RUN07 FINAL_RESULT=FAIL");
console.log("RUN07_OUTPUT_REPLAY FINAL_RESULT=FAIL");

assert(validateSlotFills(validFills.slots, slotPlan, facts).length === 0, "valid fills remain structurally clean");
console.log("MODEL_VISIBLE_CLOSED_CLAIMS=" + firewall.TOTAL_VISIBLE_CLOSED_CLAIMS);

function projectDescription(description: string) {
  const clone = thinFacts();
  clone.description = description;
  const nextPlan = createGenerationPlan(clone);
  const nextManifest = buildGenerationFactManifest(clone);
  const nextProjection = projectEvidenceClaims(clone, nextPlan, nextManifest);
  return { clone, nextPlan, nextManifest, nextProjection, visible: modelVisibleText(nextProjection) };
}

const normal = projectDescription("See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients.");
assert(
  /supports lubrication, flexibility and comfortable movement with five targeted ingredients/i.test(normal.visible),
  "PRECISION A: normal product description remains visible",
);

assert(!/\bdaily use\b/i.test(visible), "PRECISION B: daily use hidden when usage is closed");
assert(!/\bdaily use\b/i.test(f002Projected), "PRECISION B: daily use not in F002 projected text");

const guaranteePhrase = projectDescription(
  "See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients and a 180-day guarantee.",
);
assert(!/180-day guarantee/i.test(guaranteePhrase.visible), "PRECISION C: 180-day guarantee span hidden");
assert(
  guaranteePhrase.nextProjection.excluded.some(
    (claim) => claim.claimClass === "GUARANTEE_REFERENCE" && /180-day guarantee/i.test(claim.sourceText) && !claim.generationAuthorized,
  ),
  "PRECISION C: 180-day guarantee classified GUARANTEE_REFERENCE and unauthorized",
);

const refundPhrase = projectDescription(
  "See how Joint Genesis supports lubrication with five targeted ingredients and a 180-day refund.",
);
assert(!/180-day refund/i.test(refundPhrase.visible), "PRECISION D: 180-day refund span hidden");

const moneyBack = projectDescription(
  "See how Joint Genesis supports lubrication with five targeted ingredients and a money-back guarantee.",
);
assert(!/money-back guarantee/i.test(moneyBack.visible), "PRECISION E: money-back guarantee span hidden");

const returnWindow = projectDescription(
  "See how Joint Genesis supports lubrication with five targeted ingredients and a return window.",
);
assert(!/return window/i.test(returnWindow.visible), "PRECISION F: return window span hidden");

assert(!/180-day vendor/i.test(visible), "PRECISION G: ambiguous 180-day vendor hidden conservatively");
assert(!/180-day vendor/i.test(f002Projected), "PRECISION G: 180-day vendor not in F002 projected text");
assert(
  f002.some(
    (claim) =>
      claim.claimClass === "GUARANTEE_REFERENCE" &&
      /180-day vendor/i.test(claim.sourceText) &&
      !claim.generationAuthorized &&
      claim.generationText === "",
  ),
  "PRECISION G: 180-day vendor classified GUARANTEE_REFERENCE without reconstructed wording",
);

assert(JSON.stringify(facts) === JSON.stringify(storedFacts), "PRECISION H: original ProductFacts unchanged");
assert(facts.description === storedDescription, "PRECISION H: original description source text unchanged");
assert(JSON.stringify(manifest) === JSON.stringify(storedManifest), "PRECISION I: original Evidence Manifest unchanged");

const excludedVendor = f002.find(
  (claim) => claim.claimClass === "GUARANTEE_REFERENCE" && /180-day vendor/i.test(claim.sourceText),
);
assert(Boolean(excludedVendor), "PRECISION J: excluded claim trace exists");
assert(excludedVendor?.claimId.includes("F002"), "PRECISION J: claimId retained");
assert(excludedVendor?.evidenceId === "F002", "PRECISION J: evidenceId retained");
assert(excludedVendor?.field === "description", "PRECISION J: field retained");
assert(excludedVendor?.provenance === "DIRECT_SOURCE", "PRECISION J: provenance retained");
assert(excludedVendor?.claimClass === "GUARANTEE_REFERENCE", "PRECISION J: claimClass retained");
assert(excludedVendor?.generationAuthorized === false, "PRECISION J: generationAuthorized=false");
assert(/180-day vendor/i.test(excludedVendor?.sourceText || ""), "PRECISION J: original source span retained");

assert(firewall.ACTUAL_MODEL_TEXT_AUDITED === true, "PRECISION K: firewall audits actual model-facing text");
assert(firewall.GUARANTEE_VISIBLE === 0, "PRECISION K: GUARANTEE_VISIBLE=0 on real projection");
const poison: ClaimUnit = {
  claimId: "POISON:C001",
  evidenceId: "F002",
  field: "description",
  claimClass: "DESCRIPTION",
  sourceText: "180-day guarantee",
  generationText: "180-day guarantee",
  generationAuthorized: true,
  provenance: "DIRECT_SOURCE",
  semanticAuthority: "DESCRIPTION",
  compositionAuthority: false,
};
const poisonedFirewall = closedClaimFirewall({ ...projection, authorized: [...projection.authorized, poison] }, plan);
assert(poisonedFirewall.GUARANTEE_VISIBLE > 0, "PRECISION K: GUARANTEE_VISIBLE counts model-facing text not only claim metadata");
assert(plan.closedTopics.includes("guarantee"), "description guarantee-like wording does not open guarantee authority");
assert(facts.confidence.guaranteeInformation === "HEURISTIC_EXTRACTION", "guaranteeInformation provenance unchanged");

const generatedGuarantee = validateGrounding("Joint Genesis includes a 180-day guarantee.", facts);
assert(generatedGuarantee.status === "UNGROUNDED", "PRECISION L: generated 180-day guarantee without authority is UNGROUNDED");
assert(
  generatedGuarantee.unsupportedClaims.some((item) => /guarantee|refund/i.test(item.reason)),
  "PRECISION L: Grounding BLOCKED for 180-day guarantee without authority",
);

assert(validEval.finalGate === "READY", "PRECISION M: valid projected thin fixture CONTENT READY");
assert(firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "PRECISION M: MODEL_VISIBLE_CLOSED_CLAIMS=0");
assert(!prompt.toLowerCase().includes("180-day vendor"), "model prompt hides 180-day vendor");
assert(!prompt.toLowerCase().includes("daily use"), "model prompt hides daily use");

console.log("F002_ORIGINAL=" + storedDescription);
console.log("F002_PROJECTED=" + f002Projected);
console.log("DAILY_USE_VISIBLE=" + (/\bdaily use\b/i.test(visible) ? "YES" : "NO"));
console.log("180_DAY_VENDOR_VISIBLE=" + (/180-day vendor/i.test(visible) ? "YES" : "NO"));
console.log("GUARANTEE_REFERENCE_VISIBLE=" + (firewall.GUARANTEE_VISIBLE > 0 ? "YES" : "NO"));
console.log("USAGE_VISIBLE=" + firewall.USAGE_INSTRUCTION_VISIBLE);
console.log("GUARANTEE_VISIBLE=" + firewall.GUARANTEE_VISIBLE);
console.log("TOTAL_VISIBLE_CLOSED_CLAIMS=" + firewall.TOTAL_VISIBLE_CLOSED_CLAIMS);
console.log("ACTUAL_MODEL_TEXT_AUDITED=" + firewall.ACTUAL_MODEL_TEXT_AUDITED);
console.log("Todos os testes de claim-level evidence projection passaram.");
