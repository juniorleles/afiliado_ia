// npx tsx scripts/test-content-boundary-v1.ts
// Generic content boundary. Fictional pages only. No network, no database, no model calls.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyContentBoundaries,
  htmlWithoutPageStructure,
  isStructuralClass,
  sectionOwning,
} from "../src/lib/content-boundary.ts";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { extractOperationalFactsFromHtml } from "../src/lib/operational-evidence.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function labelsOf(html: string, classification: string): string[] {
  return classifyContentBoundaries(html)
    .filter((section) => section.classification === classification)
    .flatMap((section) => section.labels);
}

const portal = `
<body>
  <div>
    <a href="/general">General</a>
    <a href="/property">Property Usage</a>
    <a href="/financial">Financial</a>
  </div>
  <h1>Harbor Kettle</h1>
  <h2>Features</h2>
  <ul>
    <li>Holds a full liter for the morning commute</li>
    <li>Supports everyday financial planning for property owners who want a clear summary</li>
  </ul>
</body>`;

const portalFacts = extractProductFacts(portal, "https://example.test/harbor");
assert(!portalFacts.features.some((item) => /^(general|property usage|financial)$/i.test(item)), "portal menu labels are not features");
assert(
  portalFacts.features.some((item) => /financial planning for property owners/i.test(item)),
  "a product sentence may mention financial and property",
);
assert(labelsOf(portal, "PRIMARY_NAVIGATION").includes("Property Usage"), "portal menu is primary navigation");
const propertyAt = portal.indexOf("Property Usage");
const owner = sectionOwning(classifyContentBoundaries(portal), propertyAt);
assert(owner?.classification === "PRIMARY_NAVIGATION", "the menu label is owned by the navigation section");
assert(isStructuralClass(owner?.classification ?? "FEATURE"), "navigation is page structure");
assert(owner?.confidence === "HIGH" && owner.origin === "LINK_CLUSTER", "link cluster carries confidence and origin");

const chrome = `
<body>
  <header><a href="/buy">Check the offer</a></header>
  <ol aria-label="breadcrumb">
    <li><a href="/">Home</a> ›</li>
    <li><a href="/shop">Shop</a> ›</li>
    <li><a href="/kettle">Kettle</a></li>
  </ol>
  <div role="contentinfo">
    <ul>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/terms">Terms</a></li>
      <li><a href="/careers">Careers</a></li>
    </ul>
  </div>
  <form role="search"><input type="search" name="q"></form>
  <div role="dialog" aria-modal="true"><p>This notice is short.</p><button>Yes</button><button>No</button></div>
  <aside><a href="/login">Login</a><a href="/account">Account</a><a href="/orders">Orders</a></aside>
  <h1>Harbor Kettle</h1>
  <h2>What's Inside</h2>
  <ul><li><a href="/glucosamine">Glucosamine sulfate</a></li><li><a href="/chondroitin">Chondroitin</a></li></ul>
  <h2>How To Use</h2>
  <p>Take two capsules daily with food.</p>
  <h2>Warnings</h2>
  <p>Talk to a clinician if you are pregnant.</p>
  <h2>FAQ</h2>
  <p>Is this a drug? No, it is sold as a supplement.</p>
  <h2>Pricing</h2>
  <p>$49 per kettle.</p>
  <h2>Guarantee</h2>
  <p>The seller offers a 60-day money-back guarantee.</p>
  <h2>Manufacturer</h2>
  <p>Packed by Harbor Works.</p>
  <h2>Shipping</h2>
  <p>Orders ship within 24 hours after payment is confirmed.</p>
  <h2>Return Policy</h2>
  <p>Return the kettle within 60 days for a refund.</p>
</body>`;

const kept = extractProductFacts(chrome, "https://example.test/harbor");
assert(kept.ingredientsOrComponents.some((item) => /glucosamine/i.test(item)), "linked ingredients under their heading stay");
assert(kept.usageInformation.some((item) => /two capsules/i.test(item)), "usage stays");
assert(kept.cautions.some((item) => /pregnant/i.test(item)), "warnings stay");
assert(kept.sourceSnippets.some((item) => item.field === "faq" && /supplement/i.test(item.text)), "faq stays");
assert(/\$49/.test(kept.pricingInformation ?? ""), "pricing stays");
assert(/60-day money-back/i.test(kept.guaranteeInformation ?? ""), "guarantee stays");
assert(/Harbor Works/i.test(kept.manufacturer ?? ""), "manufacturer stays");
assert(!kept.features.some((item) => /^(privacy|terms|careers|login|account|orders|home|shop)$/i.test(item)), "footer, account, and breadcrumb labels are not features");
assert(!htmlWithoutPageStructure(chrome).includes("Check the offer"), "header cta is removed");
assert(!htmlWithoutPageStructure(chrome).includes(">Login<"), "account sidebar is removed");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "BREADCRUMB"), "breadcrumb is classified");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "FOOTER"), "footer landmark is classified");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "COOKIE"), "cookie dialog is classified");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "UTILITY"), "search control is classified");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "SHIPPING" && section.origin === "HEADING_OWNERSHIP"), "shipping section is owned by its heading");
assert(classifyContentBoundaries(chrome).some((section) => section.classification === "RETURN_POLICY"), "return policy section is product content");

const shipping = extractOperationalFactsFromHtml(chrome, "https://example.test/harbor/shipping", "SHIPPING");
assert(shipping.shipping.some((item) => /24 hours/i.test(item.statement)), "shipping fact still extracted");
assert(!shipping.shipping.some((item) => /privacy|login|breadcrumb/i.test(item.statement)), "shipping extraction skips chrome");
const returns = extractOperationalFactsFromHtml(chrome, "https://example.test/harbor/returns", "RETURNS");
assert(returns.returns.some((item) => /60 days/i.test(item.statement)), "return fact still extracted");

const categoryNav = `
<body>
  <ul>
    <li><a href="/kitchen">Kitchen</a></li>
    <li><a href="/outdoor">Outdoor</a></li>
    <li><a href="/travel">Travel</a></li>
  </ul>
  <h2>Features</h2>
  <ul><li>A folding handle for travel days</li></ul>
</body>`;
const categoryFacts = extractProductFacts(categoryNav, "https://example.test/northwind");
assert(!categoryFacts.features.some((item) => /^(kitchen|outdoor|travel)$/i.test(item)), "category navigation is rejected");
assert(categoryFacts.features.some((item) => /folding handle/i.test(item)), "a feature that mentions travel stays");

const fernwick = `
<body>
  <ul>
    <li><a href="/account">Account</a></li>
    <li><a href="/billing">Billing</a></li>
    <li><a href="/language">Language</a></li>
  </ul>
  <h1>Fernwick Lantern</h1>
  <h2>FAQ</h2>
  <p>How do you light it? Turn the dial once.</p>
  <h2>Guarantee</h2>
  <p>Return the lantern within 180 days for a full refund.</p>
</body>`;
const fernwickFacts = extractProductFacts(fernwick, "https://example.test/fernwick");
assert(!fernwickFacts.features.some((item) => /^(account|billing|language)$/i.test(item)), "utility menu is rejected");
assert(fernwickFacts.sourceSnippets.some((item) => item.field === "faq" && /dial/i.test(item.text)), "unseen page keeps its faq");
assert(/180 days/i.test(fernwickFacts.guaranteeInformation ?? ""), "unseen page keeps its guarantee");

const hiddenControls = `
<body>
  <span class="sr-only">Previous Image</span>
  <span class="sr-only">Next Image</span>
  <h2>Features</h2>
  <ul><li>A soft knit upper for everyday walking</li></ul>
</body>`;
const hiddenFacts = extractProductFacts(hiddenControls, "https://example.test/fernwick");
assert(!hiddenFacts.features.some((item) => /previous image|next image/i.test(item)), "screen-reader controls are not features");
assert(hiddenFacts.features.some((item) => /knit upper/i.test(item)), "the product feature next to those controls stays");

const sameWord = `
<body>
  <footer>
    <a href="/support">Support</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </footer>
  <p>Clarity</p><p>Support</p><p>Focus</p>
  <h2>Features</h2>
  <ul><li>Supports sharp focus during a long afternoon</li></ul>
</body>`;
const sameWordFacts = extractProductFacts(sameWord, "https://example.test/harbor");
assert(!sameWordFacts.features.some((item) => item.trim().toLowerCase() === "support"), "a chip that repeats a footer label is not a feature");
assert(sameWordFacts.features.some((item) => /sharp focus/i.test(item)), "the product sentence that mentions focus stays");

const comparison = `
<body>
  <div>
    <div>
      <div>Cedar</div><div>Freehold</div><div>Condo</div><div>Mortgage</div>
    </div>
    <div>
      <div>Own your home</div><div>Yes</div><div>No</div><div>No</div>
    </div>
  </div>
  <h2>Features</h2>
  <ul><li>A documented feature sentence for the kettle</li></ul>
</body>`;
const comparisonFacts = extractProductFacts(comparison, "https://example.test/harbor");
assert(!comparisonFacts.features.some((item) => /^(cedar|freehold|condo|mortgage)$/i.test(item)), "comparison column headers are not features");
assert(!comparisonFacts.features.some((item) => /own your home/i.test(item)), "comparison row labels are not features");
assert(comparisonFacts.features.some((item) => /documented feature sentence/i.test(item)), "the feature under the comparison stays");
const documented = comparisonFacts.sourceSnippets.find((item) => /documented feature sentence/i.test(item.text));
assert(documented?.sourceLocation === "FEATURE", "a kept fact records its owner class");
assert(Boolean(documented?.sourceUnit), "a kept fact records its owner section");

const negatives: Array<[string, string]> = [
  ["404", `<html><head><title>404</title></head><body><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Home</a></body></html>`],
  ["403", `<html><body><h1>403 Forbidden</h1><p>You do not have permission to view this page.</p></body></html>`],
  ["anti-bot", `<html><body><h1>Just a moment...</h1><p>Checking your browser before accessing the site.</p><p>Enable JavaScript and cookies to continue.</p></body></html>`],
  ["blog", `<html><body><nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a></nav><article><h1>How to choose a kettle</h1><p>A buying guide with no product offer.</p></article></body></html>`],
  ["home", `<html><body><header><a href="/shop">Shop</a><a href="/about">About</a><a href="/support">Support</a></header><h1>Welcome</h1><p>Browse the catalog.</p></body></html>`],
  ["commerce", `<html><body><nav><a href="/cart">Cart</a><a href="/account">Account</a><a href="/search">Search</a></nav><h1>Shop all</h1><p>No single product is described on this page.</p></body></html>`],
  ["marketing", `<html><body><h1>Grow your store</h1><p>A platform homepage for merchants.</p><a href="/pricing">Pricing</a><a href="/login">Login</a><a href="/demo">Book a demo</a></body></html>`],
  ["landing", `<html><body><h1>Harbor Kettle</h1><p>A short landing sentence.</p><a href="/buy">Buy</a></body></html>`],
  ["supplement", `<html><body><nav><a href="/ingredients">Ingredients</a><a href="/faq">FAQ</a><a href="/order">Order</a></nav><h1>Daily formula</h1><p>No ingredient list is present.</p></body></html>`],
];
for (const [kind, html] of negatives) {
  const facts = extractProductFacts(html, `https://example.test/${kind}`);
  assert(!facts.features.some((item) => /^(home|about|blog|shop|cart|account|support|login|pricing|order|ingredients|faq)$/i.test(item)), `${kind} chrome is not a feature`);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  if (facts.productName) {
    assert(plain.includes(facts.productName.trim().toLowerCase()), `${kind} name is text that appears on the page`);
  }
  assert(facts.ingredientsOrComponents.length === 0, `${kind} invents no ingredients`);
  assert(facts.features.every((item) => plain.includes(item.trim().toLowerCase())), `${kind} features are text on the page`);
}

const source = readFileSync(path.join("src", "lib", "content-boundary.ts"), "utf8");
const banned = ["visiflora", "neuro", "prodentim", "audifort", "joint genesis", "peakbiome", "getcedar", "clickbank"];
assert(!banned.some((word) => source.toLowerCase().includes(word)), "boundary engine has no product or domain names");
assert(!/^\s*(home|about|contact|login|privacy)\b/m.test(source), "boundary engine has no navigation word list");

const fixture = readFileSync(path.join("scripts", "fixtures", "prodentim-vsl.html"), "utf8");
const started = Date.now();
for (let i = 0; i < 20; i += 1) htmlWithoutPageStructure(fixture);
const average = (Date.now() - started) / 20;
assert(average < 50, `boundary classification stays cheap (${average.toFixed(1)}ms)`);

console.log(`content boundary tests passed (${average.toFixed(1)}ms average on the stored fixture)`);
