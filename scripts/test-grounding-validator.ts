// npx tsx scripts/test-grounding-validator.ts
import {
  composePublicationGate,
  ctaImpliesOfficialAuthority,
  factsHaveOfficialIdentity,
  validateGrounding,
} from "../src/lib/ai/grounding-validator.ts";
import { emptyProductFacts, formatFactsForPrompt, isCopyEligibleConfidence } from "../src/lib/product-facts.ts";
import {
  GROUNDED_JACKET_PARAGRAPH,
  SANITIZED_BUYER_GUIDE_EXCERPT,
  SANITIZED_EDUCATIONAL_EXCERPT,
  SANITIZED_REVIEW_EXCERPT,
  UNSOURCED_DRUG_INTERACTION,
  UNSOURCED_QUANTITY_RANGE,
  UNSOURCED_RESEARCH,
  UNSOURCED_SAFETY,
  UNSOURCED_TIMELINE,
  UNSOURCED_TRIVIA,
} from "./fixtures/ungrounded-presell-copy.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function supplementFacts() {
  const facts = emptyProductFacts("Oral Tablet Example", "https://example.com/p", "IMPORTED");
  facts.description = "a chewable oral probiotic tablet";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["supports gums", "supports mouth bacteria"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Lactobacillus Paracasei"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["chew a tablet every morning"];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "60-day money-back guarantee";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.sourceSnippets = [
    {
      field: "features",
      text: "supports gums",
      sourceUrl: "https://example.com/p",
      confidence: "DIRECT_SOURCE",
    },
  ];
  facts.importQuality = "SUFFICIENT";
  return facts;
}

const facts = supplementFacts();

function claimsOf(copy: string): string {
  return validateGrounding(copy, facts)
    .unsupportedClaims.map((c) => `${c.claim} ${c.reason}`)
    .join(" | ")
    .toLowerCase();
}

for (const [label, excerpt] of [
  ["safety", UNSOURCED_SAFETY],
  ["drug interaction", UNSOURCED_DRUG_INTERACTION],
  ["quantity range", UNSOURCED_QUANTITY_RANGE],
  ["timeline", UNSOURCED_TIMELINE],
  ["research", UNSOURCED_RESEARCH],
  ["trivia", UNSOURCED_TRIVIA],
] as const) {
  const result = validateGrounding(excerpt, facts);
  assert(result.status === "UNGROUNDED", `${label} excerpt is UNGROUNDED`);
  assert(result.unsupportedClaims.length > 0, `${label} excerpt records an unsupported claim`);
}

assert(claimsOf(UNSOURCED_SAFETY).includes("safety"), "safety claim reason is recorded");
assert(claimsOf(UNSOURCED_DRUG_INTERACTION).includes("medication"), "drug-interaction reason is recorded");
assert(claimsOf(UNSOURCED_QUANTITY_RANGE).includes("statistic") || claimsOf(UNSOURCED_QUANTITY_RANGE).includes("quantity"), "quantity-range reason is recorded");
assert(claimsOf(UNSOURCED_TIMELINE).includes("timeline"), "timeline reason is recorded");
assert(claimsOf(UNSOURCED_RESEARCH).includes("research"), "research reason is recorded");
assert(claimsOf(UNSOURCED_TRIVIA).includes("trivia") || claimsOf(UNSOURCED_TRIVIA).includes("thousand"), "trivia reason is recorded");

assert(validateGrounding(SANITIZED_REVIEW_EXCERPT, facts).status === "UNGROUNDED", "sanitized REVIEW fixture is UNGROUNDED");
assert(validateGrounding(SANITIZED_EDUCATIONAL_EXCERPT, facts).status === "UNGROUNDED", "sanitized EDUCATIONAL fixture is UNGROUNDED");
assert(validateGrounding(SANITIZED_BUYER_GUIDE_EXCERPT, facts).status === "UNGROUNDED", "sanitized BUYER_GUIDE fixture is UNGROUNDED");

const jacketFacts = emptyProductFacts("Winter Jacket XT-200", "", "MANUAL");
jacketFacts.features = ["Water-resistant shell for commuting", "Insulated core for ordinary winter days"];
jacketFacts.confidence.features = "DIRECT_SOURCE";
jacketFacts.description = "a mid-weight insulated layer for daily cold weather";
jacketFacts.confidence.description = "MANUAL";
const jacketGround = validateGrounding(GROUNDED_JACKET_PARAGRAPH, jacketFacts);
assert(jacketGround.status === "GROUNDED", `ordinary jacket copy stays GROUNDED (veio ${jacketGround.status})`);
assert(jacketGround.unsupportedClaims.length === 0, "ordinary jacket copy has no unsupported additions");

const sellerBacked = validateGrounding(
  "The listing describes a chewable oral probiotic tablet. Chew a tablet every morning.",
  facts,
);
assert(sellerBacked.status === "GROUNDED", "source-backed restatement without encyclopedia fill stays GROUNDED");

assert(composePublicationGate("READY", "GROUNDED") === "READY", "GROUNDED + READY policy stays READY");
assert(
  composePublicationGate("READY", "REVIEW_REQUIRED") === "REVIEW_REQUIRED",
  "grounding REVIEW_REQUIRED blocks READY",
);
assert(composePublicationGate("READY", "UNGROUNDED") === "BLOCKED", "UNGROUNDED maps to BLOCKED, not READY");
assert(composePublicationGate("BLOCKED", "GROUNDED") === "BLOCKED", "policy BLOCKED is preserved");
assert(composePublicationGate("BLOCKED", "UNGROUNDED") === "BLOCKED", "BLOCKED wins over UNGROUNDED");
assert(composePublicationGate("REVIEW_REQUIRED", "GROUNDED") === "REVIEW_REQUIRED", "policy REVIEW_REQUIRED is not auto-READY");

assert(isCopyEligibleConfidence("DIRECT_SOURCE") === true, "DIRECT_SOURCE is copy-eligible");
assert(isCopyEligibleConfidence("MANUAL") === true, "MANUAL is copy-eligible");
assert(isCopyEligibleConfidence("HEURISTIC_EXTRACTION") === false, "HEURISTIC_EXTRACTION is not copy-eligible");
assert(isCopyEligibleConfidence("NOT_FOUND") === false, "NOT_FOUND is not copy-eligible");

function adversarialFacts(overrides: (facts: ReturnType<typeof emptyProductFacts>) => void) {
  const next = emptyProductFacts("Sample Product", "https://example.com/p", "IMPORTED");
  overrides(next);
  return next;
}

const testAFacts = adversarialFacts((f) => {
  f.description = "180-day vendor";
  f.confidence.description = "DIRECT_SOURCE";
  f.guaranteeInformation = "Read the full refund policy";
  f.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
});
const testA = validateGrounding("180-day refund policy", testAFacts);
assert(testA.status === "UNGROUNDED", `TEST A: 180-day refund from description+heuristic is UNSUPPORTED (veio ${testA.status})`);

const testBFacts = adversarialFacts((f) => {
  f.guaranteeInformation = "180-day money-back guarantee";
  f.confidence.guaranteeInformation = "DIRECT_SOURCE";
});
const testB = validateGrounding("180-day money-back guarantee", testBFacts);
assert(testB.status === "GROUNDED", `TEST B: same-field DIRECT_SOURCE guarantee is SUPPORTED (veio ${testB.status})`);

const testCFacts = adversarialFacts((f) => {
  f.confidence.cautions = "NOT_FOUND";
});
const testC = validateGrounding("Consult your doctor before use.", testCFacts);
assert(testC.status === "UNGROUNDED", "TEST C: consult doctor without cautions is UNSUPPORTED");

const testDFacts = adversarialFacts((f) => {
  f.cautions = ["Consult your healthcare provider before use."];
  f.confidence.cautions = "DIRECT_SOURCE";
});
const testD = validateGrounding("Consult your healthcare provider before use.", testDFacts);
assert(testD.status === "GROUNDED", `TEST D: sourced consult caution is SUPPORTED (veio ${testD.status})`);

const testE = validateGrounding("Do not use if pregnant or nursing.", testCFacts);
assert(testE.status === "UNGROUNDED", "TEST E: pregnant/nursing without cautions is UNSUPPORTED");

const testFFacts = adversarialFacts((f) => {
  f.description = "daily support";
  f.confidence.description = "DIRECT_SOURCE";
  f.confidence.usageInformation = "NOT_FOUND";
});
const testF = validateGrounding("Take one capsule daily.", testFFacts);
assert(testF.status === "UNGROUNDED", "TEST F: dosage from daily support is UNSUPPORTED");

const testGFacts = adversarialFacts((f) => {
  f.usageInformation = ["Take one capsule daily."];
  f.confidence.usageInformation = "DIRECT_SOURCE";
});
const testG = validateGrounding("Take one capsule daily.", testGFacts);
assert(testG.status === "GROUNDED", "TEST G: sourced dosage is SUPPORTED");

const testHFacts = adversarialFacts((f) => {
  f.description = "five targeted ingredients";
  f.confidence.description = "DIRECT_SOURCE";
  f.confidence.ingredientsOrComponents = "NOT_FOUND";
});
const testH = validateGrounding("Contains turmeric.", testHFacts);
assert(testH.status === "UNGROUNDED", "TEST H: named ingredient from count-only description is UNSUPPORTED");

const testIFacts = adversarialFacts((f) => {
  f.ingredientsOrComponents = ["Turmeric"];
  f.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
});
const testI = validateGrounding("Contains turmeric.", testIFacts);
assert(testI.status === "GROUNDED", "TEST I: named DIRECT_SOURCE ingredient is SUPPORTED");

const testJFacts = adversarialFacts((f) => {
  f.confidence.manufacturer = "NOT_FOUND";
});
const testJ = validateGrounding("Manufactured by BioDynamix.", testJFacts);
assert(testJ.status === "UNGROUNDED", "TEST J: manufacturer identity without evidence is UNSUPPORTED");

const testKFacts = adversarialFacts((f) => {
  f.confidence.pricingInformation = "NOT_FOUND";
});
const testK = validateGrounding("Available for $49.", testKFacts);
assert(testK.status === "UNGROUNDED", "TEST K: price without pricing evidence is UNSUPPORTED");

const testLFacts = adversarialFacts((f) => {
  f.description = "joint support supplement";
  f.confidence.description = "DIRECT_SOURCE";
});
const testL = validateGrounding("Treats arthritis.", testLFacts);
assert(testL.status === "UNGROUNDED", "TEST L: arthritis treatment from joint support is UNSUPPORTED");

const testM = validateGrounding("Joint support supplement", testLFacts);
assert(testM.status === "GROUNDED", `TEST M: restated DIRECT_SOURCE description is SUPPORTED (veio ${testM.status})`);

const testNFacts = adversarialFacts((f) => {
  f.guaranteeInformation = "Read the full refund policy";
  f.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
});
const testNPrompt = formatFactsForPrompt(testNFacts);
assert(!/Read the full refund policy/i.test(testNPrompt), "TEST N: heuristic guarantee value is absent from copy-eligible SOURCE FACTS");
assert(/NOT COPY-ELIGIBLE \(HEURISTIC_EXTRACTION\)/.test(testNPrompt), "TEST N: heuristic guarantee is labeled not copy-eligible");

const testOFacts = adversarialFacts((f) => {
  f.confidence.manufacturer = "NOT_FOUND";
});
assert(!factsHaveOfficialIdentity(testOFacts), "TEST O: no official brand evidence");
assert(ctaImpliesOfficialAuthority("Visit Official Website"), "TEST O: official CTA is detected");
const testO = validateGrounding("Learn more about this listing.\nVisit Official Website", testOFacts);
assert(testO.status === "UNGROUNDED", `TEST O: Official Website CTA without identity is rejected (veio ${testO.status})`);

assert(composePublicationGate("READY", "UNGROUNDED") === "BLOCKED", "TEST P: UNGROUNDED cannot be READY");
assert(composePublicationGate("READY", "UNGROUNDED") !== "READY", "TEST P: CONTENT_GATE != READY when UNGROUNDED");

const precisionAFacts = adversarialFacts((f) => {
  f.confidence.manufacturer = "NOT_FOUND";
});
const precisionA = validateGrounding("The product is manufactured in the USA.", precisionAFacts);
assert(precisionA.status === "UNGROUNDED", "PRECISION A: USA manufacture without manufacturer fact is UNSUPPORTED");

const precisionB = validateGrounding("Produced in a GMP-certified facility.", precisionAFacts);
assert(precisionB.status === "UNGROUNDED", "PRECISION B: GMP facility without manufacturer fact is UNSUPPORTED");

const precisionCFacts = adversarialFacts((f) => {
  f.manufacturer = "Manufactured in the USA in a GMP-certified facility.";
  f.confidence.manufacturer = "DIRECT_SOURCE";
});
const precisionC = validateGrounding(
  "Manufactured in the USA in a GMP-certified facility.",
  precisionCFacts,
);
assert(precisionC.status === "GROUNDED", `PRECISION C: manufacturer DIRECT_SOURCE supports the same claim (veio ${precisionC.status})`);

const precisionIngredientFacts = adversarialFacts((f) => {
  f.ingredientsOrComponents = ["A", "B", "C"];
  f.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
});
const precisionD = validateGrounding("Contains three listed ingredients.", precisionIngredientFacts);
assert(precisionD.status === "GROUNDED", `PRECISION D: pure listed ingredient count is SUPPORTED (veio ${precisionD.status})`);

const precisionE = validateGrounding(
  "Contains three clinically proven active ingredients.",
  precisionIngredientFacts,
);
assert(precisionE.status === "UNGROUNDED", "PRECISION E: qualified ingredient count without those qualifiers is UNSUPPORTED");

const precisionPrimary = validateGrounding("Contains three primary components.", precisionIngredientFacts);
assert(precisionPrimary.status === "UNGROUNDED", "PRECISION E2: primary-components count without that qualifier is UNSUPPORTED");

const precisionGuaranteeFacts = adversarialFacts((f) => {
  f.guaranteeInformation = "60-day money-back guarantee";
  f.confidence.guaranteeInformation = "DIRECT_SOURCE";
});
const precisionF = validateGrounding("Comes with a 60-day money-back guarantee.", precisionGuaranteeFacts);
assert(precisionF.status === "GROUNDED", `PRECISION F: semantic guarantee restatement is SUPPORTED (veio ${precisionF.status})`);

const precisionG = validateGrounding(
  "You have 60 days to determine whether the product works.",
  precisionGuaranteeFacts,
);
assert(precisionG.status === "UNGROUNDED", "PRECISION G: trial-window expansion from a money-back guarantee is UNSUPPORTED");

const precisionH = validateGrounding("Guaranteed results within 60 days.", precisionGuaranteeFacts);
assert(precisionH.status === "UNGROUNDED", "PRECISION H: results-window expansion from a money-back guarantee is UNSUPPORTED");

const precisionLFacts = adversarialFacts((f) => {
  f.cautions = ["Consult your healthcare provider if taking medication."];
  f.confidence.cautions = "DIRECT_SOURCE";
});
const precisionL = validateGrounding(
  "Consult your healthcare provider if taking medication.",
  precisionLFacts,
);
assert(precisionL.status === "GROUNDED", `PRECISION L: sourced caution restatement is GROUNDED (veio ${precisionL.status})`);

const dietaryExpand = validateGrounding("This dietary supplement is popular.", testLFacts);
assert(dietaryExpand.status === "UNGROUNDED", "dietary supplement expansion without explicit wording is UNSUPPORTED");

const manufacturerClaims = validateGrounding("We reviewed the manufacturer's claims in the listing.", testJFacts);
assert(manufacturerClaims.status === "UNGROUNDED", "manufacturer's claims without manufacturer evidence is UNSUPPORTED");

const resultsFaq = validateGrounding("How long until results?", testFFacts);
assert(resultsFaq.status === "UNGROUNDED", "results-timeline FAQ without evidence is UNSUPPORTED");

console.log("\nTodos os testes do grounding validator passaram.");
