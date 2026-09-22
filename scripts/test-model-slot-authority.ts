// npx tsx scripts/test-model-slot-authority.ts
import { emptyProductFacts, buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { namedIngredientMentions } from "../src/lib/ai/ingredient-claims.ts";
import {
  createModelSlotAuthority,
  identityUsedAsComposition,
  validateModelSlotAuthority,
} from "../src/lib/ai/model-slot-authority.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function richFacts() {
  const facts = emptyProductFacts("SampleProduct", "https://example.com/sample", "IMPORTED");
  facts.description = "Daily oral care tablet.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Supports gum health."];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["IngredientX", "IngredientY"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["Take two capsules daily."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.confidence.cautions = "NOT_FOUND";
  facts.confidence.pricingInformation = "NOT_FOUND";
  facts.confidence.guaranteeInformation = "NOT_FOUND";
  facts.confidence.manufacturer = "NOT_FOUND";
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function slot(partial: Partial<EvidenceSlot> & Pick<EvidenceSlot, "type" | "topic" | "semanticAuthority" | "evidence">): EvidenceSlot {
  return {
    slotId: partial.slotId || "S100",
    type: partial.type,
    topic: partial.topic,
    allowedEvidenceIds: partial.allowedEvidenceIds || partial.evidence.map((item) => item.id),
    allowedClaimIds: partial.allowedClaimIds || ["C001"],
    evidence: partial.evidence,
    maxWords: partial.maxWords || 80,
    required: partial.required ?? true,
    semanticAuthority: partial.semanticAuthority,
    preserveSemanticRelationships: true,
  };
}

const facts = richFacts();
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
assert(plan.generationRoute === "MODEL", "RICH sample uses MODEL route");
assert(plan.thinMode === false, "MODEL route is not DETERMINISTIC_THIN");

const identitySlot = slot({
  type: "HEADLINE",
  topic: "identity",
  semanticAuthority: "IDENTITY",
  evidence: [{ id: "F001", field: "productName", value: "SampleProduct" }],
});
const featureSlot = slot({
  type: "FEATURE",
  topic: "features",
  semanticAuthority: "FEATURE_DESCRIPTION",
  evidence: [{ id: "F003", field: "features", value: "Supports gum health." }],
});
const usageSlot = slot({
  type: "USAGE",
  topic: "usage",
  semanticAuthority: "USAGE",
  evidence: [{ id: "F010", field: "usageInformation", value: "Take two capsules daily." }],
});
const ingredientSlot = slot({
  type: "INGREDIENTS",
  topic: "ingredients",
  semanticAuthority: "INGREDIENTS",
  evidence: [
    { id: "F004", field: "ingredientsOrComponents", value: "Contains ingredient X." },
    { id: "F005", field: "ingredientsOrComponents", value: "Supports Y." },
  ],
});
const descriptionSlot = slot({
  type: "OVERVIEW",
  topic: "description",
  semanticAuthority: "DESCRIPTION",
  evidence: [{ id: "F002", field: "description", value: "Daily oral care tablet." }],
});
const compressSlot = slot({
  type: "INGREDIENTS",
  topic: "ingredients",
  semanticAuthority: "INGREDIENTS",
  evidence: [
    { id: "F006", field: "ingredientsOrComponents", value: "Lactobacillus Paracasei" },
    { id: "F007", field: "ingredientsOrComponents", value: "Lactobacillus Reuteri" },
  ],
});

const aHits = validateModelSlotAuthority({
  copy: "Ingredients include SampleProduct",
  slot: identitySlot,
  plan,
  productName: "SampleProduct",
});
assert(aHits.some((item) => item.code === "IDENTITY_AS_COMPOSITION"), "A: identity → ingredient promotion FAIL");
assert(identityUsedAsComposition("Ingredients include SampleProduct", "SampleProduct"), "A: identityUsedAsComposition detects include-form");

const bHits = validateModelSlotAuthority({
  copy: "The manufacturer recommends taking two capsules daily.",
  slot: usageSlot,
  plan,
  productName: "SampleProduct",
});
assert(bHits.some((item) => item.code === "ATTRIBUTION_AUTHORITY"), "B: usage → manufacturer attribution FAIL");

const cHits = validateModelSlotAuthority({
  copy: "Ingredient X supports Y.",
  slot: ingredientSlot,
  plan,
  productName: "SampleProduct",
});
assert(cHits.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION"), "C: invented relationship FAIL");

const dHits = validateModelSlotAuthority({
  copy: "A straightforward five-ingredient formula.",
  slot: slot({
    type: "INGREDIENTS",
    topic: "ingredients",
    semanticAuthority: "INGREDIENTS",
    evidence: [{ id: "F008", field: "ingredientsOrComponents", value: "Contains five ingredients." }],
  }),
  plan,
  productName: "SampleProduct",
});
assert(dHits.some((item) => item.code === "EDITORIAL_EXPANSION" || item.code === "SEMANTIC_CLOSURE"), "D: editorial characterization FAIL");

const eHits = validateModelSlotAuthority({
  copy: "Take one capsule daily.",
  slot: featureSlot,
  plan,
  productName: "SampleProduct",
});
assert(eHits.some((item) => item.code === "USAGE_PROMOTION"), "E: field promotion dosage FAIL");

const fHits = validateModelSlotAuthority({
  copy: "This product has a 60-day money-back guarantee.",
  slot: featureSlot,
  plan,
  productName: "SampleProduct",
});
assert(fHits.some((item) => item.code === "GUARANTEE_PROMOTION"), "F: guarantee promotion FAIL");

const gHits = validateModelSlotAuthority({
  copy: "The manufacturer is Acme Labs.",
  slot: featureSlot,
  plan,
  productName: "SampleProduct",
});
assert(gHits.some((item) => item.code === "CLOSED_TOPIC"), "G: manufacturer promotion FAIL");

const hHits = validateModelSlotAuthority({
  copy: "Designed to support gum health.",
  slot: featureSlot,
  plan,
  productName: "SampleProduct",
});
assert(
  hHits.length === 0,
  "H: conservative paraphrase PASS (designed-to-support is a hedge of Supports when the object is unchanged)",
);

const iHits = validateModelSlotAuthority({
  copy: "Lactobacillus Paracasei and Lactobacillus Reuteri.",
  slot: compressSlot,
  plan,
  productName: "SampleProduct",
});
assert(iHits.length === 0, "I: same-field compression without a new relationship PASS");

const jHits = validateModelSlotAuthority({
  copy: "IngredientX supports daily oral care.",
  slot: descriptionSlot,
  plan,
  productName: "SampleProduct",
});
assert(
  jHits.some((item) => item.code === "COMPOSITION_PROMOTION" || item.code === "UNSUPPORTED_RELATIONAL_EXPANSION"),
  "J: cross-field synthesis FAIL",
);

const identityFills: SlotFill[] = slotPlan.slots.map((item) => {
  if (item.type === "HEADLINE") return { slotId: item.slotId, content: "Ingredients include SampleProduct" };
  if (item.type === "FAQ") return { slotId: item.slotId, question: "What is listed?", answer: item.evidence[0]?.value || "SampleProduct" };
  return { slotId: item.slotId, content: item.evidence.map((row) => row.value).join(" ") };
});
assert(
  validateSlotFills(identityFills, slotPlan, facts).some((item) => item.code === "IDENTITY_AS_COMPOSITION"),
  "A: validateSlotFills identity promotion FAIL",
);

const prompt = buildPrompt({ productName: facts.productName, facts, targetApproach: "REVIEW" });
assert(prompt.system.includes("CODE owns authority") || prompt.user.includes("CODE owns meaning"), "MODEL prompt states code owns authority");
assert(!/SOURCE FACTS/i.test(prompt.user.split("STRATEGY CONTEXT")[0] || prompt.user) || prompt.user.includes("Raw ProductFacts are not visible"), "MODEL prompt does not dump raw ProductFacts bag");
assert(prompt.user.includes("IngredientX"), "projected ingredient remains visible inside assigned slot authority");
assert(prompt.user.includes("If a field is absent, do not infer it"), "absence contract remains");
assert(slotPlan.slots.filter((item) => item.type === "INGREDIENTS").length === 2, "MODEL splits ingredient slots by evidence item");
assert(!slotPlan.slots.some((item) => item.type === "HEADLINE" && item.evidence.some((row) => row.field === "description")), "MODEL headline does not mix identity with description");
assert(slotPlan.slots.every((item) => createModelSlotAuthority(item, plan).allowedClaimIds.length > 0), "every MODEL slot has assigned claim IDs");

const faqFail = validateFaqQuestion({
  question: "Why are these ingredients effective?",
  topic: "ingredients",
  closedTopics: plan.closedTopics,
  supportText: "IngredientX",
  productName: facts.productName,
});
assert(faqFail.semanticResult === "FAIL", "FAQ cannot turn contain-authority into an efficacy presupposition");

assert(namedIngredientMentions("ingredients Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE lowercase ingredients + ProperName");
assert(namedIngredientMentions("Ingredients Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE sentence-initial Ingredients");
assert(namedIngredientMentions("INGREDIENTS Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE uppercase INGREDIENTS");
assert(namedIngredientMentions("ingredients include Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE include-form");
assert(namedIngredientMentions("ingredients includes Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE includes-form");
assert(namedIngredientMentions("contains Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE contains-form");
assert(namedIngredientMentions("formula contains Mobilee").some((hit) => /mobilee/i.test(hit)), "CASE formula contains-form");
assert(!namedIngredientMentions("ingredients also").some((hit) => /also\b/i.test(hit) && !/mobilee/i.test(hit)), "FALSE_POSITIVE ingredients also");
assert(namedIngredientMentions("ingredients working").length === 0, "FALSE_POSITIVE ingredients working");
assert(namedIngredientMentions("the ingredients for this product").length === 0, "FALSE_POSITIVE ingredients for");
assert(
  namedIngredientMentions("SampleProduct contains IngredientX", { productName: "SampleProduct" }).every(
    (hit) => !/^sampleproduct$/i.test(hit),
  ),
  "FALSE_POSITIVE product identity as CamelCase ingredient",
);
assert(identityUsedAsComposition("contains SampleProduct", "SampleProduct"), "contains-form treats identity as composition");
assert(!identityUsedAsComposition("SampleProduct contains IngredientX", "SampleProduct"), "identity as grammatical subject is not composition");

console.log("H_RULE=designed-to-support is a conservative hedge of Supports when the object is unchanged");
console.log("MODEL_ROUTE_EVIDENCE_SLOT_AUTHORITY_V1=PASS");
console.log("Todos os testes de model slot authority passaram.");
