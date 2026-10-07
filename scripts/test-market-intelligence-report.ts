import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createMarketIntelligenceReport } from "../src/lib/market-discovery/market-intelligence-report.ts";
import { createMarketReportBuilder } from "../src/lib/market-discovery/market-report-builder.ts";
import { MARKET_REPORT_CONTEXT_MEMBERS } from "../src/lib/market-discovery/market-report-context.ts";
import {
  EVIDENCE_COVERAGE_KEYS,
  MARKET_COVERAGE_KEYS,
  MARKET_GRAPH_KEYS,
  MARKET_GRAPH_NODE_KINDS,
  MARKET_METADATA_KEYS,
  MARKET_REPORT_KEYS,
  MARKET_REPORT_ORIGINS,
  MARKET_REPORT_PROVENANCE,
  MARKET_REPORT_SNAPSHOT_KEYS,
  MARKET_REPORT_STATUSES,
  SERP_SUMMARY_KEYS,
  freezeDeepMarketReport,
} from "../src/lib/market-discovery/market-report-snapshot.ts";
import { MARKET_REPORT_STATISTICS_KEYS } from "../src/lib/market-discovery/market-report-statistics.ts";
import { createMarketReportValidator } from "../src/lib/market-discovery/market-report-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

const searchHtml = "<section>opaque-search-marker</section>";

function searchOf() {
  return {
    snapshotId: "snapshot-1",
    query: "zebra offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchUrl: "https://example.test/search?q=zebra",
    html: searchHtml,
    collectedAt: "2026-01-01T00:00:00.000Z",
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: {},
  };
}

function serpOf(title: string, marker: string | null) {
  return {
    title,
    url: `https://example.test/${title}`,
    description: `${title} line.`,
    position: 1,
    resultType: "block",
    sponsoredMarker: marker,
    organicMarker: null,
    resultMetadata: "block",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function sponsoredOf(url: string, title: string, position: number) {
  return {
    title,
    url,
    description: `${title} line.`,
    position,
    sponsoredMarker: "marked",
    resultMetadata: "block",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function pageOf(id: string, url: string, html: string) {
  return {
    landingPageId: id,
    destinationUrl: url,
    finalUrl: `${url}/final`,
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: {},
  };
}

function productOf(id: string, name: string) {
  return {
    landingPageId: id,
    productName: name,
    brand: "North Brand",
    vendor: "Vendor North",
    primaryOffer: "One bottle listed on the page.",
    primaryDomain: "offers.example.test",
    offerUrl: "https://example.test/buy",
    category: "Outdoor",
    language: "en",
    visiblePrice: "$47.00",
    currency: "USD",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

const keptUrl = "https://example.test/two";
const missingUrl = "https://example.test/missing";

function inputOf(over: Record<string, unknown> = {}) {
  return {
    searchSnapshot: searchOf(),
    serpRecords: [serpOf("Later block", "marked"), serpOf("Earlier block", null)],
    sponsoredResults: [sponsoredOf(missingUrl, "Later page", 2), sponsoredOf(keptUrl, "Earlier page", 1)],
    landingPageSnapshots: [pageOf("page-1", keptUrl, "<div>page one</div>")],
    observedProducts: [productOf("page-1", "Zebra Offer"), productOf("page-9", "Plain Offer")],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function reportOf() {
  let n = 0;
  return createMarketIntelligenceReport({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `market-report-${++n}`,
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

const validator = createMarketReportValidator();
check("statuses are OK and REJECTED", MARKET_REPORT_STATUSES.join() === "OK,REJECTED");
check("origin is OBSERVED and provenance is DIRECT_SOURCE", MARKET_REPORT_ORIGINS.join() === "OBSERVED" && MARKET_REPORT_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name the market artifacts and metadata", MARKET_REPORT_CONTEXT_MEMBERS.join() === "searchSnapshot,serpRecords,sponsoredResults,landingPageSnapshots,observedProducts,executionMetadata,runtimeMetadata,configuration");
check("report keys keep the summaries, coverage, warnings, and missing evidence", MARKET_REPORT_KEYS.join() === "searchSummary,serpSummary,sponsoredSummary,landingPageSummary,observedProductSummary,marketCoverage,marketMetadata,evidenceCoverage,warnings,missingEvidence,origin,provenance");
check("SERP summary keys keep the copied result fields", SERP_SUMMARY_KEYS.join() === "count,titles,urls,descriptions,positions");
check("market coverage keys keep the observed market fields", MARKET_COVERAGE_KEYS.join() === "keywords,observedDomains,observedLandingPages,observedOffers,observedBrands,observedCategories,observedPrices,observedLanguages");
check("coverage keys name each artifact", EVIDENCE_COVERAGE_KEYS.join() === "search,serp,sponsored,landingPages,observedProducts");
check("market metadata keys keep the search locale", MARKET_METADATA_KEYS.join() === "query,language,country,device,market");
check("graph keys are nodes then edges", MARKET_GRAPH_KEYS.join() === "nodes,edges");
check("graph kinds follow the market artifacts", MARKET_GRAPH_NODE_KINDS.join() === "SearchSnapshot,SERPRecords,SponsoredResults,LandingPageSnapshots,ObservedProducts");
check("snapshot keys keep the report, graph, statistics, and time", MARKET_REPORT_SNAPSHOT_KEYS.join() === "reportId,report,graph,statistics,createdAt,origin,provenance,metadata");
check("statistics keys count artifacts, warnings, and missing evidence", MARKET_REPORT_STATISTICS_KEYS.join() === "searchCount,serpCount,sponsoredCount,landingPageCount,observedProductCount,warningCount,missingCount,executionTime");
check("Missing SearchSnapshot: a missing envelope is rejected", has(validator.validateInput(null), /Missing SearchSnapshot/));
check("Missing SERP Records: a missing list is rejected", has(validator.validateInput(inputOf({ serpRecords: null })), /Missing SERP Records/));
check("Missing Sponsored Results: a missing list is rejected", has(validator.validateInput(inputOf({ sponsoredResults: null })), /Missing Sponsored Results/));
check("Missing Landing Pages: a missing list is rejected", has(validator.validateInput(inputOf({ landingPageSnapshots: undefined })), /Missing Landing Pages/));
check("Missing Observed Products: a missing list is rejected", has(validator.validateInput({ searchSnapshot: searchOf(), sponsoredResults: [], landingPageSnapshots: [] }), /Missing Observed Products/));
check("Corrupted Evidence: page text that is not text is rejected", has(validator.validateInput(inputOf({ landingPageSnapshots: [pageOf("page-1", keptUrl, 1 as unknown as string)] })), /Corrupted Evidence/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const host = reportOf();
const built = host.build(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const report = built.report;
check("market artifacts are consolidated", built.status === "OK" && report !== null && built.graph !== null && built.snapshot !== null && built.statistics.searchCount === 1 && built.statistics.serpCount === 2 && built.statistics.sponsoredCount === 2 && built.statistics.landingPageCount === 1 && built.statistics.observedProductCount === 2);
check("the search summary copies the query and the page length", report?.searchSummary.query === "zebra offer" && report.searchSummary.market === "north" && report.searchSummary.device === "desktop" && report.searchSummary.htmlLength === searchHtml.length && report.marketMetadata.query === "zebra offer" && report.marketMetadata.country === "US");
check("search page text is not copied into the report", report !== null && !JSON.stringify(report).includes("opaque-search-marker"));
check("SERP records stay in the given order", report?.serpSummary.titles.join("|") === "Later block|Earlier block" && report.serpSummary.urls.join("|") === "https://example.test/Later block|https://example.test/Earlier block" && report.serpSummary.count === 2 && Object.keys(report.serpSummary).join() === SERP_SUMMARY_KEYS.join());
check("sponsored results stay in the given order", report?.sponsoredSummary.urls.join("|") === `${missingUrl}|${keptUrl}` && report.sponsoredSummary.positions.join("|") === "2|1" && report.sponsoredSummary.titles.join("|") === "Later page|Earlier page");
check("a SERP marker is not copied as a sponsored result", reportOf().build(inputOf({ serpRecords: [serpOf("Marked block", "marked")], sponsoredResults: [] })).statistics.sponsoredCount === 0 && reportOf().build(inputOf({ serpRecords: [serpOf("Marked block", "marked")], sponsoredResults: [] })).report?.sponsoredSummary.count === 0);
check("landing pages and observed products stay in the given order", report?.landingPageSummary.landingPageIds.join("|") === "page-1" && report.landingPageSummary.htmlLength === "<div>page one</div>".length && report.observedProductSummary.productNames.join("|") === "Zebra Offer|Plain Offer" && report.observedProductSummary.vendors.join("|") === "Vendor North|Vendor North");
check("market coverage restates the keyword and the observed fields", report?.marketCoverage.keywords.join("|") === "zebra offer" && report.marketCoverage.observedDomains.join("|") === "offers.example.test|offers.example.test" && report.marketCoverage.observedLandingPages.join("|") === keptUrl && report.marketCoverage.observedOffers.join("|") === "https://example.test/buy|https://example.test/buy" && report.marketCoverage.observedBrands.join("|") === "North Brand|North Brand" && report.marketCoverage.observedCategories.join("|") === "Outdoor|Outdoor" && report.marketCoverage.observedPrices.join("|") === "$47.00|$47.00" && report.marketCoverage.observedLanguages.join("|") === "en|en" && Object.keys(report.marketCoverage).join() === MARKET_COVERAGE_KEYS.join());
check("coverage, warnings, and missing evidence restate the supplied artifacts", report?.evidenceCoverage.search === "PRESENT" && report.evidenceCoverage.serp === "PRESENT" && report.evidenceCoverage.sponsored === "PRESENT" && report.missingEvidence.length === 0 && report.warnings.join("|") === `Sponsored result url has no landing page snapshot: ${missingUrl}|Observed product has no landing page snapshot: page-9`);
check("the evidence graph has five nodes and the artifact edges", built.graph?.nodes.length === 5 && built.graph.edges.length === 4 && built.graph.nodes.every((node) => node.present === "PRESENT") && built.graph.nodes.map((node) => node.kind).join("|") === MARKET_GRAPH_NODE_KINDS.join("|") && built.snapshot?.graph === built.graph);
check("an empty SERP list is stored and named as missing evidence", reportOf().build(inputOf({ serpRecords: [] })).report?.missingEvidence.join("|") === "serpRecords" && reportOf().build(inputOf({ serpRecords: [] })).graph?.nodes[1]?.present === "ABSENT");
check("a missing SERP list stores nothing", reportOf().build(inputOf({ serpRecords: undefined })).status === "REJECTED" && has(reportOf().build(inputOf({ serpRecords: undefined })).issues, /Missing SERP Records/) && reportOf().build(inputOf({ serpRecords: undefined })).snapshot === null);
check("an empty sponsored list is stored and named as missing evidence", reportOf().build(inputOf({ sponsoredResults: [], observedProducts: [productOf("page-1", "Zebra Offer")] })).report?.missingEvidence.join("|") === "sponsoredResults");
check("the snapshot names the report and the run", built.snapshot?.reportId === "market-report-1" && built.snapshot.createdAt === "2026-01-01T00:00:00.000Z" && built.metadata.run === "r1" && built.snapshot.origin === "OBSERVED" && built.statistics.warningCount === 2 && built.statistics.missingCount === 0);
check("the report has exactly the requested fields", report !== null && Object.keys(report).join() === MARKET_REPORT_KEYS.join() && Object.keys(report.evidenceCoverage).join() === EVIDENCE_COVERAGE_KEYS.join() && Object.keys(report.marketCoverage).join() === MARKET_COVERAGE_KEYS.join());
check("getSnapshot returns the stored report", host.getSnapshot("market-report-1") === built.snapshot && host.getSnapshot("missing") === null);
check("the builder copies the search length", createMarketReportBuilder().build(inputOf() as never).report.searchSummary.htmlLength === searchHtml.length);

(source.searchSnapshot as { html: string }).html = "changed";
(source.observedProducts[0] as { productName: string }).productName = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.reportId as string) = "hacked";
  if (report) (report.observedProductSummary.productNames as string[])[0] = "hacked";
  if (built.graph) (built.graph.nodes as unknown as { present: string }[])[0].present = "ABSENT";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the report unchanged", before !== JSON.stringify(source) && report?.searchSummary.htmlLength === searchHtml.length && report.observedProductSummary.productNames[0] === "Zebra Offer" && built.metadata.run === "r1");
check("Immutable snapshot: the report, graph, and statistics cannot be assigned into", built.snapshot?.reportId === "market-report-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(report) && Object.isFrozen(report?.observedProductSummary.productNames) && Object.isFrozen(built.graph) && Object.isFrozen(built.statistics));
check("freeze helper returns the same value", freezeDeepMarketReport(built.snapshot) === built.snapshot);

const left = reportOf();
const right = reportOf();
left.build(inputOf());
right.build(null);
check("Independent report: reports do not share snapshots", left.getSnapshot("market-report-1")?.report.observedProductSummary.productNames[0] === "Zebra Offer" && right.getSnapshot("market-report-1") === null);
check("deterministic report: a second report matches the product names", reportOf().build(inputOf()).report?.observedProductSummary.productNames.join("|") === "Zebra Offer|Plain Offer");

function wrappedProduct(id: string, name: string) {
  return {
    identity: productOf(id, name),
    evidence: {
      landingPageId: id,
      htmlTitle: "Page heading",
      metaTitle: "Meta heading",
      openGraphTitle: "Graph heading",
      h1: "Visible heading",
      canonicalUrl: "https://example.test/offer",
      structuredData: '{ "name": "Hidden Name" }',
      visibleProductName: name,
      visibleBrand: "North Brand",
      visibleCtas: ["Get the offer"],
      visiblePrice: "$47.00",
      brandMentions: ["Mention One"],
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
    },
    metadata: { run: "r1" },
    confidenceInputs: {
      productName: true,
      brand: true,
      vendor: true,
      primaryDomain: true,
      offerUrl: true,
      category: true,
      language: true,
      price: true,
      currency: true,
      htmlTitle: true,
      h1: true,
      structuredData: true,
    },
  };
}
const wrapped = reportOf().build(inputOf({ observedProducts: [wrappedProduct("page-1", "Zebra Offer")] }));
check("a wrapped observed product is read from its identity", wrapped.status === "OK" && wrapped.report?.observedProductSummary.productNames.join("|") === "Zebra Offer" && wrapped.report.marketCoverage.observedPrices.join("|") === "$47.00" && !JSON.stringify(wrapped.report.observedProductSummary).includes("Hidden Name"));

const missing = reportOf().build(null);
check("a missing search snapshot stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing SearchSnapshot/) && missing.snapshot === null && missing.report === null && missing.graph === null);
const noPages = reportOf().build(inputOf({ landingPageSnapshots: null }));
check("missing landing pages store nothing", noPages.status === "REJECTED" && has(noPages.issues, /Missing Landing Pages/) && noPages.snapshot === null);
const noProducts = reportOf().build(inputOf({ observedProducts: null }));
check("missing observed products store nothing", noProducts.status === "REJECTED" && has(noProducts.issues, /Missing Observed Products/) && noProducts.snapshot === null);
const malformed = reportOf().build(inputOf({ landingPageSnapshots: [{ landingPageId: "page-1", html: 1 }] }));
check("corrupted evidence stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Corrupted Evidence/) && malformed.snapshot === null);
const nested = reportOf().build(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
const corrupted = createMarketIntelligenceReport({ now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "BAD" }).build(inputOf());
check("a corrupted report id stores nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Evidence/) && corrupted.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["market-intelligence-report.ts", "market-report-builder.ts", "market-report-validator.ts", "market-report-types.ts", "market-report-context.ts", "market-report-snapshot.ts", "market-report-statistics.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("seven report modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|gravity|product-intelligence|google-ads|campaign|recommend/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "market-report-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the report or the market artifact contracts", imports.every((from) => /^\.\/(market-intelligence-report|market-report-builder|market-report-validator|market-report-types|market-report-context|market-report-snapshot|market-report-statistics|google-search-snapshot|serp-types|sponsored-types|landing-page-snapshot|product-types)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored|landing-page|product|clickbank)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the report", earlier.every((file) => !/from ["']\.\/market-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the market report`, !sources.some((file) => /market-discovery|market-intelligence-report/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`MARKET_INTELLIGENCE_REPORT_FAILURES=${failures}`);
  process.exit(1);
}
console.log("MARKET_INTELLIGENCE_REPORT_FAILURES=0");
