import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createProductIdentifier } from "../src/lib/market-discovery/product-identifier.ts";
import { PRODUCT_CONTEXT_MEMBERS } from "../src/lib/market-discovery/product-context.ts";
import { createProductParser } from "../src/lib/market-discovery/product-parser.ts";
import { PRODUCT_SNAPSHOT_KEYS } from "../src/lib/market-discovery/product-snapshot.ts";
import { CONFIDENCE_INPUT_KEYS, OBSERVED_PRODUCT_RECORD_KEYS, PRODUCT_EVIDENCE_KEYS, PRODUCT_IDENTITY_KEYS, PRODUCT_ORIGINS, PRODUCT_PROVENANCE, PRODUCT_STATISTICS_KEYS, PRODUCT_STATUSES, freezeDeepProduct } from "../src/lib/market-discovery/product-types.ts";
import { createProductValidator } from "../src/lib/market-discovery/product-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

const fullHtml = `<html lang="en"><head>
<title>Page heading</title>
<meta name="title" content="Meta heading">
<meta content="Graph heading" property="og:title">
<link rel="canonical" href="https://example.test/offer">
<script type="application/ld+json">{ "name": "Hidden Name" }</script>
</head><body>
<h1>Visible heading</h1>
<span data-field="productName">Zebra Offer</span>
<span data-field="brand">North Brand</span>
<span data-field="vendor">Vendor North</span>
<span data-field="primaryOffer">One bottle listed on the page.</span>
<span data-field="primaryDomain">offers.example.test</span>
<a data-field="offerUrl" href="https://example.test/buy">Buy</a>
<span data-field="category">Outdoor</span>
<span data-field="visiblePrice" data-currency="USD">$47.00</span>
<span data-field="brandMention">Mention One</span>
<span data-field="brandMention">Mention Two</span>
<a data-field="cta" href="#buy">Get the offer</a>
<a data-field="cta" href="#more">Learn more</a>
</body></html>`;

const plainHtml = `<html><body>
<span data-field="productName">Plain Offer</span>
<span data-field="visiblePrice">$12.00</span>
<a href="https://shop.example.test/item" data-field="offerUrl">Open</a>
</body></html>`;

function pageOf(id: string, html: unknown) {
  return {
    landingPageId: id,
    destinationUrl: `https://example.test/${id}`,
    finalUrl: `https://example.test/${id}/final`,
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: {},
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    landingPageSnapshots: [pageOf("page-1", fullHtml), pageOf("page-2", plainHtml)],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function identifierOf() {
  let n = 0;
  return createProductIdentifier({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `identification-${++n}`,
  });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const validator = createProductValidator();
check("statuses are OK and REJECTED", PRODUCT_STATUSES.join() === "OK,REJECTED");
check("origin is OBSERVED and provenance is DIRECT_SOURCE", PRODUCT_ORIGINS.join() === "OBSERVED" && PRODUCT_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name landing page snapshots and metadata", PRODUCT_CONTEXT_MEMBERS.join() === "landingPageSnapshots,landingPageSnapshot,executionMetadata,runtimeMetadata,configuration");
check("identity keys keep the advertised product fields", PRODUCT_IDENTITY_KEYS.join() === "landingPageId,productName,brand,vendor,primaryOffer,primaryDomain,offerUrl,category,language,visiblePrice,currency,origin,provenance");
check("evidence keys keep the page evidence", PRODUCT_EVIDENCE_KEYS.join() === "landingPageId,htmlTitle,metaTitle,openGraphTitle,h1,canonicalUrl,structuredData,visibleProductName,visibleBrand,visibleCtas,visiblePrice,brandMentions,origin,provenance");
check("confidence inputs name the observed fields", CONFIDENCE_INPUT_KEYS.join() === "productName,brand,vendor,primaryDomain,offerUrl,category,language,price,currency,htmlTitle,h1,structuredData");
check("an observed product keeps identity, evidence, metadata, and confidence inputs", OBSERVED_PRODUCT_RECORD_KEYS.join() === "identity,evidence,metadata,confidenceInputs");
check("snapshot keys keep the products, identities, evidence, and time", PRODUCT_SNAPSHOT_KEYS.join() === "identificationId,products,identities,evidence,createdAt,origin,provenance,metadata");
check("statistics keys count pages and issues", PRODUCT_STATISTICS_KEYS.join() === "pageCount,issueCount,executionTime");
check("Missing LandingPageSnapshot: a missing envelope is rejected", has(validator.validateInput(null), /Missing LandingPageSnapshot/));
check("Missing HTML: a page without html is rejected", has(validator.validateInput(inputOf({ landingPageSnapshots: [pageOf("page-1", null)] })), /Missing HTML/));
check("Malformed HTML: page text that is not text is rejected", has(validator.validateInput(inputOf({ landingPageSnapshots: [pageOf("page-1", 1)] })), /Malformed HTML/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const parsed = createProductParser().parse(fullHtml);
check("structured data is stored as text and is not the product name", parsed.identity?.productName === "Zebra Offer" && parsed.evidence.structuredData?.includes("Hidden Name") === true);

const source = inputOf();
const before = JSON.stringify(source);
const host = identifierOf();
const built = host.identify(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const first = built.identities?.[0];
const second = built.identities?.[1];
const firstEvidence = built.evidence?.[0];
check("landing page snapshots are identified", built.status === "OK" && built.snapshot !== null && built.products !== null && built.identities !== null && built.evidence !== null && built.statistics.pageCount === 2);
check("identities stay in the landing page order", built.identities?.map((item) => item.productName).join("|") === "Zebra Offer|Plain Offer");
check("the first page copies the marked product fields", first?.brand === "North Brand" && first.vendor === "Vendor North" && first.primaryOffer === "One bottle listed on the page." && first.primaryDomain === "offers.example.test" && first.offerUrl === "https://example.test/buy" && first.category === "Outdoor" && first.language === "en" && first.visiblePrice === "$47.00" && first.currency === "USD" && first.landingPageId === "page-1" && first.origin === "OBSERVED" && first.provenance === "DIRECT_SOURCE");
check("a price symbol is not a currency and an offer host is the domain only when unmarked", second?.visiblePrice === "$12.00" && second.currency === null && second.primaryDomain === "shop.example.test" && second.brand === null && second.vendor === null && second.language === null && second.landingPageId === "page-2");
check("page evidence copies the title, heading, graph title, meta title, canonical address, mentions, and calls to action", firstEvidence?.htmlTitle === "Page heading" && firstEvidence.h1 === "Visible heading" && firstEvidence.openGraphTitle === "Graph heading" && firstEvidence.metaTitle === "Meta heading" && firstEvidence.canonicalUrl === "https://example.test/offer" && firstEvidence.visibleProductName === "Zebra Offer" && firstEvidence.visibleBrand === "North Brand" && firstEvidence.visiblePrice === "$47.00" && firstEvidence.brandMentions.join("|") === "Mention One|Mention Two" && firstEvidence.visibleCtas.join("|") === "Get the offer|Learn more" && firstEvidence.landingPageId === "page-1");
check("the page title is not copied into the meta title", firstEvidence?.metaTitle !== firstEvidence?.htmlTitle);
const firstProduct = built.products?.[0];
const secondProduct = built.products?.[1];
check("an observed product restates the marked product", firstProduct?.identity.productName === "Zebra Offer" && firstProduct.evidence.visibleProductName === "Zebra Offer" && firstProduct.metadata.run === "r1");
check("confidence inputs record which fields were present", firstProduct !== undefined && Object.keys(firstProduct.confidenceInputs).join() === CONFIDENCE_INPUT_KEYS.join() && firstProduct.confidenceInputs.productName === true && firstProduct.confidenceInputs.brand === true && firstProduct.confidenceInputs.currency === true && firstProduct.confidenceInputs.price === true && firstProduct.confidenceInputs.htmlTitle === true && firstProduct.confidenceInputs.structuredData === true && secondProduct?.confidenceInputs.currency === false && secondProduct.confidenceInputs.price === true && secondProduct.confidenceInputs.brand === false && secondProduct.confidenceInputs.htmlTitle === false);
check("the snapshot names the identification and the run", built.snapshot?.identificationId === "identification-1" && built.snapshot.createdAt === "2026-01-01T00:00:00.000Z" && built.metadata.run === "r1" && built.snapshot.origin === "OBSERVED" && built.snapshot.provenance === "DIRECT_SOURCE" && built.snapshot.products[0]?.identity.productName === "Zebra Offer");
check("each identity, evidence row, and observed product has exactly the requested fields", built.identities !== null && built.evidence !== null && built.products !== null && built.identities.every((item) => Object.keys(item).join() === PRODUCT_IDENTITY_KEYS.join()) && built.evidence.every((item) => Object.keys(item).join() === PRODUCT_EVIDENCE_KEYS.join()) && built.products.every((item) => Object.keys(item).join() === OBSERVED_PRODUCT_RECORD_KEYS.join()));
check("getSnapshot returns the stored identification", host.getSnapshot("identification-1") === built.snapshot && host.getSnapshot("missing") === null);
check("a single landing page snapshot is accepted", identifierOf().identify({ landingPageSnapshot: pageOf("page-1", fullHtml) }).identities?.[0]?.productName === "Zebra Offer");
check("a bare landing page snapshot is accepted", identifierOf().identify(pageOf("page-1", plainHtml)).identities?.[0]?.productName === "Plain Offer");

(source.landingPageSnapshots[0] as { html: string }).html = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.identificationId as string) = "hacked";
  if (first) (first as { productName: string }).productName = "hacked";
  if (firstEvidence) (firstEvidence.brandMentions as string[])[0] = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the identity unchanged", before !== JSON.stringify(source) && first?.productName === "Zebra Offer" && built.metadata.run === "r1" && firstEvidence?.brandMentions[0] === "Mention One");
check("Immutable snapshot: the identification and rows cannot be assigned into", built.snapshot?.identificationId === "identification-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(built.products) && Object.isFrozen(firstProduct) && Object.isFrozen(built.identities) && Object.isFrozen(first) && Object.isFrozen(firstEvidence?.brandMentions));
check("freeze helper returns the same value", freezeDeepProduct(built.snapshot) === built.snapshot);

const left = identifierOf();
const right = identifierOf();
left.identify(inputOf());
right.identify(null);
check("Independent identifier: identifiers do not share snapshots", left.getSnapshot("identification-1")?.identities.length === 2 && right.getSnapshot("identification-1") === null);
check("deterministic identification: a second identifier matches the product names", identifierOf().identify(inputOf()).identities?.map((item) => item.productName).join("|") === "Zebra Offer|Plain Offer");

const missing = identifierOf().identify(null);
check("a missing snapshot stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing LandingPageSnapshot/) && missing.snapshot === null && missing.products === null && missing.identities === null && missing.evidence === null);
const empty = identifierOf().identify({ landingPageSnapshots: [] });
check("an empty snapshot list stores nothing", empty.status === "REJECTED" && has(empty.issues, /Missing LandingPageSnapshot/) && empty.snapshot === null);
const missingHtml = identifierOf().identify(inputOf({ landingPageSnapshots: [pageOf("page-1", null)] }));
check("missing page text stores nothing", missingHtml.status === "REJECTED" && has(missingHtml.issues, /Missing HTML/) && missingHtml.snapshot === null && missingHtml.products === null);
const malformed = identifierOf().identify(inputOf({ landingPageSnapshots: [pageOf("page-1", 1)] }));
check("malformed page text stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed HTML/) && malformed.snapshot === null);
const unnamed = identifierOf().identify({ landingPageSnapshot: pageOf("page-1", "<html><head><title>Hidden Name</title></head><body><h1>Hidden Name</h1></body></html>") });
check("Missing Product Evidence: a page without a marked product name stores nothing", unnamed.status === "REJECTED" && has(unnamed.issues, /Missing Product Evidence/) && unnamed.snapshot === null && unnamed.identities === null);
const nested = identifierOf().identify(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["product-identifier.ts", "product-identifier-engine.ts", "product-parser.ts", "product-validator.ts", "product-types.ts", "product-context.ts", "product-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("seven identifier modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|gravity|product-intelligence/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "product-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the identifier or the landing page snapshot contract", imports.every((from) => /^\.\/(product-identifier|product-identifier-engine|product-parser|product-validator|product-types|product-context|product-snapshot|landing-page-snapshot)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored|landing-page)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the identifier", earlier.every((file) => !/from ["']\.\/product-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the product identifier`, !sources.some((file) => /market-discovery|product-identifier/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`PRODUCT_IDENTIFIER_FAILURES=${failures}`);
  process.exit(1);
}
console.log("PRODUCT_IDENTIFIER_FAILURES=0");
