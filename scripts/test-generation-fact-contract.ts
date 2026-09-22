// npx tsx scripts/test-generation-fact-contract.ts
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { composePresellPage, consumerVisibleText } from "../src/lib/presell-page.ts";
import { emptyMarketSignals, formatSafeMarketContext } from "../src/lib/market-research/signals.ts";
import type { MarketResearchReport } from "../src/lib/market-research/types.ts";
import {
  buildGenerationFactManifest,
  emptyProductFacts,
  formatFactsForPrompt,
  getConsumerCopyEligibleFacts,
  productNameAuthority,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function baseFacts(): ProductFacts {
  const facts = emptyProductFacts("Sample Capsule", "https://example.test/product", "IMPORTED");
  facts.importQuality = "PARTIAL";
  facts.importWarnings = [];
  return facts;
}

function faqAdversarialFacts(): ProductFacts {
  const facts = baseFacts();
  facts.confidence.ingredientsOrComponents = "NOT_FOUND";
  facts.confidence.usageInformation = "NOT_FOUND";
  facts.confidence.manufacturer = "NOT_FOUND";
  facts.guaranteeInformation = "See the refund policy";
  facts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
  facts.sourceSnippets = [
    {
      field: "faq",
      text: "Ingredient Alpha and Ingredient Beta. Take one capsule daily. Manufactured in USA in a GMP facility. 180-day guarantee.",
      sourceUrl: "https://example.test/product",
      confidence: "DIRECT_SOURCE",
    },
    {
      field: "faq",
      text: "Manufacturer XYZ. Free from allergens, non-GMO, BPA-free. 30 servings. Contact support@example.test.",
      sourceUrl: "https://example.test/product",
      confidence: "DIRECT_SOURCE",
    },
  ];
  return facts;
}

function eligibleInverseFacts(): ProductFacts {
  const facts = baseFacts();
  facts.ingredientsOrComponents = ["Ingredient Alpha"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["Take one capsule daily"];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "60-day money-back guarantee";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  return facts;
}

function promptLeaks(prompt: string, needle: string): boolean {
  return prompt.toLowerCase().includes(needle.toLowerCase());
}

function groundingHit(result: ReturnType<typeof validateGrounding>, needle: string | RegExp): boolean {
  return result.unsupportedClaims.some((item) =>
    typeof needle === "string" ? item.claim.toLowerCase().includes(needle.toLowerCase()) : needle.test(item.claim),
  );
}

function campaignFor(body: string): Campaign {
  return {
    id: 1,
    name: "Test",
    slug: "sample-capsule-review",
    headline: "Sample Capsule Review",
    body,
    ctaLabel: "Learn More",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

const faqFacts = faqAdversarialFacts();
const faqPrompt = formatFactsForPrompt(faqFacts);
assert(!faqPrompt.includes("FAQ snippets from source"), "FAQ snippets are not a prompt section");
assert(!faqPrompt.includes("paraphrase; do not copy long passages"), "FAQ snippets are not presented as paraphrase evidence");
assert(!promptLeaks(faqPrompt, "Ingredient Alpha"), "A: FAQ ingredient is absent from generation prompt");
assert(!promptLeaks(faqPrompt, "Ingredient Beta"), "A: FAQ Ingredient Beta is absent");
assert(!promptLeaks(faqPrompt, "one capsule daily"), "B: FAQ dosage is absent from generation prompt");
assert(!promptLeaks(faqPrompt, "Manufactured in USA"), "C: FAQ manufacturer/location is absent");
assert(!promptLeaks(faqPrompt, "Manufacturer XYZ"), "C: FAQ manufacturer name is absent");
assert(!promptLeaks(faqPrompt, "180-day"), "D: FAQ 180-day guarantee is absent");
assert(!promptLeaks(faqPrompt, "GMP facility"), "C: FAQ GMP facility snippet is absent");
assert(!/NOT COPY-ELIGIBLE \(HEURISTIC_EXTRACTION\)/.test(faqPrompt) || !promptLeaks(faqPrompt, "See the refund policy"), "D: heuristic guarantee value is not prompt-visible");
assert(!promptLeaks(faqPrompt, "See the refund policy"), "D: heuristic guarantee text is absent");

const inverse = eligibleInverseFacts();
const inversePrompt = formatFactsForPrompt(inverse);
assert(promptLeaks(inversePrompt, "Ingredient Alpha"), "E: DIRECT_SOURCE ingredient is present");
assert(promptLeaks(inversePrompt, "Take one capsule daily"), "F: DIRECT_SOURCE usage is present");
assert(promptLeaks(inversePrompt, "60-day money-back guarantee"), "G: DIRECT_SOURCE guarantee is present");

const heuristicDesc = baseFacts();
heuristicDesc.description = "Secret heuristic description about Ingredient Alpha";
heuristicDesc.confidence.description = "HEURISTIC_EXTRACTION";
const heuristicPrompt = formatFactsForPrompt(heuristicDesc);
assert(!promptLeaks(heuristicPrompt, "Secret heuristic description"), "H: HEURISTIC description value is absent");
assert(/NOT COPY-ELIGIBLE \(HEURISTIC_EXTRACTION\)/.test(heuristicPrompt), "H: heuristic field is labeled not copy-eligible");

const missing = baseFacts();
missing.confidence.manufacturer = "NOT_FOUND";
const missingPrompt = formatFactsForPrompt(missing);
assert(/Manufacturer: NOT_FOUND/.test(missingPrompt), "I: NOT_FOUND manufacturer is labeled omit");
assert(!promptLeaks(missingPrompt, "Manufacturer XYZ"), "I: NOT_FOUND manufacturer has no leaked value");

const manual = emptyProductFacts("Manual Capsule", "", "MANUAL");
manual.description = "Operator attested daily capsule description";
manual.confidence.description = "MANUAL";
const manualPrompt = formatFactsForPrompt(manual);
assert(promptLeaks(manualPrompt, "Operator attested daily capsule description"), "J: MANUAL eligible fact is present");

const identityBefore = productNameAuthority({
  ...baseFacts(),
  productName: "Sample Capsule",
  confidence: { ...baseFacts().confidence, productName: "HEURISTIC_EXTRACTION" },
});
assert(identityBefore.authority === "OPERATOR_IDENTITY", "stored HEURISTIC productName is identity-only, not DIRECT_SOURCE");
const identityPrompt = formatFactsForPrompt({
  ...baseFacts(),
  productName: "Sample Capsule",
  confidence: { ...baseFacts().confidence, productName: "HEURISTIC_EXTRACTION" },
});
assert(promptLeaks(identityPrompt, "Sample Capsule"), "generation still receives the product identity name");
assert(!/Product name \[HEURISTIC_EXTRACTION\]/.test(identityPrompt), "heuristic productName is not labeled as a copy-eligible field fact");

const faqManifest = buildGenerationFactManifest(faqFacts);
assert(faqManifest.promptFactNotCopyEligible === 0, "FAQ adversarial manifest has NON_ELIGIBLE=0");
assert(
  faqManifest.items.every((item) => item.copyEligible),
  "every prompt fact is copy-eligible or identity-only",
);
assert(
  !faqManifest.items.some((item) => /Ingredient Alpha|one capsule|180-day|Manufacturer XYZ/i.test(item.value)),
  "manifest does not include FAQ snippet values",
);

const inverseManifest = buildGenerationFactManifest(inverse);
assert(inverseManifest.promptFactNotCopyEligible === 0, "eligible inverse manifest NON_ELIGIBLE=0");
assert(inverseManifest.items.some((item) => item.field === "ingredientsOrComponents" && item.value === "Ingredient Alpha"), "manifest includes DIRECT_SOURCE ingredient");

const generationPrompt = buildPrompt({ productName: faqFacts.productName, facts: faqFacts }).user;
assert(!promptLeaks(generationPrompt, "Ingredient Alpha"), "buildPrompt FAQ ingredient leak=NO");
assert(!promptLeaks(generationPrompt, "one capsule daily"), "buildPrompt FAQ usage leak=NO");
assert(!promptLeaks(generationPrompt, "Manufacturer XYZ"), "buildPrompt FAQ manufacturer leak=NO");
assert(!promptLeaks(generationPrompt, "180-day"), "buildPrompt FAQ guarantee leak=NO");
assert(generationPrompt.includes("If a field is absent, do not infer it") || buildPrompt({ productName: "X" }).system.includes("If a field is absent"), "field-aware absence contract is in the prompt");

const absenceFacts = baseFacts();
const absencePrompt = formatFactsForPrompt(absenceFacts);
assert(/ABSENT SUBJECTS/.test(absencePrompt), "absence contract lists omitted subjects");
assert(/manufacturer/i.test(absencePrompt), "absent manufacturer is called out as omit-subject");
assert(/pricing/i.test(absencePrompt), "absent pricing is called out as omit-subject");
assert(/guarantee/i.test(absencePrompt), "absent guarantee is called out as omit-subject");
assert(/dosage/i.test(absencePrompt), "absent usage/dosage is called out as omit-subject");
assert(!promptLeaks(absencePrompt, "consult your doctor"), "absent cautions do not inject consult-doctor as a fact");

const unsupportedCopy = [
  "Contains Ingredient Alpha and Ingredient Beta.",
  "Take one capsule daily. Each bottle has 30 servings.",
  "Manufactured by Manufacturer XYZ.",
  "Made in USA.",
  "GMP-certified facility.",
  "FDA-inspected facility.",
  "180-day refund.",
  "Available at a discount.",
  "Non-GMO and BPA-free.",
  "Allergen-free.",
  "This is a dietary supplement.",
  "Consult your doctor.",
].join(" ");

const emptyEligible = baseFacts();
const coverage = validateGrounding(unsupportedCopy, emptyEligible);
assert(coverage.status === "UNGROUNDED", "adversarial unsupported copy is UNGROUNDED");
assert(groundingHit(coverage, "Ingredient Alpha"), "L: unsupported named ingredient is detected");
assert(groundingHit(coverage, /one capsule daily/i), "M: unsupported dosage is detected");
assert(groundingHit(coverage, /30 servings/i), "M2: unsupported servings are detected");
assert(groundingHit(coverage, /Manufacturer XYZ/i), "manufacturer/company name is detected");
assert(groundingHit(coverage, /made in usa/i), "K: unsupported USA claim is detected");
assert(groundingHit(coverage, /gmp/i), "K: unsupported GMP claim is detected");
assert(groundingHit(coverage, /fda/i), "FDA-inspected facility is detected");
assert(groundingHit(coverage, /180-day refund/i), "N: unsupported guarantee is detected");
assert(groundingHit(coverage, /discount/i), "O: unsupported pricing/discount is detected");
assert(groundingHit(coverage, /non-gmo/i) || groundingHit(coverage, /gmo/i), "unsupported GMO claim is detected");
assert(groundingHit(coverage, /bpa/i), "unsupported BPA claim is detected");
assert(groundingHit(coverage, /allergen/i), "unsupported allergen claim is detected");
assert(groundingHit(coverage, /dietary supplement/i), "unsupported dietary-supplement claim is detected");
assert(groundingHit(coverage, /consult your doctor/i), "unsupported medical-advice claim is detected");

const namedOk = baseFacts();
namedOk.ingredientsOrComponents = ["Ingredient Alpha"];
namedOk.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
const namedGrounded = validateGrounding("Contains Ingredient Alpha.", namedOk);
assert(namedGrounded.status === "GROUNDED", "DIRECT_SOURCE ingredient name may ground a contains restatement");
const namedStrengthened = validateGrounding("Contains clinically proven Ingredient Alpha.", namedOk);
assert(namedStrengthened.status === "UNGROUNDED", "clinically proven is not grounded merely because the ingredient name exists");

const mfrOnly = baseFacts();
mfrOnly.manufacturer = "Manufacturer XYZ";
mfrOnly.confidence.manufacturer = "DIRECT_SOURCE";
const mfrNameOk = validateGrounding("Manufactured by Manufacturer XYZ.", mfrOnly);
assert(mfrNameOk.status === "GROUNDED", "DIRECT_SOURCE manufacturer name supports the company name");
const mfrGmp = validateGrounding("Manufacturer XYZ is a GMP-certified facility in the USA and FDA-inspected.", mfrOnly);
assert(mfrGmp.status === "UNGROUNDED", "manufacturer name does not automatically support GMP/USA/FDA");

const LIVE_NEGATED_CURE =
  "It is designed to support the body's natural joint-lubrication mechanisms and comfortable movement through daily use, but it does not claim to cure, treat, or prevent any disease.";
const jacketBody = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days.

${LIVE_NEGATED_CURE}`;
const negatedCure = lintCampaign(campaignFor(jacketBody)).findings.find((f) => f.ruleId === "health.cure");
assert(negatedCure?.status === "pass", "P: exact live negated cure disclaimer does not BLOCK health.cure");

const realCure = lintCampaign(campaignFor("This product cures arthritis.")).findings.find((f) => f.ruleId === "health.cure");
assert(realCure?.status === "fail" && realCure.blocking, "Q: actual cure claim remains health.cure BLOCK");

const disguised = lintCampaign(
  campaignFor("This isn't just relief — it cures the underlying condition."),
).findings.find((f) => f.ruleId === "health.cure");
assert(disguised?.status === "fail" && disguised.blocking, "disguised cure claim remains BLOCKED");

function parity(facts: ProductFacts, label: string): void {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const manifest = buildGenerationFactManifest(facts);
  const prompt = formatFactsForPrompt(facts);
  assert(manifest.promptFactNotCopyEligible === 0, `${label}: PROMPT_FACT_NOT_COPY_ELIGIBLE=0`);
  for (const item of manifest.items) {
    assert(item.copyEligible, `${label}: ${item.field} is copy-eligible`);
    assert(prompt.includes(item.value), `${label}: prompt contains ${item.field} value`);
    if (item.field === "productName") {
      assert(eligible.productName === item.value, `${label}: productName is representable by the shared helper`);
      continue;
    }
    const bag = [
      eligible.description,
      ...eligible.features,
      ...eligible.ingredientsOrComponents,
      ...eligible.usageInformation,
      ...eligible.cautions,
      eligible.pricingInformation,
      eligible.guaranteeInformation,
      eligible.manufacturer,
    ].join("\n");
    assert(bag.includes(item.value), `${label}: Grounding/composition helper contains ${item.field}`);
  }
  const composed = composePresellPage({
    variant: {
      approach: "REVIEW",
      headline: "Sample Capsule Review",
      body: "This product is described from eligible facts only.\n\n## Final Thoughts\nA straightforward option.",
      ctaLabel: "Learn More",
    },
    facts,
    template: "REVIEW",
  });
  const visible = consumerVisibleText(composed);
  for (const ingredient of eligible.ingredientsOrComponents) {
    assert(
      !visible.includes(ingredient) && !JSON.stringify(composed).includes(ingredient),
      `${label}: composer must not auto-inject eligible ingredient from raw ProductFacts`,
    );
  }
  assert(!visible.includes("Ingredient Beta") || eligible.ingredientsOrComponents.includes("Ingredient Beta"), `${label}: composition does not invent FAQ ingredients`);
}

parity(faqFacts, "R FAQ");
parity(inverse, "R eligible");
parity(manual, "R manual");
console.log("OK: R: GENERATION_GROUNDING_FACT_PARITY=PASS");

const composedFaq = composePresellPage({
  variant: {
    approach: "REVIEW",
    headline: "Sample Capsule Review",
    body: "This product is a daily option described from eligible facts.\n\n## Final Thoughts\nA straightforward option.",
    ctaLabel: "Learn More",
  },
  facts: faqFacts,
  template: "REVIEW",
});
const composedBlob = `${consumerVisibleText(composedFaq)}\n${JSON.stringify(composedFaq)}`;
assert(!composedBlob.includes("Ingredient Alpha"), "composition does not promote FAQ ingredients");
assert(!composedBlob.includes("180-day"), "composition does not promote FAQ guarantee");
assert(!composedBlob.includes("Manufacturer XYZ"), "composition does not promote FAQ manufacturer");

const leakSignals = emptyMarketSignals();
leakSignals.observedIntents = [
  {
    kind: "REVIEW_INTENT",
    strength: "WEAK",
    evidence: "Manufacturer XYZ Official Arthritis Relief $49 60-day guarantee",
    sourceUrl: "https://news.example/pr",
  },
];
const leakResearch: MarketResearchReport = {
  productName: "Sample Capsule",
  researchedAt: "2026-01-01T00:00:00.000Z",
  status: "FRESH",
  quality: "LOW",
  queriesUsed: ["Sample Capsule"],
  queryFamilies: [],
  queryOutcomes: [],
  providerMix: {
    DDG_QUERY_SUCCESS: 0,
    BRAVE_FALLBACK_ATTEMPTS: 0,
    BRAVE_FALLBACK_SUCCESS: 0,
    BRAVE_FALLBACK_FAILED: 0,
  },
  sources: [
    {
      url: "https://news.example/pr",
      title: "Manufacturer XYZ Official Arthritis Relief $49 60-day guarantee",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      relevantEvidence: "Pain Relief Arthritis",
      classification: "OTHER",
      classificationReason: "other",
      query: "sample",
      queryFamily: "PRODUCT",
      domain: "news.example",
      path: "/pr",
      promotional: true,
      usable: false,
      discoveredByProvider: "DUCKDUCKGO_HTML",
    },
  ],
  signals: leakSignals,
  diversity: {
    UNIQUE_DOMAINS: 1,
    SOURCE_CLASS_DIVERSITY: 1,
    SOURCE_CLASSES: ["OTHER"],
    PROMOTIONAL_SOURCES: 1,
    PROMOTIONAL_SOURCE_RATIO: 1,
    PROMOTIONAL_PATTERN_DETECTED: true,
    SEARCH_RESULTS_TOTAL: 1,
    USABLE_SOURCES: 0,
  },
  searchProvider: {
    name: "DUCKDUCKGO_HTML",
    configured: true,
    realWebSearchAvailable: true,
  },
  maxAgeHours: 24,
  discardedFabrications: [],
};
const safeMarket = formatSafeMarketContext(leakSignals);
assert(!/Manufacturer XYZ/.test(safeMarket), "Market Research: SERP manufacturer is not generation factual copy");
assert(!/\$49/.test(safeMarket), "Market Research: SERP price is not generation factual copy");
assert(safeMarket.includes("REVIEW_INTENT"), "Market Research: intent labels remain allowed strategy context");
const marketPrompt = buildPrompt({
  productName: faqFacts.productName,
  facts: faqFacts,
  marketResearch: leakResearch,
  targetApproach: "REVIEW",
}).user;
assert(!promptLeaks(marketPrompt, "Manufacturer XYZ Official"), "raw SERP titles are not generation factual copy");
assert(marketPrompt.includes("STRATEGY CONTEXT"), "intent/strategy context remains available");

console.log("\nTodos os testes do generation/grounding fact contract passaram.");
