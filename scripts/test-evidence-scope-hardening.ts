// npx tsx scripts/test-evidence-scope-hardening.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  evaluateStructuredPage,
  faqTopicField,
  validateStructuredPage,
  type StructuredFaqItem,
  type StructuredGenerationPage,
} from "../src/lib/ai/structured-generation.ts";
import { hasUsageAuthorityLanguage } from "../src/lib/ai/generation-plan.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import {
  classifyIngredientLanguage,
  namedIngredientMentions,
  CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT,
  CLAIM_CLASS_NAMED_INGREDIENT,
  CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION,
} from "../src/lib/ai/ingredient-claims.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
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

function basePage(): StructuredGenerationPage {
  return {
    approach: "BUYER_GUIDE",
    headline: { text: "Joint Genesis Notes", evidenceIds: ["F001"] },
    summary: {
      text: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
      evidenceIds: ["F001", "F002"],
    },
    blocks: [
      {
        id: "OVERVIEW",
        type: "OVERVIEW",
        evidenceIds: ["F002"],
        content: "Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients and daily use.",
      },
      {
        id: "FEATURES",
        type: "FEATURES",
        evidenceIds: ["F003", "F004"],
        content:
          "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises. The ingredients also give the formula broader support through antioxidants.",
      },
      {
        id: "FINAL_THOUGHTS",
        type: "FINAL_THOUGHTS",
        evidenceIds: ["F001", "F002"],
        content: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
      },
    ],
    cta: { label: "View Product Details" },
  };
}

function withFaq(items: StructuredFaqItem[], parentEvidenceIds: string[] | undefined = []): StructuredGenerationPage {
  const page = basePage();
  page.blocks.push({
    id: "FAQ",
    type: "FAQ",
    evidenceIds: parentEvidenceIds || [],
    content: "",
    items,
  });
  return page;
}

function evalPage(page: StructuredGenerationPage | string, facts = thinFacts()) {
  return evaluateStructuredPage(page, facts, "Joint Genesis", VALIDATION_SAFE_AFFILIATE);
}

function hasCode(page: StructuredGenerationPage, code: string) {
  return validateStructuredPage(page, thinFacts()).violations.some((item) => item.code === code);
}

const facts = thinFacts();

assert(faqTopicField("description") === "description", "description maps to description");
assert(faqTopicField("features") === "features", "features maps to features");
assert(faqTopicField("identity") === "productName", "identity maps to productName");
assert(faqTopicField("ingredients") === "ingredientsOrComponents", "ingredients maps to ingredientsOrComponents");
assert(faqTopicField("usage") === "usageInformation", "usage maps to usageInformation");

const a = validateStructuredPage(
  withFaq([
    {
      question: "What is Joint Genesis described as supporting?",
      answer: "The listing describes lubrication, flexibility and comfortable movement.",
      topic: "description",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(!a.violations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"), "A: FAQ description + F002 compatible");

const b = validateStructuredPage(
  withFaq([
    {
      question: "What is Joint Genesis described as supporting?",
      answer: "The listing describes lubrication, flexibility and comfortable movement.",
      topic: "description",
      evidenceIds: ["F003"],
    },
  ]),
  facts,
);
assert(b.violations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"), "B: FAQ description + F003 incompatible");

const c = validateStructuredPage(
  withFaq([
    {
      question: "What wellness story is described?",
      answer: "It is designed for steady joint wellness rather than dramatic overnight promises.",
      topic: "features",
      evidenceIds: ["F003"],
    },
  ]),
  facts,
);
assert(!c.violations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"), "C: FAQ features + F003 compatible");

const d = validateStructuredPage(
  withFaq([
    {
      question: "What wellness story is described?",
      answer: "It is designed for steady joint wellness rather than dramatic overnight promises.",
      topic: "features",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(d.violations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"), "D: FAQ features + F002 incompatible");

const e = validateStructuredPage(
  withFaq([
    {
      question: "What is the product name?",
      answer: "Joint Genesis",
      topic: "identity",
      evidenceIds: ["F001"],
    },
  ]),
  facts,
);
assert(!e.violations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"), "E: FAQ identity + F001 compatible");

const fEmptyParent = validateStructuredPage(
  withFaq(
    [
      {
        question: "What is Joint Genesis described as supporting?",
        answer: "The listing describes lubrication, flexibility and comfortable movement.",
        topic: "description",
        evidenceIds: ["F002"],
      },
    ],
    [],
  ),
  facts,
);
assert(
  !fEmptyParent.violations.some((item) => item.code === "MISSING_EVIDENCE" && !item.text.startsWith("FAQ:")),
  "F: FAQ parent empty evidenceIds is valid container",
);
const fAbsentRaw = JSON.stringify({
  approach: "BUYER_GUIDE",
  headline: { text: "Joint Genesis Notes", evidenceIds: ["F001"] },
  summary: {
    text: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
    evidenceIds: ["F001", "F002"],
  },
  blocks: [
    {
      id: "OVERVIEW",
      type: "OVERVIEW",
      evidenceIds: ["F002"],
      content: "Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients and daily use.",
    },
    {
      id: "FEATURES",
      type: "FEATURES",
      evidenceIds: ["F003"],
      content: "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises.",
    },
    {
      id: "FAQ",
      type: "FAQ",
      content: "",
      items: [
        {
          question: "What is Joint Genesis described as supporting?",
          answer: "The listing describes lubrication, flexibility and comfortable movement.",
          topic: "description",
          evidenceIds: ["F002"],
        },
      ],
    },
    {
      id: "FINAL_THOUGHTS",
      type: "FINAL_THOUGHTS",
      evidenceIds: ["F001", "F002"],
      content: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
    },
  ],
  cta: { label: "View Product Details" },
});
const fAbsent = evalPage(fAbsentRaw);
assert(
  !fAbsent.structuralViolations.some((item) => item.code === "MISSING_EVIDENCE" && !item.text.startsWith("FAQ:")),
  "F: FAQ parent omitted evidenceIds is valid container",
);

const g = validateStructuredPage(
  withFaq([
    {
      question: "What is Joint Genesis described as supporting?",
      answer: "The listing describes lubrication, flexibility and comfortable movement.",
      topic: "description",
      evidenceIds: [],
    },
  ]),
  facts,
);
assert(g.violations.some((item) => item.code === "MISSING_EVIDENCE"), "G: FAQ child empty evidenceIds BLOCKED");
assert(evalPage(withFaq([
  {
    question: "What is Joint Genesis described as supporting?",
    answer: "The listing describes lubrication, flexibility and comfortable movement.",
    topic: "description",
    evidenceIds: [],
  },
])).finalGate === "BLOCKED", "G: invalid FAQ child fail-closed");

const isolation = evalPage(
  withFaq([
    {
      question: "What is Joint Genesis described as supporting?",
      answer: "Its strongest benefit story connects supporting synovial-fluid quality with bending and walking.",
      topic: "description",
      evidenceIds: ["F002"],
    },
    {
      question: "What wellness story is described?",
      answer: "It is designed for steady joint wellness rather than dramatic overnight promises.",
      topic: "features",
      evidenceIds: ["F003"],
    },
  ]),
);
const faq1 = isolation.traces.find((item) => item.blockType === "FAQ_ITEM" && item.question?.includes("described as supporting"));
const faq2 = isolation.traces.find((item) => item.blockType === "FAQ_ITEM" && item.question?.includes("wellness story"));
assert(faq1?.declaredEvidence.join() === "F002", "H: FAQ1 declared F002 only");
assert(faq2?.declaredEvidence.join() === "F003", "H: FAQ2 declared F003 only");
assert(faq1?.groundingResult === "UNGROUNDED", "H: FAQ1 cannot borrow FAQ2 F003");
assert(isolation.traces.some((item) => item.blockType === "FAQ" && Array.isArray(item.effectiveChildEvidenceUnion)), "H: parent union is diagnostic only");

const onceMorning = basePage();
onceMorning.blocks[1]!.content = "The feature description references once each morning.";
const i = evalPage(onceMorning);
assert(!i.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "I: once each morning is not usage promotion");
assert(i.structuralViolations.length === 0, "I: conservative once each morning is structurally eligible for Grounding");

const takeOnce = basePage();
takeOnce.blocks[1]!.content = "Take once each morning.";
assert(hasCode(takeOnce, "USAGE_PROMOTION") || hasUsageAuthorityLanguage("Take once each morning."), "J: take once each morning detected");
assert(evalPage(takeOnce).finalGate === "BLOCKED", "J: take once each morning BLOCKED");

const regimen = basePage();
regimen.blocks[2]!.content = "A once-daily regimen is described.";
assert(hasUsageAuthorityLanguage("once-daily regimen"), "K: once-daily regimen detected");
assert(evalPage(regimen).finalGate === "BLOCKED", "K: once-daily regimen BLOCKED");

const recommended = basePage();
recommended.blocks[1]!.content = "Recommended every morning.";
assert(hasUsageAuthorityLanguage("recommended every morning"), "L: recommended every morning detected");
assert(evalPage(recommended).finalGate === "BLOCKED", "L: recommended every morning BLOCKED");

const dailyUse = basePage();
dailyUse.blocks[0]!.content = "The listing mentions daily use.";
const m = evalPage(dailyUse);
assert(!m.structuralViolations.some((item) => item.code === "USAGE_PROMOTION"), "M: daily use description restatement is not usage promotion");
assert(m.structuralViolations.length === 0, "M: daily use may proceed to Grounding");

const takeDaily = basePage();
takeDaily.blocks[0]!.content = "Take daily.";
assert(hasUsageAuthorityLanguage("take daily"), "N: take daily detected");
assert(evalPage(takeDaily).finalGate === "BLOCKED", "N: take daily from description only BLOCKED");

assert(classifyIngredientLanguage("five targeted ingredients") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT, "O: five targeted ingredients is generic");
assert(
  !validateGrounding("five targeted ingredients", facts).unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_NAMED_INGREDIENT),
  "O: five targeted ingredients is not NAMED_INGREDIENT",
);

const workTogether = validateGrounding("The ingredients work together to provide broader support.", facts);
assert(
  workTogether.unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION),
  "P: ingredients work together is UNSUPPORTED_RELATIONAL_EXPANSION",
);
assert(workTogether.status !== "GROUNDED", "P: ingredients work together BLOCKED");

const synergistic = validateGrounding("The ingredients work synergistically.", facts);
assert(
  synergistic.unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION),
  "Q: work synergistically is UNSUPPORTED_RELATIONAL_EXPANSION",
);
assert(synergistic.status !== "GROUNDED", "Q: work synergistically BLOCKED");

const broader = validateGrounding("The ingredients also give the formula broader support.", facts);
assert(
  !broader.unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_NAMED_INGREDIENT),
  "R: broader support is not NAMED_INGREDIENT",
);
assert(
  !broader.unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION),
  "R: ingredients provide broader support is eligible for Grounding",
);

const strategy = validateGrounding("The multi-angle ingredient strategy supports movement.", facts);
assert(strategy.status !== "GROUNDED", "S: multi-angle ingredient strategy BLOCKED without equivalent evidence");

assert(classifyIngredientLanguage("Contains Mobilee") === CLAIM_CLASS_NAMED_INGREDIENT, "T: Mobilee is named");
assert(validateGrounding("Contains Mobilee.", facts).status === "UNGROUNDED", "T: named Mobilee BLOCKED");
assert(namedIngredientMentions("ingredients Mobilee").some((hit) => /mobilee/i.test(hit)), "T: same-line ingredients Mobilee remains named");

const s001 = "Joint Genesis: Support for lubrication, flexibility and comfortable movement with five targeted ingredients";
const s002 = "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement with five targeted ingredients.";
const s005 = "The ingredients also give the formula broader support through antioxidants, botanical inflammatory-response compounds and enhanced nutrient absorption. Together, those features create a multi-angle daily formula.";
const run11AllCopy = [s001, s002, s005].map((text) => `${text}  `).join("\n");
assert(namedIngredientMentions(s001).length === 0, "T2: S001 alone is not NAMED_INGREDIENT");
assert(namedIngredientMentions(s002).length === 0, "T2: S002 alone is not NAMED_INGREDIENT");
assert(namedIngredientMentions(s005).length === 0, "T2: S005 alone is not NAMED_INGREDIENT");
assert(
  !namedIngredientMentions(run11AllCopy).some((hit) => /joint genesis/i.test(hit)),
  "T2: joining S001/S002/S005 must not invent ingredients Joint Genesis",
);
assert(
  classifyIngredientLanguage(s005) === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT,
  "T2: S005 remains GENERIC_INGREDIENT_RESTATEMENT",
);

const refund = basePage();
refund.blocks[2]!.content = "There is a 180-day refund.";
assert(evalPage(refund).finalGate === "BLOCKED", "U: 180-day refund without guarantee authority BLOCKED");

assert(validateGrounding("Synovial fluid is the lubricating substance found in joints.", facts).status === "UNGROUNDED", "V: external synovial-fluid physiology BLOCKED");

const validThin = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/valid-thin-structured.json"), "utf8"),
) as StructuredGenerationPage;
const validEval = evalPage(validThin);
assert(validEval.structuralViolations.length === 0, "W: valid thin STRUCTURAL PASS");
assert(
  validEval.traces.filter((item) => item.blockType !== "FAQ").every((item) => item.groundingResult === "GROUNDED" || item.groundingResult === "NOT_RUN"),
  "X: valid thin BLOCK_SCOPED_GROUNDING PASS",
);
assert(
  validEval.traces.filter((item) => item.blockType === "FAQ_ITEM").every((item) => item.groundingResult === "GROUNDED"),
  "X: valid thin FAQ child Grounding PASS",
);
assert(validEval.grounding.status === "GROUNDED", "Y: valid thin GLOBAL GROUNDED");
assert(validEval.policyGate === "READY", "Z: valid thin POLICY READY");
assert(validEval.finalGate === "READY", "Z: valid thin CONTENT READY");

const replayWrapper = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/controlled-ready-05b-structured.json"), "utf8"),
) as { raw: string };
assert(replayWrapper.raw.includes("\"evidenceIds\":[]"), "05B fixture parent FAQ evidenceIds remain empty");
assert(replayWrapper.raw.includes("take once each morning"), "05B fixture take once wording unchanged");
assert(replayWrapper.raw.includes("once-daily regimen"), "05B fixture once-daily regimen unchanged");
assert(replayWrapper.raw.includes("ingredients work together"), "05B fixture relational wording unchanged");
assert(replayWrapper.raw.includes("multi-angle ingredient strategy"), "05B fixture multi-angle wording unchanged");

const replay = evalPage(replayWrapper.raw);
assert(
  !replay.structuralViolations.some((item) => item.code === "MISSING_EVIDENCE" && item.text === "FAQ"),
  "RUN05B: FAQ parent MISSING_EVIDENCE resolved by child ownership",
);
assert(
  replay.structuralViolations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE" && /F003/.test(item.text)),
  "RUN05B: FAQ description + F003 still FAIL",
);
assert(
  replay.structuralViolations.some((item) => item.code === "USAGE_PROMOTION" || (item.code === "CLOSED_TOPIC" && /take once/i.test(item.text))),
  "RUN05B: take once FAIL",
);
assert(
  replay.structuralViolations.some((item) => /once-daily regimen/i.test(item.text) || /regimen/i.test(item.text)),
  "RUN05B: once-daily regimen FAIL",
);
const workTogetherUnsupported = replay.grounding.unsupportedClaims.some(
  (item) => item.claimClass === CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION && /work together/i.test(item.claim),
);
console.log("RUN05B_WORK_TOGETHER=" + (workTogetherUnsupported ? "FAIL" : "ENTAILED"));
const multiAngleHit = replay.grounding.unsupportedClaims.some((item) => /multi[- ]angle ingredient strategy/i.test(item.claim) || /ingredient strategy/i.test(item.reason + item.claim));
console.log("RUN05B_MULTI_ANGLE_INGREDIENT_STRATEGY=" + (multiAngleHit ? "FAIL" : replay.grounding.status));
assert(replay.finalGate === "BLOCKED", "RUN05B: FINAL_RESULT=FAIL");

const editorial = validateGrounding("Buyers considering this product should evaluate whether the formula fits daily goals.", facts);
assert(editorial.status !== "GROUNDED", "editorial evaluate-whether is rejected");

console.log("FAQ_FIELD_EXACTNESS CROSS_FIELD_ALLOWED=NO");
console.log("PARENT_REQUIRES_EVIDENCE=NO CHILD_REQUIRES_EVIDENCE=YES");
console.log("\nTodos os testes de evidence scope hardening passaram.");
