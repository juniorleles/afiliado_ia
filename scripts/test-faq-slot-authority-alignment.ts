// npx tsx scripts/test-faq-slot-authority-alignment.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { checkModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { hasUsageAuthorityLanguage } from "../src/lib/ai/generation-plan.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function ask(input: {
  question: string;
  topic: string;
  field: string;
  authority: string;
  support?: string;
}) {
  return validateFaqQuestion({
    question: input.question,
    topic: input.topic,
    field: input.field,
    semanticAuthority: input.authority,
    authorizedTopics: [input.topic],
    supportText: input.support || "",
    productName: "Product X",
    slotId: "FAQTEST",
  });
}

const a = ask({
  question: "How do I take Product X?",
  topic: "usage",
  field: "usageInformation",
  authority: "USAGE",
  support: "Take one capsule daily.",
});
assert(a.semanticResult === "PASS", "A: usage-authorized how-do-I-take PASS");

const b = ask({
  question: "How do I take Product X?",
  topic: "identity",
  field: "productName",
  authority: "IDENTITY",
  support: "Product X",
});
assert(b.semanticResult === "FAIL", "B: identity FAQ usage question FAIL");

const c = ask({
  question: "What is the return policy?",
  topic: "guarantee",
  field: "guaranteeInformation",
  authority: "GUARANTEE",
  support: "Seller publishes a 60-day return policy.",
});
assert(c.semanticResult === "PASS", "C: guarantee-authorized return-policy question PASS");

const d = ask({
  question: "What is the return policy?",
  topic: "description",
  field: "description",
  authority: "DESCRIPTION",
  support: "Designed for daily convenience.",
});
assert(d.semanticResult === "FAIL", "D: description FAQ return-policy question FAIL");

const e = ask({
  question: "What is the money-back guarantee?",
  topic: "guarantee",
  field: "guaranteeInformation",
  authority: "GUARANTEE",
  support: "60-day return policy.",
});
assert(e.semanticResult === "FAIL" && e.failCodes.includes("GUARANTEE_STRENGTHENING"), "E: money-back strengthening FAIL");

const f = ask({
  question: "How do I claim a full refund?",
  topic: "guarantee",
  field: "guaranteeInformation",
  authority: "GUARANTEE",
  support: "60-day return policy.",
});
assert(f.semanticResult === "FAIL" && f.failCodes.includes("GUARANTEE_STRENGTHENING"), "F: full-refund claim FAIL");

const g = ask({
  question: "Why is it simple to use?",
  topic: "usage",
  field: "usageInformation",
  authority: "USAGE",
  support: "Take one capsule daily.",
});
assert(g.semanticResult === "FAIL" && g.failCodes.includes("NEW_EVALUATION"), "G: usage editorial question FAIL");

const h = ask({
  question: "Who manufactures Product X?",
  topic: "features",
  field: "features",
  authority: "FEATURE_DESCRIPTION",
  support: "Supports mobility.",
});
assert(h.semanticResult === "FAIL", "H: feature FAQ manufacturer question FAIL");

const i = ask({
  question: "What is Product X?",
  topic: "identity",
  field: "productName",
  authority: "IDENTITY",
  support: "Product X",
});
assert(i.semanticResult === "PASS", "I: identity what-is PASS");

const identityGuarantee = ask({
  question: "What is the return policy?",
  topic: "identity",
  field: "productName",
  authority: "IDENTITY",
  support: "Product X",
});
assert(identityGuarantee.semanticResult === "FAIL", "identity FAQ guarantee question FAIL");

const identityIngredients = ask({
  question: "What ingredients are in Product X?",
  topic: "identity",
  field: "productName",
  authority: "IDENTITY",
  support: "Product X",
});
assert(identityIngredients.semanticResult === "FAIL", "identity FAQ ingredients question FAIL");

const jPass = ask({
  question: "What does Product X support?",
  topic: "features",
  field: "features",
  authority: "FEATURE_DESCRIPTION",
  support: "Product X supports mobility.",
});
assert(jPass.semanticResult === "PASS", "J: feature support question PASS when evidence supports it");

const jFail = ask({
  question: "What does Product X support?",
  topic: "features",
  field: "features",
  authority: "FEATURE_DESCRIPTION",
  support: "Absorbs quickly without residue.",
});
assert(jFail.semanticResult === "FAIL", "J: feature support question FAIL when evidence does not");

const featureUsage = ask({
  question: "How do I take Product X?",
  topic: "features",
  field: "features",
  authority: "FEATURE_DESCRIPTION",
  support: "Supports mobility.",
});
assert(featureUsage.semanticResult === "FAIL", "feature FAQ does not gain usage");

const featureGuarantee = ask({
  question: "What is the return policy?",
  topic: "features",
  field: "features",
  authority: "FEATURE_DESCRIPTION",
  support: "Supports mobility.",
});
assert(featureGuarantee.semanticResult === "FAIL", "feature FAQ does not gain guarantee");

const storedFacts = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
    "utf8",
  ),
) as ProductFacts;
const recovered = applyGenericFaqRecovery(storedFacts);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const storedRaw = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/web-anatomy-lab/v1/slot-projection-isolation/generation-raw.json"), "utf8"),
) as { fills: SlotFill[]; ctaLabel: string };

const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: storedRaw.ctaLabel }, slots: storedRaw.fills }] },
  recovered,
  recovered.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);

function faq(slotId: string) {
  return evaluation.slotTraces.find((item) => item.slotId === slotId);
}

const faq003 = faq("FAQ003");
const faq004 = faq("FAQ004");
const faq001 = slotPlan.slots.find((slot) => slot.slotId === "FAQ001");
const faq002 = slotPlan.slots.find((slot) => slot.slotId === "FAQ002");
assert(faq003?.declaredFields?.includes("usageInformation") || faq003?.topic === "usage", "FAQ003 authority is usage");
assert(faq003?.questionSemantic?.semanticResult === "PASS", "FAQ003_QUESTION_SEMANTICS=PASS");
assert(faq003?.answerGrounding === "GROUNDED", "FAQ003 answer grounding GROUNDED");
assert(faq004?.topic === "guarantee", "FAQ004 authority topic is guarantee");
assert(faq004?.declaredFields?.includes("guaranteeInformation"), "FAQ004 field is guaranteeInformation");
assert(faq004?.questionSemantic?.semanticResult === "PASS", "FAQ004_QUESTION_SEMANTICS=PASS");
assert(faq004?.answerGrounding === "GROUNDED", "FAQ004 answer grounding GROUNDED");

assert(Boolean(faq001 && faq002), "FAQ001 and FAQ002 exist");
const leakUsage = validateFaqQuestion({
  question: "How do I take Joint Genesis?",
  topic: faq001!.topic,
  field: faq001!.evidence[0]?.field,
  semanticAuthority: faq001!.semanticAuthority,
  authorizedTopics: [faq001!.topic],
  supportText: faq001!.evidence.map((item) => item.value).join(" "),
  productName: recovered.productName,
  slotId: faq001!.slotId,
});
const leakGuarantee = validateFaqQuestion({
  question: "What is the return policy?",
  topic: faq001!.topic,
  field: faq001!.evidence[0]?.field,
  semanticAuthority: faq001!.semanticAuthority,
  authorizedTopics: [faq001!.topic],
  supportText: faq001!.evidence.map((item) => item.value).join(" "),
  productName: recovered.productName,
  slotId: faq001!.slotId,
});
assert(leakUsage.semanticResult === "FAIL", "FAQ001 usage leak BLOCKED");
assert(leakGuarantee.semanticResult === "FAIL", "FAQ001 guarantee leak BLOCKED");

const featureUsageLeak = validateFaqQuestion({
  question: "How do I take Joint Genesis?",
  topic: faq002!.topic,
  field: faq002!.evidence[0]?.field,
  semanticAuthority: faq002!.semanticAuthority,
  authorizedTopics: [faq002!.topic],
  supportText: faq002!.evidence.map((item) => item.value).join(" "),
  productName: recovered.productName,
  slotId: faq002!.slotId,
});
const featureGuaranteeLeak = validateFaqQuestion({
  question: "What is the return policy?",
  topic: faq002!.topic,
  field: faq002!.evidence[0]?.field,
  semanticAuthority: faq002!.semanticAuthority,
  authorizedTopics: [faq002!.topic],
  supportText: faq002!.evidence.map((item) => item.value).join(" "),
  productName: recovered.productName,
  slotId: faq002!.slotId,
});
assert(featureUsageLeak.semanticResult === "FAIL", "FAQ002 usage leak BLOCKED");
assert(featureGuaranteeLeak.semanticResult === "FAIL", "FAQ002 guarantee leak BLOCKED");

const f14 = checkModelWordingConstraint({
  generated:
    "The seller offers a 180-day return policy measured from the order date, providing customers with an extended window to evaluate the product and request a refund if needed.",
  support: "The seller publishes a 180-day return policy measured from the order date.",
  slotId: "S007",
  field: "guaranteeInformation",
});
assert(f14.violations.some((item) => item.violationType === "NEW_POLICY_RIGHT"), "F14 policy strengthening remains BLOCKED");

const directions = hasUsageAuthorityLanguage(
  "supports joint health from several complementary directions",
);
assert(!directions, "F10 complementary directions is not usage solely from the token");
assert(hasUsageAuthorityLanguage("usage directions"), "usage-sense directions remain detected");

console.log("ANTHROPIC_CALLS=0");
console.log("FAQ003_AUTHORITY=usageInformation");
console.log("FAQ003_QUESTION_SEMANTICS=" + faq003?.questionSemantic?.semanticResult);
console.log("FAQ003_ANSWER_GROUNDING=" + faq003?.answerGrounding);
console.log("FAQ004_AUTHORITY=guaranteeInformation");
console.log("FAQ004_QUESTION_SEMANTICS=" + faq004?.questionSemantic?.semanticResult);
console.log("FAQ004_ANSWER_GROUNDING=" + faq004?.answerGrounding);
console.log("FAQ_LOCAL_AUTHORITY=PASS");
console.log("Todos os testes de FAQ slot authority alignment passaram.");
