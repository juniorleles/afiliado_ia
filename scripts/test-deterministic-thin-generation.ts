// npx tsx scripts/test-deterministic-thin-generation.ts
import { emptyProductFacts, buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims, closedClaimFirewall } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration } from "../src/lib/ai/slot-generation.ts";
import { generateDeterministicThinCopy } from "../src/lib/ai/deterministic-thin-generation.ts";
import { resolveGenerationRoute } from "../src/lib/ai/generation-router.ts";
import { generateVariants } from "../src/lib/ai/generate-variants.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function run10Facts(): ProductFacts {
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

function pipeline(facts: ProductFacts) {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  return { plan, manifest, projection, slotPlan };
}

function joinedCopy(fills: { content?: string; question?: string; answer?: string }[]): string {
  return fills
    .map((fill) => [fill.content, fill.question, fill.answer].filter(Boolean).join(" "))
    .join("\n");
}

function evaluate(facts: ProductFacts) {
  const built = pipeline(facts);
  const generated = generateDeterministicThinCopy({
    plan: built.plan,
    slotPlan: built.slotPlan,
    projection: built.projection,
  });
  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: generated.ctaLabel }, slots: generated.fills }] },
    facts,
    facts.productName || "Product",
    VALIDATION_SAFE_AFFILIATE,
    built.slotPlan,
  );
  return { ...built, generated, evaluation };
}

function existingGatePermitted(
  evaluation: { structuralViolations: unknown[]; grounding: { status: string }; policyGate: string; finalGate: string },
  label: string,
) {
  assert(evaluation.structuralViolations.length === 0, label + " STRUCTURE PASS");
  assert(evaluation.grounding.status === "GROUNDED", label + " GROUNDED");
  assert(evaluation.policyGate !== "BLOCKED", label + " POLICY not BLOCKED");
  assert(
    evaluation.finalGate === "READY" || evaluation.finalGate === "REVIEW_REQUIRED",
    label + " follows existing completeness without weakening",
  );
  return evaluation.finalGate;
}

const run10 = evaluate(run10Facts());
assert(run10.plan.generationRoute === "DETERMINISTIC_THIN", "THIN generationRoute is DETERMINISTIC_THIN");
assert(resolveGenerationRoute(run10.plan) === "DETERMINISTIC_THIN", "router reads GenerationPlan.generationRoute");
assert(run10.generated.anthropicCalls === 0, "THIN_ANTHROPIC_CALLS=0");
assert(run10.generated.generationMethod === "DETERMINISTIC_THIN", "generationMethod=DETERMINISTIC_THIN");
assert(run10.generated.ctaLabel === "Learn More", "CTA is Learn More");
assert(
  run10.generated.fills.every((fill) => fill.generationMethod === "DETERMINISTIC_THIN"),
  "every fill is DETERMINISTIC_THIN",
);
assert(
  run10.generated.provenance.every((row) => row.generationMethod === "DETERMINISTIC_THIN" && row.evidenceIds.length > 0),
  "provenance retains evidenceIds",
);

const headline = run10.generated.fills.find((fill) => fill.slotId === "S001")?.content || "";
const summary = run10.generated.fills.find((fill) => fill.slotId === "S002")?.content || "";
const overview = run10.generated.fills.find((fill) => fill.slotId === "S003");
const featureA = run10.generated.fills.find((fill) => fill.slotId === "S004")?.content || "";
const featureB = run10.generated.fills.find((fill) => fill.slotId === "S005")?.content || "";
const closing = run10.generated.fills.find((fill) => fill.slotId === "S006");
const faq001 = run10.generated.fills.find((fill) => fill.slotId === "FAQ001");
const faq002 = run10.generated.fills.find((fill) => fill.slotId === "FAQ002");
const copy = joinedCopy(run10.generated.fills);

assert(/^Joint Genesis: Support for /i.test(headline), "A headline uses product name + supported benefit phrase");
assert(!/approach|strategy|solution|system/i.test(headline), "headline does not invent approach/strategy");
assert(/is described as supporting/i.test(summary), "summary uses deterministic described-as template");
assert(!overview, "OVERVIEW omitted when it would duplicate SUMMARY");
assert(/Together, those features create a multi-angle daily formula/i.test(featureB), "G: together-create relationship preserved");
assert(!/multi-angle strategy|multi-angle daily approach/i.test(copy), "formula is not transformed into strategy/approach");
assert(!closing, "FINAL_THOUGHTS omitted by default");
assert(!/take once|each morning|daily use|180-day vendor/i.test(copy), "E/F: closed usage and guarantee spans excluded");
assert(faq001?.question === "What does Joint Genesis focus on?", "J: canonical description FAQ");
assert(faq001?.answer && !/quick results/i.test(faq001.question || ""), "FAQ is not a results question");
if (faq002) {
  assert(faq002.question === "What features are described for Joint Genesis?", "canonical features FAQ");
}

assert(run10.evaluation.structuralViolations.length === 0, "STRUCTURE=PASS");
assert(
  run10.evaluation.slotTraces
    .filter((trace) => trace.blockType === "FAQ")
    .every((trace) => trace.questionSemantic?.semanticResult === "PASS"),
  "FAQ=PASS_OR_OMITTED (returned FAQ PASS)",
);
assert(
  !run10.evaluation.structuralViolations.some((item) => item.code === "SEMANTIC_CLOSURE"),
  "SEMANTIC_CLOSURE=PASS",
);
assert(
  run10.evaluation.slotTraces
    .filter((trace) => trace.text)
    .every((trace) => (trace.blockType === "FAQ" ? trace.answerGrounding === "GROUNDED" : trace.groundingResult === "GROUNDED")),
  "SLOT_SCOPED_GROUNDING=PASS",
);
assert(run10.evaluation.grounding.status === "GROUNDED", "GLOBAL_GROUNDING=GROUNDED");
assert(run10.evaluation.grounding.unsupportedClaims.length === 0, "UNSUPPORTED_CLAIMS=0");
assert(run10.evaluation.policyGate === "READY", "POLICY=READY");
assert(run10.evaluation.finalGate === "READY", "CONTENT_GATE=READY");
assert(closedClaimFirewall(run10.projection, run10.plan).TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "closed claims not visible");

console.log("RUN10_HEADLINE=" + headline);
console.log("RUN10_SUMMARY=" + summary);
console.log("RUN10_FEATURE_A=" + featureA);
console.log("RUN10_FEATURE_B=" + featureB);
console.log("RUN10_FAQ001_Q=" + (faq001?.question || "OMITTED"));
console.log("RUN10_FAQ001_A=" + (faq001?.answer || "OMITTED"));
console.log("RUN10_FAQ002_Q=" + (faq002?.question || "OMITTED"));
console.log("RUN10_FAQ002_A=" + (faq002?.answer || "OMITTED"));
console.log("RUN10_OMITTED=" + run10.generated.omittedSlotIds.join(","));

const start = performance.now();
generateDeterministicThinCopy({ plan: run10.plan, slotPlan: run10.slotPlan, projection: run10.projection });
const latencyMs = performance.now() - start;
assert(latencyMs < 250, "deterministic generation is local and fast");
console.log("DETERMINISTIC_GENERATION_LATENCY_MS=" + latencyMs.toFixed(2));

function fixtureB() {
  const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
  facts.description =
    "See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients, daily use and a 180-day vendor";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.confidence.features = "NOT_FOUND";
  facts.importQuality = "PARTIAL";
  return facts;
}
const b = evaluate(fixtureB());
assert(b.plan.coverage === "THIN", "B coverage THIN");
assert(b.generated.fills.some((fill) => fill.slotId === "S001" && fill.content), "B headline present");
assert(b.generated.fills.some((fill) => fill.slotId === "S002" && fill.content), "B summary present");
assert(!b.slotPlan.slots.some((slot) => slot.type === "FEATURE"), "B has no feature slots");
console.log("FIXTURE_B_GATE=" + existingGatePermitted(b.evaluation, "B"));

function fixtureC() {
  const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
  facts.features = ["Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises."];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.confidence.description = "NOT_FOUND";
  facts.importQuality = "PARTIAL";
  return facts;
}
const c = evaluate(fixtureC());
assert(c.generated.fills.some((fill) => fill.content === "Joint Genesis" || Boolean(fill.content?.startsWith("Joint Genesis"))), "C identity headline");
assert(c.slotPlan.slots.some((slot) => slot.type === "FEATURE"), "C has feature slots");
assert(c.generated.fills.some((fill) => /steady joint wellness/i.test(fill.content || "")), "C preserves feature sentence");
console.log("FIXTURE_C_GATE=" + existingGatePermitted(c.evaluation, "C"));

function fixtureD() {
  const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
  facts.confidence.description = "NOT_FOUND";
  facts.confidence.features = "NOT_FOUND";
  return facts;
}
const d = evaluate(fixtureD());
assert(d.plan.coverage === "THIN" || d.plan.coverage === "INSUFFICIENT", "D identity-only stays on existing coverage rules");
assert(d.generated.fills.some((fill) => fill.content === "Joint Genesis"), "D emits identity copy");
assert(!d.generated.fills.some((fill) => fill.question), "I: no FAQ-supporting evidence omits FAQ");
assert(
  d.evaluation.finalGate === "READY" || d.evaluation.finalGate === "REVIEW_REQUIRED" || d.evaluation.finalGate === "BLOCKED",
  "D does not weaken completeness",
);
console.log("FIXTURE_D_GATE=" + d.evaluation.finalGate);

function fixtureH() {
  const facts = emptyProductFacts("Joint Genesis", "https://jointgenesisofficial.com/", "IMPORTED");
  facts.features = ["Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises."];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "PARTIAL";
  return facts;
}
const h = evaluate(fixtureH());
assert(!/together|synerg|approach|strategy/i.test(joinedCopy(h.generated.fills)), "H: generator cannot add relationship");
console.log("FIXTURE_H_GATE=" + existingGatePermitted(h.evaluation, "H"));

const adversarial = copy;
assert(!/Five-Ingredient Approach/i.test(adversarial), "adversarial: Five-Ingredient Approach absent");
assert(!/multi-angle strategy/i.test(adversarial), "adversarial: multi-angle strategy absent");
assert(!/straightforward option/i.test(adversarial), "adversarial: straightforward option absent");
assert(!/For those seeking/i.test(adversarial), "adversarial: For those seeking absent");
assert(!/Is this formula designed for quick results/i.test(adversarial), "adversarial: quick-results question absent");

const rich = emptyProductFacts("Rich Product", "https://example.test/rich", "IMPORTED");
rich.description = "A full description of the coat for winter walking.";
rich.confidence.description = "DIRECT_SOURCE";
rich.features = ["Insulated core", "Washable shell"];
rich.confidence.features = "DIRECT_SOURCE";
rich.ingredientsOrComponents = ["Fill"];
rich.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
rich.usageInformation = ["Wear over a shirt"];
rich.confidence.usageInformation = "DIRECT_SOURCE";
rich.cautions = ["Keep away from open flame"];
rich.confidence.cautions = "DIRECT_SOURCE";
rich.pricingInformation = "$80";
rich.confidence.pricingInformation = "DIRECT_SOURCE";
const richPlan = createGenerationPlan(rich);
assert(richPlan.thinMode === false, "RICH/ADEQUATE is not THIN");
assert(richPlan.generationRoute === "MODEL", "NON_THIN still uses MODEL generator");
assert(resolveGenerationRoute(richPlan) === "MODEL", "router keeps MODEL for non-THIN");

let threw = false;
try {
  generateDeterministicThinCopy({
    plan: richPlan,
    slotPlan: createEvidenceSlotPlan(rich),
    projection: projectEvidenceClaims(rich),
  });
} catch {
  threw = true;
}
assert(threw, "deterministic generator refuses non-THIN plans");

for (const fill of run10.generated.fills) {
  const slot = run10.slotPlan.slots.find((item) => item.slotId === fill.slotId);
  const support = (slot?.evidence || []).map((item) => item.value).join("\n");
  const generated = slot?.type === "FAQ" ? fill.answer || "" : fill.content || "";
  const closure = validateThinSemanticClosure({ generated, support, slotType: slot?.type, thinMode: true });
  assert(closure.result === "PASS", `${fill.slotId} semantic closure PASS`);
  if (fill.question) {
    const q = validateFaqQuestion({
      question: fill.question,
      topic: slot?.topic,
      closedTopics: run10.plan.closedTopics,
      supportText: support,
      productName: "Joint Genesis",
    });
    assert(q.semanticResult === "PASS", `${fill.slotId} FAQ question PASS`);
  }
}

assert(run10.evaluation.finalGate === "READY", "A: identity+description+features READY");

console.log("THIN_GENERATOR=DETERMINISTIC");
console.log("NON_THIN_GENERATOR=MODEL");
console.log("DOWNSTREAM_VALIDATION_SHARED=YES");

generateVariants({
  productName: "Joint Genesis",
  sourceUrl: "https://jointgenesisofficial.com/",
  facts: run10Facts(),
})
  .then((variants) => {
    assert(variants[0]!.anthropicCalls === 0, "generateVariants THIN path makes zero Anthropic calls");
    assert(variants[0]!.generationRoute === "DETERMINISTIC_THIN", "generateVariants uses DETERMINISTIC_THIN route");
    assert(variants[0]!.headline === headline, "generateVariants returns the same deterministic headline");
    console.log("Todos os testes de deterministic THIN generation passaram.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
