// npx tsx scripts/test-evidence-expansion-v2.ts
//
// Fictional products only. Passing here cannot depend on ProDentim or Joint Genesis.
import { extractProductFacts } from "../src/lib/import-product.ts";
import {
  buildIngredientContextEntry,
  extractIngredientContextFromHtml,
  isHealthEfficacyStatement,
} from "../src/lib/ingredient-context.ts";
import {
  extractExplicitProductFormat,
  extractReturnsFacts,
  extractShippingFacts,
  operationalExclusionReason,
} from "../src/lib/operational-evidence.ts";
import {
  classifySourcePage,
  mergeSecondaryPages,
  SOURCE_EXPANSION_LIMITS,
} from "../src/lib/first-party-source-expansion.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { evaluateEvidenceCoverage } from "../src/lib/evidence-coverage.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const A = "Nimbus Trail Tin";
const B = "Harbor Wick Lamp";

function page(name: string, inner: string): string {
  return `<html><head><meta name="description" content="${name} is a compact field tin for dry goods." /></head><body><h1>${name}</h1>${inner}</body></html>`;
}

// 1. Ingredient identity only.
const identityOnly = extractProductFacts(
  page(A, `<h2>Ingredients</h2><ul><li>Beeswax</li><li>Pine resin</li></ul>`),
);
assert(identityOnly.ingredientsOrComponents.includes("Beeswax"), "1: ingredient identity captured");
assert(identityOnly.ingredientContext.length === 0, "1: identity-only page has no ingredient context");

// 2. Ingredient + seller health claim.
const healthClaim = extractProductFacts(
  page(
    A,
    `<h2>Ingredients</h2><ul><li>Beeswax</li></ul><h3>Beeswax</h3><ul><li>Beeswax supports the immune system</li></ul>`,
  ),
);
const healthEntry = healthClaim.ingredientContext.find((entry) => /immune/i.test(entry.statement));
assert(Boolean(healthEntry), "2: seller health claim stored as ingredient context");
assert(healthEntry?.kind === "HEALTH_EFFICACY", "2: classified as HEALTH_EFFICACY");
assert(healthEntry?.copyEligibility === "NO", "2: health claim is not copy-eligible");
assert(healthEntry?.attribution === "SELLER", "2: remains seller-attributed");
assert(healthEntry?.provenance === "DIRECT_SOURCE", "2: provenance is DIRECT_SOURCE, not verified fact");
assert(
  !healthClaim.ingredientsOrComponents.some((item) => /immune/i.test(item)),
  "2: health claim is not collapsed into ingredients[]",
);

// 3. Ingredient + neutral source context.
const built = buildIngredientContextEntry({
  ingredient: "Pine resin",
  statement: "Pine resin hardens the finish",
  sourceUrl: "https://tin.example/product",
});
assert(built.kind === "NEUTRAL_CONTEXT" || built.kind === "SELLER_ATTRIBUTED", "3: non-health context is not HEALTH_EFFICACY");
assert(built.relation === "OTHER", "3: 'hardens' is not inferred as SUPPORTS");
assert(built.copyEligibility === "YES", "3: neutral context may be copy-eligible");

const fromHtml = extractIngredientContextFromHtml(
  `<h3>Pine resin</h3><ul><li>Pine resin hardens the finish</li></ul>`,
  ["Pine resin"],
  "https://tin.example/product",
);
assert(fromHtml.some((entry) => /hardens the finish/i.test(entry.statement)), "3: HTML extractor captures neutral context");

// 4. Health claim remains non-copy-eligible even when stored.
assert(healthEntry?.copyEligibility === "NO", "4: stored health claim stays COPY_ELIGIBLE=NO");
const plan = createGenerationPlan(healthClaim);
assert(!plan.allowedTopics.includes("background_science"), "4: science topic stays closed");
assert(
  plan.allowedTopics.includes("ingredients") === healthClaim.ingredientsOrComponents.length > 0,
  "4: ingredients topic follows identity field, not context claims",
);

// 5. Same-origin refund page is consumed.
const primary = extractProductFacts(
  page(A, `<h2>Ingredients</h2><ul><li>Beeswax</li></ul><a href="/help/refunds.php">Refund Policy</a>`),
  "https://tin.example/product",
);
const refundHtml = `<html><body><h1>Refund Policy</h1>
<p>You have 45 days from delivery to request a refund.</p>
<p>Send the tin back with the packing slip. Opened tins are accepted.</p>
<p>We do not support the return shipping costs.</p>
</body></html>`;
const refunded = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/refunds.php", html: refundHtml, headings: ["Refund Policy"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(refunded.fetched.some((page) => /refunds/.test(page.url)), "5: same-origin refund page fetched");
assert(refunded.facts.returnsInformation.some((item) => /45 days/i.test(item.statement)), "5: return window extracted");
assert(
  !refunded.facts.returnsInformation.some((item) => /guaranteed refund for 45 days/i.test(item.statement)),
  "5: procedure is not strengthened into a guaranteed refund",
);
assert(
  refunded.facts.returnsInformation.every((item) => item.sourceUrl.includes("/help/refunds.php")),
  "5: refund facts keep the refund page URL",
);

// 6. External refund page rejected.
const external = mergeSecondaryPages(
  primary,
  [{ url: "https://other.example/help/refunds.php", html: refundHtml, headings: ["Refund Policy"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(external.fetched.length === 0, "6: external refund page is not fetched");
assert(
  external.discovered.some((page) => page.rejectReason === "EXTERNAL_ORIGIN"),
  "6: external origin recorded",
);

// 7. Same-origin shipping page.
const shippingHtml = `<html><body><h1>Shipping Policy</h1>
<table>
<tr><th>Delivery Address</th><th>Shipping Fee</th><th>Shipping Time</th></tr>
<tr><td>United States</td><td>FREE</td><td>5-7 working days</td></tr>
<tr><td>Canada</td><td>$15.95</td><td>10-15 working days</td></tr>
</table>
<p>In no more than 60 hours, you will receive an email with your shipping tracking ID.</p>
<p>We will deliver your ordered products wherever you want.</p>
</body></html>`;
const shipped = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/shipping.php", html: shippingHtml, headings: ["Shipping Policy"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(shipped.facts.shippingInformation.some((item) => /united states/i.test(item.statement) && /5-7 working days/i.test(item.statement)), "7: destination row captured");
assert(shipped.facts.shippingInformation.some((item) => /60 hours/i.test(item.statement)), "7: tracking window captured");
assert(
  !shipped.facts.shippingInformation.some((item) => /wherever you want/i.test(item.statement)),
  "7: worldwide availability is not inferred",
);

// 8. Unrelated same-origin page rejected.
assert(classifySourcePage({ url: "https://tin.example/help/contact-us.php", pathname: "/help/contact-us.php" }) === "UNRELATED_SUPPORT", "8: contact page is UNRELATED_SUPPORT");
const contact = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/contact-us.php", html: `<p>Email us anytime.</p>`, headings: ["Contact"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(contact.fetched.length === 0, "8: unrelated support page is not imported");

const homepageDup = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/", html: shippingHtml, headings: ["Shipping policy"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(
  homepageDup.discovered.some((page) => page.rejectReason === "PRIMARY_DUPLICATE"),
  "8b: origin homepage is PRIMARY_DUPLICATE, not a shipping page",
);
assert(homepageDup.fetched.length === 0, "8b: origin homepage is not imported as a secondary source");

// 9. Robots-disallowed page rejected.
const robots = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/refunds.php", html: refundHtml, headings: ["Refund Policy"], depth: 1 }],
  { primaryUrl: "https://tin.example/product", robotsText: "User-agent: *\nDisallow: /help" },
);
assert(robots.fetched.length === 0, "9: robots-disallowed page rejected");
assert(robots.discovered.some((page) => page.rejectReason === "ROBOTS_DISALLOWED"), "9: ROBOTS_DISALLOWED recorded");

// 10. Depth > 1 rejected.
const deep = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/refunds.php", html: refundHtml, headings: ["Refund Policy"], depth: 2 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(deep.fetched.length === 0, "10: depth > 1 rejected");
assert(SOURCE_EXPANSION_LIMITS.MAX_DEPTH === 1, "10: MAX_DEPTH is 1");

// 11. Testimonial page rejected.
assert(classifySourcePage({ url: "https://tin.example/testimonials", pathname: "/testimonials", headings: ["Customer Stories"] }) === "TESTIMONIALS", "11: testimonial path classified");
const testimonials = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/testimonials", html: `<p>"This tin changed my life."</p>`, headings: ["Testimonials"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
);
assert(testimonials.fetched.length === 0, "11: testimonial page is not imported");

// 12. Offer/pricing chip excluded from features and from shipping facts.
const chips = extractProductFacts(
  page(
    A,
    `<p>Natural Formula</p><p>Easy To Use</p><p>Non-GMO</p><p>Most Popular</p><p>Free Shipping</p>`,
  ),
);
assert(chips.features.includes("Natural Formula"), "12: product attribute chip recovered");
assert(!chips.features.some((item) => /most popular|free shipping/i.test(item)), "12: offer/pricing chips excluded");
assert(
  extractShippingFacts(["Every 6 Bottles Order Gets FREE Shipping Too!"], "https://tin.example/product").length === 0,
  "12: promotional free-shipping offer is not a shipping fact",
);

// 13. Explicit product format.
const formatted = extractProductFacts(
  page(A, `<h2>How To Use</h2><ul><li>Take one capsule daily with water</li></ul>`),
);
assert(formatted.productFormat?.value === "capsule", "13: explicit capsule format captured");
assert(formatted.productFormat?.provenance === "DIRECT_SOURCE", "13: format provenance is DIRECT_SOURCE");

const formatFromText = extractExplicitProductFormat(
  ["Chew one tablet every morning."],
  "https://tin.example/product",
);
assert(formatFromText?.value === "tablet", "13: tablet named in usage is explicit format");

// 14. Inferred product format rejected.
const inferred = extractExplicitProductFormat(
  ["This oral-care supplement is a daily wellness formula."],
  "https://tin.example/product",
);
assert(!inferred, "14: category language does not infer a format");
const imageOnly = extractExplicitProductFormat(["See product photo"], "https://tin.example/product");
assert(!imageOnly, "14: image cue does not infer a format");

// 15. Returns procedure preserved without strengthening.
const returns = extractReturnsFacts(
  [
    "Make sure you are still in the 60-day period starting with the day the order has been delivered to you.",
    "Send all the bottles back to us (no matter if they are empty or not).",
    "Please keep in mind that we do not support the return shipping costs.",
  ],
  "https://tin.example/help/refunds.php",
  { sourcePageCategory: "REFUNDS" },
);
assert(returns.some((item) => item.kind === "RETURN_WINDOW" && /60-day period/i.test(item.statement)), "15: return window kept verbatim");
assert(!returns.some((item) => /guaranteed refund/i.test(item.statement)), "15: not rewritten as guaranteed refund");
assert(returns.some((item) => /packing slip|empty or not|return shipping costs/i.test(item.statement)), "15: process/condition kept");

// 16. Product independence.
const other = extractProductFacts(
  page(B, `<h2>Ingredients</h2><ul><li>Beeswax</li></ul><p>Beeswax hardens the finish</p>`),
  "https://lamp.example/product",
);
const otherHealth = other.ingredientContext.filter((entry) => entry.kind === "HEALTH_EFFICACY");
assert(other.ingredientsOrComponents.some((item) => /beeswax/i.test(item)), "16: unrelated product identity captured");
assert(otherHealth.length === 0, "16: non-health context is not labeled HEALTH_EFFICACY");
const otherCoverage = evaluateEvidenceCoverage(
  [{ id: "X1", text: "Beeswax", location: "p", type: "LIST_ITEM", fetchedByImporter: true }],
  other,
);
assert(otherCoverage.sourceUnitsCollected >= 1, "16: coverage still runs for an unrelated product");
assert(emptyProductFacts(B, "https://lamp.example/product").ingredientContext.length === 0, "16: empty facts start with no context");

// 17. Ingredient card labelled by a non-heading element keeps its attribution.
const labelled = extractIngredientContextFromHtml(
  `<div><p><b> Cedar Oil </b></p></div><ul><li>Supports healthy skin</li><li>Helps the finish resist water</li></ul>`,
  ["Cedar Oil"],
  "https://tin.example/product",
);
const labelledHealth = labelled.find((entry) => /healthy skin/i.test(entry.statement));
const labelledPerf = labelled.find((entry) => /resist water/i.test(entry.statement));
assert(labelledHealth?.ingredient === "Cedar Oil", "17: unnamed card bullet attributed to the labelled ingredient");
assert(labelledHealth?.kind === "HEALTH_EFFICACY" && labelledHealth.copyEligibility === "NO", "17: body effect stays HEALTH_EFFICACY / NO");
assert(labelledPerf?.kind === "SELLER_ATTRIBUTED", "17: non-body effect is a seller claim, not neutral context");
assert(
  extractIngredientContextFromHtml(`<h2>Ingredients</h2><ul><li>Cedar oil keeps the lid smooth</li></ul>`, ["Cedar Oil"], "https://tin.example/p")
    .every((entry) => entry.sourceLocation !== "primary#ingredient-label"),
  "17: a section label that is not an ingredient does not claim the list",
);

// 18. FAQ answers are paired with their question; unqualified answers are withheld.
const faqHtml = `<html><body><h1>Shipping</h1>
<h3>Can the gift address differ from the billing address?</h3><p>Yes. Enter both addresses at checkout.</p>
<h3>Where do you ship?</h3><p>We will deliver your order wherever you want.</p>
<h3>What does delivery cost?</h3><p>Nothing at all! Delivery is on our side.</p>
<h3>How long does it take?</h3><p>According to most of our customers, parcels arrive within 3-4 working days.</p>
<p>We care about every parcel. Parcels may be held by customs for inspection.</p>
<p>Here is the list of shipping questions. Please go through them.</p>
</body></html>`;
const faqShip = mergeSecondaryPages(
  primary,
  [{ url: "https://tin.example/help/shipping", html: faqHtml, headings: ["Shipping"], depth: 1 }],
  { primaryUrl: "https://tin.example/product" },
).facts.shippingInformation;
const paired = faqShip.find((item) => /enter both addresses/i.test(item.statement));
assert(paired?.question === "Can the gift address differ from the billing address?", "18: FAQ answer keeps its question");
assert(!faqShip.some((item) => /wherever you want/i.test(item.statement)), "18: unqualified availability withheld");
assert(!faqShip.some((item) => /nothing at all/i.test(item.statement)), "18: implied free delivery withheld");
assert(!faqShip.some((item) => /most of our customers/i.test(item.statement)), "18: hearsay estimate withheld");
assert(faqShip.some((item) => item.statement === "Parcels may be held by customs for inspection."), "18: explicit sentence extracted from a mixed paragraph");
assert(!faqShip.some((item) => /we care about every parcel/i.test(item.statement)), "18: marketing sentence not stored");
assert(!faqShip.some((item) => /here is the list/i.test(item.statement)), "18: navigation text is not a fact");
assert(operationalExclusionReason("Please see below how to do this.") === "NAVIGATIONAL", "18: navigation classified");

// 19. Page titles are not return facts; return address is a return-process fact.
const titled = extractReturnsFacts(
  ["Acme Refund Policy", "Step-by-Step Refund Guideline:", "12 Harbor Rd, Portland, ME 04101, United States"],
  "https://tin.example/help/refunds",
  { sourcePageCategory: "REFUNDS" },
);
assert(!titled.some((item) => /refund policy|guideline/i.test(item.statement)), "19: titles and labels are not stored");
assert(titled.some((item) => item.kind === "RETURN_PROCESS" && /Harbor Rd/.test(item.statement)), "19: postal return address captured");

// 20. A paragraph rejected for mixed contact text still yields its explicit window.
const mixed = extractReturnsFacts(
  ["You have 30 days from delivery to ask for a refund. Many customers contact us to share their stories."],
  "https://tin.example/help/refunds",
  { sourcePageCategory: "REFUNDS" },
);
assert(mixed.some((item) => item.kind === "RETURN_WINDOW" && item.sourceUnit === "SENTENCE"), "20: window recovered at sentence scale");
assert(!mixed.some((item) => /share their stories/i.test(item.statement)), "20: contact sentence not stored");

// 21. Coverage treats unflagged health claims and withheld phrasing as exclusions, not loss.
const exclusionCoverage = evaluateEvidenceCoverage(
  [
    { id: "E1", text: "Every tin you use will support the good health of your skin and joints.", location: "p", type: "PARAGRAPH", fetchedByImporter: true },
    { id: "E2", text: "We will deliver your order wherever you want, at home or at work.", location: "p", type: "PARAGRAPH", pageRole: "SHIPPING_POLICY", fetchedByImporter: true },
  ],
  emptyProductFacts(A, "https://tin.example/product"),
);
assert(exclusionCoverage.lostEligibleUnits === 0, "21: withheld statements do not count as lost evidence");
assert(isHealthEfficacyStatement("Supports the balance of mouth bacteria"), "21: health predicate matches body effect");
assert(!isHealthEfficacyStatement("Helps the lid close tightly"), "21: health predicate ignores non-body effect");

console.log("EVIDENCE_EXPANSION_V2_TESTS=PASS");
