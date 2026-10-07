import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleSearchConnector } from "../src/lib/market-discovery/google-search-connector.ts";
import { createGoogleSerpParser } from "../src/lib/market-discovery/google-serp-parser.ts";
import { createLandingPageCollector } from "../src/lib/market-discovery/landing-page-collector.ts";
import { MARKET_DISCOVERY_CONTEXT_MEMBERS } from "../src/lib/market-discovery/market-discovery-context.ts";
import { createMarketDiscoveryPipeline } from "../src/lib/market-discovery/market-discovery-pipeline.ts";
import type { MarketDiscoveryHosts } from "../src/lib/market-discovery/market-discovery-runner.ts";
import {
  MARKET_DISCOVERY_ANALYSIS_KEYS,
  MARKET_DISCOVERY_EXECUTION_KEYS,
  MARKET_DISCOVERY_ORIGINS,
  MARKET_DISCOVERY_PROVENANCE,
  MARKET_DISCOVERY_SNAPSHOT_KEYS,
  MARKET_DISCOVERY_STAGES,
  MARKET_DISCOVERY_STATISTICS_KEYS,
  MARKET_DISCOVERY_STATUSES,
  freezeDeepMarketDiscovery,
} from "../src/lib/market-discovery/market-discovery-snapshot.ts";
import { createMarketIntelligenceReport } from "../src/lib/market-discovery/market-intelligence-report.ts";
import { createProductIdentifier } from "../src/lib/market-discovery/product-identifier.ts";
import { createSponsoredResultsDetector } from "../src/lib/market-discovery/sponsored-results-detector.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

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

function pageOf() {
  return {
    destinationUrl: "https://example.test/buy",
    finalUrl: "https://example.test/buy",
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html: productHtml,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    keyword: "zebra offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchHtml,
    pages: [pageOf()],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function pipelineOf(idFactory?: () => string) {
  let n = 0;
  return createMarketDiscoveryPipeline({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: idFactory ?? (() => `discovery-${++n}`),
  });
}

function countingHosts(reject?: "serp" | "sponsored") {
  const clocks = { now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z" };
  const calls = { search: 0, serp: 0, sponsored: 0, landing: 0, products: 0, report: 0 };
  const search = createGoogleSearchConnector({ ...clocks, idFactory: () => "snapshot-1" });
  const serp = createGoogleSerpParser({ ...clocks, idFactory: () => "serp-1" });
  const sponsored = createSponsoredResultsDetector({ ...clocks, idFactory: () => "sponsored-1" });
  const landingPages = createLandingPageCollector({ ...clocks, idFactory: () => "collection-1" });
  const products = createProductIdentifier({ ...clocks, idFactory: () => "identification-1" });
  const report = createMarketIntelligenceReport({ ...clocks, idFactory: () => "market-report-1" });
  const hosts: MarketDiscoveryHosts = {
    search: { ...search, collect(input) { calls.search += 1; return search.collect(input); } },
    serp: { ...serp, parse(input) { calls.serp += 1; return reject === "serp" ? serp.parse(null) : serp.parse(input); } },
    sponsored: { ...sponsored, detect(input) { calls.sponsored += 1; return reject === "sponsored" ? sponsored.detect(null) : sponsored.detect(input); } },
    landingPages: { ...landingPages, collect(input) { calls.landing += 1; return landingPages.collect(input); } },
    products: { ...products, identify(input) { calls.products += 1; return products.identify(input); } },
    report: { ...report, build(input) { calls.report += 1; return report.build(input); } },
  };
  const pipeline = createMarketDiscoveryPipeline({ ...clocks, idFactory: () => "discovery-1", hosts });
  return { pipeline, calls };
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

const validator = pipelineOf().validator;
check("statuses are OK and REJECTED", MARKET_DISCOVERY_STATUSES.join() === "OK,REJECTED");
check("origin is OBSERVED and provenance is DIRECT_SOURCE", MARKET_DISCOVERY_ORIGINS.join() === "OBSERVED" && MARKET_DISCOVERY_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name the keyword, supplied pages, and metadata", MARKET_DISCOVERY_CONTEXT_MEMBERS.join() === "keyword,language,country,device,market,searchHtml,pages,executionMetadata,runtimeMetadata,configuration");
check("stages follow the market discovery hosts", MARKET_DISCOVERY_STAGES.join() === "GoogleSearchConnector,GoogleSerpParser,SponsoredResultsDetector,LandingPageCollector,ProductIdentifier,MarketIntelligenceReport");
check("analysis keys keep the keyword and the host snapshot ids", MARKET_DISCOVERY_ANALYSIS_KEYS.join() === "keyword,searchSnapshotId,serpId,sponsoredId,collectionId,identificationId,reportId,origin,provenance");
check("execution keys are the stage and the count", MARKET_DISCOVERY_EXECUTION_KEYS.join() === "stage,count");
check("statistics keys count stages, completions, and issues", MARKET_DISCOVERY_STATISTICS_KEYS.join() === "stageCount,completedCount,issueCount,executionTime");
check("snapshot keys keep the analysis, report, graph, and context", MARKET_DISCOVERY_SNAPSHOT_KEYS.join() === "analysisId,analysis,report,graph,statistics,executions,context,createdAt,origin,provenance,metadata");
check("Missing Keyword: a missing envelope is rejected", has(validator.validateInput(null), /Missing Keyword/));
check("Invalid Pipeline Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Pipeline Metadata/));
check("Invalid Pipeline Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Pipeline Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const counted = countingHosts();
const built = counted.pipeline.run(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const report = built.report;
check("the pipeline consolidates one keyword", built.status === "OK" && built.analysis !== null && report !== null && built.graph !== null && built.snapshot !== null);
check("every host executes once", built.executions.length === MARKET_DISCOVERY_STAGES.length && built.executions.every((entry) => entry.count === 1) && Object.values(counted.calls).every((count) => count === 1) && built.executions.map((entry) => entry.stage).join() === MARKET_DISCOVERY_STAGES.join());
check("no host executes twice", built.executions.every((entry) => entry.count === 1) && Object.values(counted.calls).every((count) => count === 1));
check("the analysis names the keyword and each host snapshot", built.analysis?.keyword === "zebra offer" && built.analysis.searchSnapshotId === "snapshot-1" && built.analysis.serpId === "serp-1" && built.analysis.sponsoredId === "sponsored-1" && built.analysis.collectionId === "collection-1" && built.analysis.identificationId === "identification-1" && built.analysis.reportId === "market-report-1" && built.snapshot?.analysisId === "discovery-1");
check("the report restates the keyword, the sponsored address, and the observed product", report?.searchSummary.query === "zebra offer" && report.marketCoverage.keywords.join("|") === "zebra offer" && report.serpSummary.titles.join("|") === "Listed block|Other block" && report.sponsoredSummary.count === 1 && report.sponsoredSummary.urls.join("|") === "https://example.test/buy" && report.observedProductSummary.productNames.join("|") === "Zebra Offer");
check("an organic block is not copied as a sponsored result", report?.sponsoredSummary.urls.includes("https://example.test/other") === false && report.sponsoredSummary.titles.join("|") === "Listed block");
check("search page text is not copied into the report", report !== null && !JSON.stringify(report).includes("opaque-search-marker"));
check("the evidence graph has five nodes", built.graph?.nodes.length === 5 && built.graph.edges.length === 4 && built.graph.nodes.every((node) => node.present === "PRESENT"));
check("statistics count six completed hosts", built.statistics.stageCount === 6 && built.statistics.completedCount === 6 && built.statistics.issueCount === 0 && built.metadata.run === "r1" && built.snapshot?.origin === "OBSERVED" && built.snapshot.provenance === "DIRECT_SOURCE" && built.snapshot.createdAt === "2026-01-01T00:00:00.000Z");
check("the analysis, executions, and context have exactly the requested fields", built.analysis !== null && Object.keys(built.analysis).join() === MARKET_DISCOVERY_ANALYSIS_KEYS.join() && built.executions.every((entry) => Object.keys(entry).join() === MARKET_DISCOVERY_EXECUTION_KEYS.join()) && Object.keys(built.statistics).join() === MARKET_DISCOVERY_STATISTICS_KEYS.join());
check("getSnapshot returns the stored analysis", counted.pipeline.getSnapshot("discovery-1") === built.snapshot && counted.pipeline.getSnapshot("missing") === null);

(source as { keyword: string }).keyword = "changed";
(source as { searchHtml: string }).searchHtml = "changed";
(source.pages[0] as { html: string }).html = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.analysisId as string) = "hacked";
  if (built.analysis) (built.analysis as { keyword: string }).keyword = "hacked";
  if (report) (report.observedProductSummary.productNames as string[])[0] = "hacked";
  if (built.snapshot) (built.snapshot.context.pages[0] as { html: string }).html = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the analysis unchanged", before !== JSON.stringify(source) && built.analysis?.keyword === "zebra offer" && built.snapshot?.context.searchHtml === searchHtml && built.snapshot.context.pages[0]?.html === productHtml && report?.observedProductSummary.productNames[0] === "Zebra Offer" && built.metadata.run === "r1");
check("Immutable snapshot: the analysis, report, graph, and context cannot be assigned into", built.snapshot?.analysisId === "discovery-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(built.analysis) && Object.isFrozen(report) && Object.isFrozen(built.graph) && Object.isFrozen(built.snapshot?.context) && Object.isFrozen(built.executions));
check("freeze helper returns the same value", freezeDeepMarketDiscovery(built.snapshot) === built.snapshot);

const again = pipelineOf();
const first = again.run(inputOf());
const second = again.run(inputOf());
check("a second run keeps its own snapshot and still runs each host once", first.snapshot?.analysisId === "discovery-1" && second.snapshot?.analysisId === "discovery-2" && first.analysis?.keyword === "zebra offer" && second.executions.every((entry) => entry.count === 1) && again.getSnapshot("discovery-1") === first.snapshot);

const left = pipelineOf();
const right = pipelineOf();
left.run(inputOf());
right.run(null);
check("Independent pipeline: pipelines do not share snapshots", left.getSnapshot("discovery-1")?.analysis.keyword === "zebra offer" && right.getSnapshot("discovery-1") === null);
check("deterministic pipeline: a second pipeline matches the product name", pipelineOf().run(inputOf()).report?.observedProductSummary.productNames.join("|") === "Zebra Offer");

const skipped = countingHosts();
const missingKeyword = skipped.pipeline.run(null);
check("a missing keyword stores nothing and runs no host", missingKeyword.status === "REJECTED" && has(missingKeyword.issues, /Missing Keyword/) && missingKeyword.snapshot === null && missingKeyword.analysis === null && missingKeyword.report === null && missingKeyword.executions.every((entry) => entry.count === 0) && Object.values(skipped.calls).every((count) => count === 0));
const blank = pipelineOf().run(inputOf({ keyword: "  " }));
check("a blank keyword stores nothing", blank.status === "REJECTED" && has(blank.issues, /Missing Keyword/) && blank.snapshot === null && blank.statistics.stageCount === 0);
const badPage = pipelineOf().run(inputOf({ searchHtml: 1 }));
check("missing search text stores nothing after the search host", badPage.status === "REJECTED" && has(badPage.issues, /Missing Search Snapshot/) && badPage.snapshot === null && badPage.executions[0]?.count === 1 && badPage.executions.slice(1).every((entry) => entry.count === 0));
const noSerpCalls = countingHosts("serp");
const noSerpRun = noSerpCalls.pipeline.run(inputOf());
check("missing SERP records stop the walk", noSerpRun.status === "REJECTED" && has(noSerpRun.issues, /Missing SERP Records/) && noSerpRun.snapshot === null && noSerpCalls.calls.search === 1 && noSerpCalls.calls.serp === 1 && noSerpCalls.calls.sponsored === 0 && noSerpCalls.calls.report === 0);
const noSponsored = countingHosts("sponsored");
const noSponsoredRun = noSponsored.pipeline.run(inputOf());
check("missing sponsored results stop the walk", noSponsoredRun.status === "REJECTED" && has(noSponsoredRun.issues, /Missing Sponsored Results/) && noSponsoredRun.snapshot === null && noSponsored.calls.sponsored === 1 && noSponsored.calls.landing === 0);
const noPages = pipelineOf().run(inputOf({ pages: undefined }));
check("missing landing pages stop the walk", noPages.status === "REJECTED" && has(noPages.issues, /Missing Landing Pages/) && noPages.snapshot === null && noPages.executions[3]?.stage === "LandingPageCollector" && noPages.executions[3]?.count === 1 && noPages.executions[4]?.count === 0 && noPages.executions[5]?.count === 0);
const noProducts = pipelineOf().run(inputOf({ searchHtml: "<div>opaque-search-marker</div>", pages: [] }));
check("missing observed products stop the walk", noProducts.status === "REJECTED" && has(noProducts.issues, /Missing Observed Products/) && noProducts.snapshot === null && noProducts.executions[4]?.count === 1 && noProducts.executions[5]?.count === 0);
const nested = pipelineOf().run(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Pipeline Metadata/) && nested.snapshot === null && nested.executions.every((entry) => entry.count === 0));
const corrupted = pipelineOf(() => "BAD").run(inputOf());
check("a corrupted analysis id stores nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Invalid Pipeline Metadata/) && corrupted.snapshot === null && corrupted.analysis === null && corrupted.executions.every((entry) => entry.count === 1));

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["market-discovery-pipeline.ts", "market-discovery-runner.ts", "market-discovery-validator.ts", "market-discovery-context.ts", "market-discovery-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("five pipeline modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|gravity|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "market-discovery-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the pipeline or the market discovery hosts", imports.every((from) => /^\.\/(market-discovery-pipeline|market-discovery-runner|market-discovery-validator|market-discovery-context|market-discovery-snapshot|google-search-connector|google-serp-parser|sponsored-results-detector|landing-page-collector|landing-page-context|product-identifier|market-intelligence-report|market-report-types)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored|landing-page|product|clickbank|market-report|market-intelligence)-[a-z0-9-]+\.ts$/.test(file));
check("earlier market discovery modules do not import the pipeline", earlier.every((file) => !/from ["']\.\/market-discovery-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the market discovery pipeline`, !sources.some((file) => /market-discovery-pipeline|market-discovery-runner/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`MARKET_DISCOVERY_PIPELINE_FAILURES=${failures}`);
  process.exit(1);
}
console.log("MARKET_DISCOVERY_PIPELINE_FAILURES=0");
