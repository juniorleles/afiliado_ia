/**
 * Regression: the reference product's FAQ planning is unaffected by optional-slot omission.
 * Rebuilds the slot plan from the frozen facts and compares it with the accepted page copy.
 */
import { readFileSync } from "node:fs";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { deterministicFaqQuestion, validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";

let failed = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const stored = JSON.parse(
  readFileSync("data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json", "utf8"),
) as ProductFacts;
const accepted = JSON.parse(readFileSync("data/web-anatomy-lab/v1/controlled-rich-replay-v4/REPORT.json", "utf8")) as {
  FAQ_ITEMS: { FAQ_ID: string; QUESTION: string }[];
  GROUNDING: string;
  UNSUPPORTED_CLAIMS: number;
  POLICY: string;
  CONTENT_GATE: string;
};
const acceptedGeneration = JSON.parse(
  readFileSync("data/web-anatomy-lab/v1/controlled-rich-replay-v4/generation-raw.json", "utf8"),
) as { ctaLabel: string; fills: unknown[] };

const facts = applyGenericFaqRecovery(stored);
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
const faqSlots = slotPlan.slots.filter((slot) => slot.type === "FAQ");

assert(slotPlan.omitted.length === 0, "the reference product omits no slot");
assert(faqSlots.length === accepted.FAQ_ITEMS.length, `FAQ count unchanged (${faqSlots.length})`);
assert(
  faqSlots.map((slot) => slot.slotId).join(",") === accepted.FAQ_ITEMS.map((item) => item.FAQ_ID).join(","),
  "FAQ slot ids unchanged",
);

for (const [index, slot] of faqSlots.entries()) {
  const question = deterministicFaqQuestion(slot, facts.productName);
  const validation = question
    ? validateFaqQuestion({
        question,
        topic: slot.topic,
        field: slot.evidence[0]?.field,
        semanticAuthority: slot.semanticAuthority,
        authorizedTopics: [slot.topic],
        slotId: slot.slotId,
        closedTopics: plan.closedTopics,
        supportText: slot.evidence.map((item) => item.value).join("\n"),
        productName: facts.productName,
      })
    : null;
  assert(validation?.semanticResult === "PASS", `${slot.slotId} question still authorized`);
  assert(question === accepted.FAQ_ITEMS[index]?.QUESTION, `${slot.slotId} question copy unchanged`);
}

// The accepted content is never regenerated; revalidate it with today's validators.
const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: acceptedGeneration.ctaLabel }, slots: acceptedGeneration.fills }] },
  facts,
  facts.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(evaluation.grounding.status === accepted.GROUNDING, `grounding unchanged (${evaluation.grounding.status})`);
assert(evaluation.grounding.unsupportedClaims.length === accepted.UNSUPPORTED_CLAIMS, "unsupported-claim count unchanged");
assert(evaluation.policyGate === accepted.POLICY, `policy unchanged (${evaluation.policyGate})`);
assert(evaluation.finalGate === accepted.CONTENT_GATE, `content gate unchanged (${evaluation.finalGate})`);
assert(evaluation.structuralViolations.length === 0, "no structural violations appear");

console.log(`JOINT_GENESIS_FAQ_COUNT=${faqSlots.length}`);
if (failed) {
  console.error("REFERENCE_FAQ_REGRESSION=FAIL " + failed);
  process.exit(1);
}
console.log("REFERENCE_FAQ_REGRESSION=PASS");
