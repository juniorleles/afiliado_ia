// npx tsx scripts/test-semantic-closure.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { createGenerationPlan, formatGenerationPlanForPrompt } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims, closedClaimFirewall } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
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
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
const f002 = slotPlan.slots.find((slot) => slot.slotId === "S002")!.evidence.map((item) => item.value).join("\n");
const f003 = slotPlan.slots.find((slot) => slot.slotId === "S004")!.evidence.map((item) => item.value).join("\n");
const f004 = slotPlan.slots.find((slot) => slot.slotId === "S005")!.evidence.map((item) => item.value).join("\n");
const closing = slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS")!.evidence.map((item) => item.value).join("\n");

assert(plan.thinMode === true, "THIN_MODE=YES");
assert(slotPlan.slots.find((slot) => slot.type === "OVERVIEW")?.required === false, "THIN OVERVIEW is optional");
assert(slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS")?.required === false, "THIN FINAL_THOUGHTS is optional");
assert(slotPlan.slots.find((slot) => slot.type === "HEADLINE")?.required === true, "HEADLINE remains required");
assert(slotPlan.slots.find((slot) => slot.type === "SUMMARY")?.required === true, "SUMMARY remains required");

const a = validateThinSemanticClosure({
  generated: "Together, those features create a multi-angle daily formula.",
  support: f004,
  slotType: "FEATURE",
});
assert(a.result === "PASS", "A: exact source restatement PASS");

const b = validateThinSemanticClosure({
  generated: "Together, those features create a multi-angle daily formula.",
  support: f004,
  slotType: "FEATURE",
});
assert(b.result === "PASS", "B: grammar-only equivalent PASS");

const c = validateThinSemanticClosure({
  generated: "Joint Genesis supports lubrication, flexibility, and comfortable movement with five targeted ingredients.",
  support: f002,
  slotType: "SUMMARY",
});
assert(c.result === "PASS", "C: compression preserving meaning PASS");

const d = validateThinSemanticClosure({
  generated: "Those features create a multi-angle strategy.",
  support: f004,
  slotType: "FEATURE",
});
assert(d.result === "FAIL" && d.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "D: formula → strategy FAIL");

const e = validateThinSemanticClosure({
  generated: "Together, those features create a multi-angle daily approach.",
  support: f004,
  slotType: "FEATURE",
});
assert(e.result === "FAIL" && e.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "E: formula → approach FAIL");

const f = validateThinSemanticClosure({
  generated: "Its strongest benefit story connects synovial-fluid quality with practical goals like bending and walking.",
  support: f003,
  slotType: "FEATURE",
});
assert(f.result === "PASS", "F: practical goals retained PASS");

const g = validateThinSemanticClosure({
  generated: "Joint Genesis is a practical option for daily tasks.",
  support: f003,
  slotType: "FEATURE",
});
assert(g.result === "FAIL" && g.failCodes.includes("EDITORIAL_CHARACTERIZATION"), "G: practical option FAIL");

const h = validateThinSemanticClosure({
  generated: "Joint Genesis offers a straightforward option.",
  support: closing,
  slotType: "FINAL_THOUGHTS",
});
assert(h.result === "FAIL" && h.failCodes.includes("EDITORIAL_CHARACTERIZATION"), "H: straightforward option FAIL");

const i = validateThinSemanticClosure({
  generated: "For those seeking steady joint wellness, the listing describes synovial-fluid quality.",
  support: f003,
  slotType: "FEATURE",
});
assert(i.result === "FAIL" && i.failCodes.includes("INFERRED_AUDIENCE_OR_PURPOSE"), "I: For those seeking FAIL");

const j = validateThinSemanticClosure({
  generated: "It is designed for anyone looking to maintain joint function during everyday tasks.",
  support: f002,
  slotType: "OVERVIEW",
});
assert(j.result === "FAIL" && j.failCodes.includes("NEW_PREDICATE"), "J: maintain joint function FAIL");

const k = validateThinSemanticClosure({
  generated: "These elements work together to create a multi-angle daily formula.",
  support: f004,
  slotType: "FEATURE",
});
assert(k.result === "PASS", "K: work together entailed by together-create PASS");

const l = validateThinSemanticClosure({
  generated: "The ingredients work synergistically.",
  support: f004,
  slotType: "FEATURE",
});
assert(l.result === "FAIL", "L: work synergistically FAIL");

const m = validateThinSemanticClosure({
  generated: "Together, those features create a multi-angle daily formula.",
  support: f004,
  slotType: "FEATURE",
});
assert(m.result === "PASS", "M: multi-angle daily formula PASS");

const n = validateThinSemanticClosure({
  generated: "The formula uses a multi-angle strategy.",
  support: f004,
  slotType: "FEATURE",
});
assert(n.result === "FAIL" && n.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "N: multi-angle strategy FAIL");

const o = validateThinSemanticClosure({
  generated: "Together, these features create a multi-angle daily approach to joint wellness.",
  support: f004,
  slotType: "FEATURE",
});
assert(o.result === "FAIL" && o.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "O: multi-angle approach to joint wellness FAIL");

const p = validateThinSemanticClosure({
  generated: "Joint Genesis is designed for steady joint wellness. The listing also describes broader support through antioxidants and a multi-angle daily formula.",
  support: closing,
  slotType: "FINAL_THOUGHTS",
});
assert(p.result === "PASS", "P: sequential facts PASS");

const q = validateThinSemanticClosure({
  generated:
    "The formula's ingredients add antioxidants for a multi-angle strategy. For those seeking a daily joint-wellness formula, Joint Genesis offers a straightforward option.",
  support: closing,
  slotType: "FINAL_THOUGHTS",
});
assert(q.result === "FAIL" && q.failCodes.includes("INFERRED_CONCLUSION"), "Q: synthesized conclusion FAIL");

const r = validateThinSemanticClosure({
  generated: "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises.",
  support: closing,
  slotType: "FINAL_THOUGHTS",
});
assert(r.result === "PASS", "R: FINAL_THOUGHTS direct summary PASS");

const s = validateThinSemanticClosure({
  generated: "For those seeking a daily joint-wellness formula, Joint Genesis offers a straightforward option.",
  support: closing,
  slotType: "FINAL_THOUGHTS",
});
assert(s.result === "FAIL", "S: FINAL_THOUGHTS inferred recommendation FAIL");

const t = validateFaqQuestion({
  question: "What does Joint Genesis focus on?",
  topic: "description",
  closedTopics: plan.closedTopics,
  supportText: f002,
  productName: facts.productName,
});
assert(t.semanticResult === "PASS", "T: neutral FAQ question PASS");

const validFills = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/valid-thin-projected-slot-fills.json"), "utf8"),
) as { cta: { label: string }; slots: SlotFill[] };
const faq002 = validFills.slots.find((item) => item.slotId === "FAQ002")!;
assert((faq002.answer || "").trim().split(/\s+/).length <= 35, "U: FAQ answer <=35");

const omitted = evaluateSlotGeneration(
  wrap(validFills.slots.filter((item) => item.slotId !== "S003")),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(omitted.finalGate === "READY", "V: optional unsupported/omitted OVERVIEW PASS");

const run09S003 =
  "Joint Genesis approaches joint wellness through a formula built around five targeted ingredients. According to the product description, it's designed to support lubrication, flexibility, and comfortable movement—practical goals for anyone looking to maintain joint function during everyday tasks.";
const run09S005 =
  "The formula's ingredients provide broader support through antioxidants, botanical inflammatory-response compounds, and enhanced nutrient absorption. Together, these features create a multi-angle daily approach to joint wellness.";
const run09S006 =
  "Joint Genesis takes a steady, mechanism-focused approach to joint wellness. Rather than promising overnight results, it connects synovial-fluid support with practical daily goals like bending, walking, and exercising. The formula's ingredients add antioxidants, botanical inflammatory-response compounds, and enhanced absorption for a multi-angle strategy. For those seeking a daily joint-wellness formula grounded in a clearly defined mechanism, Joint Genesis offers a straightforward option.";

const s003 = validateThinSemanticClosure({ generated: run09S003, support: f002, slotType: "OVERVIEW" });
assert(s003.result === "FAIL", "S003 FAIL");
assert(s003.failCodes.includes("NEW_PREDICATE"), "S003 NEW_PREDICATE");
assert(s003.failCodes.includes("INFERRED_AUDIENCE_OR_PURPOSE"), "S003 INFERRED_AUDIENCE_OR_PURPOSE");

const s005 = validateThinSemanticClosure({ generated: run09S005, support: f004, slotType: "FEATURE" });
assert(s005.result === "FAIL" && s005.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "S005 RELATIONSHIP_TRANSFORMATION");

const s006 = validateThinSemanticClosure({ generated: run09S006, support: closing, slotType: "FINAL_THOUGHTS" });
assert(s006.result === "FAIL", "S006 FAIL");
assert(s006.failCodes.includes("RELATIONSHIP_TRANSFORMATION"), "S006 RELATIONSHIP_TRANSFORMATION");
assert(s006.failCodes.includes("EDITORIAL_CHARACTERIZATION"), "S006 EDITORIAL_CHARACTERIZATION");
assert(s006.failCodes.includes("INFERRED_AUDIENCE_OR_PURPOSE"), "S006 INFERRED_AUDIENCE_OR_PURPOSE");

const run09Fills: SlotFill[] = validFills.slots.map((item) => {
  if (item.slotId === "S003") return { slotId: "S003", content: run09S003 };
  if (item.slotId === "S005") return { slotId: "S005", content: run09S005 };
  if (item.slotId === "S006") return { slotId: "S006", content: run09S006 };
  return item;
});
const run09Eval = evaluateSlotGeneration(wrap(run09Fills), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(run09Eval.finalGate !== "READY", "W: Run09 exact output FAIL");
assert(
  run09Eval.structuralViolations.some((item) => item.code === "SEMANTIC_CLOSURE"),
  "W: Run09 semantic closure FAIL",
);

const validEval = evaluateSlotGeneration(wrap(validFills.slots, validFills.cta.label), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
const firewall = closedClaimFirewall(projection, plan);
assert(firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "X: MODEL_VISIBLE_CLOSED_CLAIMS=0");
assert(!validEval.structuralViolations.some((item) => item.code === "SEMANTIC_CLOSURE"), "X: SEMANTIC_CLOSURE PASS");
assert(validEval.structuralViolations.length === 0, "X: STRUCTURE PASS");
assert(validEval.grounding.status === "GROUNDED", "X: GLOBAL GROUNDED");
assert(validEval.policyGate === "READY", "X: POLICY READY");
assert(validEval.finalGate === "READY", "X: CONTENT READY");

const prompt = buildPrompt({ productName: facts.productName, sourceUrl: facts.sourceUrl, facts });
const planText = formatGenerationPlanForPrompt(plan);
const sizeAfter = prompt.system.length + prompt.user.length;
assert(/conservative rewriter, not a copywriter/i.test(planText), "prompt states conservative rewriter contract");
assert(!/straightforward option[\s\S]{0,40}practical option/.test(planText), "prompt does not dump editorial blacklist");
assert(sizeAfter < 16000, "prompt did not grow into a warning catalog");

console.log("S003_FAIL_CODES=" + s003.failCodes.join(","));
console.log("S005_FAIL_CODES=" + s005.failCodes.join(","));
console.log("S006_FAIL_CODES=" + s006.failCodes.join(","));
console.log("PROMPT_SIZE_AFTER=" + sizeAfter);
console.log("PLAN_PROMPT_CHARS=" + planText.length);
console.log("Todos os testes de semantic closure passaram.");
