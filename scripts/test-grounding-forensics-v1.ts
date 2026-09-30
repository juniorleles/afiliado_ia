/**
 * Semantic restatement and product-identity fixtures. Fictional products only.
 * Positive cases must ground; negative cases must stay ungrounded.
 */
import { readFileSync } from "node:fs";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { namedIngredientMentions } from "../src/lib/ai/ingredient-claims.ts";
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

type Fixture = { productName: string; usage?: string[]; ingredients?: string[]; cautions?: string[] };

function facts(fixture: Fixture): ProductFacts {
  const base = emptyProductFacts(fixture.productName, "https://seller.example/offer", "IMPORTED");
  return {
    ...base,
    usageInformation: fixture.usage ?? [],
    ingredientsOrComponents: fixture.ingredients ?? [],
    cautions: fixture.cautions ?? [],
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      usageInformation: fixture.usage?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      ingredientsOrComponents: fixture.ingredients?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      cautions: fixture.cautions?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
    },
    importQuality: "SUFFICIENT",
  };
}

const USAGE_SOURCE = "We recommend you slowly chew a tablet every morning.";
const usageFacts = facts({ productName: "AlphaNova", usage: [USAGE_SOURCE] });
const grounded = (copy: string, subject = usageFacts) => validateGrounding(copy, subject).status === "GROUNDED";

// --- POSITIVE: meaning-preserving grammatical transforms -----------------------------
assert(grounded("Chew one tablet slowly each morning."), "determiner + distributive + word order restatement grounds");
assert(grounded("Chew a tablet slowly every morning."), "plain restatement grounds");
assert(grounded("Slowly chew one tablet every morning."), "unit numeral for indefinite determiner grounds");
assert(grounded("Chew a tablet each morning."), "dropping an adverb grounds");

// --- NEGATIVE: any factual change must stay ungrounded --------------------------------
assert(!grounded("Chew two tablets slowly each morning."), "a different quantity does not ground");
assert(!grounded("Chew one tablet slowly each evening."), "a different time of day does not ground");
assert(!grounded("Swallow one tablet each morning."), "a different administration verb does not ground");
assert(!grounded("Chew one tablet immediately each morning."), "a different manner adverb does not ground");
assert(!grounded("Chew one tablet slowly each morning with water."), "an added instruction does not ground");

// --- NEGATIVE: containment must not invert a negated source ---------------------------
const negatedFacts = facts({ productName: "AlphaNova", usage: ["Do not chew a tablet slowly every morning."] });
assert(
  !grounded("Chew one tablet slowly each morning.", negatedFacts),
  "full token containment does not invert a negated source",
);

// --- NEGATIVE: unpaired numerals are never treated as determiners ---------------------
const cfuFacts = facts({ productName: "AlphaNova", ingredients: ["Contains 3.5 billion probiotic strains"] });
assert(
  validateGrounding("Contains one billion probiotic strains", cfuFacts).status !== "GROUNDED",
  "a numeral with no singular determiner in the source does not ground",
);

// --- PRODUCT IDENTITY vs NAMED INGREDIENT ---------------------------------------------
const identityFacts = facts({
  productName: "AlphaNova",
  cautions: ["If you take prescription medication, show a bottle of AlphaNova to your doctor before use."],
  ingredients: ["Lactobacillus X"],
});
const scopedToCautions = facts({
  productName: "",
  cautions: ["If you take prescription medication, show a bottle of AlphaNova to your doctor before use."],
});
const cautionCopy = "If you take prescription medication, show a bottle of AlphaNova to your doctor before use.";
const namedIngredientClaims = (result: ReturnType<typeof validateGrounding>) =>
  result.unsupportedClaims.filter((claim) => claim.claimClass === "NAMED_INGREDIENT").map((claim) => claim.claim);

assert(
  !namedIngredientClaims(validateGrounding(cautionCopy, identityFacts)).includes("AlphaNova"),
  "the product name is not an ingredient claim when identity is in the facts",
);
assert(
  namedIngredientClaims(validateGrounding(cautionCopy, scopedToCautions)).includes("AlphaNova"),
  "without identity the classifier still flags the token (the defect being repaired)",
);
assert(
  !namedIngredientClaims(validateGrounding(cautionCopy, scopedToCautions, { productIdentity: "AlphaNova" })).includes("AlphaNova"),
  "supplying the identity to a slot-scoped call clears the misclassification",
);
assert(
  namedIngredientMentions("Contains Lactobacillus X", { productName: "AlphaNova" }).length > 0,
  "a real named ingredient stays subject to ingredient authority",
);
assert(
  validateGrounding("Formula contains Lactobacillus X", facts({ productName: "AlphaNova" })).unsupportedClaims.some(
    (claim) => claim.claimClass === "NAMED_INGREDIENT",
  ),
  "a named ingredient without ingredient evidence remains unsupported",
);
assert(
  validateGrounding("AlphaNova contains AlphaNova", facts({ productName: "AlphaNova" })).unsupportedClaims.length > 0,
  "identity used as composition is not exempted",
);

// --- IDENTITY IS NOT EVIDENCE ---------------------------------------------------------
assert(
  validateGrounding("AlphaNova rebuilds enamel in two weeks.", facts({ productName: "AlphaNova" }), {
    productIdentity: "AlphaNova",
  }).status !== "GROUNDED",
  "passing the identity does not make unsupported copy grounded",
);

const validator = readFileSync("src/lib/ai/grounding-validator.ts", "utf8");
assert(!/(?:prodentim|joint[\s-]?genesis|alphanova)/i.test(validator), "the validator names no product");
assert(
  !/chew a tablet|slowly chew|each morning/i.test(validator),
  "the validator contains no fixture sentence allowlist",
);
assert(/0\.72/.test(validator) && /0\.4/.test(validator), "existing grounding thresholds are unchanged");

if (failed) {
  console.error("GROUNDING_FORENSIC_TESTS=FAIL " + failed);
  process.exit(1);
}
console.log("GROUNDING_FORENSIC_TESTS=PASS");
