// npx tsx scripts/test-search-intent.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import {
  applyPresellMode,
  classifySearchIntent,
  composeIntentHeadline,
  evaluateGoogleAdsReadiness,
  searchIntentCategoryOf,
} from "../src/lib/search-intent/index.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

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

const what = classifySearchIntent("what is Novalis Core");
assert(what.intent === "INFORMATIONAL" && what.mode === "PRESELL_EDITORIAL", "what-is is informational editorial");
const reviews = classifySearchIntent("Novalis Core reviews");
assert(reviews.intent === "COMMERCIAL_INVESTIGATION" && reviews.mode === "PRESELL_BOFU", "reviews is commercial BOFU");
const buy = classifySearchIntent("buy Novalis Core");
assert(buy.intent === "TRANSACTIONAL" && buy.mode === "PRESELL_BOFU", "buy is transactional BOFU");
const price = classifySearchIntent("Novalis Core price");
assert(price.intent === "TRANSACTIONAL", "price is transactional");
const official = classifySearchIntent("Novalis Core official website");
assert(official.intent === "NAVIGATIONAL" && official.mode === "PRESELL_EDITORIAL", "official website stays editorial");
const oquee = classifySearchIntent("o que é Novalis Core");
assert(oquee.intent === "INFORMATIONAL", "Portuguese what-is is informational");
const comprar = classifySearchIntent("comprar Novalis Core");
assert(comprar.intent === "TRANSACTIONAL", "Portuguese buy is transactional");
const ambiguous = classifySearchIntent("Novalis Core");
assert(ambiguous.uncertain && ambiguous.mode === "PRESELL_EDITORIAL", "ambiguous product-only query stays conservative");

assert(searchIntentCategoryOf({ productKind: "dietary supplement" }) === "SUPPLEMENT", "SUPPLEMENT category");
assert(searchIntentCategoryOf({ productKind: "tinted lip balm" }) === "BEAUTY", "BEAUTY category");
assert(searchIntentCategoryOf({ productKind: "wireless earbuds" }) === "ELECTRONICS", "ELECTRONICS category");
assert(searchIntentCategoryOf({ productKind: "digital course" }) === "DIGITAL_PRODUCT", "DIGITAL_PRODUCT category");

const s1 = enrichProduct({ scenarioKey: "s1", contractInput: labContractInput(0), sources: labSources("s1") });
const s2 = enrichProduct({ scenarioKey: "s2", contractInput: labContractInput(1), sources: labSources("s2") });
const s3 = enrichProduct({ scenarioKey: "s3", contractInput: labContractInput(2), sources: labSources("s3") });

function apply(query: string, contract: ReturnType<typeof enrichProduct>["afterContract"]) {
  const brief = buildConversionBrief(contract);
  const page = buildPageBlueprint({ contract, brief });
  return applyPresellMode({ query, contract, brief, copy: page.copy });
}

const s1Editorial = apply("what is Novalis Core", s1.afterContract);
assert(s1Editorial.mode === "PRESELL_EDITORIAL", "supplement informational uses editorial");
assert(s1Editorial.headline.startsWith(`${s1.afterContract.identity.productName}: `), "informational headline is name-led");
assert(/Product Overview|Dietary supplement|Ingredients|capsule/i.test(s1Editorial.headline), "informational headline uses the documented kind or composition");
assert(!/official website/i.test(s1Editorial.headline), "headline is not an official-site claim");
const s1Ground = validateSalesCopy(s1Editorial.copy, s1.afterContract, buildConversionBrief(s1.afterContract));
assert(s1Ground.ok, `supplement editorial grounds (${s1Ground.violations.map((item) => item.message).join("; ")})`);

const s2Bofu = apply("buy Pellucid Rose Balm", s2.afterContract);
assert(s2Bofu.mode === "PRESELL_BOFU", "beauty buy uses BOFU");
assert(s2Bofu.copy.sections.findIndex((item) => item.sectionType === "legal") === s2Bofu.copy.sections.length - 1, "BOFU keeps legal last");
assert(!(s2Bofu.copy.sections.find((item) => item.sectionType === "offers") && s2Bofu.copy.offerMicrocopy.length === 0), "BOFU does not invent an empty offer");

const s3Nav = apply("Quillon X2 official website", s3.afterContract);
assert(s3Nav.mode === "PRESELL_EDITORIAL", "navigational electronics stays editorial");
assert(/Product Information/i.test(s3Nav.headline), "navigational headline is product information");

const digitalFacts = seed("Novalis Notes", "https://notes.novalis.example/course", "digital course");
digitalFacts.description = "Novalis Notes is a digital course supplied as a download.";
digitalFacts.confidence.description = "MANUAL";
digitalFacts.usageInformation = ["Download the files after checkout."];
digitalFacts.confidence.usageInformation = "MANUAL";
const digital = buildProductContract(inputOf(digitalFacts)).contract;
const digitalApplied = apply("what is Novalis Notes", digital);
assert(searchIntentCategoryOf({ productKind: digital.identity.productKind }) === "DIGITAL_PRODUCT", "digital product stays its own category");
assert(digitalApplied.mode === "PRESELL_EDITORIAL", "digital informational stays editorial");
assert(digitalApplied.hop.authorizationStatus !== "AUTHORIZED", "digital without hop stays inactive");

const noPrice = apply("Novalis Core price", s1.afterContract);
assert(!/\$/.test(noPrice.copy.headline.text), "absence of price does not invent a price");
assert(noPrice.ads.checks.find((item) => item.id === "NO_UNVERIFIED_PRICES")?.verdict === "PASS", "unverified prices stay blocked");

const noHop = apply("buy Novalis Notes", digital);
assert(noHop.hop.cta.enabled === false && noHop.hop.authorizedDestination === null, "absence of HopLink keeps CTA inactive");
assert(!noHop.copy.cta.href, "no invented hop URL");

const zzzz = inputOf(seed("Novalis Core", "https://shop.example.com/buy", "dietary supplement"), "https://shop.example.com/buy?hop=zzzzz");
zzzz.cta = { href: "https://shop.example.com/buy?hop=zzzzz", label: "Buy now", previewOnly: false };
const zContract = buildProductContract(zzzz).contract;
const zApplied = apply("buy Novalis Core", zContract);
assert(zApplied.hop.authorizationStatus === "BLOCKED_PLACEHOLDER" || zApplied.hop.authorizationStatus === "PREVIEW_ONLY", "invalid hop is not authorized");
assert(zApplied.hop.openRedirectBlocked, "open redirects stay blocked");
assert(zApplied.hop.sensitiveFieldsLogged === false, "tokens are not logged");

const unverifiedOffer = apply("buy Pellucid Rose Balm", s2.afterContract);
assert(
  !unverifiedOffer.copy.sections.some((section) => section.sectionType === "offers" && section.items.length === 0),
  "unverified empty offers are not rendered",
);

const medical = classifyCopyText({
  path: "introduction",
  text: "Clinically proven to cure fatigue",
  contract: s1.afterContract,
});
assert(!medical.allowed, "medical claims stay blocked");

assert(Boolean(s1.afterContract.guarantee || s2.afterContract.guarantee), "guarantee is available when the source stated it");
assert(s2Bofu.copy.sections.some((item) => item.sectionType === "guarantee") || !s2.afterContract.guarantee, "stated guarantee can appear in BOFU");

const ads = evaluateGoogleAdsReadiness(s1.afterContract, s1Editorial.copy);
assert(ads.certified === false, "readiness is not Google Ads approval");
assert(ads.checks.find((item) => item.id === "ADVERTISER_IDENTITY")?.verdict === "PASS", "advertiser identity is present");
assert(ads.checks.find((item) => item.id === "AFFILIATE_TRANSPARENCY")?.verdict === "PASS", "affiliate disclosure is present");
assert(ads.checks.find((item) => item.id === "LEGAL_LINKS")?.verdict === "PASS", "legal links are present");
assert(ads.checks.find((item) => item.id === "OWN_CONTENT")?.verdict === "PASS", "page has its own content");

const officialHeadline = composeIntentHeadline({
  contract: s1.afterContract,
  intent: "NAVIGATIONAL",
  mode: "PRESELL_EDITORIAL",
});
assert(!/official website/i.test(officialHeadline), "navigational headline does not impersonate the official site");

const libFiles = [
  "src/lib/search-intent/classify.ts",
  "src/lib/search-intent/headline.ts",
  "src/lib/search-intent/apply.ts",
  "src/lib/search-intent/hoplink.ts",
  "src/lib/search-intent/ads-readiness.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-search-intent.ts (${passed} OK)`);
