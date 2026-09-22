// npx tsx scripts/test-generation-topic-budget.ts
import {
  createGenerationPlan,
  isKnowledgeExpansion,
  validateGenerationPlan,
} from "../src/lib/ai/generation-plan.ts";
import { buildPrompt, lintVariant } from "../src/lib/ai/generate-variants.ts";
import { composePublicationGate, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { emptyProductFacts, getConsumerCopyEligibleFacts } from "../src/lib/product-facts.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function thinFacts() {
  const facts = emptyProductFacts("Sample Capsule", "https://example.test/p", "IMPORTED");
  facts.description = "Supports synovial-fluid quality for comfortable movement with botanical compounds.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = [
    "The formula story mentions botanical compounds and once each morning use as part of daily comfort.",
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

function hasTopic(plan: ReturnType<typeof createGenerationPlan>, topic: string, open: boolean) {
  return open ? plan.allowedTopics.includes(topic as never) : plan.closedTopics.includes(topic as never);
}

const thin = thinFacts();
const plan = createGenerationPlan(thin);
assert(plan.coverage === "THIN", "A: THIN topic budget coverage");
assert(plan.thinMode === true, "A: THIN_FACT_MODE enabled");
assert(plan.generationRoute === "DETERMINISTIC_THIN", "A: THIN uses DETERMINISTIC_THIN route");
assert(hasTopic(plan, "identity", true), "A: identity OPEN");
assert(hasTopic(plan, "description", true), "A: description OPEN");
assert(hasTopic(plan, "features", true), "A: features OPEN");
assert(hasTopic(plan, "ingredients", false), "B: ingredients CLOSED");
assert(hasTopic(plan, "usage", false), "C: usage CLOSED");
assert(hasTopic(plan, "manufacturer", false), "D: manufacturer CLOSED");
assert(hasTopic(plan, "pricing", false), "E: pricing CLOSED");
assert(hasTopic(plan, "guarantee", false), "F: guarantee heuristic CLOSED");
assert(hasTopic(plan, "results_timeline", false), "G: results timeline CLOSED");
assert(hasTopic(plan, "category_classification", false), "H: category classification CLOSED");
assert(hasTopic(plan, "background_science", false), "I: background science CLOSED");
assert(plan.disallowedSections.includes("Ingredients / Components"), "B: ingredients section disallowed");
assert(plan.disallowedSections.includes("How It Works / How to Use"), "C: usage section disallowed");
assert(plan.disallowedSections.includes("Manufacturer"), "D: manufacturer section disallowed");
assert(plan.disallowedSections.includes("Pricing"), "E: pricing section disallowed");
assert(plan.disallowedSections.includes("Guarantee"), "F: guarantee section disallowed");

const prompt = buildPrompt({ productName: thin.productName, facts: thin }).user;
assert(prompt.includes("GENERATION PLAN"), "topic budget is visible in the production prompt");
assert(prompt.includes("CLOSED_TOPICS:"), "CLOSED_TOPICS are explicit");
assert(/CATEGORY CLOSED|category_classification/.test(prompt), "prompt prevents supplement category");
assert(/USAGE CLOSED/.test(prompt), "prompt prevents dosage promotion");
assert(/MANUFACTURER CLOSED/.test(prompt), "prompt prevents manufacturer discussion");
assert(/PRICING CLOSED/.test(prompt), "prompt prevents pricing discussion");
assert(/GUARANTEE CLOSED/.test(prompt), "prompt prevents guarantee discussion");
assert(/RESULTS TIMELINE CLOSED/.test(prompt), "prompt prevents results timeline");
assert(/BACKGROUND SCIENCE CLOSED/.test(prompt), "prompt prohibits background science");
assert(/MISSING_FACT_IS_OMISSION_NOT_CONTENT/.test(prompt), "prompt prohibits absence commentary");
assert(/THIN_FACT_MODE/.test(prompt), "thin mode behavior is in the prompt");
assert(!/FAQ snippets from source/.test(prompt), "FAQ firewall remains active");

const eligible = getConsumerCopyEligibleFacts(thin);
assert(eligible.ingredientsOrComponents.length === 0, "fact contract still omits ineligible ingredients");
assert(eligible.manufacturer === "", "fact contract still omits manufacturer");

const adversarial = [
  "Joint Genesis is a dietary supplement.",
  "Take one dose each morning.",
  "Synovial fluid is the body's natural lubricant and cushion.",
  "The manufacturer does not disclose its facility.",
  "Ingredient names are not disclosed.",
  "How long does it take to notice results?",
].join("\n");
const adversarialHits = validateGenerationPlan(adversarial, plan).violations;
const topics = new Set(adversarialHits.map((item) => item.topic));
assert(topics.has("category_classification"), "N: supplement classification violation detected");
assert(topics.has("usage"), "O: dosage violation detected");
assert(topics.has("background_science"), "S: synovial encyclopedia expansion detected");
assert(topics.has("manufacturer"), "P: manufacturer absence statement violation detected");
assert(topics.has("ingredients"), "K: missing-field absence commentary is a plan violation");
assert(topics.has("results_timeline"), "G/J: results-timeline FAQ is a plan violation");
assert(
  adversarialHits.some((item) => /dietary supplement/i.test(item.text)),
  "SUPPLEMENT_CATEGORY=VIOLATION",
);

const featureOk = validateGenerationPlan(
  "The source describes the product in the context of once-each-morning use.",
  plan,
);
assert(
  featureOk.violations.every((item) => item.topic !== "usage"),
  "L: conservative feature restatement is not usage promotion",
);
const featureBad = validateGenerationPlan("Take one capsule each morning.", plan);
assert(
  featureBad.violations.some((item) => item.topic === "usage"),
  "L: Take one capsule each morning is CLOSED_USAGE_TOPIC",
);
const dosageBad = validateGenerationPlan("Recommended dosage is one dose daily.", plan);
assert(
  dosageBad.violations.some((item) => item.topic === "usage"),
  "O: recommended dosage is CLOSED_USAGE_TOPIC",
);
assert(plan.factualFieldsMissing.includes("usageInformation"), "FEATURE_ONCE_MORNING does not open usage field");

const guaranteePromo = validateGenerationPlan("This product has a 180-day refund policy.", plan);
assert(
  guaranteePromo.violations.some((item) => item.topic === "guarantee"),
  "M: description/vendor mention does not grant guarantee authority",
);

const support = `${thin.description}\n${thin.features.join("\n")}`;
assert(
  isKnowledgeExpansion("Synovial fluid is the body's natural lubricant and cushion.", support),
  "B knowledge: lubricant/cushion is expansion",
);
assert(
  isKnowledgeExpansion("Healthy synovial fluid reduces friction between cartilage surfaces.", support),
  "C knowledge: friction/cartilage is expansion",
);
assert(
  isKnowledgeExpansion("This mechanism improves mobility by reducing joint friction.", support),
  "D knowledge: mobility causal chain is expansion",
);
assert(
  !isKnowledgeExpansion("Sample Capsule is described as supporting synovial-fluid quality.", support),
  "T: conservative synovial restatement is not knowledge expansion",
);

const conservativeCopy = "Sample Capsule is described as supporting synovial-fluid quality.";
const conservativePlan = validateGenerationPlan(conservativeCopy, plan);
assert(
  conservativePlan.violations.every((item) => item.topic !== "background_science"),
  "T: conservative synovial restatement is allowed by the generation plan",
);
const conservative = validateGrounding(conservativeCopy, thin);
assert(
  !conservative.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "T: conservative restatement remains eligible for Grounding evaluation",
);

const absenceGround = validateGrounding("Ingredient names are not disclosed.", thin);
assert(
  !absenceGround.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "Q: ingredient absence statement is NOT misclassified as named ingredient",
);
const named = validateGrounding("Contains Mobilee.", thin);
assert(named.status === "UNGROUNDED", "R: named real ingredient still detected");
assert(
  named.unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "R: Contains Mobilee is a named-ingredient claim",
);
assert(validateGrounding("Includes Boswellia.", thin).status === "UNGROUNDED", "R: Includes Boswellia still detected");
assert(validateGrounding("BioPerine improves absorption.", thin).status === "UNGROUNDED", "R: BioPerine still detected");

const lintedBad = lintVariant(
  {
    approach: "REVIEW",
    headline: "Sample Capsule Review",
    body: "Joint Genesis is a dietary supplement.\n\nTake one dose each morning.\n\n## Final Thoughts\nA short close.",
    ctaLabel: "Learn More",
  },
  "Sample Capsule",
  "https://example.com/hop",
  thin,
);
assert(lintedBad.generationPlanViolations && lintedBad.generationPlanViolations.length > 0, "U: plan violations recorded");
assert(lintedBad.finalGate !== "READY", "U: Generation Plan violations prevent READY");
assert(lintedBad.grounding.status === "UNGROUNDED" || lintedBad.finalGate === "BLOCKED", "V: Grounding still runs alongside the plan");

const lintedUngrounded = lintVariant(
  {
    approach: "REVIEW",
    headline: "Sample Capsule Notes",
    body: "People comparing several similar options in neighborhood stores often talk about ordinary winter errands and school runs.",
    ctaLabel: "Learn More",
  },
  "Sample Capsule",
  "https://example.com/hop",
  thin,
);
assert(
  (lintedUngrounded.generationPlanViolations || []).length === 0 ||
    lintedUngrounded.grounding.status === "UNGROUNDED",
  "V: Grounding remains required even when plan scan is clean or mixed",
);
assert(lintedUngrounded.finalGate !== "READY" || lintedUngrounded.grounding.status === "GROUNDED", "V: READY still requires Grounding");
assert(composePublicationGate("READY", "UNGROUNDED") === "BLOCKED", "V: UNGROUNDED still cannot be READY");

function makeCampaign(body: string): Campaign {
  return {
    id: 1,
    name: "Test",
    slug: "winter-jacket-review",
    headline: "Winter Jacket XT-200 Review: Does It Actually Keep You Warm?",
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

const jacket = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting when temperatures drop. It is a clothing product, not a treatment.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Standard front zipper and pockets

## Who May Consider It?

People who want a practical winter coat for short outdoor trips, school runs, or a cold commute.

## Things to Consider

Fit can run large. Check the merchant size chart before you buy. Weather protection depends on what you wear underneath.

## FAQ

- Does it replace a technical mountaineering suit? No. It is a daily winter jacket.
- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days and you already like this silhouette.
`;
assert(
  lintCampaign(makeCampaign(jacket)).findings.find((f) => f.ruleId === "health.cure")?.status === "pass",
  "W: clean factual clothing copy has no health.cure fail",
);
const cure = lintCampaign(
  makeCampaign(jacket + "\n\nThis product cures arthritis."),
).findings.find((f) => f.ruleId === "health.cure");
assert(cure?.status === "fail", "W: real cure claim still BLOCKS");
const disclaimer = lintCampaign(
  makeCampaign(
    jacket +
      "\n\nIt is designed to support the body's natural joint-lubrication mechanisms and comfortable movement through daily use, but it does not claim to cure, treat, or prevent any disease.",
  ),
).findings.find((f) => f.ruleId === "health.cure");
assert(disclaimer?.status === "pass", "W: negated cure disclaimer still does not BLOCK");

assert(plan.allowedTopics.includes("features"), "J: FAQ budget can only use open topics");
assert(!plan.allowedTopics.includes("usage"), "J: dosage FAQ is not in the allowed topic budget");

console.log("\nTodos os testes do generation topic budget passaram.");
