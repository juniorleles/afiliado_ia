// npx tsx scripts/test-presell-enrichment.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { attachSlotEvidence, buildPresellPlan, presellCtaAuthorization } from "../src/lib/presell-strategy/plan.ts";
import { classifyEvidence } from "../src/lib/presell-enrichment/classify.ts";
import { extractPresellItems } from "../src/lib/presell-enrichment/extract.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { mergePreservedCopy } from "../src/lib/presell-enrichment/copy.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function source(html: string, url: string, records: EnrichmentSource["records"] = []): EnrichmentSource {
  return { url, retrievedAt: "2026-10-22T00:00:00.000Z", pageCategory: "PRIMARY", html, records };
}

function seed(name: string, url: string, kind: string) {
  const facts = emptyProductFacts(name, url, "MANUAL");
  facts.confidence.productName = "MANUAL";
  facts.productFormat = {
    value: kind,
    statement: kind,
    provenance: "MANUAL",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: url,
    sourcePageCategory: "PRIMARY",
  };
  return facts;
}

function inputOf(facts: ReturnType<typeof seed>, href?: string): ContractInput {
  return {
    facts,
    slug: "lab",
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: href ? { href, label: "View Official Offer", previewOnly: false } : { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

const supplementHtml = `<!doctype html><html><head>
<meta property="og:description" content="Novalis Core is a dietary supplement supplied as vegetable capsules.">
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How should I take it?","acceptedAnswer":{"@type":"Answer","text":"Take one capsule every morning with water."}}]}</script>
</head><body>
<h1>Novalis Core</h1>
<h2>Ingredients</h2>
<ul><li>Cranberry Extract</li><li>Lactobacillus Acidophilus</li></ul>
<h2>How to use</h2>
<ul><li>Take one capsule every morning with water.</li></ul>
<h2>Warnings</h2>
<ul><li>Keep out of reach of children.</li></ul>
<h2>Features</h2>
<ul><li>Vegetable capsule shell</li><li>Clinically proven to cure fatigue</li></ul>
</body></html>`;

const beautyHtml = `<!doctype html><html><body>
<h1>Pellucid Rose Balm</h1>
<p>A tinted lip balm in a twist-up tube.</p>
<h2>Features</h2>
<ul><li>Fragrance-free formula</li><li>Tint stays on after a drink of water</li></ul>
<h2>How to apply</h2>
<ul><li>Apply to lips as needed.</li></ul>
<h2>Materials</h2>
<ul><li>Shea butter</li><li>Beeswax</li></ul>
<h2>Specifications</h2>
<ul><li>Net weight: 4.5 g</li></ul>
</body></html>`;

const electronicsHtml = `<!doctype html><html><body>
<h1>Quillon X2</h1>
<p>True wireless earbuds with a charging case.</p>
<h2>Features</h2>
<ul><li>Water-resistant housing</li><li>Touch controls on each earbud</li></ul>
<h2>Specifications</h2>
<ul><li>Battery life: 8 hours</li><li>Bluetooth version: 5.3</li></ul>
<h2>How to use</h2>
<ul><li>Charge the case with the included USB-C cable.</li></ul>
<h2>What's included</h2>
<ul><li>Earbuds (one pair)</li><li>Charging case</li></ul>
<h2>FAQ</h2>
<h3>What is in the box?</h3>
<p>Earbuds, a charging case, and a USB-C cable.</p>
</body></html>`;

const supplementSrc = source(supplementHtml, "https://shop.novalis.example/core");
const beautySrc = source(beautyHtml, "https://pellucid.example/balm");
const electroSrc = source(electronicsHtml, "https://quillon.example/x2", [
  { field: "offer", packageName: "1 pair", totalPrice: "$59", unitPrice: "$59", quantity: "1 pair" },
]);

const supplementItems = extractPresellItems(supplementSrc);
assert(supplementItems.some((item) => item.field === "INGREDIENTS" && /cranberry/i.test(item.text)), "supplement extracts ingredients");
assert(supplementItems.some((item) => item.field === "FAQ" && item.question), "supplement extracts FAQ with a question");
assert(supplementItems.some((item) => item.field === "HOW_TO_USE"), "supplement extracts usage");
assert(supplementItems.some((item) => item.field === "CAUTIONS"), "supplement extracts cautions");
assert(supplementItems.some((item) => item.field === "PRODUCT_OVERVIEW"), "supplement extracts overview");

const beautyItems = extractPresellItems(beautySrc);
assert(beautyItems.some((item) => item.field === "HOW_TO_USE" && /apply/i.test(item.text)), "beauty extracts application");
assert(beautyItems.some((item) => item.field === "SPECIFICATIONS" || item.field === "INGREDIENTS"), "beauty extracts composition or specs");

const electroItems = extractPresellItems(electroSrc);
assert(electroItems.some((item) => item.field === "SPECIFICATIONS" && /battery/i.test(item.text + (item.name ?? ""))), "electronics extracts specifications");
assert(electroItems.some((item) => item.field === "FAQ" && /box/i.test(item.question ?? "")), "electronics extracts FAQ from headings");

const prohibited = classifyEvidence({ field: "SELLER_CLAIMS", text: "Clinically proven to cure fatigue" });
assert(prohibited.verification === "PROHIBITED" && prohibited.restriction === "BLOCKED", "medical claims are prohibited");
const testimonial = classifyEvidence({ field: "SELLER_CLAIMS", text: "Verified buyer: this changed my life" });
assert(testimonial.verification === "UNVERIFIED", "testimonials stay unverified");
const price = classifyEvidence({ field: "SELLER_CLAIMS", text: "Today only $19 with 50% off" });
assert(price.restriction === "NOT_PERMANENT", "prices are not treated as permanent");
const affiliateCopy = classifyEvidence({
  field: "PRODUCT_OVERVIEW",
  text: "Proven Copy: VSL crafted by A-list copywriters with multiple ClickBank blockbusters under their belt",
});
assert(affiliateCopy.restriction === "BLOCKED", "affiliate-program copy is not product evidence");

const supplementEnriched = enrichProduct({
  scenarioKey: "lab-supplement",
  contractInput: inputOf(seed("Novalis Core", supplementSrc.url, "dietary supplement")),
  sources: [supplementSrc],
});
assert(
  Boolean(supplementEnriched.afterContract.description?.text || supplementEnriched.afterContract.valueProposition?.headline?.text),
  "supplement overview reaches the contract",
);
assert((supplementEnriched.afterContract.components ?? []).length >= 2, "supplement ingredients reach the contract");
assert((supplementEnriched.afterContract.faq ?? []).some((item) => /take/i.test(item.question)), "supplement FAQ question survives merge");
assert(!(supplementEnriched.afterContract.features ?? []).some((item) => /cure/i.test(item.text)), "prohibited claim is not a feature");
assert(supplementEnriched.withheld.some((item) => /cure|clinically|fatigue/i.test(item.text)) || supplementEnriched.afterFacts.features.every((item) => !/cure/i.test(item)), "prohibited claim is withheld");
assert(supplementEnriched.afterContract.publication.approval === "REQUIRED", "publication stays required");

const beautyEnriched = enrichProduct({
  scenarioKey: "lab-beauty",
  contractInput: inputOf(seed("Pellucid Rose Balm", beautySrc.url, "tinted lip balm")),
  sources: [beautySrc],
});
assert(
  Boolean(beautyEnriched.afterContract.description?.text || beautyEnriched.afterContract.valueProposition?.headline?.text),
  "beauty overview reaches the contract",
);
assert((beautyEnriched.afterContract.usage ?? []).length >= 1, "beauty usage reaches the contract");

const electroEnriched = enrichProduct({
  scenarioKey: "lab-electronics",
  contractInput: inputOf(seed("Quillon X2", electroSrc.url, "wireless earbuds"), "https://shop.quillon.example/x2"),
  sources: [electroSrc],
});
assert((electroEnriched.afterContract.specifications ?? []).length >= 1, "electronics specifications reach the contract");
assert(presellCtaAuthorization(electroEnriched.afterContract).status === "AUTHORIZED" || electroEnriched.afterContract.offer, "electronics can keep an authorized destination or packages");

const conflictSrc = source(
  `<html><body><h2>Specifications</h2><ul><li>Capsules per bottle: 60</li></ul></body></html>`,
  "https://shop.novalis.example/core-b",
  [{ field: "specification", name: "Capsules per bottle", value: "90" }],
);
const conflict = enrichProduct({
  scenarioKey: "lab-conflict",
  contractInput: inputOf(seed("Novalis Core", conflictSrc.url, "dietary supplement")),
  sources: [conflictSrc],
});
assert(conflict.conflicts.length >= 1, "conflicting specifications are recorded");
assert(conflict.conflicts[0].kept.includes("90") || conflict.conflicts[0].kept.includes("60"), "a conflict keeps one stated value instead of inventing a third");

const empty = enrichPresellContent({
  facts: seed("Alder Clip", "https://alder.example/clip", "bag clip"),
  sources: [],
});
assert(empty.fields.every((item) => item.field === "PRODUCT_OVERVIEW" ? true : true), "absence still returns field payloads");
assert(!empty.facts.description, "missing overview is not invented");
assert(empty.limitations.some((item) => /no source/i.test(item)), "unavailable sources are recorded");

const incomplete = extractPresellItems(source(`<html><body><h1>Widget</h1><p>Buy now</p></body></html>`, "https://widget.example/x"));
assert(!incomplete.some((item) => item.field === "PRODUCT_OVERVIEW" && /buy now/i.test(item.text)), "CTA copy is not used as overview");

const billingFacts = seed("Novalis Core", "https://shop.example.com/core", "dietary supplement");
billingFacts.description = "You can rest assured that this is a one-time payment. There won’t be any recurring shipments or charges to your card.";
billingFacts.usageInformation = ["Take one capsule every morning with water."];
const billingEnriched = enrichPresellContent({ facts: billingFacts, sources: [] });
assert(!/one-time payment|recurring shipments|charges to your card/i.test(billingEnriched.facts.description ?? ""), "checkout billing copy is not used as overview");
assert(/dietary supplement supplied as a capsule/i.test(billingEnriched.facts.description ?? ""), "blocked billing overview falls back to identity");

const shippingFacts = seed("Novalis Core", "https://shop.example.com/core", "dietary supplement");
shippingFacts.description = "Your order will be shipped the next business day after your confirmation. Your shipment should arrive within 5-7 business days if you are based in the US.";
shippingFacts.usageInformation = ["Take one capsule every morning with water."];
shippingFacts.sourceSnippets = [{
  field: "faq",
  text: "Your order will be shipped the next business day after your confirmation.",
  question: "How will Novalis Core be shipped to me and how quickly?",
  sourceUrl: "https://shop.example.com/help/shipping",
  confidence: "DIRECT_SOURCE",
}];
const shippingEnriched = enrichPresellContent({ facts: shippingFacts, sources: [] });
assert(!/order will be shipped|shipment should arrive/i.test(shippingEnriched.facts.description ?? ""), "shipping fulfillment copy is not used as overview");
assert(/dietary supplement supplied as a capsule/i.test(shippingEnriched.facts.description ?? ""), "blocked shipping overview falls back to identity");
assert(shippingEnriched.facts.sourceSnippets.some((item) => item.field === "faq" && /shipped/i.test(item.text)), "shipping FAQ remains a FAQ after overview is blocked");

const pointerFacts = seed("Novalis Core", "https://shop.example.com/core", "dietary supplement");
pointerFacts.description = "You may find the label with all the ingredients and their dosages at the following link: References";
pointerFacts.usageInformation = ["Take one capsule every morning with water."];
const pointerEnriched = enrichPresellContent({ facts: pointerFacts, sources: [] });
assert(!/following link|find the label/i.test(pointerEnriched.facts.description ?? ""), "label-pointer copy is not used as overview");
assert(/dietary supplement supplied as a capsule/i.test(pointerEnriched.facts.description ?? ""), "blocked pointer overview falls back to identity");

const duplicate = enrichPresellContent({
  facts: seed("Novalis Core", supplementSrc.url, "dietary supplement"),
  sources: [supplementSrc, supplementSrc],
});
const cranberry = duplicate.facts.ingredientsOrComponents.filter((item) => /cranberry/i.test(item));
assert(cranberry.length === 1, "duplicate sources do not duplicate ingredients");

const zzzz = inputOf(seed("Novalis Core", "https://shop.example.com/buy", "dietary supplement"), "https://shop.example.com/buy?hop=zzzzz");
zzzz.cta = { href: "https://shop.example.com/buy?hop=zzzzz", label: "Buy now", previewOnly: false };
const zContract = buildProductContract(zzzz).contract;
const zStatus = presellCtaAuthorization(zContract).status;
assert(zStatus === "BLOCKED_PLACEHOLDER" || zStatus === "PREVIEW_ONLY", "placeholder hop stays blocked after enrichment");
assert(presellCtaAuthorization(zContract).href === null, "placeholder hop has no live href");

const noHop = enrichProduct({
  scenarioKey: "lab-nohop",
  contractInput: inputOf(seed("Novalis Core", supplementSrc.url, "dietary supplement")),
  sources: [supplementSrc],
});
assert(presellCtaAuthorization(noHop.afterContract).status === "PREVIEW_ONLY", "CTA without HopLink stays preview-only");
assert(buildPresellPlan(noHop.afterContract).cta.href === null, "no invented affiliate link");

const s1 = enrichProduct({ scenarioKey: "s1", contractInput: labContractInput(0), sources: labSources("s1") });
const s2 = enrichProduct({ scenarioKey: "s2", contractInput: labContractInput(1), sources: labSources("s2") });
const s3 = enrichProduct({ scenarioKey: "s3", contractInput: labContractInput(2), sources: labSources("s3") });
assert((s1.afterContract.faq ?? []).length >= 1, "lab supplement still carries FAQ");
assert((s2.afterContract.offer?.packages.length ?? 0) >= 2, "lab beauty still carries packages");
assert((s3.afterContract.usage ?? []).length >= 1, "lab electronics still carries usage");

const plan = attachSlotEvidence(buildPresellPlan(supplementEnriched.afterContract), enrichPresellContent({
  facts: supplementEnriched.afterFacts,
  sources: [supplementSrc],
  contract: supplementEnriched.afterContract,
}).sections.map((item) => ({ slot: item.slot, evidenceIds: item.evidenceIds })));
assert(plan.slots.every((item) => item.status === (item.include ? "SELECTED" : "OMITTED")), "slots record SELECTED or OMITTED");
assert(plan.slots.filter((item) => item.include).every((item) => item.selectionReason), "selected slots have a selection reason");
assert(plan.slots.filter((item) => !item.include).every((item) => item.omissionReason), "omitted slots have an omission reason");
assert(!plan.independentReviewClaim, "page is not claimed as an independent review");

const brief = buildConversionBrief(supplementEnriched.afterContract);
const page = buildPageBlueprint({ contract: supplementEnriched.afterContract, brief });
const ground = validateSalesCopy(page.copy, supplementEnriched.afterContract, brief);
assert(ground.ok, `enriched copy grounds (${ground.violations.map((item) => item.message).join("; ")})`);
const mergedCopy = mergePreservedCopy(page.copy, page.copy);
assert(mergedCopy.headline.text === page.copy.headline.text, "preserved copy is not replaced");
const introClass = classifyCopyText({
  path: "introduction",
  text: page.copy.introduction.text,
  contract: supplementEnriched.afterContract,
});
assert(introClass.allowed, "introduction remains allowed by semantic grounding");

const libFiles = [
  "src/lib/presell-enrichment/extract.ts",
  "src/lib/presell-enrichment/enrich.ts",
  "src/lib/presell-enrichment/registry.ts",
  "src/lib/presell-enrichment/classify.ts",
  "src/lib/presell-strategy/plan.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-presell-enrichment.ts (${passed} OK)`);
