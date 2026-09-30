/**
 * LP presentation closure V1 — disclosure placement, CTA position semantics,
 * single footer, product alt text and return-policy labeling. Fictional products only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CTA_POSITIONS, isCtaPosition } from "../src/lib/analytics.ts";
import { returnSectionLabel } from "../src/lib/presell-section-labels.ts";
import { AFFILIATE_DISCLOSURE_TEXT } from "../src/lib/public-site.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Return-policy label follows the copy, never upgrades it into a guarantee.
assert(
  returnSectionLabel("Guarantee", ["The seller publishes a 90-day return policy measured from the delivery date."]) === "Return policy",
  "return policy copy under a guarantee title is labeled Return policy",
);
assert(
  returnSectionLabel("Guarantee", ["Unopened lamps may be returned within 30 days for store credit."]) === "Return policy",
  "return instructions are labeled Return policy",
);
assert(
  returnSectionLabel("Guarantee", ["Refunds are issued to the original payment method within 10 business days."]) === "Refund policy",
  "refund-only copy is labeled Refund policy",
);
assert(
  returnSectionLabel("Guarantee", ["Every Lumora Lamp comes with a 60-day money-back guarantee."]) === "Guarantee",
  "explicit guarantee wording keeps the section title",
);
assert(
  returnSectionLabel("Our Promise", ["Orders ship from the Oslo warehouse."]) === "Our Promise",
  "unrelated copy keeps the section title",
);
assert(returnSectionLabel("Guarantee", []) === "Guarantee", "empty section keeps the section title");

// CTA positions: the header CTA has its own semantic position.
assert(isCtaPosition("header") && CTA_POSITIONS.includes("header"), "header is a tracked CTA position");
for (const position of ["hero", "middle", "final", "guarantee", "sticky"]) {
  assert(isCtaPosition(position), `${position} remains a tracked CTA position`);
}
const pageView = read("src/components/presell/presell-page-view.tsx");
assert(pageView.includes('navCta={cta("header"'), "production header CTA is attributed to header");
assert(!pageView.includes('navCta={cta("middle"'), "header CTA is no longer attributed to middle");

// Disclosure precedes every affiliate link; footer does not repeat the disclosure sentence.
const view = read("src/components/presell/visual-master-view.tsx");
const disclosureAt = view.indexOf("{AFFILIATE_DISCLOSURE_TEXT}");
assert(disclosureAt > 0, "visual master renders the affiliate disclosure");
for (const cta of ["{navCta}", "{heroCta}", "{finalCta}"]) {
  assert(view.indexOf(cta) > disclosureAt, `disclosure renders before ${cta}`);
}
assert(!view.includes("Disclosure: I may earn"), "footer no longer repeats the disclosure sentence inline");
assert(AFFILIATE_DISCLOSURE_TEXT.startsWith("Disclosure:"), "disclosure text is labeled");

// One coherent footer on the production presentation.
const route = read("src/app/p/[slug]/page.tsx");
assert(route.includes("campaignRendersSiteFooter(campaign) ? null : <PublicFooter />"), "public route skips the site footer when the page renders its own");
assert(view.includes("PUBLIC_FOOTER_LINKS.map") && view.includes("getPublicSiteName()"), "page footer keeps legal links and site name");

// Product images are named from campaign data, never from a hardcoded product.
assert((view.match(/alt=\{productAlt\}/g) ?? []).length === 3, "all three product shots use the product-name alt text");
assert(pageView.includes("productName={productNameFromFacts(campaign)}"), "product name comes from campaign facts");
assert(!/joint genesis|audifort|prodentim/i.test(view), "visual master view has no product-specific text");

console.log("LP_PRESENTATION_CLOSURE_V1=PASS");
