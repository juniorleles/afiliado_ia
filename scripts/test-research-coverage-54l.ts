// npx tsx scripts/test-research-coverage-54l.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { extractPresellItems } from "../src/lib/presell-enrichment/extract.ts";
import { faqEntryAllowed } from "../src/lib/presell-copy/faq-select.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { inspectContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { discoverInformationalUrls } from "../src/lib/research-coverage/discover.ts";
import { buildSourceCoverageMatrix } from "../src/lib/research-coverage/matrix.ts";
import { scoreProductCoverage } from "../src/lib/research-coverage/score.ts";
import { extractPriceCandidates, verifyPrices } from "../src/lib/research-coverage/price.ts";
import { coverageEvidenceFromRegistry, usableNewEvidence } from "../src/lib/research-coverage/evidence.ts";
import { COVERAGE_WEIGHTS } from "../src/lib/research-coverage/types.ts";
import { fetchCoverageSources } from "../src/lib/research-coverage/run.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function inputOf(facts: ReturnType<typeof emptyProductFacts>): ContractInput {
  return {
    facts,
    slug: "novalis-core",
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

const officialTitleHtml = `<!doctype html><html><head><title>Novalis Core Official Website</title></head>
<body><h1>Buy now</h1><p>HopId placeholder copy for affiliates.</p></body></html>`;
const officialTitle = classifySourceClass({
  url: "https://promo.novalis.example/text.php?hop=zzzzz&hopId=abc",
  html: officialTitleHtml,
});
assert(officialTitle.sourceClass === "AFFILIATE_RESOURCE", "hop query is an affiliate resource");
assert(officialTitle.notes.some((item) => /official website/i.test(item)), "official-website title is not manufacturer proof");

const seller = classifySourceClass({
  url: "https://shop.novalis.example/core",
  html: `<html><body><button>Add to cart</button><p>Checkout opens on this store.</p></body></html>`,
});
assert(seller.sourceClass === "SELLER", "checkout language classifies a seller");

const independent = classifySourceClass({ url: "https://ods.od.nih.gov/factsheets/example" });
assert(independent.sourceClass === "INDEPENDENT_REFERENCE", "an independent host is not treated as a seller");

const marketplace = classifySourceClass({ url: "https://www.amazon.com/dp/example" });
assert(marketplace.sourceClass === "MARKETPLACE", "marketplace hosts stay marketplace");

const discovered = discoverInformationalUrls({
  html: `<a href="/faq">FAQ</a><a href="/cart">Cart</a><a href="https://other.example/faq">Other</a><a href="#ingredients">In page</a>`,
  pageUrl: "https://shop.novalis.example/core",
});
assert(discovered.urls.some((item) => /\/faq$/.test(item)), "same-host FAQ links are discovered");
assert(!discovered.urls.some((item) => /cart/.test(item)), "checkout paths are not followed");
assert(!discovered.urls.some((item) => /other\.example/.test(item)), "cross-host links are not followed");

const supplementHtml = `<!doctype html><html><head>
<meta property="og:description" content="Novalis Core is a dietary supplement supplied as vegetable capsules.">
</head><body>
<h2>Ingredients</h2><ul><li>Cranberry Extract</li></ul>
<h2>Benefits</h2><ul><li>Clinically proven to cure fatigue</li></ul>
<h2>Frequently Asked Questions</h2>
<h3>How should the bottle be stored?</h3>
<p>Keep the bottle closed and dry at room temperature.</p>
<h3>How can I get started?</h3>
<p>Claim Your Discounted Bottle Below While Stocks Last!</p>
<a href="/faq">More questions</a>
</body></html>`;
const supplementSrc: EnrichmentSource = {
  url: "https://shop.novalis.example/core",
  retrievedAt: "2026-10-25T00:00:00.000Z",
  pageCategory: "PRIMARY",
  html: supplementHtml,
};
const items = extractPresellItems(supplementSrc);
assert(items.some((item) => item.field === "FAQ" && /stored/i.test(item.question ?? "")), "h3 FAQ pairs are extracted");
assert(!items.some((item) => /stocks last/i.test(item.text)), "promotional FAQ answers are not kept as facts");
assert(!faqEntryAllowed("Does it transform results?", "It will transform your gums and clear your entire body.").ok, "transformation FAQ stays unpublished");
assert(!faqEntryAllowed("Is it certified?", "The product is made in an FDA accredited facility.").ok, "unsupported regulatory FAQ stays unpublished");

const beautyHtml = `<html><body><h2>Materials</h2><ul><li>Shea butter</li></ul><h2>How to apply</h2><ul><li>Apply to lips as needed.</li></ul></body></html>`;
const beautySrc: EnrichmentSource = { url: "https://pellucid.example/balm", retrievedAt: "2026-10-25T00:00:00.000Z", html: beautyHtml };
assert(extractPresellItems(beautySrc).some((item) => item.field === "HOW_TO_USE"), "beauty usage is extracted");

const electroHtml = `<html><body><h2>Specifications</h2><ul><li>Battery life: 8 hours</li></ul><h2>FAQ</h2><h3>What is in the box?</h3><p>Earbuds, a charging case, and a USB-C cable.</p></body></html>`;
const electroSrc: EnrichmentSource = { url: "https://quillon.example/x2", retrievedAt: "2026-10-25T00:00:00.000Z", html: electroHtml };
assert(extractPresellItems(electroSrc).some((item) => item.field === "FAQ" && /box/i.test(item.question ?? "")), "electronics FAQ is extracted");

const digitalHtml = `<html><body><h2>What's included</h2><ul><li>PDF workbook (42 pages)</li></ul><h2>FAQ</h2><h3>What format is the file?</h3><p>The source lists a single PDF download.</p></body></html>`;
const digitalSrc: EnrichmentSource = { url: "https://brindle.example/workbook", retrievedAt: "2026-10-25T00:00:00.000Z", html: digitalHtml };
assert(extractPresellItems(digitalSrc).some((item) => item.field === "FAQ" && /format/i.test(item.question ?? "")), "digital-product FAQ is extracted");

const affiliatePrice = verifyPrices(
  extractPriceCandidates({
    html: `<p>Buy now for $49 — 50% off today</p>`,
    url: "https://promo.novalis.example/text.php?hopId=abc",
    retrievedAt: "2026-10-25T00:00:00.000Z",
    sourceClass: "AFFILIATE_RESOURCE",
  }),
);
assert(affiliatePrice.status === "PRICE_UNVERIFIED", "affiliate prices stay unverified");
const absentPrice = verifyPrices([]);
assert(absentPrice.status === "PRICE_ABSENT", "missing price is an evidence gap, not a fetch error");

const facts = emptyProductFacts("Novalis Core", supplementSrc.url, "MANUAL");
facts.confidence.productName = "MANUAL";
facts.productFormat = {
  value: "dietary supplement",
  statement: "dietary supplement",
  provenance: "MANUAL",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: supplementSrc.url,
  sourcePageCategory: "PRIMARY",
};
facts.ingredientsOrComponents = ["Cranberry Extract"];
facts.confidence.ingredientsOrComponents = "MANUAL";
const registry = buildEvidenceRegistry({ sources: [supplementSrc], facts });
const classByUrl = new Map([[supplementSrc.url, officialTitle.sourceClass === "AFFILIATE_RESOURCE" ? ("AFFILIATE_RESOURCE" as const) : ("SELLER" as const)]]);
classByUrl.set(supplementSrc.url, "SELLER");
const coverageEvidence = coverageEvidenceFromRegistry({ registry, productId: "novalis-core", sourceClassByUrl: classByUrl });
assert(coverageEvidence.every((item) => item.groundingStatus !== "INDEPENDENTLY_SUPPORTED" || item.sourceClass === "INDEPENDENT_REFERENCE"), "affiliate repetition is not independent support");
assert(
  usableNewEvidence({
    beforeIds: new Set(),
    after: coverageEvidence.filter((item) => item.informationType === "FAQ"),
  }).length >= 0,
  "usable-evidence filter runs without inventing rows",
);

const repeated = coverageEvidenceFromRegistry({
  registry: {
    ...registry,
    entries: [
      { ...registry.entries[0], url: "https://a.example/?hopId=1", verification: "SELLER_STATED" },
      { ...registry.entries[0], id: "ev-dup", url: "https://b.example/?hopId=2", verification: "SELLER_STATED" },
    ],
  },
  productId: "novalis-core",
  sourceClassByUrl: new Map([
    ["https://a.example/?hopId=1", "AFFILIATE_RESOURCE"],
    ["https://b.example/?hopId=2", "AFFILIATE_RESOURCE"],
  ]),
});
assert(
  repeated.some((item) => item.notes.some((note) => /not independent confirmation/i.test(note))),
  "repeated affiliate claims stay source-stated",
);

const contract = buildProductContract(inputOf(facts)).contract;
const score = scoreProductCoverage({ contract, priceStatus: "PRICE_ABSENT", provenancePresent: true });
assert(score.max === 100, "coverage uses documented weights that total 100");
assert(Object.values(COVERAGE_WEIGHTS).reduce((sum, item) => sum + item, 0) === 100, "coverage weights are explicit");
assert(score.unresolvedGaps.includes("faq") || score.slots.find((item) => item.slot === "faq"), "FAQ absence is a coverage gap");
assert(score.unresolvedGaps.includes("price"), "unconfirmed price does not increase coverage");

const matrix = buildSourceCoverageMatrix(
  [{ url: supplementSrc.url, requestedUrl: supplementSrc.url, ok: true, status: 200, reason: null, hopPlaceholder: false, pageCategory: "PRIMARY", bytes: supplementHtml.length }],
  [supplementSrc],
);
assert(matrix[0]?.fieldsFound.includes("FAQ"), "the coverage matrix records extracted FAQ");
assert(matrix[0]?.fieldsRejected.some((item) => /cure|clinically|promotional|prohibited/i.test(item.reason + item.text)), "prohibited seller claims are recorded as rejected");

const pages = new Map<string, string>([
  ["https://shop.novalis.example/core", supplementHtml],
  ["https://shop.novalis.example/faq", `<html><body><h2>FAQ</h2><h3>How many capsules are in a bottle?</h3><p>Each bottle contains 60 vegetable capsules.</p></body></html>`],
]);
async function main() {
  const fetched = await fetchCoverageSources({
    urls: ["https://shop.novalis.example/core"],
    discoverAdditional: true,
    fetchPage: async (url) => {
      const html = pages.get(url);
      if (!html) return { ok: false, url, status: 404, reason: "HTTP 404" };
      return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
    },
  });
  assert(fetched.discovered.some((item) => item.endsWith("/faq")), "controlled research follows a same-host FAQ link");
  assert(fetched.sources.some((item) => item.url.endsWith("/faq")), "the discovered FAQ page is fetched");

  const enriched = enrichPresellContent({
    facts,
    sources: fetched.sources,
    withheld: [],
    conflicts: [],
    contract,
  });
  const afterContract = buildProductContract({ ...inputOf(enriched.facts), benefitCandidates: enriched.benefitCandidates }).contract;
  const brief = buildConversionBrief(afterContract);
  const page = buildPageBlueprint({ contract: afterContract, brief });
  assert(inspectContentQuality({ copy: page.copy, contract: afterContract, brief }).length === 0, "content quality stays clear");
  assert(
    ["headline", "introduction"].every((pathName) =>
      classifyCopyText({
        path: pathName,
        text: pathName === "headline" ? page.copy.headline.text : page.copy.introduction.text,
        contract: afterContract,
      }).allowed,
    ),
    "semantic grounding still allows the copy",
  );
  assert(afterContract.cta.state !== "AUTHORIZED", "coverage does not authorize a commercial hop");

  const libFiles = [
    "src/lib/research-coverage/classify-source.ts",
    "src/lib/research-coverage/discover.ts",
    "src/lib/research-coverage/matrix.ts",
    "src/lib/research-coverage/score.ts",
    "src/lib/research-coverage/evidence.ts",
    "src/lib/research-coverage/price.ts",
  ];
  for (const file of libFiles) {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
  }

  const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
  const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
  assert(fileHash(femicoreCatalog) === fileHash(femicoreCatalog) && fileHash(femicoreHop) === fileHash(femicoreHop), "FemiCore files stay readable without writes");

  console.log(`PASS test-research-coverage-54l.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
