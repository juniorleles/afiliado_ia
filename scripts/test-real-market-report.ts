import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REAL_MARKET_REPORT_CONTEXT_MEMBERS } from "../src/lib/real-market-report/market-report-context.ts";
import {
  REAL_MARKET_COVERAGE_KEYS,
  REAL_MARKET_GRAPH_KEYS,
  REAL_MARKET_LANDING_SUMMARY_KEYS,
  REAL_MARKET_LIST_SUMMARY_KEYS,
  REAL_MARKET_PRODUCT_SUMMARY_KEYS,
  REAL_MARKET_REPORT_ORIGINS,
  REAL_MARKET_REPORT_PRESENCE,
  REAL_MARKET_REPORT_PROVENANCE,
  REAL_MARKET_REPORT_RECORD_KEYS,
  REAL_MARKET_RESULT_KEYS,
  REAL_MARKET_SEARCH_SUMMARY_KEYS,
  REAL_MARKET_SNAPSHOT_KEYS,
  REAL_MARKET_STATISTICS_KEYS,
  REAL_MARKET_REPORT_STATUSES,
} from "../src/lib/real-market-report/market-report-snapshot.ts";
import { createRealMarketReport } from "../src/lib/real-market-report/real-market-report.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

function searchOf() {
  return {
    snapshotId: "search-1",
    query: "zebra offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "us",
    searchUrl: "https://www.google.com/search?q=zebra+offer",
    html: "<div>opaque-search-marker</div>",
    collectedAt: T0,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: {},
  };
}

function serp(url: string, title: string, position: number, sponsored: boolean) {
  return {
    title,
    url,
    description: "A listed page.",
    position,
    resultType: sponsored ? "sponsored" : "organic",
    sponsoredMarker: sponsored ? "top" : null,
    organicMarker: sponsored ? null : "organic",
    resultMetadata: "opaque-serp-marker",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function sponsored(url: string, position: number) {
  return {
    title: "Listed block",
    url,
    description: "A listed page.",
    position,
    sponsoredMarker: "top",
    resultMetadata: null,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function page(id: string, url: string, address: "originalUrl" | "destinationUrl" = "originalUrl") {
  return {
    landingPageId: id,
    [address]: url,
    finalUrl: url,
    html: `<html>opaque-page-marker ${id}</html>`,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
  };
}

function product(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    identity: {
      landingPageId: id,
      productName: name,
      brand: "North Brand",
      vendor: "Vendor North",
      price: "47.00",
      currency: "USD",
      language: "en",
      category: id === "page-1" ? "Outdoor" : null,
      primaryDomain: "example.test",
      offerUrl: "https://example.test/buy",
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
      ...over,
    },
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    searchSnapshot: searchOf(),
    serpRecords: [
      serp("https://example.test/notes", "Other block", 1, false),
      serp("https://example.test/buy", "Zebra Offer desk", 2, true),
    ],
    sponsoredResults: [
      sponsored("https://example.test/buy", 1),
      sponsored("https://example.test/buy", 2),
      sponsored("https://vendor.example.test/ad", 3),
    ],
    landingPageSnapshots: [page("page-1", "https://example.test/buy"), page("page-2", "https://example.test/desk")],
    observedProducts: [product("page-1", "Zebra Offer"), product("page-2", "Zebra Desk")],
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function reportFor(idFactory?: () => string) {
  let tick = 0;
  return createRealMarketReport({ now: () => tick++, timestamp: () => T0, idFactory });
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
  check("statuses are OK and REJECTED", REAL_MARKET_REPORT_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", REAL_MARKET_REPORT_ORIGINS.join() === "OBSERVED" && REAL_MARKET_REPORT_PROVENANCE.join() === "DIRECT_SOURCE");
  check("coverage is PRESENT or ABSENT", REAL_MARKET_REPORT_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members name the collected artifacts", REAL_MARKET_REPORT_CONTEXT_MEMBERS.join() === "searchSnapshot,serpRecords,sponsoredResults,landingPageSnapshots,observedProducts,executionMetadata,runtimeMetadata,configuration");

  const input = inputOf();
  const report = reportFor();
  const built = report.build(input);
  const text = JSON.stringify({ report: built.report, graph: built.graph });
  input.searchSnapshot.query = "changed query";
  input.observedProducts[0].identity.productName = "changed name";
  input.executionMetadata.note = "changed";
  const sponsoredUrls = built.report?.sponsoredSummary.urls ?? [];
  check(
    "one bundle becomes a report, an evidence graph, and market statistics",
    built.status === "OK" &&
      built.report !== null &&
      built.report.searchSummary.query === "zebra offer" &&
      built.report.searchSummary.htmlLength === searchOf().html.length &&
      built.report.serpSummary.count === 2 &&
      built.report.sponsoredSummary.count === 3 &&
      built.report.landingPageSummary.count === 2 &&
      built.report.observedProductSummary.productNames.join() === "Zebra Offer,Zebra Desk" &&
      built.report.observedBrands.join() === "North Brand" &&
      built.report.observedCategories.join() === "Outdoor" &&
      built.report.observedPrices.join() === "47.00 USD" &&
      built.report.observedLanguages.join() === "en" &&
      built.report.observedDomains.join() === "example.test,vendor.example.test" &&
      built.report.evidenceCoverage.search === "PRESENT" &&
      built.statistics.searchCount === 1 &&
      built.statistics.brandCount === 1 &&
      built.statistics.sponsoredCount === 3 &&
      built.graph !== null &&
      built.graph.nodes.some((node) => node.kind === "SearchSnapshot" && node.label === "search-1") &&
      built.graph.nodes.some((node) => node.kind === "SERPRecord" && node.label === "https://example.test/notes") &&
      built.graph.nodes.some((node) => node.kind === "SponsoredResult" && node.label === "https://vendor.example.test/ad") &&
      built.graph.nodes.some((node) => node.kind === "LandingPage" && node.label === "page-1") &&
      built.graph.nodes.some((node) => node.kind === "ObservedProduct" && node.label === "Zebra Offer") &&
      built.graph.edges.some((edge) => edge.from === "page-page-1" && edge.to === "product-page-1"),
  );
  check(
    "every supplied address is referenced and page text is not copied",
    text.includes("search-1") &&
      text.includes("https://example.test/notes") &&
      text.includes("https://example.test/buy") &&
      text.includes("page-1") &&
      text.includes("page-2") &&
      text.includes("Zebra Offer") &&
      text.includes("Zebra Desk") &&
      !text.includes("opaque-search-marker") &&
      !text.includes("opaque-serp-marker") &&
      !text.includes("opaque-page-marker") &&
      !sponsoredUrls.includes("https://example.test/notes"),
  );
  check(
    "repeated brands, prices, and languages are kept once",
    built.report?.observedBrands.length === 1 &&
      built.report.observedPrices.length === 1 &&
      built.report.observedLanguages.length === 1 &&
      built.report.observedProductSummary.brands.length === 2 &&
      built.report.warnings.some((warning) => warning.includes("https://vendor.example.test/ad")),
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    built.snapshot !== null &&
      report.getSnapshot("real-market-report-1") === built.snapshot &&
      Object.isFrozen(built.snapshot) &&
      Object.isFrozen(built.report) &&
      Object.isFrozen(built.graph) &&
      built.snapshot?.context.query === "zebra offer" &&
      built.snapshot?.context.productNames[0] === "Zebra Offer" &&
      built.snapshot?.metadata.note === "kept" &&
      Object.keys(built).join() === REAL_MARKET_RESULT_KEYS.join() &&
      Object.keys(built.statistics).join() === REAL_MARKET_STATISTICS_KEYS.join() &&
      Object.keys(built.snapshot ?? {}).join() === REAL_MARKET_SNAPSHOT_KEYS.join() &&
      Object.keys(built.report ?? {}).join() === REAL_MARKET_REPORT_RECORD_KEYS.join() &&
      Object.keys(built.report?.searchSummary ?? {}).join() === REAL_MARKET_SEARCH_SUMMARY_KEYS.join() &&
      Object.keys(built.report?.serpSummary ?? {}).join() === REAL_MARKET_LIST_SUMMARY_KEYS.join() &&
      Object.keys(built.report?.landingPageSummary ?? {}).join() === REAL_MARKET_LANDING_SUMMARY_KEYS.join() &&
      Object.keys(built.report?.observedProductSummary ?? {}).join() === REAL_MARKET_PRODUCT_SUMMARY_KEYS.join() &&
      Object.keys(built.report?.evidenceCoverage ?? {}).join() === REAL_MARKET_COVERAGE_KEYS.join() &&
      Object.keys(built.graph ?? {}).join() === REAL_MARKET_GRAPH_KEYS.join(),
  );

  const again = reportFor();
  const second = again.build(inputOf());
  check("an independent report keeps its own snapshot", second.status === "OK" && second.report?.searchSummary.query === "zebra offer" && second.snapshot !== built.snapshot && again.getSnapshot("real-market-report-1") !== report.getSnapshot("real-market-report-1"));

  const legacy = reportFor().build(inputOf({
    landingPageSnapshots: [page("page-1", "https://example.test/buy", "destinationUrl")],
    observedProducts: [{
      landingPageId: "page-1",
      productName: "Zebra Offer",
      brand: "North Brand",
      vendor: "Vendor North",
      visiblePrice: "12.00",
      currency: "USD",
      language: "en",
      category: "Outdoor",
      primaryDomain: "example.test",
      offerUrl: "https://example.test/buy",
    }],
    sponsoredResults: [sponsored("https://example.test/buy", 1)],
  }));
  check(
    "an earlier landing page and product shape still aggregates",
    legacy.status === "OK" &&
      legacy.report?.landingPageSummary.originalUrls[0] === "https://example.test/buy" &&
      legacy.report?.observedPrices.join() === "12.00 USD" &&
      legacy.report?.observedCategories.join() === "Outdoor",
  );

  const missingSearch = reportFor().build(inputOf({ searchSnapshot: null }));
  check("a missing search snapshot stores nothing", missingSearch.status === "REJECTED" && has(missingSearch.issues, /Missing Search Snapshot/) && missingSearch.snapshot === null);

  const missingSponsored = reportFor().build(inputOf({ sponsoredResults: [] }));
  check("missing sponsored results store nothing", missingSponsored.status === "REJECTED" && has(missingSponsored.issues, /Missing Sponsored Results/) && missingSponsored.snapshot === null);

  const missingPages = reportFor().build(inputOf({ landingPageSnapshots: [] }));
  check("missing landing pages store nothing", missingPages.status === "REJECTED" && has(missingPages.issues, /Missing Landing Pages/) && missingPages.snapshot === null);

  const missingProducts = reportFor().build(inputOf({ observedProducts: [] }));
  check("missing observed products store nothing", missingProducts.status === "REJECTED" && has(missingProducts.issues, /Missing Observed Products/) && missingProducts.snapshot === null);

  const corrupted = reportFor().build(inputOf({ observedProducts: [{ identity: { landingPageId: "page-1", productName: "  " } }] }));
  check("corrupted product evidence stores nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Evidence/) && corrupted.snapshot === null);

  const nested = reportFor().build(inputOf({ configuration: { nested: { inner: true } } }));
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badId = reportFor(() => "BAD").build(inputOf());
  check("a corrupted report id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null);

  const dir = join(process.cwd(), "src/lib/real-market-report");
  const names = [
    "real-market-report.ts",
    "market-report-builder.ts",
    "market-report-validator.ts",
    "market-report-context.ts",
    "market-report-snapshot.ts",
  ];
  check("five real market report modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the report does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|anthropic|openai|clickbank|product-intelligence/i.test(line)));
  check("no ordering, model calls, or outside catalogs in code", !code.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "market-report-context.ts"), "utf8")));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the real market report`, !sources.some((file) => /real-market-report/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`REAL_MARKET_REPORT_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("REAL_MARKET_REPORT_FAILURES=0");
}

main();
