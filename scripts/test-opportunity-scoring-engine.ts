import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  OPPORTUNITY_SCORE_CONTEXT_MEMBERS,
  OPPORTUNITY_SCORE_ENVELOPE_MEMBERS,
} from "../src/lib/opportunity-scoring/opportunity-score-context.ts";
import {
  OPPORTUNITY_EXECUTION_STATISTICS_KEYS,
  OPPORTUNITY_SCORE_RESULT_KEYS,
  OPPORTUNITY_SCORE_SNAPSHOT_KEYS,
} from "../src/lib/opportunity-scoring/opportunity-score-snapshot.ts";
import {
  OPPORTUNITY_COVERAGE_FIELDS,
  OPPORTUNITY_METRIC_KEYS,
  OPPORTUNITY_SCORE_ORIGINS,
  OPPORTUNITY_SCORE_PROVENANCE,
  OPPORTUNITY_SCORE_STATUSES,
} from "../src/lib/opportunity-scoring/opportunity-score-types.ts";
import { createOpportunityScoringEngine } from "../src/lib/opportunity-scoring/opportunity-scoring-engine.ts";
import { createRealMarketReport } from "../src/lib/real-market-report/real-market-report.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

function statistics() {
  return {
    searchCount: 1,
    serpCount: 2,
    sponsoredCount: 3,
    landingPageCount: 2,
    observedProductCount: 2,
    brandCount: 1,
    domainCount: 2,
    categoryCount: 1,
    priceCount: 2,
    languageCount: 1,
    warningCount: 0,
    missingCount: 0,
    executionTime: 0,
  };
}

function graph() {
  return {
    nodes: [
      { id: "search", kind: "SearchSnapshot", label: "search-1", present: "PRESENT" },
      { id: "serp", kind: "SERPRecords", label: "2", present: "PRESENT" },
      { id: "sponsored", kind: "SponsoredResults", label: "3", present: "PRESENT" },
      { id: "landing-pages", kind: "LandingPageSnapshots", label: "2", present: "PRESENT" },
      { id: "observed-products", kind: "ObservedProducts", label: "2", present: "PRESENT" },
    ],
    edges: [
      { from: "search", to: "serp" },
      { from: "serp", to: "sponsored" },
      { from: "sponsored", to: "landing-pages" },
      { from: "landing-pages", to: "observed-products" },
    ],
  };
}

function coverage(absent: string[] = []) {
  return Object.fromEntries(OPPORTUNITY_COVERAGE_FIELDS.map((field) => [field, absent.includes(field) ? "ABSENT" : "PRESENT"]));
}

function reportOf(over: Record<string, unknown> = {}) {
  return {
    searchSummary: { snapshotId: "search-1", query: "zebra offer", language: "en", country: "US", device: "desktop", market: "us", searchUrl: "https://example.test/search", htmlLength: 4, collectedAt: T0 },
    serpSummary: { count: 2, titles: ["Notes", "Desk"], urls: ["https://example.test/notes", "https://example.test/buy"], descriptions: ["A", "B"], positions: [1, 2] },
    sponsoredSummary: { count: 3, titles: ["A", "B", "C"], urls: ["https://example.test/buy", "https://example.test/buy", "https://vendor.example.test/ad"], descriptions: ["A", "B", "C"], positions: [1, 2, 3] },
    landingPageSummary: { count: 2, landingPageIds: ["page-1", "page-2"], originalUrls: ["https://example.test/buy", "https://example.test/desk"], finalUrls: ["https://example.test/buy", "https://example.test/desk"], htmlLength: 20 },
    observedProductSummary: {
      count: 2,
      productNames: ["Zebra Offer", "Zebra Desk"],
      brands: ["North Brand", "North Brand"],
      vendors: ["Vendor North", "Vendor North"],
      prices: ["47.00", "12.00"],
      currencies: ["USD", "USD"],
      languages: ["en", "en"],
      categories: ["Outdoor", null],
      domains: ["example.test", "example.test"],
      landingPageIds: ["page-1", "page-2"],
      offerUrls: ["https://example.test/buy", "https://example.test/desk"],
    },
    observedBrands: ["North Brand"],
    observedDomains: ["example.test", "vendor.example.test"],
    observedCategories: ["Outdoor"],
    observedPrices: ["47.00 USD", "12.00 USD"],
    observedLanguages: ["en"],
    evidenceCoverage: coverage(),
    missingEvidence: [],
    warnings: [],
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    ...over,
  };
}

function bundle(over: Record<string, unknown> = {}) {
  return { report: reportOf(), graph: graph(), statistics: statistics(), executionMetadata: { note: "kept" }, ...over };
}

function engine(idFactory?: () => string) {
  let tick = 0;
  return createOpportunityScoringEngine({ now: () => tick++, timestamp: () => T0, idFactory });
}

function variance(amounts: readonly number[]): number | null {
  if (amounts.length === 0) return null;
  let sum = 0;
  for (const value of amounts) sum += value;
  const mean = sum / amounts.length;
  let squared = 0;
  for (const value of amounts) squared += (value - mean) ** 2;
  return Number((squared / amounts.length).toFixed(6));
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

function main() {
  check("statuses are OK and REJECTED", OPPORTUNITY_SCORE_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", OPPORTUNITY_SCORE_ORIGINS.join() === "OBSERVED" && OPPORTUNITY_SCORE_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the report, the graph, and the statistics", OPPORTUNITY_SCORE_CONTEXT_MEMBERS.join() === "report,graph,statistics,executionMetadata,runtimeMetadata,configuration");
  check("a market report envelope can be passed through", OPPORTUNITY_SCORE_ENVELOPE_MEMBERS.join() === "metadata,reportId,context,createdAt,origin,provenance,status,issues,snapshot,executionTime");

  const input = bundle();
  const scoring = engine();
  const measured = scoring.evaluate(input);
  input.report.searchSummary.query = "changed query";
  input.executionMetadata.note = "changed";
  const metrics = measured.metrics;
  const evidence = measured.evidence;
  check(
    "one report becomes ten independent metrics and their evidence",
    measured.status === "OK" &&
      metrics !== null &&
      evidence !== null &&
      Object.keys(metrics).join() === OPPORTUNITY_METRIC_KEYS.join() &&
      metrics.sponsoredAdvertiserCount === 2 &&
      evidence.sponsoredAdvertiserCount.hosts.join() === "example.test,vendor.example.test" &&
      metrics.uniqueDomainCount === 2 &&
      metrics.uniqueLandingPageCount === 2 &&
      metrics.observedProductCount === 2 &&
      metrics.observedBrandCount === 1 &&
      metrics.observedCategoryCount === 1 &&
      metrics.priceVariance === 306.25 &&
      metrics.priceVariance === variance(evidence.priceVariance.amounts) &&
      metrics.languageConsistency === 1 &&
      evidence.languageConsistency.modalLanguage === "en" &&
      metrics.serpCoverage === 1 &&
      metrics.evidenceCompleteness === 1 &&
      evidence.evidenceCompleteness.presentFields.length === 10 &&
      measured.statistics.metricCount === 10 &&
      measured.statistics.nullMetricCount === 0 &&
      !("total" in metrics) &&
      !("overall" in metrics),
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    measured.snapshot !== null &&
      scoring.getSnapshot("opportunity-score-1") === measured.snapshot &&
      Object.isFrozen(measured.snapshot) &&
      Object.isFrozen(measured.metrics) &&
      Object.isFrozen(measured.evidence) &&
      measured.snapshot?.context.query === "zebra offer" &&
      measured.snapshot?.context.searchSnapshotId === "search-1" &&
      measured.snapshot?.metadata.note === "kept" &&
      Object.keys(measured).join() === OPPORTUNITY_SCORE_RESULT_KEYS.join() &&
      Object.keys(measured.statistics).join() === OPPORTUNITY_EXECUTION_STATISTICS_KEYS.join() &&
      Object.keys(measured.snapshot ?? {}).join() === OPPORTUNITY_SCORE_SNAPSHOT_KEYS.join(),
  );

  const again = engine().evaluate(bundle());
  check("a second evaluation reproduces the same metrics", again.status === "OK" && JSON.stringify(again.metrics) === JSON.stringify(metrics) && JSON.stringify(again.evidence) === JSON.stringify(evidence) && again.snapshot !== measured.snapshot);

  const otherBrands = bundle();
  otherBrands.report.observedBrands = ["North Brand", "Plain Brand"];
  const branded = engine().evaluate(otherBrands);
  check("a brand measurement does not change the price measurement", branded.metrics?.observedBrandCount === 2 && branded.metrics.priceVariance === metrics?.priceVariance && branded.metrics.sponsoredAdvertiserCount === metrics?.sponsoredAdvertiserCount);

  const split = bundle();
  split.report.observedProductSummary.languages = ["en", "es"];
  const languages = engine().evaluate(split);
  check("language consistency is the share of the first most frequent language", languages.metrics?.languageConsistency === 0.5 && languages.evidence?.languageConsistency.modalLanguage === "en" && languages.metrics.priceVariance === 306.25);

  const unmarked = bundle({ report: reportOf({ observedPrices: ["$12"], evidenceCoverage: coverage(["prices"]) }) });
  const prices = engine().evaluate(unmarked);
  check("a currency mark is not read as an amount", prices.status === "OK" && prices.metrics?.priceVariance === null && prices.evidence?.priceVariance.amounts.length === 0 && prices.metrics.evidenceCompleteness === 0.9 && prices.statistics.nullMetricCount === 1);

  const emptySerp = bundle({ report: reportOf({ serpSummary: { count: 0, titles: [], urls: [], descriptions: [], positions: [] }, evidenceCoverage: coverage(["serp"]) }) });
  const serp = engine().evaluate(emptySerp);
  check("serp coverage is empty when no rows were supplied", serp.metrics?.serpCoverage === null && serp.evidence?.serpCoverage.rowCount === 0 && serp.metrics.observedProductCount === 2);

  const market = createRealMarketReport({ now: () => 0, timestamp: () => T0 });
  const reported = market.build({
    searchSnapshot: { snapshotId: "search-1", query: "zebra offer", language: "en", country: "US", device: "desktop", market: "us", searchUrl: "https://www.google.com/search?q=zebra+offer", html: "<div>opaque-search-marker</div>", collectedAt: T0, origin: "COLLECTED", provenance: "DIRECT_SOURCE", metadata: {} },
    serpRecords: [
      { title: "Notes", url: "https://example.test/notes", description: "A listed page.", position: 1, resultType: "organic", sponsoredMarker: null, organicMarker: "organic", resultMetadata: "opaque-serp-marker", origin: "OBSERVED", provenance: "DIRECT_SOURCE" },
      { title: "Desk", url: "https://example.test/buy", description: "A listed page.", position: 2, resultType: "sponsored", sponsoredMarker: "top", organicMarker: null, resultMetadata: null, origin: "OBSERVED", provenance: "DIRECT_SOURCE" },
    ],
    sponsoredResults: [{ title: "Desk", url: "https://example.test/buy", description: "A listed page.", position: 1, sponsoredMarker: "top", resultMetadata: null, origin: "OBSERVED", provenance: "DIRECT_SOURCE" }],
    landingPageSnapshots: [{ landingPageId: "page-1", destinationUrl: "https://example.test/buy", finalUrl: "https://example.test/buy", html: "<html>opaque-page-marker</html>", origin: "COLLECTED", provenance: "DIRECT_SOURCE" }],
    observedProducts: [{ landingPageId: "page-1", productName: "Zebra Offer", brand: "North Brand", vendor: "Vendor North", visiblePrice: "47.00", currency: "USD", language: "en", category: "Outdoor", primaryDomain: "example.test", offerUrl: "https://example.test/buy" }],
  });
  const fromReport = engine().evaluate(reported);
  check(
    "a real market report result is measured without copying page text",
    reported.status === "OK" &&
      fromReport.status === "OK" &&
      fromReport.metrics?.sponsoredAdvertiserCount === 1 &&
      fromReport.metrics.observedProductCount === 1 &&
      fromReport.metrics.observedBrandCount === 1 &&
      fromReport.metrics.priceVariance === 0 &&
      fromReport.metrics.evidenceCompleteness === 1 &&
      !JSON.stringify(fromReport.metrics).includes("opaque-search-marker") &&
      !JSON.stringify(fromReport.evidence).includes("opaque-page-marker"),
  );

  const missingReport = engine().evaluate(bundle({ report: null }));
  check("a missing market report stores nothing", missingReport.status === "REJECTED" && has(missingReport.issues, /Missing Market Report/) && missingReport.snapshot === null && missingReport.metrics === null);

  const missingGraph = engine().evaluate(bundle({ graph: { nodes: [], edges: [] } }));
  check("a corrupted evidence graph stores nothing", missingGraph.status === "REJECTED" && has(missingGraph.issues, /Corrupted Evidence Graph/) && missingGraph.snapshot === null);

  const brokenEdge = graph();
  brokenEdge.edges.push({ from: "search", to: "missing-node" });
  const edge = engine().evaluate(bundle({ graph: brokenEdge }));
  check("an edge to a missing node stores nothing", edge.status === "REJECTED" && has(edge.issues, /Corrupted Evidence Graph/) && edge.snapshot === null);

  const missingStatistics = engine().evaluate(bundle({ statistics: null }));
  check("missing statistics store nothing", missingStatistics.status === "REJECTED" && has(missingStatistics.issues, /Missing Statistics/) && missingStatistics.snapshot === null);

  const nested = engine().evaluate(bundle({ configuration: { nested: { inner: true } } }));
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badId = engine(() => "BAD").evaluate(bundle());
  check("a corrupted evaluation id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && engine().getSnapshot("opportunity-score-1") === null);

  const dir = join(process.cwd(), "src/lib/opportunity-scoring");
  const names = [
    "opportunity-scoring-engine.ts",
    "opportunity-score-builder.ts",
    "opportunity-score-validator.ts",
    "opportunity-score-types.ts",
    "opportunity-score-context.ts",
    "opportunity-score-snapshot.ts",
  ];
  check("six opportunity scoring modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the engine does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|anthropic|openai|clickbank|product-intelligence|google-ads/i.test(line)));
  check("no ordering, hidden weights, or outside catalogs in code", !code.some((line) => /\brank\b|\.sort\(|Math\.random|campaign|recommend|\bdecision\b|\bweight\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "opportunity-score-context.ts"), "utf8")));
  check("the scoring modules do not import another host", !/from\s+["']\.\.\/(?!opportunity-score|opportunity-scoring)/.test(bundled));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the scoring engine`, !sources.some((file) => /opportunity-scoring/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`OPPORTUNITY_SCORING_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("OPPORTUNITY_SCORING_FAILURES=0");
}

main();
