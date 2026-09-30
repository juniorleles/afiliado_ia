// npx tsx scripts/test-faq-presupposition-evidence.ts
import { evidenceBackedFaqTopics } from "../src/lib/ai/faq-question-semantics.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function hasReason(text: string, facts: ReturnType<typeof emptyProductFacts>, reason: string): boolean {
  return validateGrounding(text, facts).unsupportedClaims.some((item) => item.reason === reason);
}

const named = emptyProductFacts("Harbor Trail Capsule", "https://example.com/harbor", "IMPORTED");
named.description = "A daily capsule described on the product page.";
named.confidence.description = "DIRECT_SOURCE";
named.usageInformation = ["Take one capsule daily with a meal and a glass of water."];
named.confidence.usageInformation = "DIRECT_SOURCE";
named.ingredientsOrComponents = ["Harbor Leaf", "Trail Root", "Copper"];
named.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
named.guaranteeInformation = "The seller publishes a 60-day return policy.";
named.confidence.guaranteeInformation = "DIRECT_SOURCE";
named.pricingInformation = "One bottle is listed at $49.";
named.confidence.pricingInformation = "DIRECT_SOURCE";

assert(
  !hasReason("How do you take Harbor Trail Capsule?", named, "UNSUPPORTED_USAGE_PRESUPPOSITION"),
  "plain how-to-take question is grounded when usage evidence exists",
);
assert(
  !hasReason("Which ingredient is listed?", named, "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "listed-ingredient question is grounded when ingredient evidence exists",
);
assert(
  !hasReason("Which ingredients are listed?", named, "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "plural listed-ingredient question is grounded when ingredient evidence exists",
);

const noUsage = emptyProductFacts("Harbor Trail Capsule", "https://example.com/harbor", "IMPORTED");
noUsage.description = named.description;
noUsage.confidence.description = "DIRECT_SOURCE";
noUsage.ingredientsOrComponents = named.ingredientsOrComponents;
noUsage.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
assert(
  hasReason("How do you take Harbor Trail Capsule?", noUsage, "UNSUPPORTED_USAGE_PRESUPPOSITION"),
  "how-to-take question stays blocked when usage evidence is absent",
);

const noIngredients = emptyProductFacts("Harbor Trail Capsule", "https://example.com/harbor", "IMPORTED");
noIngredients.description = named.description;
noIngredients.confidence.description = "DIRECT_SOURCE";
noIngredients.usageInformation = named.usageInformation;
noIngredients.confidence.usageInformation = "DIRECT_SOURCE";
assert(
  hasReason("Which ingredient is listed?", noIngredients, "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "listed-ingredient question stays blocked when ingredient evidence is absent",
);

assert(
  hasReason("What ingredients does it contain?", named, "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "a containment question stays blocked",
);
assert(
  hasReason("How quickly will results appear?", named, "UNSUPPORTED_RESULTS_TIMELINE_PRESUPPOSITION"),
  "a results question stays blocked",
);
assert(
  hasReason("How does it reduce inflammation?", named, "UNSUPPORTED_MEDICAL_PRESUPPOSITION"),
  "a medical question stays blocked",
);
assert(
  hasReason("What is the return policy?", named, "UNSUPPORTED_GUARANTEE_PRESUPPOSITION"),
  "a guarantee question stays blocked without guarantee authority",
);
assert(
  hasReason("How much does Harbor Trail Capsule cost?", named, "UNSUPPORTED_FACTUAL_PRESUPPOSITION"),
  "a price question is not grounded by usage or ingredient evidence",
);
const safety = "Is Harbor Trail Capsule safe to take?";
assert(
  evidenceBackedFaqTopics(safety, {
    usage: "Take one capsule daily with a meal and a glass of water.",
    ingredients: "Harbor Leaf",
  }).length === 0,
  "a safety question receives no usage or ingredient authority",
);
assert(
  validateGrounding(safety, named).unsupportedClaims.map((item) => item.reason).join("|") ===
    validateGrounding(safety, noUsage).unsupportedClaims.map((item) => item.reason).join("|"),
  "usage evidence does not ground a safety question",
);
const evaluative = "Why is Harbor Trail Capsule so easy to take?";
assert(
  evidenceBackedFaqTopics(evaluative, {
    usage: "Take one capsule daily with a meal and a glass of water.",
    ingredients: "Harbor Leaf",
  }).length === 0,
  "an evaluative usage question receives no usage authority",
);
assert(
  validateGrounding(evaluative, named).unsupportedClaims.some((item) => item.severity === "hard"),
  "an evaluative usage question stays blocked",
);

const wrongSlot: FaqAuthorityBinding = {
  question: "How do you take Harbor Trail Capsule?",
  field: "description",
  topic: "description",
  semanticAuthority: "DESCRIPTION",
  authorizedTopics: ["description"],
  supportText: named.description,
  closedTopics: ["usage"],
};
const leaked = validateGrounding("How do you take Harbor Trail Capsule?", named, { faqAuthorities: [wrongSlot] });
assert(
  leaked.unsupportedClaims.some((item) => item.reason === "UNSUPPORTED_USAGE_PRESUPPOSITION"),
  "a description-owned slot does not authorize a usage question",
);

const ordinary = validateGrounding("Harbor Trail Capsule cures joint pain overnight.", named);
assert(
  ordinary.unsupportedClaims.some((item) => item.severity === "hard"),
  "an ordinary unsupported claim stays blocked",
);
