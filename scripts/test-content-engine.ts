// npx tsx scripts/test-content-engine.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  campaignFromVariant,
  emptyHeadingTitles,
  lintVariant,
  longestSharedPhrase,
  parseVariantsResponse,
  VARIANT_APPROACHES,
  type Variant,
} from "../src/lib/ai/generate-variants.ts";
import { applyManualFacts, emptyProductFacts, formatFactsForPrompt } from "../src/lib/product-facts.ts";
import { extractProductFacts } from "../src/lib/import-product.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string): string {
  return path.join(process.cwd(), rel);
}

const FACTUAL_BODY = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting when temperatures drop.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell

## Who May Consider It?

People who want a practical winter coat for short outdoor trips.

## Pros and Cons

- Warm enough for most winter days
- Sold through a third-party merchant, so pricing can change

## Things to Consider

Fit can run large. Check the merchant size chart.

## FAQ

- Is it a medical device? No.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days.
`;

const variants: Variant[] = parseVariantsResponse(
  JSON.stringify([
    { approach: "REVIEW", headline: "XT-200 Review: A Daily Winter Coat", body: FACTUAL_BODY, ctaLabel: "Check Current Price" },
    { approach: "EDUCATIONAL", headline: "What a Mid-Weight Jacket Is For", body: FACTUAL_BODY, ctaLabel: "Visit Official Website" },
    { approach: "BUYER_GUIDE", headline: "How to Choose a Winter Jacket", body: FACTUAL_BODY, ctaLabel: "View Product Details" },
  ]),
);

assert(variants.length === 3, "exactly 3 variants");
assert(
  variants.map((v) => v.approach).join(",") === VARIANT_APPROACHES.join(","),
  "approaches are REVIEW, EDUCATIONAL, BUYER_GUIDE",
);

for (const variant of variants) {
  const linted = lintVariant(variant, "Winter Jacket XT-200", "https://example.com/hop");
  assert(typeof linted.lint.gate === "string", `${variant.approach} received a Policy Linter V2 gate`);
  assert(linted.lint.gate === "READY" || linted.lint.gate === "REVIEW_REQUIRED" || linted.lint.gate === "BLOCKED", `${variant.approach} gate is a known value`);
  assert(linted.finalGate === linted.lint.gate, `${variant.approach} without facts keeps policy as final gate`);
  assert(linted.grounding.status === "GROUNDED", `${variant.approach} skips grounding when facts are omitted`);
  assert(linted.wordCount > 40, `${variant.approach} has informational word count`);
  assert(emptyHeadingTitles(variant.body).length === 0, `${variant.approach} has no forced empty sections`);
}

const emptySectionBody = "## What Is X?\n\n## Key Features\n\n- A real feature";
assert(emptyHeadingTitles(emptySectionBody).includes("What Is X?"), "empty heading detector catches a forced empty section");

const sourcePassage =
  "Water-resistant shell for commuting in real rain and a packable hood for windy platforms near the station every morning.";
const copied = `Intro paragraph.\n\n${sourcePassage}\n\n## Final Thoughts\n\nDone.`;
const original = "This jacket is described as water-resistant. The listing also mentions a hood.\n\n## Final Thoughts\n\nUseful for ordinary winter days.";
assert(longestSharedPhrase(copied, sourcePassage, 12) !== null, "verbatim source dump is detected");
assert(longestSharedPhrase(original, sourcePassage, 12) === null, "paraphrased copy is not flagged as a long dump");

const manual = applyManualFacts(emptyProductFacts("", "", "MANUAL"), {
  productName: "Manual Capsule",
  description: "Operator-entered description",
  featuresText: "Feature one\nFeature two",
  ingredientsText: "",
  pricingInformation: "",
});
assert(manual.origin === "MANUAL", "manual facts are labeled MANUAL");
assert(manual.features.length === 2, "manual feature lines are kept");
assert(manual.confidence.ingredientsOrComponents === "NOT_FOUND", "blank manual ingredients stay NOT_FOUND");
assert(manual.importWarnings.some((w) => /MANUAL PRODUCT FACTS/i.test(w)), "manual fallback is labeled for the operator");

const prompt = formatFactsForPrompt(manual);
assert(prompt.includes("Origin: MANUAL"), "prompt states MANUAL origin");
assert(prompt.includes("Feature one"), "manual features are sent as context");
assert(prompt.includes("Ingredients / components: NOT_FOUND"), "manual missing ingredients are not invented");

const imported = extractProductFacts(
  `<html><body><h1>X</h1><h2>Features</h2><ul><li>Documented zipper quality</li></ul></body></html>`,
  "https://example.com/x",
);
assert(imported.origin === "IMPORTED", "importer origin is IMPORTED");
assert(imported.confidence.features === "DIRECT_SOURCE", "imported headed features are DIRECT_SOURCE");

const copiedFromSource = lintVariant(
  {
    approach: "REVIEW",
    headline: "Joint Support Pro Review",
    body: `${FACTUAL_BODY}

This product is clinically proven. Peppermint is a natural anti-inflammatory that supports the immune system.

## Affiliate Disclosure

We may earn a commission.`,
    ctaLabel: "Check Current Price",
  },
  "Joint Support Pro",
  "https://example.com/hop",
);
assert(
  copiedFromSource.lint.blockingCount > 0,
  "DIRECT_SOURCE seller claims remain subject to Policy Linter V2 in generated copy",
);
assert(
  copiedFromSource.lint.majorFindings.some((f) => /clinically proven/i.test(`${f.ruleId} ${f.evidence ?? ""}`)) ||
    copiedFromSource.lint.gate === "BLOCKED",
  "clinically proven in copy is not whitelisted by importer provenance",
);

const ungroundedFacts = emptyProductFacts("Oral Tablet Example", "https://example.com/p", "IMPORTED");
ungroundedFacts.description = "a chewable oral probiotic tablet";
ungroundedFacts.confidence.description = "DIRECT_SOURCE";
ungroundedFacts.features = ["supports gums"];
ungroundedFacts.confidence.features = "DIRECT_SOURCE";
const ungroundedLint = lintVariant(
  {
    approach: "REVIEW",
    headline: "Oral Tablet Example Review",
    body: `${FACTUAL_BODY}

Probiotic supplements are generally considered safe for healthy individuals.
Research suggests many dental problems begin when the mouth's microbial balance shifts.

## Affiliate Disclosure

We may earn a commission.`,
    ctaLabel: "Check Current Price",
  },
  "Oral Tablet Example",
  "https://example.com/hop",
  ungroundedFacts,
);
assert(ungroundedLint.grounding.status !== "GROUNDED", "encyclopedia safety/research copy is not GROUNDED");
assert(ungroundedLint.finalGate !== "READY", "final gate is not READY when grounding fails");
assert(ungroundedLint.finalGate === "BLOCKED", "UNGROUNDED factual copy cannot be READY — CONTENT_GATE is BLOCKED");

const campaign = campaignFromVariant(variants[0], "Winter Jacket XT-200", "https://example.com/hop");
assert(campaign.publicationStatus === "draft", "variant mapped to a campaign stays draft");

const generateSrc = readFileSync(joinSrc("src/app/admin/generate/generate-client.tsx"), "utf8");
assert(generateSrc.includes("createCampaignAction"), "selected variant uses the existing create action");
assert(generateSrc.includes("DRAFT"), "UI states the campaign is DRAFT");
assert(!generateSrc.includes("publishCampaign"), "generate UI does not publish automatically");
assert(generateSrc.includes("Research market & recommend"), "facts review starts market research before equal-choice variants");
assert(generateSrc.includes("IMPORT QUALITY") || generateSrc.includes("Import quality"), "facts review shows import quality");
assert(generateSrc.includes("insufficient for grounded AI generation"), "INSUFFICIENT import blocks easy generate");
assert(generateSrc.includes("provenanceLabel"), "facts review shows provenance labels");
assert(generateSrc.includes("MANUAL PRODUCT FACTS"), "manual fallback is visible");
assert(generateSrc.includes("lint.gate"), "comparison UI shows policy gate");
assert(generateSrc.includes("Grounding:"), "comparison UI shows grounding status");
assert(generateSrc.includes("Unsupported factual additions"), "picker lists unsupported additions");
assert(generateSrc.includes("Health claim warnings"), "picker lists health claim warnings");
assert(generateSrc.includes("finalGate"), "picker shows composed final gate");
assert(generateSrc.includes("PAGE_TEMPLATES") || generateSrc.includes("Select Visual"), "variant selection leads to visual template picker");

const actionsSrc = readFileSync(joinSrc("src/app/admin/generate/actions.ts"), "utf8");
assert(actionsSrc.includes("lintVariant"), "server generation runs Policy Linter V2 on each variant");
assert(
  actionsSrc.includes("importProductFromUrl") || actionsSrc.includes("executeGenerateImport"),
  "import action still uses the importer",
);
const executeSrc = readFileSync(joinSrc("src/lib/execute-generate-import.ts"), "utf8");
assert(executeSrc.includes("importProductFromUrl"), "Import facts runner calls importProductFromUrl");

const importSrc = readFileSync(joinSrc("src/lib/import-product.ts"), "utf8");
assert(importSrc.includes("isAllowedByRobots"), "robots.txt is still checked before fetch");
assert(importSrc.includes("discoverByProductName") || importSrc.includes("recoverBlockedPrimarySource") || importSrc.includes("recoverFromPrimaryBlock"), "blocked primary sources search by product name");
assert(!/reconstruct.*domain|site:\$\{/.test(importSrc), "importer does not reconstruct the blocked domain as primary search");

console.log("\nTodos os testes do Content Engine V2 passaram.");
