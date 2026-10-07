import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SEARCHAPI_PROVIDER_NAME } from "../src/lib/search-provider/searchapi-types.ts";
import { createSearchApiProvider, type SearchApiProvider } from "../src/lib/search-provider/providers/searchapi-provider.ts";
import { REAL_MARKET_DISCOVERY_CONTEXT_MEMBERS } from "../src/lib/search-intelligence/real-market-discovery-context.ts";
import { createRealMarketDiscoveryPipeline } from "../src/lib/search-intelligence/real-market-discovery-pipeline.ts";
import {
  REAL_MARKET_DISCOVERY_ORIGINS,
  REAL_MARKET_DISCOVERY_PROVENANCE,
  REAL_MARKET_DISCOVERY_RESULT_KEYS,
  REAL_MARKET_DISCOVERY_SNAPSHOT_KEYS,
  REAL_MARKET_DISCOVERY_STAGES,
  REAL_MARKET_DISCOVERY_STATISTICS_KEYS,
  REAL_MARKET_DISCOVERY_STATUSES,
  type RealMarketDiscoveryResult,
} from "../src/lib/search-intelligence/real-market-discovery-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

const raw = {
  search_metadata: {
    id: "search_test",
    status: "Success",
    created_at: T0,
    request_url: "https://www.google.com/search?q=zebra+offer&gl=US&hl=en",
  },
  search_parameters: { engine: "google", q: "zebra offer", device: "desktop", hl: "en", gl: "us" },
  organic_results: [
    {
      position: 1,
      title: "Zebra Offer notes",
      link: "https://example.test/notes",
      snippet: "A note about the offer.",
      opaque: "opaque-search-marker",
    },
  ],
  ads: [
    {
      position: 1,
      block_position: "top",
      title: "Zebra Offer desk",
      link: "https://example.test/buy",
      snippet: "Desk copy.",
    },
  ],
};

const productHtml = `<html lang="en"><body>
<span data-field="productName">Zebra Offer</span>
<span data-field="brand">North Brand</span>
<span data-field="vendor">Vendor North</span>
</body></html>`;

function pageOf(html = productHtml) {
  return {
    destinationUrl: "https://example.test/buy",
    finalUrl: "https://example.test/buy",
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    keyword: "zebra offer",
    country: "US",
    language: "en",
    device: "desktop",
    pages: [pageOf()],
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function countOf(result: RealMarketDiscoveryResult, stage: string) {
  return result.executions.find((entry) => entry.stage === stage)?.count ?? -1;
}

function bounded(result: RealMarketDiscoveryResult) {
  return result.executions.length === REAL_MARKET_DISCOVERY_STAGES.length && result.executions.every((entry) => entry.count === 0 || entry.count === 1);
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

function providerFor(body: string, status: number, key = "unit-test-key", calls: { n: number } = { n: 0 }, seen: unknown[] = []): SearchApiProvider {
  const inner = createSearchApiProvider({
    now: () => 0,
    timestamp: () => T0,
    keyReader: () => key,
    transport: async () => {
      calls.n += 1;
      return { httpStatus: status, bodyText: body };
    },
  });
  return {
    provider: SEARCHAPI_PROVIDER_NAME,
    validator: inner.validator,
    getSnapshot: (id) => inner.getSnapshot(id),
    async search(input) {
      seen.push(input);
      return inner.search(input);
    },
  };
}

function pipelineFor(body: string, status: number, key = "unit-test-key", calls: { n: number } = { n: 0 }, seen: unknown[] = [], idFactory?: () => string) {
  return createRealMarketDiscoveryPipeline({
    now: () => 0,
    timestamp: () => T0,
    idFactory,
    provider: providerFor(body, status, key, calls, seen),
  });
}

async function main() {
  check("statuses are OK and REJECTED", REAL_MARKET_DISCOVERY_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", REAL_MARKET_DISCOVERY_ORIGINS.join() === "OBSERVED" && REAL_MARKET_DISCOVERY_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the keyword, locale, device, and supplied pages", REAL_MARKET_DISCOVERY_CONTEXT_MEMBERS.join() === "keyword,country,language,device,market,pages,executionMetadata,runtimeMetadata,configuration");
  check("five hosts run in order", REAL_MARKET_DISCOVERY_STAGES.join() === "SearchApiProvider,SearchApiNormalizer,LandingPageCollector,ProductIdentifier,MarketIntelligenceReport");

  const calls = { n: 0 };
  const seen: unknown[] = [];
  const input = inputOf();
  const pipeline = pipelineFor(JSON.stringify(raw), 200, "unit-test-key", calls, seen);
  const built = await pipeline.run(input);
  const snapshot = built.snapshot;
  const reportText = JSON.stringify(built.report);
  input.keyword = "changed keyword";
  input.pages[0].html = "changed html";
  input.executionMetadata.note = "changed";
  check(
    "one walk returns a search snapshot, SERP records, sponsored results, landing pages, observed products, and a market report",
    built.status === "OK" &&
      snapshot !== null &&
      built.searchSnapshot?.query === "zebra offer" &&
      built.searchSnapshot.country === "US" &&
      built.searchSnapshot.language === "en" &&
      built.searchSnapshot.device === "desktop" &&
      built.searchSnapshot.market === "us" &&
      built.searchSnapshot.html === "" &&
      built.serpRecords?.length === 2 &&
      built.sponsoredResults?.length === 1 &&
      built.sponsoredResults[0]?.url === "https://example.test/buy" &&
      built.serpRecords[0]?.url === "https://example.test/notes" &&
      built.serpRecords[0]?.sponsoredMarker === null &&
      built.landingPageSnapshots?.length === 1 &&
      built.observedProducts?.[0]?.identity.productName === "Zebra Offer" &&
      reportText.includes("Zebra Offer") &&
      !reportText.includes("opaque-search-marker") &&
      JSON.stringify(built.serpRecords).includes("opaque-search-marker") &&
      built.graph?.nodes.length === 5 &&
      built.graph.edges.length === 4,
  );
  check("each host executes exactly once", REAL_MARKET_DISCOVERY_STAGES.every((stage) => countOf(built, stage) === 1) && built.statistics.stageCount === 5 && built.statistics.completedCount === 5 && calls.n === 1);
  check("stage counts stay within one execution", bounded(built));
  check("the provider receives the keyword and locale only", seen.length === 1 && seen[0] !== null && typeof seen[0] === "object" && !("pages" in (seen[0] as object)) && (seen[0] as { keyword?: string }).keyword === "zebra offer");
  check("the snapshot is stored and frozen", snapshot !== null && pipeline.getSnapshot("real-discovery-1") === snapshot && Object.isFrozen(snapshot) && Object.isFrozen(snapshot.context) && Object.isFrozen(built.report));
  check(
    "later input changes leave the snapshot unchanged",
    snapshot?.context.keyword === "zebra offer" &&
      snapshot.context.pages[0]?.html.includes("Zebra Offer") &&
      snapshot.metadata.note === "kept" &&
      Object.keys(snapshot).join() === REAL_MARKET_DISCOVERY_SNAPSHOT_KEYS.join() &&
      Object.keys(built).join() === REAL_MARKET_DISCOVERY_RESULT_KEYS.join() &&
      Object.keys(built.statistics).join() === REAL_MARKET_DISCOVERY_STATISTICS_KEYS.join(),
  );

  const second = pipelineFor(JSON.stringify(raw), 200);
  const again = await second.run(inputOf());
  check("an independent pipeline keeps its own snapshot", again.status === "OK" && again.observedProducts?.[0]?.identity.productName === "Zebra Offer" && again.snapshot !== snapshot && second.getSnapshot("real-discovery-1") !== pipeline.getSnapshot("real-discovery-1"));

  const blankCalls = { n: 0 };
  const blank = await pipelineFor(JSON.stringify(raw), 200, "unit-test-key", blankCalls).run({ country: "US", language: "en", device: "desktop" });
  check("a missing keyword runs no host", blank.status === "REJECTED" && has(blank.issues, /Missing Keyword/) && blank.snapshot === null && REAL_MARKET_DISCOVERY_STAGES.every((stage) => countOf(blank, stage) === 0) && blankCalls.n === 0 && bounded(blank));

  const keyCalls = { n: 0 };
  const missingKey = await pipelineFor("{}", 200, "  ", keyCalls).run(inputOf());
  check("a missing API key stops after the provider", missingKey.status === "REJECTED" && has(missingKey.issues, /Missing API Key/) && missingKey.snapshot === null && countOf(missingKey, "SearchApiProvider") === 1 && countOf(missingKey, "SearchApiNormalizer") === 0 && keyCalls.n === 0 && bounded(missingKey));

  const httpCalls = { n: 0 };
  const httpFailure = await pipelineFor('{"error":"bad"}', 400, "unit-test-key", httpCalls).run(inputOf());
  check("a provider failure stops before the normalizer", httpFailure.status === "REJECTED" && has(httpFailure.issues, /Provider Failure/) && countOf(httpFailure, "SearchApiProvider") === 1 && countOf(httpFailure, "SearchApiNormalizer") === 0 && httpCalls.n === 1 && bounded(httpFailure));

  const malformed = await pipelineFor('{"organic_results":[]}', 200).run(inputOf());
  check("a malformed provider response stops before landing pages", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Provider Response/) && countOf(malformed, "SearchApiProvider") === 1 && countOf(malformed, "SearchApiNormalizer") === 1 && countOf(malformed, "LandingPageCollector") === 0 && bounded(malformed));

  const noPages = await pipelineFor(JSON.stringify(raw), 200).run(inputOf({ pages: undefined }));
  check("missing landing pages stop before the product identifier", noPages.status === "REJECTED" && has(noPages.issues, /Missing Landing Pages/) && countOf(noPages, "LandingPageCollector") === 1 && countOf(noPages, "ProductIdentifier") === 0 && countOf(noPages, "MarketIntelligenceReport") === 0 && bounded(noPages));

  const unmarked = await pipelineFor(JSON.stringify(raw), 200).run(inputOf({ pages: [pageOf("<html><body><p>Plain page</p></body></html>")] }));
  check("missing product evidence stops before the market report", unmarked.status === "REJECTED" && has(unmarked.issues, /Missing Product Evidence/) && countOf(unmarked, "ProductIdentifier") === 1 && countOf(unmarked, "MarketIntelligenceReport") === 0 && bounded(unmarked));

  const badId = await pipelineFor(JSON.stringify(raw), 200, "unit-test-key", { n: 0 }, [], () => "BAD").run(inputOf());
  check("a corrupted analysis id stores nothing after every host runs once", badId.status === "REJECTED" && has(badId.issues, /Invalid Pipeline Metadata/) && badId.snapshot === null && REAL_MARKET_DISCOVERY_STAGES.every((stage) => countOf(badId, stage) === 1));

  const nested = await pipelineFor(JSON.stringify(raw), 200).run(inputOf({ configuration: { nested: { inner: true } } }));
  check("nested metadata runs no host", nested.status === "REJECTED" && has(nested.issues, /Invalid Pipeline Metadata/) && REAL_MARKET_DISCOVERY_STAGES.every((stage) => countOf(nested, stage) === 0) && nested.snapshot === null);

  const dir = join(process.cwd(), "src/lib/search-intelligence");
  const names = [
    "real-market-discovery-pipeline.ts",
    "real-market-discovery-runner.ts",
    "real-market-discovery-validator.ts",
    "real-market-discovery-context.ts",
    "real-market-discovery-snapshot.ts",
  ];
  check("five real market discovery modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const files = names.map((name) => join(dir, name));
  const bundled = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the pipeline does not read provider JSON or open a request", !code.some((line) => /organic_results|shopping_ads|inline_shopping|fetch\(|searchapi\.io|process\.env/i.test(line)));
  check("no ordering, model calls, or outside catalogs in code", !code.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "real-market-discovery-context.ts"), "utf8")));
  const market = listTs(join(process.cwd(), "src/lib/market-discovery"));
  check("Market Discovery does not import the real pipeline", !market.some((file) => /real-market-discovery|search-intelligence\//.test(readFileSync(file, "utf8"))));
  const providerDir = listTs(join(process.cwd(), "src/lib/search-provider"));
  check("the search provider does not import the real pipeline", !providerDir.some((file) => /search-intelligence/.test(readFileSync(file, "utf8"))));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the real pipeline`, !sources.some((file) => /real-market-discovery/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`REAL_MARKET_DISCOVERY_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("REAL_MARKET_DISCOVERY_FAILURES=0");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "real market discovery pipeline test failed");
  process.exit(1);
});
