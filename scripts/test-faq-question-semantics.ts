// npx tsx scripts/test-faq-question-semantics.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims, closedClaimFirewall } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration, validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { evaluateRelationalEntailment, unsupportedRelationalExpansions } from "../src/lib/ai/ingredient-claims.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
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
const descSupport = facts.description;
const featSupport = facts.features.join("\n");

function q(question: string, topic: "description" | "features", support: string) {
  return validateFaqQuestion({
    question,
    topic,
    closedTopics: plan.closedTopics,
    supportText: support,
    productName: facts.productName,
  });
}

const a = q("What does Joint Genesis focus on?", "description", descSupport);
assert(a.questionClass === "NEUTRAL_INFORMATION_REQUEST" && a.semanticResult === "PASS", "A: focus on PASS");

const b = q("What is Joint Genesis described as supporting?", "description", descSupport);
assert(b.questionClass === "NEUTRAL_INFORMATION_REQUEST" && b.semanticResult === "PASS", "B: described as supporting PASS");

const c = q("What features are described?", "features", featSupport);
assert(c.questionClass === "NEUTRAL_INFORMATION_REQUEST" && c.semanticResult === "PASS", "C: features described PASS");

const d = q("Why is Joint Genesis effective?", "description", descSupport);
assert(d.semanticResult === "FAIL" && d.failCodes.includes("UNSUPPORTED_FACTUAL_PRESUPPOSITION"), "D: effective FAIL");

const e = q("How quickly does Joint Genesis work?", "description", descSupport);
assert(e.questionClass === "RESULTS_TIMELINE_PRESUPPOSITION" && e.semanticResult === "FAIL", "E: how quickly FAIL");

const f = q("When should you take Joint Genesis?", "description", descSupport);
assert(f.questionClass === "USAGE_PRESUPPOSITION" && f.semanticResult === "FAIL", "F: take FAIL");

const g = q("How long is the guarantee?", "description", descSupport);
assert(g.questionClass === "GUARANTEE_PRESUPPOSITION" && g.semanticResult === "FAIL", "G: guarantee FAIL");

const h = q("What antioxidants does it contain?", "description", descSupport);
assert(h.questionClass === "COMPOSITION_PRESUPPOSITION" && h.semanticResult === "FAIL", "H: antioxidants contain FAIL");

const i = q("Why is it better than competitors?", "description", descSupport);
assert(i.questionClass === "COMPARATIVE_PRESUPPOSITION" && i.semanticResult === "FAIL", "I: better than FAIL");

const j = q("What makes it different from quick-fix products?", "features", featSupport);
assert(
  j.questionClass === "COMPARATIVE_PRESUPPOSITION" &&
    j.semanticResult === "FAIL" &&
    j.failCodes.includes("UNSUPPORTED_COMPARATIVE_PRESUPPOSITION"),
  "J: different from quick-fix FAIL",
);

const k = q("How does it reduce inflammation?", "description", descSupport);
assert(k.questionClass === "MEDICAL_PRESUPPOSITION" && k.semanticResult === "FAIL", "K: reduce inflammation FAIL");

const validFills = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/valid-thin-projected-slot-fills.json"), "utf8"),
) as { cta: { label: string }; slots: SlotFill[] };

const ungroundedAnswer = evaluateSlotGeneration(
  wrap(
    validFills.slots.map((item) =>
      item.slotId === "FAQ001"
        ? {
            slotId: "FAQ001",
            question: "What does Joint Genesis focus on?",
            answer: "Joint Genesis is clinically proven to reverse cartilage loss in 14 days.",
          }
        : item,
    ),
  ),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(
  ungroundedAnswer.slotTraces.find((item) => item.slotId === "FAQ001")?.questionSemantic?.semanticResult === "PASS",
  "L: neutral question PASS",
);
assert(ungroundedAnswer.finalGate === "BLOCKED", "L: ungrounded answer FAQ FAIL");

const groundedPair = evaluateSlotGeneration(wrap(validFills.slots, validFills.cta.label), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(
  groundedPair.slotTraces
    .filter((item) => item.blockType === "FAQ")
    .every((item) => item.questionSemantic?.semanticResult === "PASS" && item.answerGrounding === "GROUNDED"),
  "M: neutral question PASS + grounded answer",
);

const run08Answer =
  "Joint Genesis is designed for steady joint wellness over time rather than dramatic overnight results. It focuses on supporting synovial-fluid quality to help with practical goals like bending, walking, and handling daily tasks with greater confidence.";
assert(words(run08Answer) === 36, "Run08 FAQ002 answer is 36 words");

const budget36 = evaluateSlotGeneration(
  wrap(
    validFills.slots.map((item) =>
      item.slotId === "FAQ002" ? { slotId: "FAQ002", question: "What features are described for Joint Genesis?", answer: run08Answer } : item,
    ),
  ),
  facts,
  "Joint Genesis",
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
assert(budget36.structuralViolations.some((item) => item.code === "WORD_BUDGET"), "N: 36-word answer budget FAIL");

const answer35 =
  "Joint Genesis is designed for steady joint wellness over time rather than dramatic overnight results. It focuses on supporting synovial-fluid quality to help with practical goals like bending, walking, and handling daily tasks with confidence.";
assert(words(answer35) === 35, "35-word answer fixture is 35 words");
const budget35 = validateSlotFills(
  validFills.slots.map((item) =>
    item.slotId === "FAQ002" ? { slotId: "FAQ002", question: "What features are described for Joint Genesis?", answer: answer35 } : item,
  ),
  slotPlan,
  facts,
);
assert(!budget35.some((item) => item.code === "WORD_BUDGET"), "O: 35-word answer budget PASS");

const f004 =
  "The ingredients also give the formula broader support through antioxidants, botanical inflammatory-response compounds and enhanced nutrient absorption. Together, those features create a multi-angle daily formula.";
const conservative = "These elements work together to create a multi-angle daily formula.";
const p = evaluateRelationalEntailment(conservative, f004);
assert(p.ENTAILED === "YES" && p.RESULT === "ELIGIBLE", "P: conservative together restatement eligible");

const qRel = evaluateRelationalEntailment("These elements work together.", "Joint Genesis supports lubrication and flexibility.");
assert(qRel.RESULT === "UNSUPPORTED_RELATIONAL_EXPANSION", "Q: work together without source relationship FAIL");
assert(unsupportedRelationalExpansions("These elements work together.", "supports lubrication").length > 0, "Q: detector catches work together");

const r = evaluateRelationalEntailment(
  "The ingredients synergistically amplify one another.",
  "The ingredients work together to create a multi-angle daily formula.",
);
assert(r.RESULT === "UNSUPPORTED_RELATIONAL_EXPANSION", "R: synergistic amplify is strengthened FAIL");

const faq001 = q("What does Joint Genesis focus on?", "description", descSupport);
assert(faq001.questionClass === "NEUTRAL_INFORMATION_REQUEST" && faq001.semanticResult === "PASS" && faq001.failCodes.length === 0, "S: Run08 FAQ001 semantic PASS");

const faq002 = q("What makes this formula different from quick-fix products?", "features", featSupport);
assert(
  faq002.questionClass === "COMPARATIVE_PRESUPPOSITION" &&
    faq002.semanticResult === "FAIL" &&
    faq002.failCodes.includes("UNSUPPORTED_COMPARATIVE_PRESUPPOSITION"),
  "T: Run08 FAQ002 semantic FAIL",
);

assert(words(run08Answer) === 36, "U: Run08 FAQ002 answer 36 words FAIL budget");

const run08Fills: SlotFill[] = validFills.slots.map((item) => {
  if (item.slotId === "FAQ001") {
    return {
      slotId: "FAQ001",
      question: "What does Joint Genesis focus on?",
      answer: "Joint Genesis features five targeted ingredients designed to support joint lubrication, flexibility, and comfortable movement.",
    };
  }
  if (item.slotId === "FAQ002") {
    return {
      slotId: "FAQ002",
      question: "What makes this formula different from quick-fix products?",
      answer: run08Answer,
    };
  }
  return item;
});
const run08Eval = evaluateSlotGeneration(wrap(run08Fills), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(run08Eval.finalGate !== "READY", "V: Run08 overall replay FAIL");
assert(
  run08Eval.structuralViolations.some((item) => item.code === "QUESTION_SEMANTICS" && /quick-fix/i.test(item.text)),
  "V: Run08 FAQ002 question semantics FAIL",
);
assert(run08Eval.structuralViolations.some((item) => item.code === "WORD_BUDGET"), "V: Run08 FAQ002 budget FAIL");

const firewall = closedClaimFirewall(projection, plan);
const validEval = evaluateSlotGeneration(wrap(validFills.slots, validFills.cta.label), facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE, slotPlan);
assert(firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "W: MODEL_VISIBLE_CLOSED_CLAIMS=0");
assert(projection.claims.some((item) => item.generationAuthorized), "W: CLAIM_PROJECTION VALID");
assert(validEval.structuralViolations.length === 0, "W: SLOT_STRUCTURE PASS");
assert(
  validEval.slotTraces.filter((item) => item.blockType === "FAQ").every((item) => item.questionSemantic?.semanticResult === "PASS"),
  "W: QUESTION_SEMANTICS PASS",
);
assert(
  validEval.slotTraces.filter((item) => item.blockType === "FAQ").every((item) => item.answerGrounding === "GROUNDED"),
  "W: ANSWER_GROUNDING PASS",
);
assert(!validEval.structuralViolations.some((item) => item.code === "WORD_BUDGET"), "W: WORD_BUDGET PASS");
assert(
  validEval.slotTraces
    .filter((item) => item.blockType !== "FAQ")
    .every((item) => item.groundingResult === "GROUNDED"),
  "W: SLOT_SCOPED_GROUNDING PASS",
);
assert(validEval.grounding.status === "GROUNDED", "W: GLOBAL GROUNDED");
assert(validEval.policyGate === "READY", "W: POLICY READY");
assert(validEval.finalGate === "READY", "W: CONTENT READY");

const s005 =
  "The formula incorporates ingredients that provide broader support through antioxidants, botanical compounds that address inflammatory response, and components designed to enhance nutrient absorption. These elements work together to create a multi-angle daily formula.";
const s005Rel = evaluateRelationalEntailment(s005, facts.features[1] || f004);
console.log("RUN08_RELATIONAL_REPLAY " + JSON.stringify(s005Rel));
assert(s005Rel.RELATIONSHIP_PRESENT === "YES", "S005 relationship present");
assert(validateGrounding("What does Joint Genesis focus on?", facts).status === "GROUNDED", "neutral question is not treated as a factual assertion");
assert(validateGrounding("What makes this formula different from quick-fix products?", facts).status === "UNGROUNDED", "comparative question remains blocked in Grounding");
assert(validateGrounding(run08Answer, facts).status === "GROUNDED" || validateGrounding(run08Answer, facts).status === "UNGROUNDED", "answer grounding still runs");

console.log("FAQ001_CLASS=" + faq001.questionClass);
console.log("FAQ001_RESULT=" + faq001.semanticResult);
console.log("FAQ001_FAIL_CODES=" + (faq001.failCodes.join(",") || "none"));
console.log("FAQ002_CLASS=" + faq002.questionClass);
console.log("FAQ002_RESULT=" + faq002.semanticResult);
console.log("FAQ002_FAIL_CODES=" + faq002.failCodes.join(","));
console.log("FAQ002_ANSWER_WORDS=" + words(run08Answer));
console.log("RUN08_FINAL_RESULT=FAIL");
console.log("Todos os testes de FAQ question semantics passaram.");
