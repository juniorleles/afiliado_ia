import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createProductRecommendationEngine } from "../src/lib/product-intelligence/product-recommendation-engine.ts";
import { createRecommendationBuilder } from "../src/lib/product-intelligence/recommendation-builder.ts";
import { confidenceOf } from "../src/lib/product-intelligence/ranking-engine.ts";
import { createRankingEngine } from "../src/lib/product-intelligence/ranking-engine.ts";
import {
  RECOMMENDATION_CONTEXT_MEMBERS,
  RECOMMENDATION_LEVELS,
  RECOMMENDATION_SNAPSHOT_KEYS,
  RECOMMENDATION_STATISTICS_KEYS,
  RECOMMENDATION_STATUSES,
  freezeDeepRecommendation,
} from "../src/lib/product-intelligence/recommendation-snapshot.ts";
import { createRecommendationValidator } from "../src/lib/product-intelligence/recommendation-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

const KINDS = ["ProductFacts", "LandingPageEvidence", "SearchEvidence", "CompetitionEvidence", "CommercialEvidence"] as const;

function reportOf(name: string, missing: string[] = [], decisionReady = true) {
  const present = (kind: string) => (missing.includes(kind) ? "ABSENT" : "PRESENT");
  return {
    importedProduct: {
      productName: name,
      vendor: "Vendor North",
      category: "Health & Fitness",
      landingPage: "https://example.test/offer",
    },
    landingPageSummary: missing.includes("LandingPageEvidence")
      ? null
      : { headline: `${name} offer`, primaryCta: "Get the offer", priceVisibility: "PRESENT", guarantee: "60-day refund as stated", refundPolicy: "stated on the page" },
    searchSummary: missing.includes("SearchEvidence")
      ? null
      : { searchResultPresence: "PRESENT", officialWebsite: "https://example.test/offer", sponsoredResultPresence: "PRESENT", sponsoredResultCount: 1, reviewWebsites: [] },
    competitionSummary: missing.includes("CompetitionEvidence")
      ? null
      : { numberOfAdvertisers: 2, brandPresence: "PRESENT", marketplacePresence: "PRESENT", affiliateAdvertisers: [], reviewSites: [] },
    commercialSummary: missing.includes("CommercialEvidence")
      ? null
      : {
          directPurchaseIntent: "PRESENT",
          priceVisibility: "PRESENT",
          commercialSearchPresence: "PRESENT",
          sponsoredSearchPresence: "PRESENT",
          supportAvailability: "PRESENT",
        },
    evidenceSummary: {
      productFacts: present("ProductFacts"),
      landingPageEvidence: present("LandingPageEvidence"),
      searchEvidence: present("SearchEvidence"),
      competitionEvidence: present("CompetitionEvidence"),
      commercialEvidence: present("CommercialEvidence"),
    },
    missingEvidence: missing,
    dataQuality: { presentCount: KINDS.length - missing.length, missingCount: missing.length },
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    ready: decisionReady,
  };
}

function graphOf(missing: string[] = []) {
  return {
    nodes: KINDS.map((kind) => ({ id: kind, kind, present: missing.includes(kind) ? "ABSENT" : "PRESENT" })),
    edges: [
      { from: "productFacts", to: "landingPageEvidence" },
      { from: "productFacts", to: "searchEvidence" },
      { from: "searchEvidence", to: "competitionEvidence" },
      { from: "competitionEvidence", to: "commercialEvidence" },
    ],
  };
}

function bundleOf(name: string, id: string, over: { missing?: string[]; decisionStatus?: string; discoveryStatus?: string } = {}) {
  const missing = over.missing ?? [];
  const report = reportOf(name, missing);
  delete (report as { ready?: boolean }).ready;
  return {
    productIntelligenceReport: report,
    evidenceGraph: graphOf(missing),
    discoveryAnalysis: { id, status: over.discoveryStatus ?? "NEW", source: "product-intelligence" },
    opportunityAnalysis: { analysisId: `${id}-opportunity`, candidateId: id, status: "COMPLETED" },
    trafficAnalysis: { analysisId: `${id}-traffic`, candidateId: id, status: "COMPLETED" },
    decisionAnalysis: { analysisId: `${id}-decision`, candidateId: id, status: "COMPLETED", decisionStatus: over.decisionStatus ?? "CLEARED" },
  };
}

function inputOf(products: ReturnType<typeof bundleOf>[], over: Record<string, unknown> = {}) {
  return {
    products,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

function engineOf() {
  return createProductRecommendationEngine({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "recommendation-1",
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

const validator = createRecommendationValidator();
check("statuses are OK and REJECTED", RECOMMENDATION_STATUSES.join() === "OK,REJECTED");
check("levels are execution candidate, hold, and insufficient", RECOMMENDATION_LEVELS.join() === "EXECUTION_CANDIDATE,HOLD,INSUFFICIENT");
check(
  "context members name the report, the graph, and the four analyses",
  RECOMMENDATION_CONTEXT_MEMBERS.join() === "products,productIntelligenceReport,evidenceGraph,discoveryAnalysis,opportunityAnalysis,trafficAnalysis,decisionAnalysis,executionMetadata,runtimeMetadata,configuration",
);
check("snapshot keys are recommendation id, product name, ranking position, created at, and metadata", RECOMMENDATION_SNAPSHOT_KEYS.join() === "recommendationId,productName,rankingPosition,createdAt,metadata");
check("statistics keys count products and levels", RECOMMENDATION_STATISTICS_KEYS.join() === "productCount,executionCandidateCount,holdCount,insufficientCount,executionTime");
check("Missing Evidence: a missing bundle is rejected", has(validator.validateInput(null), /Missing Evidence/));
check("Invalid Report: a report without a product name is rejected", has(validator.validateInput(bundleOf("", "alpha-tonic")), /Invalid Report/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateInput(inputOf([bundleOf("Alpha Tonic", "alpha-tonic")], { executionMetadata: { nested: { a: 1 } } })), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf([bundleOf("Alpha Tonic", "alpha-tonic")], { extra: true })), /Invalid Metadata/));
check("confidence follows the observed counts", confidenceOf(3, 1, 1) === 0.6 && confidenceOf(0, 0, 0) === 0);

const ranked = engineOf().recommend(
  inputOf([
    bundleOf("Beta Capsule", "beta-capsule"),
    bundleOf("Aaa Capsule", "aaa-capsule", { missing: ["LandingPageEvidence"] }),
    bundleOf("Gamma Drop", "gamma-drop", { decisionStatus: "WARNING" }),
    bundleOf("Alpha Tonic", "alpha-tonic"),
  ]),
);
if (ranked.status !== "OK") console.log(JSON.stringify(ranked.issues, null, 2));
const order = ranked.recommendation?.ranking.map((item) => item.candidateId).join();
check("a complete ranking returns OK", ranked.status === "OK" && ranked.issues.length === 0 && ranked.recommendation !== null && ranked.snapshot !== null);
check("ranking position follows evidence, then name", order === "alpha-tonic,beta-capsule,gamma-drop,aaa-capsule");
const alpha = ranked.recommendation?.recommendations.find((entry) => entry.candidateId === "alpha-tonic");
const gamma = ranked.recommendation?.recommendations.find((entry) => entry.candidateId === "gamma-drop");
const aaa = ranked.recommendation?.recommendations.find((entry) => entry.candidateId === "aaa-capsule");
check("a cleared complete product is an execution candidate in position 1", alpha?.level === "EXECUTION_CANDIDATE" && alpha?.rankingPosition === 1 && alpha?.confidence === 1);
check("a warning with complete evidence is held", gamma?.level === "HOLD" && gamma?.rankingPosition === 3 && gamma?.readinessSummary.decisionStatus === "WARNING");
check("missing landing evidence is insufficient and listed", aaa?.level === "INSUFFICIENT" && aaa?.rankingPosition === 4 && aaa?.missingEvidence.includes("LandingPageEvidence") === true);
check("positive evidence restates observed presence", (alpha?.positiveEvidence.length ?? 0) > 0 && alpha?.negativeEvidence.length === 0 && alpha?.riskSummary.text === "No negative evidence was observed.");
check("the snapshot names the first ranked product", ranked.snapshot?.recommendationId === "recommendation-1" && ranked.snapshot?.productName === "Alpha Tonic" && ranked.snapshot?.rankingPosition === 1 && ranked.snapshot?.metadata.productCount === 4);
check(
  "statistics restate the level counts",
  ranked.statistics?.productCount === 4 && ranked.statistics?.executionCandidateCount === 2 && ranked.statistics?.holdCount === 1 && ranked.statistics?.insufficientCount === 1,
);
check("metadata is restated", ranked.metadata.run === "r1");
check("the recommendation does not approve a product", !JSON.stringify(ranked.recommendation).includes("APPROVED"));

const single = engineOf().recommend({
  ...bundleOf("Alpha Tonic", "alpha-tonic"),
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
});
check("one product bundle is recommended in position 1", single.status === "OK" && single.recommendation?.recommendations.length === 1 && single.recommendation?.recommendations[0]?.rankingPosition === 1);

const source = inputOf([bundleOf("Alpha Tonic", "alpha-tonic"), bundleOf("Beta Capsule", "beta-capsule")]);
const observed = engineOf().recommend(source);
const firstDiscovery = (source.products[0] as { discoveryAnalysis: { status: string } }).discoveryAnalysis;
firstDiscovery.status = "FAILED";
(source.executionMetadata as { run: string }).run = "changed";
try {
  (observed.recommendation!.recommendations[0] as { level: string }).level = "hacked";
  (observed.snapshot!.productName as string) = "hacked";
} catch {
  /* frozen */
}
check(
  "No mutation: changing the input leaves the recommendation unchanged",
  observed.recommendation?.recommendations[0]?.readinessSummary.discoveryStatus === "NEW" && observed.metadata.run === "r1" && observed.snapshot?.productName === "Alpha Tonic",
);
check("Immutable recommendation: the recommendation and snapshot cannot be assigned into", observed.recommendation?.recommendations[0]?.level === "EXECUTION_CANDIDATE" && observed.snapshot?.productName === "Alpha Tonic");
check("freeze helper returns the same value", freezeDeepRecommendation(observed.recommendation) === observed.recommendation);

const left = engineOf();
const right = engineOf();
left.recommend(inputOf([bundleOf("Alpha Tonic", "alpha-tonic")]));
right.recommend(null);
check("Independent engine: engines do not share snapshots", left.getSnapshot("recommendation-1")?.productName === "Alpha Tonic" && right.getSnapshot("recommendation-1") === null);

const again = engineOf().recommend(
  inputOf([
    bundleOf("Beta Capsule", "beta-capsule"),
    bundleOf("Aaa Capsule", "aaa-capsule", { missing: ["LandingPageEvidence"] }),
    bundleOf("Gamma Drop", "gamma-drop", { decisionStatus: "WARNING" }),
    bundleOf("Alpha Tonic", "alpha-tonic"),
  ]),
);
check("deterministic ranking: a second engine matches the first", again.recommendation?.ranking.map((item) => `${item.candidateId}:${item.rankingPosition}`).join() === ranked.recommendation?.ranking.map((item) => `${item.candidateId}:${item.rankingPosition}`).join());

const missing = engineOf().recommend(null);
check("missing evidence stores no snapshot", missing.status === "REJECTED" && has(missing.issues, /Missing Evidence/) && missing.snapshot === null && missing.recommendation === null);
const badReport = engineOf().recommend(bundleOf("", "alpha-tonic"));
check("an invalid report stores no snapshot", badReport.status === "REJECTED" && has(badReport.issues, /Invalid Report/) && badReport.snapshot === null);
const duplicate = engineOf().recommend(inputOf([bundleOf("Alpha Tonic", "alpha-tonic"), bundleOf("Beta Capsule", "alpha-tonic")]));
check("a repeated candidate is a corrupted ranking", duplicate.status === "REJECTED" && has(duplicate.issues, /Corrupted Ranking/) && duplicate.snapshot === null);
const nested = engineOf().recommend(inputOf([bundleOf("Alpha Tonic", "alpha-tonic")], { configuration: { nested: { a: 1 } } }));
check("invalid metadata stores no snapshot", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

const blocked = engineOf().recommend(inputOf([bundleOf("Alpha Tonic", "alpha-tonic", { decisionStatus: "BLOCKED" })]));
check("a blocked decision is not recommended for execution", blocked.recommendation?.recommendations[0]?.level === "INSUFFICIENT" && blocked.recommendation?.recommendations[0]?.negativeEvidence.some((item) => item.text === "BLOCKED") === true);

check("the builder and the ranking engine are callable", createRecommendationBuilder().build(bundleOf("Alpha Tonic", "alpha-tonic")).level === "EXECUTION_CANDIDATE" && createRankingEngine().rank([]).entries?.length === 0);

const dir = join(process.cwd(), "src/lib/product-intelligence");
const names = ["product-recommendation-engine.ts", "recommendation-builder.ts", "recommendation-validator.ts", "recommendation-snapshot.ts", "ranking-engine.ts"];
const files = readdirSync(dir).filter((f) => names.includes(f));
check("five recommendation modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
const code = lines.filter(isCode);
const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
check("no live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
check("no campaign publish or ad client in code", !code.some((l) => /google-ads|publish\(|oauth/i.test(l)));
check("no automatic approval token in code", !bare.some((l) => /\bAPPROVED\b|\bapprove\(/.test(l)));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
check("imports were found", imports.length >= 4);
check(
  "every import stays inside the recommendation modules",
  imports.every((i) => /^\.\/(product-recommendation-engine|recommendation-builder|recommendation-validator|recommendation-snapshot|ranking-engine)$/.test(i.from)),
);
check(
  "nothing imports Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Google Ads, or ClickBank",
  !imports.some((i) => /discovery|opportunity|traffic|decision|workflow|execution|google-ads|clickbank/i.test(i.from)),
);
const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial", "product-report", "product-opportunity", "product-analysis"];
for (const prefix of prefixes) {
  const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}[a-z-]*\\.ts$`).test(f));
  check(`${prefix} modules do not import the recommendation engine`, siblings.every((f) => !/product-recommendation-|recommendation-builder|recommendation-validator|recommendation-snapshot|ranking-engine/.test(readFileSync(join(dir, f), "utf8"))));
}
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the recommendation engine`, !sources.some((f) => /product-recommendation-|ranking-engine/.test(readFileSync(f, "utf8"))));
}

if (failures > 0) {
  console.log(`RECOMMENDATION_FAILURES=${failures}`);
  process.exit(1);
}
console.log("RECOMMENDATION_FAILURES=0");
