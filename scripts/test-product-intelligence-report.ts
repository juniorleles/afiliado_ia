import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createProductIntelligenceReport } from "../src/lib/product-intelligence/product-intelligence-report.ts";
import { createProductReportBuilder } from "../src/lib/product-intelligence/product-report-builder.ts";
import { createProductReportValidator } from "../src/lib/product-intelligence/product-report-validator.ts";
import { PRODUCT_REPORT_STATISTICS_KEYS } from "../src/lib/product-intelligence/product-report-statistics.ts";
import {
  PRODUCT_REPORT_CONTEXT_MEMBERS,
  PRODUCT_REPORT_GRAPH_KEYS,
  PRODUCT_REPORT_KEYS,
  PRODUCT_REPORT_ORIGINS,
  PRODUCT_REPORT_PRESENCE,
  PRODUCT_REPORT_PROVENANCE,
  PRODUCT_REPORT_SNAPSHOT_KEYS,
  PRODUCT_REPORT_STATUSES,
  createProductReportSnapshot,
  freezeDeepProductReport,
} from "../src/lib/product-intelligence/product-report-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function factsOf(over: Record<string, unknown> = {}) {
  return {
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    category: "Health & Fitness",
    landingPage: "https://example.test/offer",
    ...over,
  };
}

function pageOf(over: Record<string, unknown> = {}) {
  return {
    headline: "Alpha Offer",
    primaryCta: "Get Alpha",
    priceVisibility: "PRESENT",
    guarantee: "60-day refund as stated on the page.",
    refundPolicy: "https://example.test/refund",
    ...over,
  };
}

function searchOf(over: Record<string, unknown> = {}) {
  return {
    searchResultPresence: "PRESENT",
    officialWebsite: "https://example.test/offer",
    sponsoredResultPresence: "PRESENT",
    sponsoredResultCount: 3,
    reviewWebsites: ["https://reviews.example.test/alpha"],
    ...over,
  };
}

function competitionOf(over: Record<string, unknown> = {}) {
  return {
    numberOfAdvertisers: 3,
    brandPresence: "PRESENT",
    marketplacePresence: "PRESENT",
    affiliateAdvertisers: ["https://hops.example.test/a"],
    reviewSites: ["https://reviews.example.test/alpha"],
    ...over,
  };
}

function commercialOf(over: Record<string, unknown> = {}) {
  return {
    directPurchaseIntent: "PRESENT",
    priceVisibility: "PRESENT",
    commercialSearchPresence: "PRESENT",
    sponsoredSearchPresence: "PRESENT",
    supportAvailability: "PRESENT",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    productFacts: factsOf(),
    landingPageEvidence: pageOf(),
    searchEvidence: searchOf(),
    competitionEvidence: competitionOf(),
    commercialEvidence: commercialOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function hostOf() {
  let n = 0;
  return createProductIntelligenceReport({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `report-${++n}`,
  });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(p));
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function main() {
  const validator = createProductReportValidator();
  const builder = createProductReportBuilder();
  check("analysis statuses are OK then REJECTED", PRODUCT_REPORT_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", PRODUCT_REPORT_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", PRODUCT_REPORT_PROVENANCE.join() === "DIRECT_SOURCE");
  check("presence tokens are PRESENT then ABSENT", PRODUCT_REPORT_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members are in the requested order", PRODUCT_REPORT_CONTEXT_MEMBERS.join() === "productFacts,landingPageEvidence,searchEvidence,competitionEvidence,commercialEvidence,executionMetadata,runtimeMetadata,configuration");
  check("report keys are in the requested order", PRODUCT_REPORT_KEYS.join() === "importedProduct,landingPageSummary,searchSummary,competitionSummary,commercialSummary,evidenceSummary,dataQuality,missingEvidence,warnings,evidenceGraph,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", PRODUCT_REPORT_SNAPSHOT_KEYS.join() === "reportId,productName,landingPage,createdAt,metadata");
  check("statistics keys are in the requested order", PRODUCT_REPORT_STATISTICS_KEYS.join() === "bundleCount,missingCount,warningCount,executionTime");
  check("graph keys are nodes then edges", PRODUCT_REPORT_GRAPH_KEYS.join() === "nodes,edges");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing ProductFacts: a missing facts record is rejected", has(validator.validateProductFacts({ commercialEvidence: commercialOf() }), /Missing ProductFacts/));
  check("Missing ProductFacts: a non-record facts value is rejected", has(validator.validateProductFacts({ productFacts: [] }), /Missing ProductFacts/));
  check("Missing Evidence: facts without evidence records are rejected", has(validator.validateEvidence({ productFacts: factsOf() }), /Missing Evidence/));
  check("Corrupted Report: a non-record landing page bundle is rejected", has(validator.validateEvidence(inputOf({ landingPageEvidence: [] })), /Corrupted Report/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createProductReportSnapshot({
    reportId: "report-1",
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === PRODUCT_REPORT_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepProductReport never throws", freezeDeepProductReport(1) === 1 && Object.isFrozen(freezeDeepProductReport({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const parsed = builder.build(inputOf());
  check("the builder restates the imported product", parsed.report?.importedProduct.productName === "Alpha Tonic" && parsed.report?.importedProduct.vendor === "Vendor North" && parsed.report?.importedProduct.landingPage === "https://example.test/offer");
  check("the builder restates landing page, search, competition, and commercial summaries", parsed.report?.landingPageSummary?.headline === "Alpha Offer" && parsed.report?.searchSummary?.sponsoredResultCount === 3 && parsed.report?.competitionSummary?.numberOfAdvertisers === 3 && parsed.report?.commercialSummary?.directPurchaseIntent === "PRESENT");

  const host = hostOf();
  const built = host.build(inputOf());
  check("the host returns OK with report, graph, statistics, snapshot, and metadata", built.status === "OK" && built.report !== null && built.graph !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("the report restates evidence summary, data quality, missing evidence, and warnings", built.report!.evidenceSummary.productFacts === "PRESENT" && built.report!.evidenceSummary.commercialEvidence === "PRESENT" && built.report!.dataQuality.presentCount === 5 && built.report!.dataQuality.missingCount === 0 && built.report!.missingEvidence.length === 0 && built.report!.warnings.length === 0);
  check("the evidence graph has five nodes and the pipeline edges", built.graph!.nodes.length === 5 && built.graph!.edges.length === 5 && built.graph!.nodes.every((node) => node.present === "PRESENT") && built.report!.evidenceGraph === built.graph);
  check("report origin is OBSERVED and provenance is DIRECT_SOURCE", built.report!.origin === "OBSERVED" && built.report!.provenance === "DIRECT_SOURCE" && built.report!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("a report record has exactly the requested fields", Object.keys(built.report!).join() === PRODUCT_REPORT_KEYS.join());
  check("statistics count bundles, missing bundles, and warnings", built.statistics!.bundleCount === 5 && built.statistics!.missingCount === 0 && built.statistics!.warningCount === 0);
  check("the snapshot stores report id, product name, and landing page", built.snapshot!.reportId === "report-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.landingPage === "https://example.test/offer");
  check("getSnapshot returns the stored snapshot", host.getSnapshot("report-1") === built.snapshot && host.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.report) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.graph) && Object.isFrozen(built.statistics) && Object.isFrozen(built.report!.evidenceGraph.nodes));
  check("metadata is restated on the result", built.metadata.run === "r1");
  check("a well-formed report validates", validator.validateReport(built.report).length === 0);

  const partial = hostOf().build(inputOf({ landingPageEvidence: undefined, commercialEvidence: undefined }));
  check("absent bundles are listed as missing evidence and warnings", partial.status === "OK" && partial.report?.landingPageSummary === null && partial.report?.commercialSummary === null && partial.report?.searchSummary?.officialWebsite === "https://example.test/offer" && partial.report?.missingEvidence.join() === "LandingPageEvidence,CommercialEvidence" && partial.report?.warnings[0] === "LandingPageEvidence is absent." && partial.statistics?.bundleCount === 3 && partial.statistics?.missingCount === 2);

  const missing = hostOf().build(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.report === null);
  const noFacts = hostOf().build(inputOf({ productFacts: undefined }));
  check("Missing ProductFacts is refused", noFacts.status === "REJECTED" && has(noFacts.issues, /Missing ProductFacts/));
  const noEvidence = hostOf().build({ productFacts: factsOf(), executionMetadata: { run: "r1" } });
  check("Missing Evidence is refused", noEvidence.status === "REJECTED" && has(noEvidence.issues, /Missing Evidence/));
  const corrupted = hostOf().build(inputOf({ landingPageEvidence: [] }));
  check("Corrupted Report is refused", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Report/));
  const nested = hostOf().build(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused build stores no snapshot", hostOf().getSnapshot("report-1") === null);

  const onceA = hostOf().build(inputOf());
  const onceB = hostOf().build(inputOf());
  check("Deterministic report: the same records yield the same report and snapshot", onceA.status === "OK" && JSON.stringify(onceA.report) === JSON.stringify(onceB.report) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const observed = hostOf().build(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.productFacts as { productName: string }).productName = "changed";
  (source.commercialEvidence as { directPurchaseIntent: string }).directPurchaseIntent = "ABSENT";
  check("No mutation: changing the input after build leaves the report unchanged", observed.report!.metadata.run === "r1" && observed.report!.importedProduct.productName === "Alpha Tonic" && observed.report!.commercialSummary?.directPurchaseIntent === "PRESENT");
  try {
    (observed.report!.importedProduct.productName as string) = "hacked";
    (observed.snapshot!.productName as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable reports: the report and snapshot cannot be assigned into", observed.report!.importedProduct.productName === "Alpha Tonic" && observed.snapshot!.productName === "Alpha Tonic");

  const left = hostOf();
  const right = hostOf();
  left.build(inputOf());
  right.build(null);
  check("Independent report builder: builders do not share snapshots", left.getSnapshot("report-1")?.productName === "Alpha Tonic" && right.getSnapshot("report-1") === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const files = readdirSync(dir).filter((f) => f === "product-intelligence-report.ts" || /^product-report-[a-z]+\.ts$/.test(f));
  check("five report modules exist: builder, report, snapshot, statistics, validator", files.sort().join() === "product-intelligence-report.ts,product-report-builder.ts,product-report-snapshot.ts,product-report-statistics.ts,product-report-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP or live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no scoring, ranking, weights, formulas, recommendations, or optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend|optimiz/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/product-report-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, ClickBank, Landing Page Intelligence, Google Search Intelligence, Competition Intelligence, Commercial Intelligence, the LP Builder, Web Anatomy, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|google-search|clickbank|landing-page|competition-|commercial-|lp-builder|web-anatomy|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial"];
  for (const prefix of prefixes) {
    const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}-[a-z]+\\.ts$`).test(f));
    check(`${prefix} modules do not import the product intelligence report`, siblings.every((f) => !/product-intelligence-report|product-report-/.test(readFileSync(join(dir, f), "utf8"))));
  }
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports the product intelligence report", !others.some((f) => /product-intelligence-report|product-report-builder|product-intelligence\/product-report/.test(readFileSync(f, "utf8"))));
  const productFactsSrc = readFileSync(join(process.cwd(), "src/lib/product-facts.ts"), "utf8");
  check("existing ProductFacts internals are unchanged by this report", !/product-intelligence|product-report-/.test(productFactsSrc));
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  check("Opportunity modules are unchanged by this report", !opportunity.some((f) => /product-intelligence-report|product-report-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nProduct intelligence report: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
