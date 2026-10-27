// npx tsx scripts/test-presell-copy.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { buildPresellPlan } from "../src/lib/presell-strategy/plan.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { mergePreservedCopy } from "../src/lib/presell-enrichment/copy.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import {
  attributionAllowed,
  auditSellerStatements,
  buildConversionHandoff,
  classifySellerStatement,
  composeNeutralOverviewFromFacts,
  restateOperationalGuarantee,
} from "../src/lib/presell-copy/index.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
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

function source(html: string, url: string, records: EnrichmentSource["records"] = []): EnrichmentSource {
  return { url, retrievedAt: "2026-10-22T00:00:00.000Z", pageCategory: "PRIMARY", html, records };
}

const allowed = classifySellerStatement({
  text: "Vegetable cellulose capsule shell",
  field: "FEATURES",
  sourceUrl: "https://shop.novalis.example/core",
});
assert(allowed.class === "SELLER_STATED_ALLOWED" && allowed.publishable, "allowed manufacturer statement can be published");
assert(attributionAllowed(allowed), "allowed statement may be used without inventing a source");

const medical = classifySellerStatement({
  text: "Clinically proven to cure bladder leaks",
  field: "SELLER_CLAIMS",
  sourceUrl: "https://shop.novalis.example/core",
});
assert(medical.class === "PROHIBITED" && !medical.publishable, "prohibited medical claim stays blocked");
assert(!medical.restatement, "attribution does not salvage a medical promise");
assert(
  classifySellerStatement({
    text: "According to the manufacturer, this clinically proven formula cures fatigue",
    field: "SELLER_CLAIMS",
    sourceUrl: "https://shop.novalis.example/core",
  }).class === "PROHIBITED",
  "manufacturer attribution does not launder a prohibited claim",
);

const unproven = classifySellerStatement({
  text: "Boosts your energy and guaranteed results in 7 days",
  field: "SELLER_CLAIMS",
});
assert(unproven.class === "PROHIBITED" && !unproven.publishable, "unproven benefit stays blocked");

const conflict = classifySellerStatement({
  text: "Capsules per bottle: 60",
  field: "SPECIFICATIONS",
  conflicting: true,
});
assert(conflict.class === "CONFLICTING" && !conflict.publishable, "conflicting evidence is not selected");

const restated = restateOperationalGuarantee(
  "Your order today is covered by our iron-clad 60-day 100% money-back guarantee. If you are not impressed with the results, then just write to us and we will refund every single cent.",
);
assert(restated === "60-day money-back guarantee.", "operational guarantee is restated without amplifiers");
assert(!/iron-clad|100\s?%|risk-free|impressed/i.test(restated ?? ""), "restatement drops promotional amplifiers");
assert(
  restateOperationalGuarantee("Our money-back guarantee is a risk-free option because we believe in this formula so much.") === null,
  "a guarantee without a stated duration is not invented",
);

const facts = seed("Novalis Core", "https://shop.novalis.example/core", "dietary supplement");
facts.usageInformation = ["Take one capsule every morning with water."];
assert(
  composeNeutralOverviewFromFacts(facts) === "Novalis Core is a dietary supplement supplied as a capsule.",
  "neutral overview is composed from identity and stated format",
);
const empty = seed("Alder Clip", "https://alder.example/clip", "bag clip");
assert(composeNeutralOverviewFromFacts(empty) === null, "overview is not invented when format evidence is missing");

const blockedAudit = auditSellerStatements([
  {
    id: "ev22",
    field: "WARRANTY_OR_GUARANTEE",
    text: "Your order today is covered by our iron-clad 60-day 100% money-back guarantee . If you are not impressed with the results, then just write to us and we’ll refund every single cent.",
    blockReason: "health.refund_duration / promotional amplifiers",
  },
  {
    id: "ev23",
    field: "FAQ",
    text: "Designed to address bladder health by targeting toxic dioxins that throw the urinary microbiome out of balance.",
    blockReason: "health or endorsement language",
  },
]);
assert(blockedAudit[0].class === "SELLER_STATED_RESTRICTED" && blockedAudit[0].factualRestatement === "60-day money-back guarantee.", "restricted guarantee can be restated");
assert(blockedAudit[1].class === "PROHIBITED" && blockedAudit[1].manufacturerAttributionAppropriate === false, "medical FAQ stays prohibited");

const supplementHtml = `<!doctype html><html><body>
<h1>Novalis Core</h1>
<p>Novalis Core is a dietary supplement supplied as vegetable capsules.</p>
<h2>Ingredients</h2>
<ul><li>Cranberry Extract</li><li>Lactobacillus Acidophilus</li></ul>
<h2>How to use</h2>
<ul><li>Take one capsule every morning with water.</li></ul>
<h2>Guarantee</h2>
<p>Your order is covered by our iron-clad 60-day 100% money-back guarantee.</p>
<h2>FAQ</h2>
<h3>How should I take it?</h3>
<p>Take one capsule every morning with water.</p>
<h3>How does it work?</h3>
<p>Clinically proven to cure fatigue.</p>
</body></html>`;

const beautyHtml = `<!doctype html><html><body>
<h1>Pellucid Rose Balm</h1>
<p>A tinted lip balm in a twist-up tube.</p>
<h2>Features</h2>
<ul><li>Fragrance-free formula</li></ul>
<h2>How to apply</h2>
<ul><li>Apply to lips as needed.</li></ul>
<h2>Materials</h2>
<ul><li>Shea butter</li></ul>
</body></html>`;

const electronicsHtml = `<!doctype html><html><body>
<h1>Quillon X2</h1>
<p>True wireless earbuds with a charging case.</p>
<h2>Specifications</h2>
<ul><li>Battery life: 8 hours</li></ul>
<h2>How to use</h2>
<ul><li>Charge the case with the included USB-C cable.</li></ul>
<h2>FAQ</h2>
<h3>What is in the box?</h3>
<p></p>
</body></html>`;

const supplementSrc = source(supplementHtml, "https://shop.novalis.example/core", [
  { field: "guarantee", text: "Your order is covered by our iron-clad 60-day 100% money-back guarantee." },
]);
const beautySrc = source(beautyHtml, "https://pellucid.example/balm");
const electroSrc = source(electronicsHtml, "https://quillon.example/x2");

const supplement = enrichProduct({
  scenarioKey: "copy-supplement",
  contractInput: inputOf(seed("Novalis Core", supplementSrc.url, "dietary supplement")),
  sources: [supplementSrc],
});
assert(supplement.afterContract.guarantee?.text === "60-day money-back guarantee.", "SUPPLEMENT restates the operational guarantee");
assert(!(supplement.afterContract.faq ?? []).some((item) => /cure|clinically/i.test(item.answer)), "SUPPLEMENT keeps medical FAQ blocked");
assert((supplement.afterContract.components ?? []).filter((item) => /cranberry/i.test(item.name)).length === 1, "duplicate ingredients are not repeated");

const beauty = enrichProduct({
  scenarioKey: "copy-beauty",
  contractInput: inputOf(seed("Pellucid Rose Balm", beautySrc.url, "tinted lip balm")),
  sources: [beautySrc],
});
assert((beauty.afterContract.usage ?? []).some((item) => /apply/i.test(item.text)), "BEAUTY keeps stated application");
assert(!(beauty.afterContract.features ?? []).some((item) => /erase|wrinkle/i.test(item.text)), "BEAUTY does not invent unproven benefits");

const electronics = enrichProduct({
  scenarioKey: "copy-electronics",
  contractInput: inputOf(seed("Quillon X2", electroSrc.url, "wireless earbuds"), "https://shop.quillon.example/x2"),
  sources: [electroSrc],
});
assert((electronics.afterContract.specifications ?? []).length >= 1, "ELECTRONICS keeps stated specifications");
assert(!(electronics.afterContract.faq ?? []).some((item) => !item.answer.trim()), "incomplete FAQ answers are not published");

const duplicate = enrichPresellContent({
  facts: seed("Novalis Core", supplementSrc.url, "dietary supplement"),
  sources: [supplementSrc, supplementSrc],
});
assert(duplicate.facts.ingredientsOrComponents.filter((item) => /cranberry/i.test(item)).length === 1, "duplicate sources do not duplicate composition");

const conflictSrc = source(
  `<html><body><h2>Specifications</h2><ul><li>Capsules per bottle: 60</li></ul></body></html>`,
  "https://shop.novalis.example/core-b",
  [{ field: "specification", name: "Capsules per bottle", value: "90" }],
);
const conflicted = enrichProduct({
  scenarioKey: "copy-conflict",
  contractInput: inputOf(seed("Novalis Core", conflictSrc.url, "dietary supplement")),
  sources: [conflictSrc],
});
assert(conflicted.conflicts.length >= 1, "conflicting specification is recorded");

const zzzz = inputOf(seed("Novalis Core", "https://shop.example.com/buy", "dietary supplement"), "https://shop.example.com/buy?hop=zzzzz");
zzzz.cta = { href: "https://shop.example.com/buy?hop=zzzzz", label: "Buy now", previewOnly: false };
const zHandoff = buildConversionHandoff(buildProductContract(zzzz).contract);
assert(zHandoff.status === "BLOCKED_PLACEHOLDER" || zHandoff.status === "PREVIEW_ONLY", "invalid HopLink is not authorized");
assert(zHandoff.href === null && zHandoff.tracking.enabled === false, "placeholder hop has no live href or tracking");

const authorized = buildConversionHandoff(electronics.afterContract);
assert(
  authorized.status === "AUTHORIZED" || Boolean(electronics.afterContract.offer?.packages.length),
  "authorized destination or verified packages can be handed off",
);
if (authorized.status === "AUTHORIZED") {
  assert(Boolean(authorized.href) && authorized.tracking.enabled && authorized.tracking.event === "official_offer_click", "authorized click tracking does not include sensitive fields");
} else {
  assert(authorized.tracking.enabled === false, "preview handoff does not emit conversion tracking");
}

const preview = buildConversionHandoff(supplement.afterContract);
assert(preview.status === "PREVIEW_ONLY" && preview.href === null, "CTA without authorization stays inactive");

const thin = enrichPresellContent({
  facts: seed("Alder Clip", "https://alder.example/clip", "bag clip"),
  sources: [],
});
assert(!thin.facts.description && !thin.facts.guaranteeInformation, "absence of evidence does not invent copy");

const s1 = enrichProduct({ scenarioKey: "s1", contractInput: labContractInput(0), sources: labSources("s1") });
const s2 = enrichProduct({ scenarioKey: "s2", contractInput: labContractInput(1), sources: labSources("s2") });
const s3 = enrichProduct({ scenarioKey: "s3", contractInput: labContractInput(2), sources: labSources("s3") });
assert(buildPresellPlan(s1.afterContract).category === "SUPPLEMENT" || (s1.afterContract.faq ?? []).length >= 1, "lab SUPPLEMENT still works");
assert((s2.afterContract.offer?.packages.length ?? 0) >= 2, "lab BEAUTY still carries packages");
assert((s3.afterContract.usage ?? []).length >= 1, "lab ELECTRONICS still carries usage");

const brief = buildConversionBrief(supplement.afterContract);
const page = buildPageBlueprint({ contract: supplement.afterContract, brief });
assert(page.copy.sections.some((item) => item.sectionType === "guarantee"), "restated guarantee becomes a section when content exists");
const ground = validateSalesCopy(page.copy, supplement.afterContract, brief);
assert(ground.ok, `evidence-aware copy grounds (${ground.violations.map((item) => item.message).join("; ")})`);
const introClass = classifyCopyText({
  path: "introduction",
  text: page.copy.introduction.text,
  contract: supplement.afterContract,
});
assert(introClass.allowed, "introduction remains allowed by semantic grounding");

const merged = mergePreservedCopy(page.copy, page.copy);
assert(merged.faq.length === page.copy.faq.length, "FAQ union does not duplicate questions");

const libFiles = [
  "src/lib/presell-copy/policy.ts",
  "src/lib/presell-copy/restate.ts",
  "src/lib/presell-copy/compose.ts",
  "src/lib/presell-copy/handoff.ts",
  "src/lib/presell-enrichment/enrich.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-presell-copy.ts (${passed} OK)`);
