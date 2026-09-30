/**
 * ENTITY_ONLY proposition contract. Fictional products only.
 * A bare label authorizes the label, never a predicate about it, and the FAQ
 * question for an entity-only slot must be answerable by the label alone.
 */
import { readFileSync } from "node:fs";
import {
  evidenceTextShape,
  formatAuthorizedPropositionsForPrompt,
  propositionShape,
  propositionsForSlot,
  validatePropositionBindings,
} from "../src/lib/ai/authorized-propositions.ts";
import { createEvidenceSlotPlan, formatEvidenceSlotPlanForPrompt, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { deterministicFaqQuestion, validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import { buildGenerationFactManifest, emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";

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
  description: string;
  features: string[];
  ingredients: string[];
  usage: string[];
  guarantee: string;
};

function factsOf(fixture: Fixture): ProductFacts {
  const base = emptyProductFacts(fixture.productName, "https://seller.example/offer", "IMPORTED");
  return {
    ...base,
    description: fixture.description,
    features: fixture.features,
    ingredientsOrComponents: fixture.ingredients,
    usageInformation: fixture.usage,
    guaranteeInformation: fixture.guarantee,
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      description: "DIRECT_SOURCE",
      features: "DIRECT_SOURCE",
      ingredientsOrComponents: "DIRECT_SOURCE",
      usageInformation: "DIRECT_SOURCE",
      guaranteeInformation: "DIRECT_SOURCE",
    },
    importQuality: "SUFFICIENT",
  };
}

function build(fixture: Fixture) {
  const facts = factsOf(fixture);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  return { facts, plan, manifest, projection, slotPlan };
}

const entityFixture: Fixture = {
  productName: "Zephyra",
  description: "Zephyra is a daily lozenge described for routine oral care.",
  features: ["Each carton holds thirty lozenges."],
  ingredients: ["Zephyrium Complex", "Calmora Root"],
  usage: ["Chew one lozenge each morning."],
  guarantee: "The seller publishes a 90-day return policy measured from the order date.",
};

const entity = build(entityFixture);
assert(entity.plan.generationRoute === "MODEL", "the fixture routes through MODEL, so the slot contract is exercised");

const ingredientFaq = entity.slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "ingredients") as EvidenceSlot;
const usageFaq = entity.slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "usage") as EvidenceSlot;
assert(Boolean(ingredientFaq) && Boolean(usageFaq), "the fixture plans both an entity-only and a statement FAQ");

function ask(slot: EvidenceSlot, question: string, facts: ProductFacts, closedTopics: readonly string[]) {
  return validateFaqQuestion({
    question,
    topic: slot.topic,
    field: slot.evidence[0]?.field,
    semanticAuthority: slot.semanticAuthority,
    authorizedTopics: [slot.topic],
    slotId: slot.slotId,
    closedTopics,
    supportText: slot.evidence.map((item) => item.value).join("\n"),
    productName: facts.productName,
  });
}

function sourceFill(slot: EvidenceSlot, facts: ProductFacts) {
  const ids = propositionsForSlot(slot).map((item) => item.propositionId);
  const wording = slot.evidence.map((item) => item.value.trim()).join(" ");
  if (slot.type === "FAQ") {
    return {
      slotId: slot.slotId,
      question: deterministicFaqQuestion(slot, facts.productName) || undefined,
      answerPropositions: [{ propositionIds: ids, wording }],
    };
  }
  return { slotId: slot.slotId, propositions: [{ propositionIds: ids, wording }] };
}

/** Fills every slot with its own evidence, then replaces one FAQ answer. */
function evaluateWithAnswer(target: EvidenceSlot, wording: string, propositionIds?: string[]) {
  const fills = entity.slotPlan.slots.map((slot) => {
    if (slot.slotId !== target.slotId) return sourceFill(slot, entity.facts);
    const ids = propositionIds ?? propositionsForSlot(slot).map((item) => item.propositionId);
    return {
      slotId: slot.slotId,
      question: deterministicFaqQuestion(slot, entity.facts.productName) || undefined,
      answerPropositions: [{ propositionIds: ids, wording }],
    };
  });
  return evaluateSlotGeneration(
    { variants: [{ cta: { label: "Learn More" }, slots: fills }] },
    entity.facts,
    entity.facts.productName,
    VALIDATION_SAFE_AFFILIATE,
    entity.slotPlan,
  );
}

function blocked(evaluation: ReturnType<typeof evaluateSlotGeneration>, wording: string): boolean {
  const ungrounded = evaluation.grounding.unsupportedClaims.some((item) => wording.toLowerCase().includes(item.claim.toLowerCase().replace(/[.]$/, "")) || item.claim.toLowerCase().includes(wording.toLowerCase().replace(/[.]$/, "")));
  const structural = evaluation.structuralViolations.some((item) => item.text.toLowerCase().includes(wording.toLowerCase().slice(0, 24)));
  return ungrounded || structural;
}

// CASE A — a single entity proposition is answerable by the entity alone.
const entityPropositions = propositionsForSlot(ingredientFaq);
assert(entityPropositions.length === 1 && entityPropositions[0]?.shape === "ENTITY_ONLY", "a bare label is classified ENTITY_ONLY");
const entityQuestion = deterministicFaqQuestion(ingredientFaq, entity.facts.productName) as string;
assert(entityQuestion === "Which ingredient is listed?", `the entity-only FAQ asks for a listed item (${entityQuestion})`);
assert(!/described/i.test(entityQuestion), "the question no longer invites a described-predicate answer");
assert(ask(ingredientFaq, entityQuestion, entity.facts, entity.plan.closedTopics).semanticResult === "PASS", "the entity question passes FAQ semantics");
const caseA = evaluateWithAnswer(ingredientFaq, "Zephyrium Complex");
assert(caseA.grounding.status === "GROUNDED", `an entity-only answer is grounded (${caseA.grounding.status})`);
assert(caseA.structuralViolations.length === 0, "an entity-only answer raises no structural violation");

// CASE B — an invented meta predicate stays blocked.
const caseB = evaluateWithAnswer(ingredientFaq, "Zephyrium Complex is described.");
assert(blocked(caseB, "Zephyrium Complex is described"), "an invented meta predicate is blocked");

// CASE C — composition over an entity the composition field does not list stays blocked.
// Containment over a copy-eligible ingredient is independently authorized by that field,
// so the line that must fail is the one whose entity is not in it.
const caseC = evaluateWithAnswer(ingredientFaq, "Zephyra contains Gammaflor.");
assert(blocked(caseC, "Zephyra contains Gammaflor"), "composition over an unlisted entity is blocked");
const caseCEvaluative = evaluateWithAnswer(ingredientFaq, "Zephyrium Complex is the main.");
assert(blocked(caseCEvaluative, "Zephyrium Complex is the main"), "an invented importance predicate is blocked");

// CASE D — two entities may appear when each one is cited.
const twoEntities: EvidenceSlot = {
  ...ingredientFaq,
  slotId: "FAQ_TWO",
  allowedEvidenceIds: [],
  allowedClaimIds: [],
  evidence: [],
};
const ingredientSlots = entity.slotPlan.slots.filter((slot) => slot.type === "INGREDIENTS");
assert(ingredientSlots.length === 2, "the fixture projects one slot per listed ingredient");
twoEntities.evidence = ingredientSlots.flatMap((slot) => slot.evidence);
twoEntities.allowedEvidenceIds = twoEntities.evidence.map((item) => item.id);
twoEntities.allowedClaimIds = ingredientSlots.flatMap((slot) => slot.allowedClaimIds);
const twoIds = propositionsForSlot(twoEntities).map((item) => item.propositionId);
assert(twoIds.length === 2, "both entities are citable in that slot");
const caseD = validatePropositionBindings({
  fill: { slotId: twoEntities.slotId, answerPropositions: [{ propositionIds: twoIds, wording: "Zephyrium Complex and Calmora Root" }] },
  slot: twoEntities,
  slots: [...entity.slotPlan.slots, twoEntities],
  plan: entity.plan,
  productName: entity.facts.productName,
});
assert(caseD.length === 0, "a list of separately cited entities binds cleanly");

// CASE E — an entity that is not authorized stays blocked.
const caseE = evaluateWithAnswer(ingredientFaq, "Zephyrium Complex and Gammaflor");
assert(blocked(caseE, "Zephyrium Complex and Gammaflor"), "an unauthorized extra entity is blocked");

// CASE F — statement realization is unchanged.
assert(propositionsForSlot(usageFaq)[0]?.shape === "STATEMENT", "a sentence proposition stays STATEMENT");
const usageQuestion = deterministicFaqQuestion(usageFaq, entity.facts.productName) as string;
assert(usageQuestion === `How do you take ${entity.facts.productName}?`, `the statement FAQ keeps its question (${usageQuestion})`);
const caseF = evaluateWithAnswer(usageFaq, "Chew one lozenge each morning.");
assert(caseF.grounding.status === "GROUNDED", "a statement answer is still grounded");

// CASE G — a mixed slot keeps every proposition under its own shape.
const mixed: EvidenceSlot = {
  ...usageFaq,
  slotId: "FAQ_MIXED",
  evidence: [...ingredientFaq.evidence, ...usageFaq.evidence],
  allowedEvidenceIds: [...ingredientFaq.allowedEvidenceIds, ...usageFaq.allowedEvidenceIds],
  allowedClaimIds: [...ingredientFaq.allowedClaimIds, ...usageFaq.allowedClaimIds],
};
const mixedShapes = propositionsForSlot(mixed).map((item) => item.shape);
assert(mixedShapes.includes("ENTITY_ONLY") && mixedShapes.includes("STATEMENT"), "a mixed slot reports both shapes");
const mixedPrompt = formatEvidenceSlotPlanForPrompt({ ...entity.slotPlan, slots: [mixed] });
assert(/answerShape=MIXED/.test(mixedPrompt), "the prompt marks the mixed slot as MIXED");
assert(
  deterministicFaqQuestion(mixed, entity.facts.productName) === `How do you take ${entity.facts.productName}?`,
  "a mixed slot does not get the entity question",
);

// CASE H — the same shapes with different fictional names behave identically.
const otherFixture: Fixture = {
  productName: "Lunaria",
  description: "Lunaria is a daily lozenge described for routine oral care.",
  features: ["Each carton holds thirty lozenges."],
  ingredients: ["Orvexa Blend", "Selunar Root"],
  usage: ["Chew one lozenge each morning."],
  guarantee: "The seller publishes a 90-day return policy measured from the order date.",
};
const other = build(otherFixture);
const otherIngredientFaq = other.slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "ingredients") as EvidenceSlot;
assert(
  deterministicFaqQuestion(otherIngredientFaq, other.facts.productName) === entityQuestion,
  "the entity question is identical for a different product",
);
assert(
  JSON.stringify(propositionsForSlot(otherIngredientFaq).map((item) => item.shape)) ===
    JSON.stringify(entityPropositions.map((item) => item.shape)),
  "shape classification is identical for a different product",
);
assert(
  other.slotPlan.slots.map((slot) => `${slot.type}:${slot.topic}`).join(",") ===
    entity.slotPlan.slots.map((slot) => `${slot.type}:${slot.topic}`).join(","),
  "planner behavior is identical for a different product",
);

// A statement-shaped composition field keeps the original question wording.
const sentenceIngredients = build({
  ...entityFixture,
  ingredients: ["The label lists a proprietary blend of four plants."],
});
const sentenceFaq = sentenceIngredients.slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "ingredients") as EvidenceSlot;
assert(
  deterministicFaqQuestion(sentenceFaq, sentenceIngredients.facts.productName) === "What ingredients are described?",
  "a sentence-shaped composition field keeps the existing question",
);

// The contract is visible to the model before generation.
const propositionPrompt = formatAuthorizedPropositionsForPrompt(entity.slotPlan.slots);
const slotPrompt = formatEvidenceSlotPlanForPrompt(entity.slotPlan);
assert(/shape=ENTITY_ONLY/.test(propositionPrompt), "the proposition list states the shape of each unit");
assert(/does not have to be a sentence/i.test(propositionPrompt), "the prompt allows a bare entity answer");
assert(/never add a predicate/i.test(propositionPrompt), "the prompt forbids an invented predicate");
assert(/answerShape=ENTITY_ONLY/.test(slotPrompt), "the slot plan marks entity-only slots");

// Shape classification is structural, not lexical bookkeeping about a product.
assert(propositionShape("Peppermint") === "ENTITY_ONLY", "a one-word label is entity-only");
assert(propositionShape("B.lactis BL-04®") === "ENTITY_ONLY", "an abbreviation dot is not a clause boundary");
assert(propositionShape("Take one capsule daily.") === "STATEMENT", "a full stop marks a statement");
assert(propositionShape("The carton is sealed") === "STATEMENT", "a copula marks a statement");
assert(evidenceTextShape("Zephyra supports lubrication and flexibility") === "STATEMENT", "a supports relation is a statement");

const sources = [
  readFileSync("src/lib/ai/authorized-propositions.ts", "utf8"),
  readFileSync("src/lib/ai/faq-question-semantics.ts", "utf8"),
];
assert(
  sources.every((source) => !/(?:prodentim|joint[\s-]?genesis|lactobacillus|zephyr|lunaria)/i.test(source)),
  "the contract names no product, brand, or ingredient",
);

if (failed) {
  console.error("ENTITY_ONLY_FAQ_CONTRACT=FAIL " + failed);
  process.exit(1);
}
console.log("ENTITY_ONLY_FAQ_CONTRACT=PASS");
