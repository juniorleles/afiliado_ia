import { readFileSync } from "node:fs";
import {
  blockingSlotOmissions,
  createEvidenceSlotPlan,
  formatEvidenceSlotPlanForPrompt,
  type EvidenceSlotPlan,
} from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";

let failed = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

type Fixture = {
  productName: string;
  guarantee?: string;
  usage?: string[];
  ingredients?: string[];
  description?: string;
};

function facts(fixture: Fixture): ProductFacts {
  const base = emptyProductFacts(fixture.productName, "https://seller.example/offer", "IMPORTED");
  const snippets: ProductFacts["sourceSnippets"] = [
    { field: "productName", text: fixture.productName, sourceUrl: base.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];
  const next: ProductFacts = {
    ...base,
    ingredientsOrComponents: fixture.ingredients ?? [],
    usageInformation: fixture.usage ?? [],
    sourceSnippets: snippets,
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      ingredientsOrComponents: fixture.ingredients?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      usageInformation: fixture.usage?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      guaranteeInformation: fixture.guarantee ? "DIRECT_SOURCE" : "NOT_FOUND",
      description: fixture.description ? "DIRECT_SOURCE" : "NOT_FOUND",
    },
    importQuality: "SUFFICIENT",
  };
  if (fixture.guarantee) {
    next.guaranteeInformation = fixture.guarantee;
    snippets.push({ field: "guaranteeInformation", text: fixture.guarantee, sourceUrl: base.sourceUrl, confidence: "DIRECT_SOURCE" });
  }
  if (fixture.description) {
    next.description = fixture.description;
    snippets.push({ field: "description", text: fixture.description, sourceUrl: base.sourceUrl, confidence: "DIRECT_SOURCE" });
  }
  for (const item of fixture.usage ?? []) {
    snippets.push({ field: "usageInformation", text: item, sourceUrl: base.sourceUrl, confidence: "DIRECT_SOURCE" });
  }
  for (const item of fixture.ingredients ?? []) {
    snippets.push({ field: "ingredientsOrComponents", text: item, sourceUrl: base.sourceUrl, confidence: "DIRECT_SOURCE" });
  }
  return next;
}

function planFor(fixture: Fixture): EvidenceSlotPlan {
  const productFacts = facts(fixture);
  return createEvidenceSlotPlan(productFacts, createGenerationPlan(productFacts));
}

const faqTopics = (plan: EvidenceSlotPlan) => plan.slots.filter((slot) => slot.type === "FAQ").map((slot) => slot.topic);
const omittedTopics = (plan: EvidenceSlotPlan) => plan.omitted.map((slot) => `${slot.topic}:${slot.reasonCode}`);

const PROMOTIONAL_GUARANTEE = "Your order today is covered by our iron-clad 60-day 100% money-back guarantee.";
const RETURN_POLICY = "The seller publishes a 180-day return policy measured from the order date.";
const REFUND_POLICY = "The seller publishes a 45-day refund policy for unopened units.";
const USAGE = ["Take one tablet each morning."];
const INGREDIENTS = ["Lactic ferment blend", "Peppermint", "Inulin"];

// CASE A — optional FAQ with an authorized deterministic question is included.
const caseA = planFor({ productName: "Northwind Daily", usage: USAGE, ingredients: INGREDIENTS });
assert(faqTopics(caseA).includes("usage"), "an authorized optional FAQ is included");
assert(!caseA.omitted.some((slot) => slot.topic === "usage"), "an included FAQ is not also recorded as omitted");

// CASE B — optional FAQ with no authorized deterministic question is omitted, not fatal.
const caseB = planFor({ productName: "Northwind Daily", usage: USAGE, ingredients: INGREDIENTS, guarantee: PROMOTIONAL_GUARANTEE });
assert(!faqTopics(caseB).includes("guarantee"), "an unauthorized optional FAQ is not planned");
assert(
  caseB.omitted.some((slot) => slot.topic === "guarantee" && slot.reasonCode === "NO_AUTHORIZED_DETERMINISTIC_REALIZATION" && slot.required === false && slot.status === "OMITTED"),
  "the omitted optional FAQ is auditable with a generic reason code",
);
assert(blockingSlotOmissions(caseB).length === 0, "an optional omission does not block");

// CASE C — a required slot with no authorized realization is reported as blocking.
const requiredOmission: EvidenceSlotPlan = {
  slots: [],
  requiredSlotIds: [],
  optionalSlotIds: [],
  omitted: [{ slotId: "S001", type: "HEADLINE", topic: "identity", required: true, status: "OMITTED", reasonCode: "NO_AUTHORIZED_EVIDENCE" }],
};
assert(blockingSlotOmissions(requiredOmission).length === 1, "a required omission blocks");

// CASE D — several optional FAQs, one unauthorized.
assert(faqTopics(caseB).length >= 2, "authorized FAQs survive alongside an omitted one");
assert(caseB.omitted.filter((slot) => slot.type === "FAQ").length === 1, "exactly the unauthorized FAQ is omitted");

// CASE E — every optional FAQ unauthorized leaves no FAQ slot and no block.
const caseE = planFor({ productName: "Northwind Daily", guarantee: PROMOTIONAL_GUARANTEE });
assert(faqTopics(caseE).length === 0, "no FAQ slot survives when none is authorized");
assert(blockingSlotOmissions(caseE).length === 0, "an empty FAQ section is not a page-level failure");

// CASE F — product name does not change planning.
const renamed = planFor({ productName: "Other Label", usage: USAGE, ingredients: INGREDIENTS, guarantee: PROMOTIONAL_GUARANTEE });
assert(JSON.stringify(faqTopics(renamed)) === JSON.stringify(faqTopics(caseB)), "planned FAQ topics do not depend on the product name");
assert(JSON.stringify(omittedTopics(renamed)) === JSON.stringify(omittedTopics(caseB)), "omissions do not depend on the product name");

// CASE G — promotional guarantee wording never produces a policy question.
const caseGQuestions = caseB.slots.filter((slot) => slot.type === "FAQ").map((slot) => slot.topic);
assert(!caseGQuestions.includes("guarantee"), "promotional guarantee wording produces no policy question");

// CASE H — supported refund-policy evidence still authorizes its question.
const caseH = planFor({ productName: "Northwind Daily", usage: USAGE, guarantee: REFUND_POLICY });
assert(faqTopics(caseH).includes("guarantee"), "refund-policy evidence still authorizes the guarantee FAQ");

// CASE I — supported return-policy evidence still authorizes its question.
const caseI = planFor({ productName: "Northwind Daily", usage: USAGE, guarantee: RETURN_POLICY });
assert(faqTopics(caseI).includes("guarantee"), "return-policy evidence still authorizes the guarantee FAQ");

// The model boundary: omitted slots never reach the prompt.
const prompt = formatEvidenceSlotPlanForPrompt(caseB);
assert(
  caseB.omitted.every((slot) => !prompt.includes(slot.slotId)),
  "an omitted slot is not sent to the model",
);

const planner = readFileSync("src/lib/ai/evidence-slot-plan.ts", "utf8");
assert(!/joint[\s-]?genesis|prodentim|money[\s-]?back/i.test(planner), "the planner has no product-specific branching identifier");

if (failed) {
  console.error("OPTIONAL_SLOT_SEMANTICS=FAIL " + failed);
  process.exit(1);
}
console.log("OPTIONAL_SLOT_SEMANTICS=PASS");
