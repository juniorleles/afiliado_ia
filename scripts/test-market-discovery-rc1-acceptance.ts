/**
 * Market Discovery — RC1 acceptance audit.
 * Validation only. Does not add host behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createGoogleSearchConnector } from "../src/lib/market-discovery/google-search-connector.ts";
import { createGoogleSerpParser } from "../src/lib/market-discovery/google-serp-parser.ts";
import { createSponsoredResultsDetector } from "../src/lib/market-discovery/sponsored-results-detector.ts";
import { createLandingPageCollector } from "../src/lib/market-discovery/landing-page-collector.ts";
import { createProductIdentifier } from "../src/lib/market-discovery/product-identifier.ts";
import { createMarketIntelligenceReport } from "../src/lib/market-discovery/market-intelligence-report.ts";
import { createMarketReportValidator } from "../src/lib/market-discovery/market-report-validator.ts";
import { createMarketDiscoveryPipeline } from "../src/lib/market-discovery/market-discovery-pipeline.ts";
import { MARKET_DISCOVERY_STAGES } from "../src/lib/market-discovery/market-discovery-snapshot.ts";

const GATES = [
  "GOOGLE_SEARCH_CONNECTOR",
  "GOOGLE_SERP_PARSER",
  "SPONSORED_RESULTS_DETECTOR",
  "LANDING_PAGE_COLLECTOR",
  "PRODUCT_IDENTIFIER",
  "MARKET_INTELLIGENCE_REPORT",
  "END_TO_END_MARKET_DISCOVERY",
  "NEGATIVE_TESTS",
  "REGRESSION",
  "PERFORMANCE",
  "GENERICITY",
] as const;
type Gate = (typeof GATES)[number];
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const failed = new Map<Gate, string[]>();
const bugs: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
let productHardcoding = 0;

function check(gate: Gate, label: string, ok: boolean, severity: Severity = "HIGH") {
  if (!ok) {
    const list = failed.get(gate) ?? [];
    list.push(label);
    failed.set(gate, list);
    bugs[severity] += 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
function clocks(prefix: string) {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `${prefix}-${(n += 1)}` };
}
function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const meta = {
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "OFFLINE" },
};

const searchHtml = `<div>opaque-search-marker</div>
<article data-serp="result" data-position="1" data-result-type="web" data-sponsored-marker="marked" data-result-metadata="block">
  <a data-field="title" href="https://example.test/buy">Listed block</a>
  <p data-field="description">A listed page.</p>
</article>
<article data-serp="result" data-position="2" data-result-type="web" data-organic-marker="marked" data-result-metadata="block">
  <a data-field="title" href="https://example.test/other">Other block</a>
  <p data-field="description">An organic block.</p>
</article>`;

const productHtml = `<html lang="en"><body>
<span data-field="productName">Zebra Offer</span>
<span data-field="brand">North Brand</span>
<span data-field="vendor">Vendor North</span>
<span data-field="category">Outdoor</span>
<span data-field="visiblePrice" data-currency="USD">$47.00</span>
<a data-field="offerUrl" href="https://example.test/buy">Buy</a>
</body></html>`;

function searchInput() {
  return {
    keyword: "zebra offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchHtml,
    ...meta,
  };
}
function pageResponse() {
  return {
    destinationUrl: "https://example.test/buy",
    finalUrl: "https://example.test/buy",
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html: productHtml,
  };
}
function pipelineInput() {
  return { ...searchInput(), pages: [pageResponse()] };
}

function main() {
  const search = createGoogleSearchConnector(clocks("snapshot")).collect(searchInput());
  const searchSnapshot = search.snapshot;
  check("GOOGLE_SEARCH_CONNECTOR", "Search Collection: a supplied page becomes one frozen search snapshot", search.status === "OK" && searchSnapshot !== null && searchSnapshot.query === "zebra offer" && searchSnapshot.html === searchHtml && Object.isFrozen(searchSnapshot));
  const searchBefore = JSON.stringify(searchInput());
  const searchSource = searchInput();
  const searchStored = createGoogleSearchConnector(clocks("snapshot")).collect(searchSource);
  (searchSource as { searchHtml: string }).searchHtml = "changed";
  check("GOOGLE_SEARCH_CONNECTOR", "No mutation: changing the search input leaves the snapshot", searchBefore !== JSON.stringify(searchSource) && searchStored.snapshot?.html === searchHtml);
  const searchLeft = createGoogleSearchConnector(clocks("snapshot"));
  const searchRight = createGoogleSearchConnector(clocks("snapshot"));
  searchLeft.collect(searchInput());
  check("GOOGLE_SEARCH_CONNECTOR", "Independent modules: search connectors do not share snapshots", searchLeft.getSnapshot("snapshot-1") !== null && searchRight.getSnapshot("snapshot-1") === null);

  const serp = searchSnapshot === null ? null : createGoogleSerpParser(clocks("serp")).parse({ searchSnapshot, ...meta });
  check("GOOGLE_SERP_PARSER", "SERP Parsing: result blocks stay in page order and loose links are omitted", serp?.status === "OK" && serp.records?.map((item) => item.title).join("|") === "Listed block|Other block" && serp.records.length === 2 && Object.isFrozen(serp.snapshot));
  const serpLeft = createGoogleSerpParser(clocks("serp"));
  const serpRight = createGoogleSerpParser(clocks("serp"));
  if (searchSnapshot) serpLeft.parse({ searchSnapshot, ...meta });
  check("GOOGLE_SERP_PARSER", "Independent modules: SERP parsers do not share snapshots", serpLeft.getSnapshot("serp-1") !== null && serpRight.getSnapshot("serp-1") === null);

  const sponsored = serp?.records === null || serp?.records === undefined ? null : createSponsoredResultsDetector(clocks("sponsored")).detect({ serpRecords: serp.records, ...meta });
  check("SPONSORED_RESULTS_DETECTOR", "Sponsored Detection: a marker is kept and an organic block is left out", sponsored?.status === "OK" && sponsored.results?.map((item) => item.url).join("|") === "https://example.test/buy" && sponsored.statistics.sponsoredCount === 1 && Object.isFrozen(sponsored.snapshot));
  const sponsoredLeft = createSponsoredResultsDetector(clocks("sponsored"));
  const sponsoredRight = createSponsoredResultsDetector(clocks("sponsored"));
  if (serp?.records) sponsoredLeft.detect({ serpRecords: serp.records, ...meta });
  check("SPONSORED_RESULTS_DETECTOR", "Independent modules: sponsored detectors do not share snapshots", sponsoredLeft.getSnapshot("sponsored-1") !== null && sponsoredRight.getSnapshot("sponsored-1") === null);

  const landing = sponsored?.results === null || sponsored?.results === undefined ? null : createLandingPageCollector(clocks("collection")).collect({ sponsoredResults: sponsored.results, pages: [pageResponse()], ...meta });
  check("LANDING_PAGE_COLLECTOR", "Landing Page Collection: the destination page is stored as supplied", landing?.status === "OK" && landing.pages?.length === 1 && landing.pages[0]?.destinationUrl === "https://example.test/buy" && landing.pages[0]?.html === productHtml && Object.isFrozen(landing.snapshot));
  const landingLeft = createLandingPageCollector(clocks("collection"));
  const landingRight = createLandingPageCollector(clocks("collection"));
  if (sponsored?.results) landingLeft.collect({ sponsoredResults: sponsored.results, pages: [pageResponse()], ...meta });
  check("LANDING_PAGE_COLLECTOR", "Independent modules: landing page collectors do not share snapshots", landingLeft.getSnapshot("collection-1") !== null && landingRight.getSnapshot("collection-1") === null);

  const identified = landing?.pages === null || landing?.pages === undefined ? null : createProductIdentifier(clocks("identification")).identify({ landingPageSnapshots: landing.pages, ...meta });
  check("PRODUCT_IDENTIFIER", "Observed Products: the marked product is restated and structured data is not the name", identified?.status === "OK" && identified.products?.[0]?.identity.productName === "Zebra Offer" && identified.products[0]?.evidence.visibleProductName === "Zebra Offer" && identified.products[0]?.confidenceInputs.productName === true && Object.isFrozen(identified.snapshot));
  const identifiedLeft = createProductIdentifier(clocks("identification"));
  const identifiedRight = createProductIdentifier(clocks("identification"));
  if (landing?.pages) identifiedLeft.identify({ landingPageSnapshots: landing.pages, ...meta });
  check("PRODUCT_IDENTIFIER", "Independent modules: identifiers do not share snapshots", identifiedLeft.getSnapshot("identification-1") !== null && identifiedRight.getSnapshot("identification-1") === null);

  const reported = searchSnapshot && serp?.records && sponsored?.results && landing?.pages && identified?.products
    ? createMarketIntelligenceReport(clocks("market-report")).build({
      searchSnapshot,
      serpRecords: serp.records,
      sponsoredResults: sponsored.results,
      landingPageSnapshots: landing.pages,
      observedProducts: identified.products,
      ...meta,
    })
    : null;
  check("MARKET_INTELLIGENCE_REPORT", "Market Intelligence Report: supplied artifacts are consolidated in the given order", reported?.status === "OK" && reported.report?.searchSummary.query === "zebra offer" && reported.report.sponsoredSummary.urls.join("|") === "https://example.test/buy" && reported.report.observedProductSummary.productNames.join("|") === "Zebra Offer" && !JSON.stringify(reported.report).includes("opaque-search-marker"));
  check("MARKET_INTELLIGENCE_REPORT", "Evidence Graph: five artifact nodes stay linked in collection order", reported?.graph?.nodes.length === 5 && reported.graph.edges.length === 4 && reported.graph.nodes.every((node) => node.present === "PRESENT") && Object.isFrozen(reported.snapshot));
  const reportLeft = createMarketIntelligenceReport(clocks("market-report"));
  const reportRight = createMarketIntelligenceReport(clocks("market-report"));
  if (searchSnapshot && serp?.records && sponsored?.results && landing?.pages && identified?.products) {
    reportLeft.build({ searchSnapshot, serpRecords: serp.records, sponsoredResults: sponsored.results, landingPageSnapshots: landing.pages, observedProducts: identified.products, ...meta });
  }
  check("MARKET_INTELLIGENCE_REPORT", "Independent modules: reports do not share snapshots", reportLeft.getSnapshot("market-report-1") !== null && reportRight.getSnapshot("market-report-1") === null);

  const pipeline = createMarketDiscoveryPipeline(clocks("discovery"));
  const source = pipelineInput();
  const before = JSON.stringify(source);
  const walked = pipeline.run(source);
  (source as { keyword: string }).keyword = "changed";
  (source.pages[0] as { html: string }).html = "changed";
  check("END_TO_END_MARKET_DISCOVERY", "Pipeline Execution: the walk restates the keyword and the observed product", walked.status === "OK" && walked.analysis?.keyword === "zebra offer" && walked.report?.observedProductSummary.productNames.join("|") === "Zebra Offer" && walked.graph?.nodes.length === 5);
  check("END_TO_END_MARKET_DISCOVERY", "Every host executes once and no host executes twice", walked.executions.length === MARKET_DISCOVERY_STAGES.length && walked.executions.every((entry) => entry.count === 1) && walked.executions.map((entry) => entry.stage).join() === MARKET_DISCOVERY_STAGES.join());
  check("END_TO_END_MARKET_DISCOVERY", "Immutable snapshots and immutable pipeline context", before !== JSON.stringify(source) && walked.snapshot?.context.keyword === "zebra offer" && walked.snapshot.context.pages[0]?.html === productHtml && Object.isFrozen(walked.snapshot) && Object.isFrozen(walked.snapshot.context) && walked.analysis?.keyword === "zebra offer");
  const pipelineLeft = createMarketDiscoveryPipeline(clocks("discovery"));
  const pipelineRight = createMarketDiscoveryPipeline(clocks("discovery"));
  pipelineLeft.run(pipelineInput());
  check("END_TO_END_MARKET_DISCOVERY", "Independent modules: pipelines do not share snapshots", pipelineLeft.getSnapshot("discovery-1") !== null && pipelineRight.getSnapshot("discovery-1") === null);
  const stopped = createMarketDiscoveryPipeline(clocks("discovery")).run({ ...pipelineInput(), searchHtml: 1 });
  check("END_TO_END_MARKET_DISCOVERY", "Stop on first refusal: a refused search host runs once and later hosts do not run", stopped.status === "REJECTED" && has(stopped.issues, /Missing Search Snapshot/) && stopped.snapshot === null && stopped.executions[0]?.count === 1 && stopped.executions.slice(1).every((entry) => entry.count === 0));

  const emptyKeyword = createGoogleSearchConnector(clocks("neg-search")).collect({ ...searchInput(), keyword: "  " });
  check("NEGATIVE_TESTS", "Empty Keyword: a blank keyword is rejected with no snapshot", emptyKeyword.status === "REJECTED" && has(emptyKeyword.issues, /Empty Keyword/) && emptyKeyword.snapshot === null);
  const malformedSearch = createGoogleSerpParser(clocks("neg-serp")).parse({ searchSnapshot: { snapshotId: "snapshot-1", html: 1 }, ...meta });
  check("NEGATIVE_TESTS", "Malformed Search Snapshot: a snapshot that is not text is rejected with no snapshot", malformedSearch.status === "REJECTED" && has(malformedSearch.issues, /Malformed Snapshot/) && malformedSearch.snapshot === null);
  const malformedSerp = createSponsoredResultsDetector(clocks("neg-sponsored")).detect({ serpRecords: [{ title: "Listed block" }], ...meta });
  check("NEGATIVE_TESTS", "Malformed SERP Records: a partial record is rejected with no snapshot", malformedSerp.status === "REJECTED" && has(malformedSerp.issues, /Malformed Records/) && malformedSerp.snapshot === null);
  const missingSponsored = createLandingPageCollector(clocks("neg-landing")).collect({ pages: [pageResponse()], ...meta });
  check("NEGATIVE_TESTS", "Missing Sponsored Results: a collector call without sponsored results stores nothing", missingSponsored.status === "REJECTED" && has(missingSponsored.issues, /Missing Sponsored Results/) && missingSponsored.snapshot === null);
  const invalidUrl = sponsored?.results
    ? createLandingPageCollector(clocks("neg-url")).collect({
      sponsoredResults: [{ ...sponsored.results[0], url: "http://example.test/buy" }],
      pages: [{ ...pageResponse(), destinationUrl: "http://example.test/buy", finalUrl: "http://example.test/buy" }],
      ...meta,
    })
    : null;
  check("NEGATIVE_TESTS", "Invalid URL: an http address is rejected with no snapshot", invalidUrl?.status === "REJECTED" && has(invalidUrl.issues, /Invalid URL/) && invalidUrl.snapshot === null);
  const timeout = sponsored?.results
    ? createLandingPageCollector(clocks("neg-timeout")).collect({
      sponsoredResults: sponsored.results,
      pages: [{ ...pageResponse(), timedOut: true }],
      ...meta,
    })
    : null;
  check("NEGATIVE_TESTS", "Timeout: a timed-out destination is rejected with no snapshot", timeout?.status === "REJECTED" && has(timeout.issues, /Timeout/) && timeout.snapshot === null);
  const redirectLoop = sponsored?.results
    ? createLandingPageCollector(clocks("neg-loop")).collect({
      sponsoredResults: sponsored.results,
      pages: [{ ...pageResponse(), redirects: ["https://example.test/mid", "https://example.test/buy"] }],
      ...meta,
    })
    : null;
  check("NEGATIVE_TESTS", "Redirect Loop: a repeated destination address is rejected with no snapshot", redirectLoop?.status === "REJECTED" && has(redirectLoop.issues, /Redirect Loop/) && redirectLoop.snapshot === null);
  const malformedPage = createProductIdentifier(clocks("neg-page")).identify({ landingPageSnapshot: { landingPageId: "page-1", html: 1 }, ...meta });
  check("NEGATIVE_TESTS", "Malformed Landing Page: page text that is not text is rejected with no snapshot", malformedPage.status === "REJECTED" && has(malformedPage.issues, /Malformed HTML/) && malformedPage.snapshot === null);
  const unnamed = createProductIdentifier(clocks("neg-product")).identify({ landingPageSnapshot: { landingPageId: "page-1", html: "<html><head><title>Hidden Name</title></head><body><h1>Hidden Name</h1></body></html>" }, ...meta });
  check("NEGATIVE_TESTS", "Missing Product Evidence: a page without a marked product name stores nothing", unnamed.status === "REJECTED" && has(unnamed.issues, /Missing Product Evidence/) && unnamed.snapshot === null);
  const corruptGraph = createMarketReportValidator().validateSnapshot({
    reportId: "market-report-1",
    report: {},
    graph: { nodes: [], edges: [] },
    statistics: {},
    createdAt: T0,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: {},
  });
  check("NEGATIVE_TESTS", "Corrupted Evidence Graph: a graph that does not name each artifact is rejected", has(corruptGraph, /Corrupted Evidence/) && has(corruptGraph, /graph\.nodes/));
  const invalidMeta = createGoogleSearchConnector(clocks("neg-meta")).collect({ ...searchInput(), configuration: { nested: { a: 1 } } });
  check("NEGATIVE_TESTS", "Invalid Metadata: nested metadata is rejected with no snapshot", invalidMeta.status === "REJECTED" && has(invalidMeta.issues, /Invalid Metadata/) && invalidMeta.snapshot === null);

  const searchTimed = timed(() => createGoogleSearchConnector(clocks("perf-search")).collect(searchInput()));
  const serpTimed = timed(() => createGoogleSerpParser(clocks("perf-serp")).parse({ searchSnapshot: searchTimed.value.snapshot, ...meta }));
  const sponsoredTimed = timed(() => createSponsoredResultsDetector(clocks("perf-sponsored")).detect({ serpRecords: serpTimed.value.records, ...meta }));
  const landingTimed = timed(() => createLandingPageCollector(clocks("perf-landing")).collect({ sponsoredResults: sponsoredTimed.value.results, pages: [pageResponse()], ...meta }));
  const productTimed = timed(() => createProductIdentifier(clocks("perf-product")).identify({ landingPageSnapshots: landingTimed.value.pages, ...meta }));
  const reportTimed = timed(() => createMarketIntelligenceReport(clocks("perf-report")).build({
    searchSnapshot: searchTimed.value.snapshot,
    serpRecords: serpTimed.value.records,
    sponsoredResults: sponsoredTimed.value.results,
    landingPageSnapshots: landingTimed.value.pages,
    observedProducts: productTimed.value.products,
    ...meta,
  }));
  const pipelineTimed = timed(() => createMarketDiscoveryPipeline(clocks("perf-pipeline")).run(pipelineInput()));
  const perfRows: Array<[string, number, boolean]> = [
    ["Search Connector", searchTimed.ms, searchTimed.value.status === "OK"],
    ["SERP Parser", serpTimed.ms, serpTimed.value.status === "OK"],
    ["Sponsored Detector", sponsoredTimed.ms, sponsoredTimed.value.status === "OK"],
    ["Landing Page Collector", landingTimed.ms, landingTimed.value.status === "OK"],
    ["Product Identifier", productTimed.ms, productTimed.value.status === "OK"],
    ["Market Report", reportTimed.ms, reportTimed.value.status === "OK"],
    ["Pipeline", pipelineTimed.ms, pipelineTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check("PERFORMANCE", `${name} completes in under 2000ms`, ok && ms < 2000, "MEDIUM");
  }

  const dir = join(process.cwd(), "src/lib/market-discovery");
  const names = readdirSync(dir);
  const expected: Record<string, string[]> = {
    search: ["google-search-client.ts", "google-search-connector.ts", "google-search-context.ts", "google-search-snapshot.ts", "google-search-types.ts", "google-search-validator.ts"],
    serp: ["google-serp-parser.ts", "serp-context.ts", "serp-parser.ts", "serp-snapshot.ts", "serp-types.ts", "serp-validator.ts"],
    sponsored: ["sponsored-context.ts", "sponsored-detector.ts", "sponsored-results-detector.ts", "sponsored-snapshot.ts", "sponsored-types.ts", "sponsored-validator.ts"],
    landing: ["landing-page-client.ts", "landing-page-collector.ts", "landing-page-context.ts", "landing-page-snapshot.ts", "landing-page-types.ts", "landing-page-validator.ts"],
    product: ["product-context.ts", "product-identifier-engine.ts", "product-identifier.ts", "product-parser.ts", "product-snapshot.ts", "product-types.ts", "product-validator.ts"],
    report: ["market-intelligence-report.ts", "market-report-builder.ts", "market-report-context.ts", "market-report-snapshot.ts", "market-report-statistics.ts", "market-report-types.ts", "market-report-validator.ts"],
    pipeline: ["market-discovery-context.ts", "market-discovery-pipeline.ts", "market-discovery-runner.ts", "market-discovery-snapshot.ts", "market-discovery-validator.ts"],
  };
  check("REGRESSION", "Backward compatibility: each Market Discovery module set is still present", Object.values(expected).every((files) => files.every((file) => names.includes(file))));
  const rc1Files = Object.values(expected).flat();
  const libLines = rc1Files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
  const allLines = walk(dir).filter((file) => file.endsWith(".ts")).flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/));
  const hardcodedProducts = allLines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line));
  if (hardcodedProducts) productHardcoding += 1;
  check("GENERICITY", "No Product Hardcoding: library source has no real product names", !hardcodedProducts);
  check("GENERICITY", "No Vendor Hardcoding: library source has no fixed vendor identity", !libLines.some((line) => /Vendor North|Vendor South|North Brand/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Keyword Hardcoding: library source has no fixed keyword", !libLines.some((line) => /zebra offer|weight loss|make money/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Marketplace Hardcoding: the replayed hosts do not name a marketplace", !libLines.some((line) => /clickbank|digistore|warriorplus|jvzoo/i.test(line)), "MEDIUM");
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "platform", "providers/google-ads", "product-intelligence"];
  check(
    "REGRESSION",
    "Backward compatibility: upstream modules do not import Market Discovery",
    !folders.some((folder) => walk(join(process.cwd(), "src/lib", folder)).filter((file) => file.endsWith(".ts")).some((file) => /market-discovery/.test(readFileSync(file, "utf8")))),
  );

  const dbDir = join(process.cwd(), "data");
  for (const name of readdirSync(dbDir).filter((item) => item.startsWith("presell-os.db"))) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  console.log("");
  for (const gate of GATES) console.log(`${gate}=${failed.has(gate) ? "FAIL" : "PASS"}`);
  const ready = failed.size === 0 && productHardcoding === 0;
  console.log(`PRODUCT_HARDCODING=${productHardcoding === 0 ? "NONE" : "FOUND"}`);
  console.log(`CRITICAL_BUGS=${bugs.CRITICAL}`);
  console.log(`HIGH_BUGS=${bugs.HIGH}`);
  console.log(`MEDIUM_BUGS=${bugs.MEDIUM}`);
  console.log(`LOW_BUGS=${bugs.LOW}`);
  console.log(`READY_FOR_PHASE10=${ready ? "YES" : "NO"}`);
  if (!ready) {
    console.error(`\n${[...failed.values()].reduce((sum, list) => sum + list.length, 0)} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT=MARKET_DISCOVERY_RC1_REPLAY");
  console.log(`
Architecture Summary
Market Discovery is a chain of offline hosts. The search connector copies a supplied search page into one frozen snapshot and builds the search address from the supplied keyword, locale, and device. The SERP parser copies marked result blocks into records and leaves loose links out. The sponsored detector keeps records whose sponsored marker is already text. The landing page collector copies supplied destination responses, keeps the last address of a supplied redirect chain, and refuses a chain that repeats an address. The product identifier restates marked product fields and page evidence into a frozen observed product. The market report consolidates those artifacts into summaries, coverage, warnings, an evidence graph, and statistics. The pipeline calls those six hosts once each and stops when one refuses. Each host keeps its own snapshot map.

Regression Summary
This audit replayed search collection, SERP parsing, sponsored detection, landing page collection, observed products, the market report, the evidence graph, and the end-to-end pipeline. Snapshots and the pipeline context stayed frozen. A second host did not see the first host's snapshot. Inputs were unchanged after each call. Upstream Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Platform Kernel, Google Ads, and Product Intelligence modules do not import Market Discovery. The module file sets listed above are still present.

Known Limitations
The hosts do not fetch pages, call a model, or write a database. A sponsored marker is a copied attribute, not a judgment. A price symbol is not a currency. Structured data is stored as text and is not used as the product name. An empty sponsored list is a valid detector result. A redirect chain that repeats an address is refused and stores nothing. The pipeline maps a refused host to a missing-artifact issue and does not continue. Affiliate resolution and marketplace lookup are outside this walk. Snapshots live only inside the host that created them.

Operational Notes
Rejected inputs return REJECTED, a list of issues, and no snapshot. Clocks and id factories are injectable, and one call does not throw. Public pages still need publication approval. This audit does not publish, deploy, buy ads, or commit.
`);
  console.log("PUBLISH=NO");
  console.log("DEPLOY=NO");
  console.log("ADS=NO");
  console.log("COMMIT=NO");
}

main();
