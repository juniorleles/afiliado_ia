// npx tsx scripts/test-generic-fix-pass.ts
import { readFileSync } from "node:fs";
import { classifyAssetCandidate, looksLikePackageRaster } from "../src/lib/assets/classify.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import type { EvidenceSlot, EvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { hydrateSlotFillsToPage } from "../src/lib/ai/slot-generation.ts";
import { adaptStructuredToVariantCopy } from "../src/lib/ai/structured-generation.ts";
import { extractProductImage } from "../src/lib/product-image.ts";
import { emptyProductFacts, type ReturnsInformationFact } from "../src/lib/product-facts.ts";
import { classifyHeading, composePresellPage } from "../src/lib/presell-page.ts";
import { collectCandidateFailures } from "../src/lib/validation/taxonomy.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const facts = emptyProductFacts("Northwind Daily Capsule", "https://example.com/northwind", "IMPORTED");
facts.description = "A morning capsule described on the product page.";
facts.confidence.description = "DIRECT_SOURCE";
facts.usageInformation = ["Take one capsule daily with a meal and a glass of water."];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Copper & Selenium", "Harbor Leaf", "Northwind Root"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.returnsInformation = [
  {
    kind: "RETURN_WINDOW",
    statement: "You have 60 days after receiving your order.",
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://example.com/northwind/returns",
    sourcePageCategory: "RETURNS",
  } satisfies ReturnsInformationFact,
  {
    kind: "OTHER",
    statement: "Contact the seller if the package arrives damaged.",
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://example.com/northwind/returns",
    sourcePageCategory: "RETURNS",
  },
];

const page = composePresellPage({
  variant: {
    headline: "Northwind Daily Capsule",
    ctaLabel: "Learn More",
    approach: "REVIEW",
    body: `## What Is This Product?

Northwind Daily Capsule is a morning capsule.

## Pricing

STARTER package is $29 per bottle.

## Returns

You have 60 days after receiving your order.

## Shipping

Your order will be shipped within 24 to 48 hours.

## Guarantee

The seller states a 60-day money-back guarantee.`,
  },
  facts,
  template: "REVIEW",
});
const overview = page.sections.find((section) => section.id === "overview");
const overviewText = `${overview?.paragraphs.join(" ")} ${overview?.bullets.join(" ")}`;
assert(classifyHeading("Pricing") === "skip", "pricing heading is omitted");
assert(/morning capsule/.test(overviewText), "overview keeps product description");
assert(!/\$29|per bottle|60 days|shipped/.test(overviewText), "overview does not absorb pricing, returns, or shipping");
assert(
  page.sections.some((section) => section.id === "guarantee" && /money-back/.test(section.paragraphs.join(" "))),
  "guarantee still routes to its supported section",
);

function ingredientSlot(id: string, realized: string): EvidenceSlot {
  return {
    slotId: id,
    type: "INGREDIENTS",
    topic: "ingredients",
    allowedEvidenceIds: [id],
    allowedClaimIds: [],
    evidence: [{ id, field: "ingredientsOrComponents", value: realized }],
    maxWords: 12,
    required: false,
    semanticAuthority: "INGREDIENTS",
    preserveSemanticRelationships: true,
  };
}

const realized = ["Copper and Selenium", "Harbor Leaf", "Northwind Root"];
const slotPlan: EvidenceSlotPlan = {
  slots: realized.map((name, index) => ingredientSlot(`S${index + 1}`, name)),
  requiredSlotIds: [],
  optionalSlotIds: [],
  omitted: [],
};
const hydrated = hydrateSlotFillsToPage(
  realized.map((name, index) => ({ slotId: `S${index + 1}`, content: name })),
  slotPlan,
  "Learn More",
);
const ingredientBlock = hydrated.blocks.find((block) => block.type === "INGREDIENTS");
assert(ingredientBlock?.lines?.length === 3, "authorized ingredient fills stay separate lines");
assert(ingredientBlock?.lines?.join(" ") !== facts.ingredientsOrComponents.join(" "), "lines are realized wording, not a raw-fact join");
const adapted = adaptStructuredToVariantCopy(hydrated, createGenerationPlan(facts));
const composed = composePresellPage({
  variant: { headline: "Northwind Daily Capsule", body: adapted.body, ctaLabel: "Learn More", approach: "REVIEW" },
  facts,
  template: "REVIEW",
});
const ingredients = composed.sections.find((section) => section.id === "ingredients");
const rendered = [...(ingredients?.cards.map((card) => card.title) ?? []), ...(ingredients?.bullets ?? [])];
assert(rendered.length === 3 && rendered.every((item, index) => item === realized[index]), "each authorized ingredient renders on its own");
assert((ingredients?.paragraphs.length ?? 0) === 0, "ingredients are not one joined paragraph");

const markerOnly = `<img src="https://cdn.example.com/ui/star-marker.svg" alt="" class="star-marker">`;
assert(extractProductImage(markerOnly, "https://example.com/northwind") === null, "a decorative marker is not invented as a packshot");
const marker = classifyAssetCandidate({ url: "https://cdn.example.com/ui/star-marker.svg", className: "star-marker" });
assert(marker.rejected, "marker filename is rejected as decoration");
const withPackage = `<img src="https://cdn.example.com/ui/star-marker.svg" alt="" class="star-marker">
<img src="https://cdn.example.com/packages/starter-product.png" alt="starter package" width="800" height="1000">`;
const selected = extractProductImage(withPackage, "https://example.com/northwind");
assert(selected?.url.endsWith("starter-product.png") === true, "package raster wins over a decorative marker");
assert(looksLikePackageRaster("https://cdn.example.com/packages/starter-product.png"), "package raster is recognized generically");

const groundingBlock = collectCandidateFailures({
  stages: [],
  fingerprint: null,
  contentQa: {
    groundingStatus: "UNGROUNDED",
    policyGate: "READY",
    finalGate: "BLOCKED",
    blockingRules: [],
    warnings: [],
    policyStatus: "READY",
    approach: "REVIEW",
  },
  assetQa: { packshotFound: true },
  visualQa: { status: "PASS", highCount: 0, warningCount: 0, actionCodes: [], overflowViewports: [] },
  performance: { regressionFlags: [] },
} as never);
assert(groundingBlock.some((item) => item.type === "GROUNDING_FAILURE"), "ungrounded publication records GROUNDING_FAILURE");
assert(!groundingBlock.some((item) => item.type === "POLICY_BLOCK"), "ungrounded publication is not labeled POLICY_BLOCK");
const policyBlock = collectCandidateFailures({
  stages: [],
  fingerprint: null,
  contentQa: {
    groundingStatus: "GROUNDED",
    policyGate: "BLOCKED",
    finalGate: "BLOCKED",
    blockingRules: ["health claim"],
  },
  assetQa: { packshotFound: true },
  visualQa: { status: "PASS", highCount: 0, warningCount: 0, actionCodes: [], overflowViewports: [] },
  performance: { regressionFlags: [] },
} as never);
assert(policyBlock.some((item) => item.type === "POLICY_BLOCK"), "a real policy block is still POLICY_BLOCK");

const sameDose = validateGrounding("Take one capsule each day with a meal and a glass of water.", facts);
assert(
  !sameDose.unsupportedClaims.some((item) => item.reason.includes("dosage/usage")),
  "each day matches daily for the same take-one-capsule instruction",
);
const otherDose = validateGrounding("Take two capsules each day with a meal and a glass of water.", facts);
assert(
  otherDose.unsupportedClaims.some((item) => item.reason.includes("dosage/usage")),
  "a different capsule count stays ungrounded",
);
const otherAction = validateGrounding("Apply one capsule each day with a meal and a glass of water.", facts);
assert(
  otherAction.unsupportedClaims.some((item) => item.severity === "hard"),
  "a different action stays ungrounded",
);

const faq = validateGrounding("How do I take Northwind Daily Capsule?", facts);
assert(
  !faq.unsupportedClaims.some((item) => item.reason === "UNSUPPORTED_USAGE_PRESUPPOSITION"),
  "a plain how-to-take question is supported by authorized usage evidence",
);
const listed = validateGrounding("Which ingredient is listed?", facts);
assert(
  !listed.unsupportedClaims.some((item) => item.reason === "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "a listed-ingredient question is supported by authorized ingredient evidence",
);
const composition = validateGrounding("What ingredients does it contain?", facts);
assert(
  composition.unsupportedClaims.some((item) => item.reason === "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"),
  "an unbound composition FAQ presupposition stays blocked",
);
const merged = validateGrounding("You have 60 days after receiving your order if you are not completely satisfied.", facts);
assert(
  merged.unsupportedClaims.some((item) => item.reason.includes("unsupported semantic merge")),
  "a satisfaction qualifier is not merged onto the return window",
);

const visualRoot = readFileSync("src/app/visual-master-v1.css", "utf8").slice(0, 400);
assert(!/overflow\s*:/.test(visualRoot.split("}")[0] || ""), "visual system root does not create an inner scrollport");
const previewClient = readFileSync("src/app/admin/generate/generate-client.tsx", "utf8");
assert(!previewClient.includes("overflow-x-auto"), "compose preview does not use an inner horizontal scrollport");
const heroRule = readFileSync("src/app/presell-design.css", "utf8").match(/\.ps-hero \{[^}]+\}/)?.[0] || "";
assert(/overflow-x:\s*clip/.test(heroRule) && !/overflow-x:\s*hidden/.test(heroRule), "hero clips sideways without a vertical scrollport");
