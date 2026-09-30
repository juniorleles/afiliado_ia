// npx tsx scripts/test-offer-facts.ts
import { extractProductFacts } from "../src/lib/import-product.ts";
import { presentOffers } from "../src/lib/presell-presentation.ts";
import { planPremiumConversion } from "../src/lib/premium/conversion-plan.ts";
import type { PresellPage } from "../src/lib/presell-page.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const page = extractProductFacts(
  `
<html><body>
<h1>Harbor Field Tin</h1>
<div class="gold_pack best_seller">
  <h3>FIELD</h3>
  <p class="opacity-0">+ secret bonus</p>
  <p>2 Tins</p>
  <img src="https://cdn.example/field-pack.png" alt="" />
  <img src="https://cdn.example/payment-methods.png" alt="" />
  <img src="https://cdn.example/cart.svg" alt="" />
  <h4 class="text-decoration-line-through">$40</h4>
  <h2>$29</h2>
  <p>per tin</p>
  <p>+3 FREE GUIDES</p>
  <h3>Total: $58</h3>
  <p>Savings: $12</p>
  <h6>+ small shipping fee</h6>
</div>
<h3>CAMP</h3>
<p>4 Tins</p>
<img src="https://cdn.example/camp-pack.png" alt="" />
<h4 class="text-decoration-line-through">$40</h4>
<h2>$19</h2>
<p>per tin</p>
<p>+3 FREE GUIDES</p>
<h3>Total: $76</h3>
<p>Savings: $84</p>
<h6>+ Free Regional Shipping</h6>
<h3>BASE</h3>
<p>1 Tin</p>
<h2>$22</h2>
<p>per tin</p>
<p>Most Popular</p>
<h3>TRAIL</h3>
<h2>$17</h2>
<p>per tin</p>
<h3>Total: $17</h3>
<p>Savings: $99</p>
</body></html>
`,
  "https://harbor.example/field/",
);

assert(page.pricingInformation === "FIELD $29 per tin; CAMP $19 per tin; BASE $22 per tin; TRAIL $17 per tin", "summary keeps current unit prices");
assert(!/\$40/.test(page.pricingInformation ?? ""), "struck price stays out of the pricing string");
assert((page.offerFacts ?? []).length === 4, "four packages stay four offers");

const field = page.offerFacts?.[0];
const camp = page.offerFacts?.[1];
const base = page.offerFacts?.[2];
const trail = page.offerFacts?.[3];
assert(field?.quantity === "2 Tins", "quantity is the source phrase");
assert(field?.unitPrice === "$29 per tin", "unit price keeps the source unit");
assert(field?.totalPrice === "Total: $58", "total stays the source line");
assert(field?.originalPrice === "$40", "struck amount is the reference price");
assert(field?.savings === "Savings: $12", "savings stays the source line");
assert(field?.shipping === "+ small shipping fee", "shipping stays the source line");
assert(field?.bonuses === "+3 FREE GUIDES", "visible bonus is kept");
assert(!field?.popularityLabel, "a class name is not a popularity label");
assert(field?.imageUrl === "https://cdn.example/field-pack.png", "package image is the card asset");
assert(!JSON.stringify(field).includes("secret bonus"), "hidden bonus text is not a fact");
assert(camp?.shipping === "+ Free Regional Shipping", "shipping is not normalized");
assert(camp?.imageUrl === "https://cdn.example/camp-pack.png", "second package keeps its own image");
assert(base?.popularityLabel === "Most Popular", "explicit popularity text is kept");
assert(base?.quantity === "1 Tin", "a one-unit phrase is still explicit");
assert(trail?.totalPrice === "Total: $17", "a last card keeps a total when earlier cards state one");
assert(trail?.unitPrice === "$17 per tin", "partial offer keeps the unit price");
assert(field?.confidence === "DIRECT_SOURCE" && field.sourceUrl === "https://harbor.example/field/", "offer provenance is the page");

const shown = presentOffers(page);
assert(shown.length === 4 && shown[0].quantity === "2 Tins" && shown[3].totalPrice === "Total: $17", "renderer repeats only stored offer fields");
assert(!shown.some((offer) => /best seller|best value/i.test(JSON.stringify(offer))), "no inferred winner");

const ambiguous = extractProductFacts(
  `<html><body><h1>Northwind</h1><h3>LEFT</h3><h2>$10</h2><p>per box</p><h3>RIGHT</h3><h2>$8</h2><p>per box</p><h3>Total: $8</h3><p>Savings: $2</p></body></html>`,
  "https://northwind.example/pair/",
);
assert(!ambiguous.offerFacts?.[1]?.totalPrice && !ambiguous.offerFacts?.[1]?.savings, "a total only after the last card is not assigned");
assert(ambiguous.offerFacts?.[0]?.unitPrice === "$10 per box" && ambiguous.offerFacts?.[1]?.unitPrice === "$8 per box", "both unit prices remain");

const lone = extractProductFacts(
  `<html><body><h1>Northwind</h1><h3>SOLO</h3><p>3 Jars</p><h2>$12</h2><p>per jar</p><h3>Total: $36</h3></body></html>`,
  "https://northwind.example/solo/",
);
assert(lone.offerFacts?.[0]?.totalPrice === "Total: $36", "a single card may keep its own total");
assert(lone.offerFacts?.[0]?.quantity === "3 Jars", "a single card may keep its quantity");

const thin = {
  hero: { badge: "Review", headline: "Northwind", subheadline: "", summary: "", image: { src: "", alt: "" } },
  sections: [],
  ctaLabel: "Learn More",
  faq: [],
} as unknown as PresellPage;
const thinPlan = planPremiumConversion({
  page: thin,
  pricingText: "",
  guaranteeLine: "",
  packshotReady: false,
});
assert(!thinPlan.sections.some((section) => section.id === "offer"), "no offer section without offer facts");
assert(!JSON.stringify(thinPlan).includes("Harbor") && !JSON.stringify(thinPlan).includes("60"), "empty plan does not inherit another product");

console.log("offer facts ok");
