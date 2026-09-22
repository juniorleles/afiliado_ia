// npx tsx scripts/test-structured-precision.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  evaluateStructuredPage,
  parseStructuredVariants,
  STRUCTURED_VARIANTS_JSON_SCHEMA,
  structuredVariantsSchema,
  validateStructuredPage,
  type StructuredGenerationPage,
} from "../src/lib/ai/structured-generation.ts";
import {
  createGenerationPlan,
  validateGenerationPlan,
} from "../src/lib/ai/generation-plan.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import {
  classifyIngredientLanguage,
  CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT,
  CLAIM_CLASS_NAMED_INGREDIENT,
} from "../src/lib/ai/ingredient-claims.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function run04Facts() {
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

function thinPage(extra?: Partial<StructuredGenerationPage>): StructuredGenerationPage {
  return {
    approach: "REVIEW",
    headline: { text: "Joint Genesis Notes", evidenceIds: ["F001"] },
    summary: {
      text: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
      evidenceIds: ["F001", "F002"],
    },
    blocks: [
      {
        id: "B001",
        type: "OVERVIEW",
        evidenceIds: ["F002"],
        content: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
      },
      {
        id: "B002",
        type: "FEATURES",
        evidenceIds: ["F003"],
        content: "The source describes synovial-fluid quality with practical goals such as bending and walking.",
      },
      {
        id: "B003",
        type: "FINAL_THOUGHTS",
        evidenceIds: ["F001", "F002"],
        content: "Joint Genesis is described as supporting lubrication, flexibility and comfortable movement.",
      },
    ],
    cta: { label: "View Product Details" },
    ...extra,
  };
}

function withFaq(
  items: Array<{ question: string; answer: string; topic: string; evidenceIds: string[] }>,
): StructuredGenerationPage {
  const page = thinPage();
  page.blocks.push({
    id: "BFAQ",
    type: "FAQ",
    evidenceIds: items[0]?.evidenceIds || ["F002"],
    content: "",
    items,
  });
  return page;
}

function nWords(n: number): string {
  return Array.from({ length: n }, () => "word").join(" ");
}

const facts = run04Facts();
const plan = createGenerationPlan(facts);

const topicEnum =
  STRUCTURED_VARIANTS_JSON_SCHEMA.properties.variants.items.properties.blocks.items.properties.items.items.properties
    .topic.enum;
assert(Array.isArray(topicEnum) && topicEnum.includes("identity"), "schema FAQ topic enum includes identity");
assert(topicEnum.includes("description") && topicEnum.includes("features"), "schema FAQ topic enum includes OPEN topics");
assert(!topicEnum.includes("Product Purpose"), "schema does not allow Product Purpose");
assert(!topicEnum.includes("Approach"), "schema does not allow Approach");
assert(STRUCTURED_VARIANTS_JSON_SCHEMA.additionalProperties === false, "structured schema additionalProperties=false");
const dynamicEnum = structuredVariantsSchema(plan.allowedTopics).properties.variants.items.properties.blocks.items
  .properties.items.items.properties.topic.enum;
assert(dynamicEnum.every((topic: string) => plan.allowedTopics.includes(topic as never)), "runtime schema enum intersects GenerationPlan");
assert(!dynamicEnum.includes("ingredients"), "runtime enum omits CLOSED ingredients");

const purpose = validateStructuredPage(
  withFaq([
    {
      question: "What is Joint Genesis designed to support?",
      answer: "The product website describes support for lubrication and comfortable movement.",
      topic: "Product Purpose",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(
  purpose.violations.some((item) => item.code === "INVALID_FAQ_TOPIC"),
  "A: FAQ topic=Product Purpose FAIL",
);

const approach = validateStructuredPage(
  withFaq([
    {
      question: "What approach does the source describe?",
      answer: "The source describes steady joint wellness rather than overnight promises.",
      topic: "Approach",
      evidenceIds: ["F003"],
    },
  ]),
  facts,
);
assert(
  approach.violations.some((item) => item.code === "INVALID_FAQ_TOPIC"),
  "B: FAQ topic=Approach FAIL",
);

const descriptionFaq = withFaq([
  {
    question: "What is Joint Genesis designed to support?",
    answer: "The product website describes support for lubrication, flexibility and comfortable movement.",
    topic: "description",
    evidenceIds: ["F002"],
  },
]);
const descriptionEval = evaluateStructuredPage(descriptionFaq, facts, "Joint Genesis", "https://example.com/hop");
assert(
  !descriptionEval.structuralViolations.some(
    (item) => item.code === "INVALID_FAQ_TOPIC" || (item.code === "CLOSED_TOPIC" && item.text.includes("What is Joint Genesis")),
  ),
  "C: FAQ topic=description + F002 eligible for Grounding",
);
assert(descriptionEval.grounding.status !== undefined, "C: Grounding ran");

const featuresFaq = withFaq([
  {
    question: "What mechanism does the feature story connect to daily movement?",
    answer: "The source connects supporting synovial-fluid quality with practical goals such as bending and walking.",
    topic: "features",
    evidenceIds: ["F003"],
  },
]);
const featuresEval = evaluateStructuredPage(featuresFaq, facts, "Joint Genesis", "https://example.com/hop");
assert(
  !featuresEval.structuralViolations.some(
    (item) => item.code === "INVALID_FAQ_TOPIC" || (item.code === "CLOSED_TOPIC" && item.text.includes("What mechanism")),
  ),
  "D: FAQ topic=features + F003 eligible for Grounding",
);

const ingredientsFaq = validateStructuredPage(
  withFaq([
    {
      question: "What ingredients are in Joint Genesis?",
      answer: "Mobilee is included in the blend.",
      topic: "ingredients",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(
  ingredientsFaq.violations.some((item) => item.code === "CLOSED_TOPIC"),
  "E: FAQ topic=ingredients while closed is BLOCKED",
);

const zeroFaq = validateStructuredPage(thinPage(), facts);
assert(zeroFaq.violations.length === 0, "F: FAQ=[] VALID");
const emptyFaqBlock = thinPage();
emptyFaqBlock.blocks.push({ id: "BFAQ0", type: "FAQ", evidenceIds: ["F002"], content: "", items: [] });
assert(validateStructuredPage(emptyFaqBlock, facts).violations.length === 0, "F: empty FAQ items remain valid");

assert(classifyIngredientLanguage("five targeted ingredients") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT, "G: class");
assert(
  !validateGrounding("five targeted ingredients", facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "G: five targeted ingredients is NOT a named-ingredient claim",
);

assert(classifyIngredientLanguage("the ingredients") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT, "H: class");
assert(
  !validateGrounding("the ingredients", facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "H: the ingredients is NOT a named-ingredient claim",
);

assert(classifyIngredientLanguage("ingredient names") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT, "I: class");
assert(
  !validateGrounding("ingredient names", facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "I: ingredient names is NOT a named-ingredient claim",
);

assert(
  classifyIngredientLanguage("ingredients working together") === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT,
  "J: working together is not a named-ingredient entity",
);
const together = validateGrounding("The ingredients working together support movement.", facts);
assert(
  !together.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "J: not classified as named ingredient",
);
assert(
  together.unsupportedClaims.some((item) => item.claimClass === CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT) ||
    together.status !== "GROUNDED",
  "J: semantic claim is still evaluated",
);

assert(classifyIngredientLanguage("Contains Mobilee") === CLAIM_CLASS_NAMED_INGREDIENT, "K: class");
assert(
  validateGrounding("Contains Mobilee.", facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "K: Contains Mobilee is NAMED_INGREDIENT / unsupported",
);

assert(classifyIngredientLanguage("Includes Boswellia") === CLAIM_CLASS_NAMED_INGREDIENT, "L: class");
assert(validateGrounding("Includes Boswellia.", facts).status === "UNGROUNDED", "L: Includes Boswellia unsupported");

assert(classifyIngredientLanguage("BioPerine improves absorption") === CLAIM_CLASS_NAMED_INGREDIENT, "M: class");
assert(
  validateGrounding("BioPerine improves absorption.", facts).unsupportedClaims.some((item) =>
    /named ingredient/i.test(item.reason),
  ),
  "M: BioPerine is NAMED_INGREDIENT / unsupported",
);

const synergy = validateGrounding("The five ingredients work synergistically.", facts);
assert(
  !synergy.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "N: synergy is not a named-ingredient entity",
);
assert(
  synergy.unsupportedClaims.some((item) => /synerg|together/i.test(item.reason) || /unsupported/i.test(item.reason)),
  "N: synergy is semantically unsupported",
);

const restatement =
  "The product is described as using five targeted ingredients.";
assert(
  validateGenerationPlan(restatement, plan).violations.every((item) => item.topic !== "ingredients"),
  "O: eligible five targeted ingredients restatement is not CLOSED_TOPIC=ingredients",
);
assert(
  !validateGrounding(restatement, facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "O: restatement is eligible for Grounding without named-ingredient false positive",
);

assert(
  validateGenerationPlan("180-day refund", plan).violations.some((item) => item.topic === "guarantee"),
  "P: 180-day refund BLOCKED",
);
assert(
  validateGrounding("180-day refund", facts).unsupportedClaims.some((item) => /guarantee|refund/i.test(item.reason)),
  "P: 180-day refund is unsupported without guarantee field",
);

assert(
  validateGenerationPlan("180-day money-back guarantee", plan).violations.some((item) => item.topic === "guarantee"),
  "Q: 180-day money-back guarantee BLOCKED",
);

assert(
  validateGenerationPlan("180-day vendor", plan).violations.every((item) => item.topic !== "guarantee"),
  "R: ambiguous 180-day vendor does not grant guarantee authority",
);
assert(
  !validateGrounding("180-day vendor", facts).unsupportedClaims.some((item) => /guarantee|refund/i.test(item.reason)),
  "R: 180-day vendor is not treated as a guarantee claim",
);

assert(
  validateGenerationPlan("The source describes a simple once-each-morning formula.", plan).violations.every(
    (item) => item.topic !== "usage",
  ),
  "S: once each morning conservative feature restatement is eligible",
);
assert(
  !validateGrounding("The product is designed as a simple once-each-morning formula.", facts).unsupportedClaims.some(
    (item) => /dosage|usage/i.test(item.reason),
  ),
  "S: once-each-morning restatement does not require usage field",
);

assert(
  validateGenerationPlan("Take one capsule each morning", plan).violations.some((item) => item.topic === "usage"),
  "T: Take one capsule each morning is a usage authority violation",
);

assert(
  validateGenerationPlan("recommended once daily", plan).violations.some((item) => item.topic === "usage"),
  "U: recommended once daily is a usage authority violation",
);

const faq20 = validateStructuredPage(
  withFaq([
    {
      question: "What is described?",
      answer: nWords(20),
      topic: "description",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(!faq20.violations.some((item) => item.code === "WORD_BUDGET"), "WORD 20 PASS");

const faq35 = validateStructuredPage(
  withFaq([
    {
      question: "What is described?",
      answer: nWords(35),
      topic: "description",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(!faq35.violations.some((item) => item.code === "WORD_BUDGET"), "WORD 35 PASS");

const faq36 = validateStructuredPage(
  withFaq([
    {
      question: "What is described?",
      answer: nWords(36),
      topic: "description",
      evidenceIds: ["F002"],
    },
  ]),
  facts,
);
assert(faq36.violations.some((item) => item.code === "WORD_BUDGET"), "WORD 36 BLOCK");

const fixtureRaw = readFileSync(
  path.join(process.cwd(), "scripts", "fixtures", "controlled-ready-04-structured.json"),
  "utf8",
);
const replayPages = parseStructuredVariants(fixtureRaw, 1);
assert(replayPages[0]?.blocks.some((block) => block.items?.some((item) => item.topic === "Product Purpose")), "RUN04 topics left unmodified");
assert(replayPages[0]?.blocks.some((block) => block.items?.some((item) => item.topic === "Approach")), "RUN04 Approach left unmodified");
const replay = evaluateStructuredPage(replayPages[0]!, facts, "Joint Genesis", "https://example.com/hop");
assert(
  replay.structuralViolations.some((item) => item.code === "INVALID_FAQ_TOPIC"),
  "RUN04 replay: free-text FAQ topics still FAIL",
);
const faqAnswers = replayPages[0]!.blocks.find((block) => block.type === "FAQ")?.items || [];
assert(countWords(faqAnswers[0]?.answer || "") > 35, "RUN04 FAQ1 exceeded 35 with compressible filler");
assert(countWords(faqAnswers[1]?.answer || "") > 35, "RUN04 FAQ2 exceeded 35 with compressible filler");
assert(
  !replay.grounding.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "RUN04 replay: generic ingredient wording is no longer a named-ingredient false positive",
);
assert(
  replay.grounding.unsupportedClaims.some((item) => /synerg|together/i.test(item.reason) || /unsupported/i.test(item.reason)),
  "RUN04 replay: real unsupported claims can still remain",
);

console.log("RUN04_FAQ1_WORDS=" + countWords(faqAnswers[0]?.answer || ""));
console.log("RUN04_FAQ2_WORDS=" + countWords(faqAnswers[1]?.answer || ""));
console.log("RUN04_NAMED_INGREDIENT_FPS=" + replay.grounding.unsupportedClaims.filter((item) => /named ingredient/i.test(item.reason)).length);
console.log(
  "RUN04_REMAINING_UNSUPPORTED=" +
    replay.grounding.unsupportedClaims.map((item) => `${item.claimClass || "SEMANTIC"}:${item.claim.slice(0, 60)}`).join(" | "),
);
