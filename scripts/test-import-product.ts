// npx tsx scripts/test-import-product.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractProductFacts, extractProductInfo, checkRobotsRules } from "../src/lib/import-product.ts";
import { assessImportQuality, emptyProductFacts } from "../src/lib/product-facts.ts";
import { isPromotionalOrCta, isPromotionalHeading, normalizeUsageInstruction } from "../src/lib/import-heuristics.ts";
import { mergeAiFacts, parseAiFactsJson, shouldTryAiFallback } from "../src/lib/ai/classify-product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const htmlNavAndFeatures = `
<html><head>
<meta property="og:title" content="Joint Support Pro" />
<meta name="description" content="A daily joint-support supplement with glucosamine." />
</head><body>
<nav><ul>
  <li><a href="/">Home</a></li>
  <li><a href="/about">About</a></li>
  <li><a href="/contact">Contact</a></li>
  <li><a href="/cart">Cart</a></li>
</ul></nav>
<h1>Joint Support Pro</h1>
<h2>Key Features</h2>
<ul>
  <li>Glucosamine complex for daily use</li>
  <li>Easy-to-swallow capsules</li>
</ul>
<footer><ul><li>Privacy</li><li>Terms</li></ul></footer>
</body></html>
`;
const facts1 = extractProductFacts(htmlNavAndFeatures, "https://example.com/joint");
assert(facts1.productName === "Joint Support Pro", "og:title still wins for the name");
assert(
  !facts1.features.some((f) => /home|about|contact|cart/i.test(f)),
  "navigation list is ignored",
);
assert(
  facts1.features.includes("Glucosamine complex for daily use"),
  "feature list under relevant heading is extracted",
);
assert(facts1.confidence.features === "DIRECT_SOURCE", "headed feature list is DIRECT_SOURCE");
assert(facts1.confidence.ingredientsOrComponents === "NOT_FOUND", "missing ingredients stay NOT_FOUND");
assert(facts1.confidence.pricingInformation === "NOT_FOUND", "missing pricing stays NOT_FOUND");
assert(
  facts1.importWarnings.some((w) => /pricing/i.test(w)),
  "import warning when pricing is missing",
);
assert(facts1.description?.includes("joint-support"), "meta description is used");
assert(facts1.origin === "IMPORTED", "successful parse is IMPORTED origin");

const htmlIngredients = `
<html><body>
<h1>Joint Support Pro</h1>
<h2>What's Inside</h2>
<ul>
  <li>Glucosamine sulfate</li>
  <li>Chondroitin</li>
</ul>
<h2>How To Use</h2>
<ul><li>Take two capsules daily with food</li></ul>
<h2>Warnings</h2>
<ul><li>Talk to a clinician if you are pregnant</li></ul>
<h2>FAQ</h2>
<ul>
  <li>Is this a drug? No, it is sold as a supplement.</li>
</ul>
</body></html>
`;
const facts2 = extractProductFacts(htmlIngredients, "https://example.com/joint");
assert(
  facts2.ingredientsOrComponents.includes("Glucosamine sulfate"),
  "ingredient section is extracted",
);
assert(facts2.usageInformation.some((u) => /two capsules/i.test(u)), "usage section is extracted");
assert(facts2.cautions.some((c) => /pregnant/i.test(c)), "warnings section is extracted");
assert(
  facts2.sourceSnippets.some((s) => s.field === "faq" && /supplement/i.test(s.text)),
  "FAQ is recognized as source snippets",
);
assert(
  !facts2.features.includes("Is this a drug? No, it is sold as a supplement."),
  "FAQ is not dumped into features",
);

const htmlEmpty = `<html><body>Nothing useful</body></html>`;
const factsEmpty = extractProductFacts(htmlEmpty);
assert(!factsEmpty.productName, "missing name is not invented");
assert(factsEmpty.features.length === 0, "import failure / empty HTML does not fabricate features");
assert(factsEmpty.ingredientsOrComponents.length === 0, "empty HTML does not fabricate ingredients");
assert(factsEmpty.confidence.productName === "NOT_FOUND", "empty name is NOT_FOUND");
assert(
  factsEmpty.importWarnings.some((w) => /almost no product information/i.test(w)),
  "sparse pages get an import warning instead of invented facts",
);

const htmlHeuristic = `
<html><head>
<meta property="og:title" content="Winter Jacket XT-200 &amp; Hood" />
</head><body>
<h1>Should not be used — og:title wins</h1>
<ul>
  <li>Water-resistant shell for daily rain</li>
  <li>Insulated pockets for cold mornings</li>
  <li>Adjustable hood for wind</li>
</ul>
</body></html>
`;
const info1 = extractProductInfo(htmlHeuristic);
assert(
  info1.name === "Winter Jacket XT-200 & Hood",
  `og:title still decoded (veio "${info1.name}")`,
);
assert(info1.bullets.length === 0, "unheaded lists are not treated as features");

const html2 = `<html><head><title>Site Name</title></head><body><h1>Product From H1</h1></body></html>`;
assert(extractProductInfo(html2).name === "Product From H1", "sem og:title, usa <h1>");

const html3 = `<html><head><title>Fallback Title</title></head><body>No headings here</body></html>`;
assert(extractProductInfo(html3).name === "Fallback Title", "sem og:title nem h1, usa <title>");

const htmlTags = `<html><body><h2>Features</h2><ul><li><strong>Bold</strong> feature here</li></ul></body></html>`;
assert(
  extractProductFacts(htmlTags).features[0] === "Bold feature here",
  "tags inside list items are stripped",
);

const manyItems = Array.from({ length: 15 }, (_, i) => `<li>Documented feature number ${i} for the jacket</li>`).join("");
const htmlMany = `<html><body><h2>Features</h2><ul>${manyItems}</ul></body></html>`;
assert(extractProductFacts(htmlMany).features.length === 12, "feature lists are capped");

const robotsAllowAll = "User-agent: *\nDisallow:";
assert(checkRobotsRules(robotsAllowAll, "/products/anything"), "Disallow vazio = permite tudo");

const robotsBlockAll = "User-agent: *\nDisallow: /";
assert(!checkRobotsRules(robotsBlockAll, "/products/anything"), "robots blocking remains enforced");

const robotsBlockSpecific = "User-agent: *\nDisallow: /admin\nDisallow: /private";
assert(!checkRobotsRules(robotsBlockSpecific, "/admin/settings"), "path dentro de /admin é bloqueado");
assert(checkRobotsRules(robotsBlockSpecific, "/products/jacket"), "path fora das regras de disallow é permitido");

const robotsOtherAgentOnly = "User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow:";
assert(
  checkRobotsRules(robotsOtherAgentOnly, "/products/jacket"),
  "regra de outro user-agent (não *) não afeta o nosso — só o grupo * importa aqui",
);

const robotsEmpty = "";
assert(checkRobotsRules(robotsEmpty, "/anything"), "robots.txt vazio = permite tudo");

const fixturePath = path.join(process.cwd(), "scripts/fixtures/prodentim-vsl.html");
const prodentimHtml = readFileSync(fixturePath, "utf8");
const prodentim = extractProductFacts(prodentimHtml, "https://example.test/prodentim", {
  operatorProductName: "ProDentim",
});

assert(prodentim.productName === "ProDentim", "operatorProductName = ProDentim is kept");
assert(
  prodentim.productName !== "Order 6 Bottles and Get 3 FREE Bonuses!",
  "CTA heading is not used as the product name",
);
assert(
  prodentim.productName !== "Real ProDentim Users. Real Life-Changing Results.",
  "testimonial heading does not replace operator product name",
);
assert(
  prodentim.productName !== "Why Thousands Choose ProDentim",
  "why-people-choose heading does not replace operator product name",
);
assert(
  prodentim.productName !== "Discover ProDentim Today",
  "discover heading does not replace operator product name",
);
assert(
  !prodentim.features.some((f) => /^about prodentim$/i.test(f)),
  "About ProDentim must not become a feature",
);
assert(
  !prodentim.description?.includes("Text Presentation"),
  "generic title is not accepted as a useful description",
);
assert(
  Boolean(prodentim.description && /probiotic|blend|tablet/i.test(prodentim.description)),
  "grounded product description is preferred",
);
assert(
  !/transform lives/i.test(prodentim.guaranteeInformation ?? ""),
  "promotional transform-lives sentence is not the guarantee",
);
assert(
  prodentim.ingredientsOrComponents.some((i) => /lactobacillus paracasei/i.test(i)),
  "card-based ingredient extraction",
);
assert(
  prodentim.ingredientsOrComponents.some((i) => /reuteri/i.test(i)),
  "second ingredient card is extracted",
);
assert(
  prodentim.usageInformation.some((u) => /chew a tablet every morning/i.test(u)),
  "FAQ usage extraction",
);
assert(
  prodentim.usageInformation.every((u) => !/entire body|support gums/i.test(u)),
  "usage drops trailing health-benefit clause when separable",
);
assert(
  prodentim.sourceSnippets.some(
    (s) => s.field === "usageInformation" && /to support/i.test(s.text),
  ),
  "usage snippet keeps original source text",
);
assert(
  /60-day|money-back|money back|refund/i.test(prodentim.guaranteeInformation ?? ""),
  "money-back guarantee extraction when supported",
);
assert(prodentim.importQuality === "SUFFICIENT" || prodentim.importQuality === "PARTIAL", "fixture is not INSUFFICIENT");

const ctaNameHtml = `
<html><head><title>Acme Joint - Text Presentation</title></head>
<body><h1>Order 6 Bottles and Get 3 FREE Bonuses!</h1><p>Acme Joint is a daily capsule designed for ordinary joint comfort.</p></body></html>
`;
const ctaFacts = extractProductFacts(ctaNameHtml);
assert(ctaFacts.productName !== "Order 6 Bottles and Get 3 FREE Bonuses!", "CTA heading rejected as product name");
assert(ctaFacts.productName === "Acme Joint", "stripped document title used when product-like");

const hinted = extractProductFacts(ctaNameHtml, "https://example.test/acme", { operatorProductName: "Acme Joint" });
assert(hinted.productName === "Acme Joint", "operator product name used as grounding hint");
assert(hinted.confidence.productName === "DIRECT_SOURCE", "operator name matching source title is DIRECT_SOURCE");

const operatorMentionHtml = `
<html><head><title>Order Now - Special Offer</title>
<meta property="og:title" content="Buy Now and Save Big">
</head>
<body><h1>Order 6 Bottles and Get 3 FREE Bonuses!</h1>
<p>Acme Joint is a daily capsule designed for ordinary joint comfort.</p>
</body></html>
`;
const operatorMention = extractProductFacts(operatorMentionHtml, "https://example.test/acme", {
  operatorProductName: "Acme Joint",
});
assert(operatorMention.productName === "Acme Joint", "operator identity is kept when the source mentions it");
assert(
  operatorMention.confidence.productName === "MANUAL",
  "operator identity without a source title/og match is MANUAL, not HEURISTIC_EXTRACTION",
);

const testimonialHtml = `
<html><head><title>Acme Joint - Text Presentation</title></head>
<body>
<h1>Real Acme Joint Users. Real Life-Changing Results.</h1>
<h1>Why Thousands Choose Acme Joint</h1>
<h1>Discover Acme Joint Today</h1>
<p>Acme Joint is a daily capsule designed for ordinary joint comfort.</p>
</body></html>
`;
const testimonialFacts = extractProductFacts(testimonialHtml, "https://example.test/acme", {
  operatorProductName: "Acme Joint",
});
assert(testimonialFacts.productName === "Acme Joint", "generic operator name is kept over testimonial heading");
assert(
  testimonialFacts.productName !== "Real Acme Joint Users. Real Life-Changing Results.",
  "generic testimonial heading is not used as the product name",
);
assert(isPromotionalHeading("Real Acme Joint Users. Real Life-Changing Results."), "real-users heading is promotional");
assert(isPromotionalHeading("Why Thousands Choose Acme Joint"), "why-people-choose heading is promotional");
assert(isPromotionalHeading("Discover Acme Joint Today"), "discover heading is promotional");

assert(
  normalizeUsageInstruction(
    "We recommend you slowly chew a tablet every morning to support the health of your entire body, gums and teeth.",
  ) === "We recommend you slowly chew a tablet every morning.",
  "usage normalization separates trailing health-benefit clause",
);
assert(
  normalizeUsageInstruction("Take two capsules daily with food.") === "Take two capsules daily with food.",
  "usage without a separable benefit clause is unchanged",
);

const labelFeature = extractProductFacts(
  `<html><body><h1>Acme Joint</h1><h2>Features</h2><ul><li>About Acme Joint</li><li>Insulated lining for cold mornings</li></ul></body></html>`,
);
assert(!labelFeature.features.some((f) => /^about acme joint$/i.test(f)), "section heading rejected as feature");
assert(labelFeature.features.includes("Insulated lining for cold mornings"), "real feature statements are kept");

const genericDesc = extractProductFacts(
  `<html><head><title>Acme Joint - Text Presentation</title><meta name="description" content="Acme Joint - Text Presentation" /></head>
<body><h1>Acme Joint</h1></body></html>`,
);
assert(!genericDesc.description, "generic title rejected as description");
assert(genericDesc.confidence.description === "NOT_FOUND", "missing fact remains NOT_FOUND");

const paragraphIngredients = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>What's Inside</h2>
<p>The formula includes glucosamine sulfate and chondroitin.</p>
</body></html>
`);
assert(
  paragraphIngredients.ingredientsOrComponents.some((i) => /glucosamine sulfate/i.test(i)),
  "paragraph-based ingredient extraction",
);

const usageFaq = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<p>Joint Support Pro is a daily joint-support supplement with glucosamine.</p>
<h2>FAQ</h2>
<h3>When and how should I take this?</h3>
<p>Take two capsules daily with food.</p>
</body></html>
`);
assert(usageFaq.usageInformation.some((u) => /two capsules daily/i.test(u)), "FAQ usage extraction (generic)");

const moneyBack = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<p>Joint Support Pro is a daily joint-support supplement with glucosamine.</p>
<h2>60-Day Money Back Guarantee</h2>
<p>If you are not satisfied, return unused bottles within 60 days for a full refund.</p>
</body></html>
`);
assert(/60 days|money-back|refund/i.test(moneyBack.guaranteeInformation ?? ""), "money-back guarantee extraction");

const promoGuarantee = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<p>Joint Support Pro is a daily joint-support supplement with glucosamine.</p>
<h2>Our Guarantee</h2>
<p>The more results we see, the stronger we believe this product has the power to transform lives.</p>
</body></html>
`);
assert(!promoGuarantee.guaranteeInformation, "promotional guarantee false positive rejected");
assert(promoGuarantee.confidence.guaranteeInformation === "NOT_FOUND", "unsupported guarantee stays NOT_FOUND");

assert(isPromotionalOrCta("Order 6 Bottles and Get 3 FREE Bonuses!"), "CTA classifier catches offer headings");
assert(isPromotionalOrCta("Claim Your Discount"), "CTA classifier catches claim-discount copy");

const insufficient = emptyProductFacts("Named Only", "", "MANUAL");
assert(assessImportQuality(insufficient) === "INSUFFICIENT", "INSUFFICIENT quality detected");

const partial = extractProductFacts(`
<html><head><meta name="description" content="A daily joint-support supplement with glucosamine." /></head>
<body><h1>Joint Support Pro</h1></body></html>
`);
assert(assessImportQuality(partial) === "PARTIAL", "PARTIAL quality detected");

const sufficient = extractProductFacts(`
<html><head><meta name="description" content="A daily joint-support supplement with glucosamine." /></head>
<body>
<h1>Joint Support Pro</h1>
<h2>Key Features</h2>
<ul><li>Easy-to-swallow capsules for daily use</li></ul>
<h2>What's Inside</h2>
<ul><li>Glucosamine sulfate</li></ul>
<h2>How To Use</h2>
<ul><li>Take two capsules daily with food</li></ul>
</body></html>
`);
assert(assessImportQuality(sufficient) === "SUFFICIENT", "SUFFICIENT quality detected");

const aiSource = "Joint Support Pro is a daily capsule. Take two capsules daily with food. Contains glucosamine sulfate.";
const invented = mergeAiFacts(
  extractProductFacts(`<html><body><h1>Joint Support Pro</h1></body></html>`),
  {
    ingredientsOrComponents: [{ value: "Unobtainium extract", evidence: "Unobtainium extract" }],
    description: { value: "Invented medical cure", evidence: "Invented medical cure" },
  },
  aiSource,
);
assert(
  !invented.ingredientsOrComponents.some((i) => /unobtainium/i.test(i)),
  "AI fallback cannot invent unsupported fields",
);

const groundedAi = mergeAiFacts(
  extractProductFacts(`<html><body><h1>Joint Support Pro</h1></body></html>`),
  {
    usageInformation: [{ value: "Take two capsules daily with food.", evidence: "Take two capsules daily with food." }],
  },
  aiSource,
);
assert(
  groundedAi.usageInformation.some((u) => /two capsules daily/i.test(u)),
  "AI fallback evidence required and accepted when present in source",
);
assert(groundedAi.confidence.usageInformation === "AI_SOURCE_CLASSIFICATION", "AI-classified field is labeled AI_SOURCE_CLASSIFICATION");

assert(parseAiFactsJson("not-json") === null, "AI fallback malformed JSON fails safely");
assert(parseAiFactsJson("{") === null, "AI fallback truncated JSON fails safely");
const malformedKept = mergeAiFacts(
  extractProductFacts(`<html><body><h1>Joint Support Pro</h1><p>Joint Support Pro is a daily capsule designed for joints.</p></body></html>`),
  parseAiFactsJson("<<<"),
  aiSource,
);
assert(malformedKept.productName === "Joint Support Pro", "malformed AI JSON keeps deterministic extraction");

const thin = extractProductFacts(`<html><body><h1>Named Product</h1></body></html>`);
assert(shouldTryAiFallback(thin, `${"word ".repeat(300)} extra product copy`) === true, "AI fallback considered when page text is substantial and facts are thin");
assert(shouldTryAiFallback(sufficient, `${"word ".repeat(300)}`) === false, "AI fallback is not mandatory when deterministic facts are SUFFICIENT");
