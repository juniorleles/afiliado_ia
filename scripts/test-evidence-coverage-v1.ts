// npx tsx scripts/test-evidence-coverage-v1.ts
//
// Generic coverage-layer fixtures. Every case uses an invented product with no
// relation to any campaign in the repo, so passing here cannot depend on one
// product's page shape.
import { extractProductFacts } from "../src/lib/import-product.ts";
import {
  classifySourceUnits,
  classifyTopicGap,
  evaluateEvidenceCoverage,
  topicGaps,
  type SourceUnit,
  type SourceUnitInput,
} from "../src/lib/evidence-coverage.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const PRODUCT = "Lumora Field Kit";

function page(inner: string, head = ""): string {
  return `<html><head>${head}</head><body><h1>${PRODUCT}</h1>${inner}</body></html>`;
}

function unit(text: string, over: Partial<SourceUnitInput> = {}): SourceUnitInput {
  return { id: over.id ?? "U1", text, location: "primary#p", type: "PARAGRAPH", fetchedByImporter: true, ...over };
}

function classifyOne(text: string, facts: ProductFacts, over: Partial<SourceUnitInput> = {}): SourceUnit {
  return classifySourceUnits([unit(text, over)], facts)[0];
}

// 1. Explicit description in meta: captured and copy-eligible.
const withDescription = extractProductFacts(
  page(
    "<p>Field notes for the kit.</p>",
    '<meta name="description" content="The Lumora Field Kit is a waxed canvas roll that holds twelve numbered tools and folds flat inside a pack." />',
  ),
);
assert(withDescription.confidence.description === "DIRECT_SOURCE", "1: explicit description is DIRECT_SOURCE");
const descUnit = classifyOne(withDescription.description, withDescription);
assert(descUnit.status === "CAPTURED_COPY_ELIGIBLE", "1: description unit is CAPTURED_COPY_ELIGIBLE");
assert(descUnit.topic === "description", "1: description unit maps to the description topic");

// 2. Missing description: the page says nothing a description field can hold.
const noDescription = extractProductFacts(page("<h2>Gallery</h2><p>Photographs of the kit in use across four seasons.</p>"));
assert(noDescription.confidence.description !== "DIRECT_SOURCE", "2: absent description is not DIRECT_SOURCE");
const gapNoDescription = topicGaps(evaluateEvidenceCoverage([unit("Photographs of the kit in use across four seasons.")], noDescription)).find(
  (gap) => gap.topic === "description",
);
assert(gapNoDescription?.capturedCopyEligible === 0, "2: description topic has no copy-eligible unit");

// 3. Explicit feature statement reaches the features field.
const withFeature = extractProductFacts(
  page("<h2>Features</h2><ul><li>The canvas roll is stitched with waxed linen thread.</li></ul>"),
);
assert(withFeature.features.length > 0, "3: explicit feature captured");
const featureUnit = classifyOne(withFeature.features[0], withFeature);
assert(featureUnit.status === "CAPTURED_COPY_ELIGIBLE" && featureUnit.topic === "features", "3: feature unit is copy-eligible");

// 4. Marketing-only benefit is not a feature.
const marketing = classifyOne("Order now and finally feel the difference!", withFeature);
assert(marketing.status === "PROMOTIONAL_ONLY", "4: marketing benefit is PROMOTIONAL_ONLY");
assert(!withFeature.features.some((item) => /order now/i.test(item)), "4: marketing benefit never became a feature");

// 5. Ingredient list is captured as components.
const withIngredients = extractProductFacts(
  page("<h2>Ingredients</h2><ul><li>Beeswax</li><li>Linseed oil</li><li>Pine resin</li></ul>"),
);
assert(withIngredients.ingredientsOrComponents.length >= 3, "5: ingredient list captured");
const ingredientUnit = classifyOne("Beeswax", withIngredients);
assert(ingredientUnit.topic === "ingredients" && ingredientUnit.copyEligible, "5: ingredient unit is copy-eligible");

// 6. Ingredient plus explicit source context is stored separately from identity.
const withContext = extractProductFacts(
  page(`
    <h2>Ingredients</h2>
    <ul>
      <li>Beeswax</li>
      <li>Linseed oil</li>
      <li>Pine resin</li>
      <li>Pine resin hardens the finish</li>
    </ul>
  `),
);
assert(
  withContext.ingredientsOrComponents.some((item) => /pine resin/i.test(item)),
  "6: ingredient identity is captured",
);
assert(
  withContext.ingredientContext.some((entry) => /hardens the finish/i.test(entry.statement)),
  "6: ingredient context is stored as its own object",
);
assert(
  !withContext.ingredientsOrComponents.some((item) => /hardens the finish/i.test(item)),
  "6: context is not collapsed into ingredients[]",
);
const contextUnit = classifyOne("Pine resin hardens the finish", withContext, { type: "LIST_ITEM" });
assert(contextUnit.topic === "ingredient_context", "6: ingredient context is its own topic");
const contextGap = classifyTopicGap("ingredient_context", [contextUnit]);
assert(contextGap.schemaField === true, "6: ingredient_context now has a ProductFacts field");
assert(contextUnit.status === "CAPTURED_COPY_ELIGIBLE" || contextUnit.status === "CAPTURED_NOT_COPY_ELIGIBLE", "6: context unit is captured");

// 7. Ingredient with no context stays a bare component.
const bareGap = classifyTopicGap("ingredient_context", []);
assert(bareGap.cause === "NO_SOURCE_EVIDENCE", "7: no ingredient context means no source evidence");

// 8. Explicit product purpose stated by the seller.
const purpose = classifyOne(`${PRODUCT} is a canvas roll designed for field repairs.`, withIngredients);
assert(purpose.topic === "seller_purpose", "8: explicit purpose is seller_purpose");

// 9. Missing product purpose is never inferred from the brand name.
const inferred = classifyOne("Lumora", withIngredients);
assert(inferred.topic !== "seller_purpose", "9: bare brand name does not imply a purpose");

// 10. Duplicate information is counted once.
const duplicated = classifySourceUnits(
  [unit("Beeswax", { id: "D1" }), unit("Beeswax", { id: "D2", location: "/index.php#p" })],
  withIngredients,
);
assert(duplicated[1].status === "DUPLICATE" && !duplicated[1].productFactCandidate, "10: repeated statement is DUPLICATE");

// 11. Unsafe promotional claim is withheld, and withholding is not a defect.
const unsafe = classifyOne("This formula is clinically proven to cure joint pain in seven days.", withIngredients);
assert(unsafe.status === "UNSAFE_OR_UNSUPPORTED" && unsafe.safetyFindings.length > 0, "11: unsafe claim is withheld");
const unsafeGap = classifyTopicGap("description", [unsafe]);
assert(unsafeGap.cause === "INTENTIONAL_SAFETY_EXCLUSION", "11: safety exclusion is not reported as a defect");

// 12. Heuristic extraction is captured but never copy-eligible.
const heuristic = extractProductFacts(page("<h2>About</h2><p>The kit is assembled by hand in a small workshop each week.</p>"));
assert(heuristic.confidence.description !== "DIRECT_SOURCE", "12: heuristic description is not DIRECT_SOURCE");
if (heuristic.description) {
  const heuristicUnit = classifyOne(heuristic.description, heuristic);
  assert(heuristicUnit.status === "CAPTURED_NOT_COPY_ELIGIBLE", "12: heuristic value is captured, not copy-eligible");
  assert(classifyTopicGap("description", [heuristicUnit]).cause === "AMBIGUOUS_AUTHORITY", "12: heuristic capture is an authority gap");
}

// 13. First-party secondary source the importer never fetched.
const secondary = classifyOne("Send the kit back to the workshop address printed on the packing slip.", withIngredients, {
  location: "/help/returns#p",
  pageRole: "RETURNS_POLICY",
  fetchedByImporter: false,
});
assert(secondary.topic === "returns_mechanics", "13: secondary policy statement classified by page role");
assert(classifyTopicGap("returns_mechanics", [secondary]).cause === "GENERIC_EXTRACTION_DEFECT", "13: unfetched first-party page is an extraction defect");

// Coverage model and the exhaustion contract.
const exhaustedFacts = extractProductFacts(page("<h2>Ingredients</h2><ul><li>Beeswax</li><li>Linseed oil</li></ul>"));
const exhausted = evaluateEvidenceCoverage(
  [unit("Beeswax", { id: "E1" }), unit("Linseed oil", { id: "E2" }), unit("Order now and save!", { id: "E3" })],
  exhaustedFacts,
);
assert(exhausted.lostEligibleUnits === 0 && exhausted.evidenceExhausted, "14: exhausted source reports EVIDENCE_EXHAUSTED");
assert(exhausted.sourceMeaningfulUnits === 2, "14: promotional unit stays out of the coverage denominator");
assert(exhausted.evidenceCoverage === 1, "14: fully captured source scores full coverage");

const leaky = evaluateEvidenceCoverage(
  [unit("Beeswax", { id: "L1" }), unit("The roll unfolds flat across a workbench and holds twelve tools.", { id: "L2" })],
  exhaustedFacts,
);
assert(leaky.lostEligibleUnits === 1 && !leaky.evidenceExhausted, "15: unmapped factual statement counts as lost");

// Product independence: the same page shape under a different brand behaves the same.
const otherFacts = extractProductFacts(
  `<html><head></head><body><h1>Verdant Trail Belt</h1><h2>Ingredients</h2><ul><li>Beeswax</li><li>Linseed oil</li></ul></body></html>`,
);
const otherCoverage = evaluateEvidenceCoverage(
  [unit("Beeswax", { id: "O1" }), unit("Linseed oil", { id: "O2" }), unit("Order now and save!", { id: "O3" })],
  otherFacts,
);
assert(
  otherCoverage.evidenceCoverage === exhausted.evidenceCoverage &&
    otherCoverage.sourceMeaningfulUnits === exhausted.sourceMeaningfulUnits,
  "16: coverage is identical for an unrelated product with the same page shape",
);
assert(buildGenerationFactManifest(otherFacts).items.length > 0, "16: manifest still builds for the unrelated product");

console.log("EVIDENCE_COVERAGE_TESTS=PASS");
