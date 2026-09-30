// npx tsx scripts/test-source-page-classification-v1.ts
//
// Source-page classification: compatible operational families, structural page
// purpose vs incidental subheadings, and fail-closed conflicts. Fictional
// origins only.
import { classifySourcePage, isEligibleSourceCategory } from "../src/lib/first-party-source-expansion.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const ORIGIN = "https://tallowmere.example";
const page = (path: string, headings: string[]) => classifySourcePage({ url: `${ORIGIN}${path}`, headings });
const eligible = (path: string, headings: string[], expected: string) => {
  const category = page(path, headings);
  return category === expected && isEligibleSourceCategory(category);
};
const rejected = (path: string, headings: string[]) => !isEligibleSourceCategory(page(path, headings));

// RETURNS / REFUNDS — compatible operational family.
assert(eligible("/return-policy.html", ["Return Policy"], "RETURNS"), "R1: clear returns page is RETURNS");
assert(eligible("/return-policy.html", ["Return Policy", "Refunds"], "RETURNS"), "R2: returns page with a refunds subheading stays RETURNS");
assert(eligible("/refunds.html", ["Refund Policy", "Returns"], "REFUNDS"), "R3: refunds page with a returns subheading stays REFUNDS");
assert(
  eligible("/help/return-policy.html", ["Return Policy", "Returns", "Refunds", "Late refunds", "Partial refunds"], "RETURNS"),
  "R4: an exact RETURNS/REFUNDS tie resolves inside the family toward structural evidence",
);
assert(eligible("/help/policy.html", ["Returns and Refunds"], "RETURNS"), "R5: equal structural family evidence resolves to the canonical member");

// SHIPPING — incidental legal subheadings do not override page purpose.
assert(eligible("/shipping.html", ["Shipping Policy"], "SHIPPING"), "S1: clear shipping page is SHIPPING");
assert(eligible("/shipping.html", ["Shipping Policy", "Wrong Address Disclaimer"], "SHIPPING"), "S2: one disclaimer subheading does not make it GENERAL_LEGAL");
assert(eligible("/shipping-policy.html", ["Shipping Information", "Delivery Disclaimer"], "SHIPPING"), "S3: delivery disclaimer subheading stays SHIPPING");
assert(
  classifySourcePage({
    url: `${ORIGIN}/help/shipping.html`,
    html: "<title>Shipping Policy</title><h1>Shipping Policy</h1><h2>Processing Time</h2><h2>Wrong Address Disclaimer</h2>",
  }) === "SHIPPING",
  "S4: title + H1 are structural; H2 disclaimer is subordinate",
);

// GENERAL LEGAL — genuine legal pages stay rejected.
assert(page("/disclaimer.html", ["Disclaimer", "Legal Notice"]) === "GENERAL_LEGAL", "L1: disclaimer page is GENERAL_LEGAL");
assert(rejected("/disclaimer.html", ["Disclaimer", "Legal Notice"]), "L2: GENERAL_LEGAL is rejected");
assert(
  page("/shipping.html", ["Shipping Policy", "Legal Disclaimer", "Limitation of Liability Disclaimer", "Governing Law and Legal Notice"]) === "GENERAL_LEGAL",
  "L3: path/title do not always win — strong subordinate legal evidence overrides them",
);

// CONFLICT — incompatible categories fail closed.
assert(page("/shipping-returns.html", ["Shipping & Returns"]) === "AMBIGUOUS_SOURCE_CATEGORY", "C1: shipping vs returns tie stays ambiguous");
assert(page("/blog/shipping-update.html", ["Shipping Update"]) === "AMBIGUOUS_SOURCE_CATEGORY", "C2: eligible vs rejected tie fails closed");
assert(rejected("/returns.html", ["Terms of Service"]), "C3: returns path with a terms title is rejected");
assert(
  page("/refund-policy.html", ["Refund Policy", "Shipping", "Delivery", "Delivery Times", "Shipping Rates"]) !== "REFUNDS",
  "C4: overwhelming shipping evidence is not labeled REFUNDS",
);

// Link-level classification (path + anchor only) is unchanged.
assert(classifySourcePage({ url: `${ORIGIN}/info/return-policy.html`, anchorText: "Return Policy" }) === "RETURNS", "K1: link-level returns");
assert(classifySourcePage({ url: `${ORIGIN}/info/privacy.html`, anchorText: "Privacy Policy" }) === "PRIVACY", "K2: link-level privacy");
assert(classifySourcePage({ url: `${ORIGIN}/info/contact.html`, anchorText: "Contact" }) === "UNRELATED_SUPPORT", "K3: link-level contact");
assert(classifySourcePage({ url: `${ORIGIN}/info/page.html`, anchorText: "More" }) === "AMBIGUOUS_SOURCE_CATEGORY", "K4: no signal stays ambiguous");

console.log("ALL SOURCE PAGE CLASSIFICATION V1 TESTS PASSED");
