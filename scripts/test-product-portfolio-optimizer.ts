import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createPortfolioBuilder } from "../src/lib/product-intelligence/portfolio-builder.ts";
import { confidenceOf, createPortfolioRanking } from "../src/lib/product-intelligence/portfolio-ranking.ts";
import { createProductPortfolioOptimizer } from "../src/lib/product-intelligence/product-portfolio-optimizer.ts";
import {
  PORTFOLIO_COMPARE_FIELDS,
  PORTFOLIO_CONTEXT_MEMBERS,
  PORTFOLIO_SNAPSHOT_KEYS,
  PORTFOLIO_STATISTICS_KEYS,
  PORTFOLIO_STATUSES,
  freezeDeepPortfolio,
} from "../src/lib/product-intelligence/portfolio-snapshot.ts";
import { createPortfolioValidator } from "../src/lib/product-intelligence/portfolio-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

const KINDS = ["ProductFacts", "LandingPageEvidence", "SearchEvidence", "CompetitionEvidence", "CommercialEvidence"] as const;

function reportOf(name: string, missing: string[] = []) {
  const present = (kind: string) => (missing.includes(kind) ? "ABSENT" : "PRESENT");
  return {
    importedProduct: { productName: name, vendor: "Vendor North", category: "Health & Fitness", landingPage: "https://example.test/offer" },
    landingPageSummary: missing.includes("LandingPageEvidence") ? null : { headline: `${name} offer`, primaryCta: "Get the offer", priceVisibility: "PRESENT" },
    searchSummary: { searchResultPresence: "PRESENT", officialWebsite: "https://example.test/offer", sponsoredResultPresence: "PRESENT" },
    competitionSummary: { numberOfAdvertisers: 2, brandPresence: "PRESENT", marketplacePresence: "PRESENT" },
    commercialSummary: { directPurchaseIntent: "PRESENT", priceVisibility: "PRESENT", commercialSearchPresence: "PRESENT" },
    evidenceSummary: {
      productFacts: "PRESENT",
      landingPageEvidence: present("LandingPageEvidence"),
      searchEvidence: "PRESENT",
      competitionEvidence: "PRESENT",
      commercialEvidence: "PRESENT",
    },
    missingEvidence: missing,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function graphOf(missing: string[] = []) {
  return {
    nodes: KINDS.map((kind) => ({ id: kind, kind, present: missing.includes(kind) ? "ABSENT" : "PRESENT" })),
    edges: [{ from: "productFacts", to: "landingPageEvidence" }],
  };
}

function productOf(name: string, id: string, over: { missing?: string[]; confidence?: number; level?: string; decisionStatus?: string } = {}) {
  const missing = over.missing ?? [];
  return {
    productIntelligenceReport: reportOf(name, missing),
    evidenceGraph: graphOf(missing),
    recommendationReport: {
      candidateId: id,
      productName: name,
      level: over.level ?? "EXECUTION_CANDIDATE",
      confidence: over.confidence ?? 1,
      positiveEvidence: [{ field: "productName", text: name }],
      negativeEvidence: [],
      missingEvidence: missing,
    },
    discoveryAnalysis: { id, status: "NEW" },
    opportunityAnalysis: { analysisId: `${id}-opportunity`, candidateId: id, status: "COMPLETED" },
    trafficAnalysis: { analysisId: `${id}-traffic`, candidateId: id, status: "COMPLETED" },
    decisionAnalysis: { analysisId: `${id}-decision`, candidateId: id, decisionStatus: over.decisionStatus ?? "CLEARED", status: "COMPLETED" },
  };
}

function optimizerOf() {
  return createProductPortfolioOptimizer({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "portfolio-1",
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

const validator = createPortfolioValidator();
check("statuses are OK and REJECTED", PORTFOLIO_STATUSES.join() === "OK,REJECTED");
check(
  "context members name reports and recommendation reports",
  PORTFOLIO_CONTEXT_MEMBERS.join() === "products,reports,recommendationReports,executionMetadata,runtimeMetadata,configuration",
);
check("comparison fields cover the requested signals", PORTFOLIO_COMPARE_FIELDS.join() === "landingPage,competition,commercial,search,discoveryStatus,opportunityStatus,trafficStatus,decisionStatus");
check("snapshot keys are portfolio id, product name, product count, created at, and metadata", PORTFOLIO_SNAPSHOT_KEYS.join() === "portfolioId,productName,productCount,createdAt,metadata");
check("statistics keys count products, best, weak, and missing products", PORTFOLIO_STATISTICS_KEYS.join() === "productCount,bestCount,weakCount,missingProductCount,executionTime");
check("Missing Reports: a missing envelope is rejected", has(validator.validateInput(null), /Missing Reports/));
check("Duplicate Products: a repeated name is rejected", has(validator.validateInput({ products: [productOf("Alpha Tonic", "alpha-tonic"), productOf("Alpha Tonic", "alpha-other")] }), /Duplicate Products/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateInput({ products: [productOf("Alpha Tonic", "alpha-tonic")], executionMetadata: { nested: { a: 1 } } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput({ products: [productOf("Alpha Tonic", "alpha-tonic")], extra: true }), /Invalid Metadata/));
check("confidence follows the observed counts", confidenceOf(3, 1, 1) === 0.6 && confidenceOf(0, 0, 0) === 0);

const built = optimizerOf().optimize({
  products: [
    productOf("Gamma Drop", "gamma-drop", { missing: ["LandingPageEvidence"], confidence: 0.5, level: "INSUFFICIENT" }),
    productOf("Beta Capsule", "beta-capsule", { confidence: 0.4, level: "HOLD" }),
    productOf("Alpha Tonic", "alpha-tonic", { confidence: 1, level: "EXECUTION_CANDIDATE" }),
  ],
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
});
if (built.status !== "OK") console.log(JSON.stringify(built.issues, null, 2));
const order = built.portfolio?.rankedProducts.map((item) => `${item.candidateId}:${item.rankingPosition}`).join();
check("a portfolio returns OK", built.status === "OK" && built.portfolio !== null && built.snapshot !== null);
check("portfolio ranking follows evidence", order === "alpha-tonic:1,beta-capsule:2,gamma-drop:3");
check("best opportunities are the strongest observed products", built.portfolio?.bestOpportunities.map((item) => item.candidateId).join() === "alpha-tonic");
check("weak opportunities are the products with missing evidence", built.portfolio?.weakOpportunities.map((item) => item.candidateId).join() === "gamma-drop");
check("missing evidence is restated", built.portfolio?.missingEvidence.some((item) => item.candidateId === "gamma-drop" && item.items.includes("LandingPageEvidence")) === true);
check("landing, competition, commercial, and search signals are restated", built.portfolio?.ranking[0]?.landingPage === "Alpha Tonic offer" && built.portfolio?.ranking[0]?.competition === "PRESENT" && built.portfolio?.ranking[0]?.commercial === "PRESENT" && built.portfolio?.ranking[0]?.search === "PRESENT");
check("discovery, opportunity, traffic, and decision results are restated", built.portfolio?.ranking[0]?.discoveryStatus === "NEW" && built.portfolio?.ranking[0]?.opportunityStatus === "COMPLETED" && built.portfolio?.ranking[0]?.trafficStatus === "COMPLETED" && built.portfolio?.ranking[0]?.decisionStatus === "CLEARED");
check("risk summary restates negative evidence", built.portfolio?.riskSummary.text === "No negative evidence was observed.");
check("confidence summary restates the range", built.portfolio?.confidenceSummary.maximum === 1 && built.portfolio?.confidenceSummary.minimum === 0.4);
check(
  "statistics restate the groups",
  built.statistics?.productCount === 3 && built.statistics?.bestCount === 1 && built.statistics?.weakCount === 1 && built.statistics?.missingProductCount === 1,
);
check("the snapshot names the first product", built.snapshot?.portfolioId === "portfolio-1" && built.snapshot?.productName === "Alpha Tonic" && built.snapshot?.productCount === 3 && built.metadata.run === "r1");
check("the portfolio does not approve a product", !JSON.stringify(built.portfolio).includes("APPROVED"));

const fromReports = optimizerOf().optimize({
  reports: [reportOf("Alpha Tonic"), reportOf("Beta Capsule")],
  recommendationReports: [
    { candidateId: "alpha-tonic", productName: "Alpha Tonic", level: "EXECUTION_CANDIDATE", confidence: 1, negativeEvidence: [], missingEvidence: [] },
    { candidateId: "beta-capsule", productName: "Beta Capsule", level: "HOLD", confidence: 0.2, negativeEvidence: [], missingEvidence: [] },
  ],
  executionMetadata: { run: "r1" },
});
check("reports and recommendation reports are compared", fromReports.status === "OK" && fromReports.portfolio?.rankedProducts[0]?.candidateId === "alpha-tonic");

const source = {
  products: [productOf("Alpha Tonic", "alpha-tonic"), productOf("Beta Capsule", "beta-capsule", { confidence: 0.4, level: "HOLD" })],
  executionMetadata: { run: "r1" },
};
const observed = optimizerOf().optimize(source);
(source.products[0].productIntelligenceReport.importedProduct as { productName: string }).productName = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (observed.portfolio) (observed.portfolio.rankedProducts as unknown as { candidateId: string }[])[0].candidateId = "hacked";
  if (observed.snapshot) (observed.snapshot.productName as string) = "hacked";
} catch {
  /* frozen */
}
check(
  "No mutation: changing the input leaves the portfolio unchanged",
  observed.portfolio?.ranking[0]?.productName === "Alpha Tonic" && observed.metadata.run === "r1" && observed.snapshot?.productName === "Alpha Tonic",
);
check("Immutable portfolio: the portfolio and snapshot cannot be assigned into", observed.snapshot?.productName === "Alpha Tonic" && observed.portfolio?.rankedProducts[0]?.candidateId !== "hacked");
check("freeze helper returns the same value", freezeDeepPortfolio(observed.portfolio) === observed.portfolio);

const left = optimizerOf();
const right = optimizerOf();
left.optimize({ products: [productOf("Alpha Tonic", "alpha-tonic")] });
right.optimize(null);
check("Independent optimizer: optimizers do not share snapshots", left.getSnapshot("portfolio-1")?.productName === "Alpha Tonic" && right.getSnapshot("portfolio-1") === null);

const again = optimizerOf().optimize({
  products: [
    productOf("Gamma Drop", "gamma-drop", { missing: ["LandingPageEvidence"], confidence: 0.5, level: "INSUFFICIENT" }),
    productOf("Beta Capsule", "beta-capsule", { confidence: 0.4, level: "HOLD" }),
    productOf("Alpha Tonic", "alpha-tonic", { confidence: 1, level: "EXECUTION_CANDIDATE" }),
  ],
});
check("deterministic portfolio: a second optimizer matches the ranking", again.portfolio?.rankedProducts.map((item) => `${item.candidateId}:${item.rankingPosition}`).join() === order);

const blocked = optimizerOf().optimize({ products: [productOf("Alpha Tonic", "alpha-tonic", { decisionStatus: "BLOCKED", level: "INSUFFICIENT", confidence: 0.2 })] });
check("a blocked decision is restated in the risk summary", blocked.portfolio?.riskSummary.items.includes("Alpha Tonic: BLOCKED") === true && blocked.portfolio?.ranking[0]?.level !== "EXECUTION_CANDIDATE");

const mismatched = productOf("Alpha Tonic", "alpha-tonic");
(mismatched.evidenceGraph.nodes[1] as { present: string }).present = "ABSENT";
const corrupt = optimizerOf().optimize({ products: [mismatched] });
check("a graph that disagrees with the report is a corrupted portfolio", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Portfolio/) && corrupt.snapshot === null);

const missing = optimizerOf().optimize(null);
check("missing reports store no snapshot", missing.status === "REJECTED" && has(missing.issues, /Missing Reports/) && missing.snapshot === null);
const duplicate = optimizerOf().optimize({ products: [productOf("Alpha Tonic", "alpha-tonic"), productOf("Alpha Tonic", "other-tonic")] });
check("duplicate products store no snapshot", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Products/) && duplicate.snapshot === null);
const nested = optimizerOf().optimize({ products: [productOf("Alpha Tonic", "alpha-tonic")], configuration: { nested: { a: 1 } } });
check("invalid metadata stores no snapshot", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
check("the builder and the ranking module are callable", createPortfolioBuilder().build(productOf("Alpha Tonic", "alpha-tonic")).draft?.productName === "Alpha Tonic" && createPortfolioRanking().rank([]).portfolio === null);

const dir = join(process.cwd(), "src/lib/product-intelligence");
const names = ["product-portfolio-optimizer.ts", "portfolio-builder.ts", "portfolio-validator.ts", "portfolio-ranking.ts", "portfolio-snapshot.ts"];
const files = readdirSync(dir).filter((f) => names.includes(f));
check("five portfolio modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
const code = lines.filter(isCode);
const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
check("no live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
check("no campaign publisher or ad client in code", !code.some((l) => /google-ads|publish\(/i.test(l)));
check("no automatic approval token in code", !bare.some((l) => /\bAPPROVED\b|\bapprove\(/.test(l)));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the portfolio modules", imports.every((from) => /^\.\/(product-portfolio-optimizer|portfolio-builder|portfolio-validator|portfolio-ranking|portfolio-snapshot)$/.test(from)));
const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial", "product-report", "product-opportunity", "product-analysis", "product-batch", "batch", "product-recommendation", "recommendation", "ranking"];
for (const prefix of prefixes) {
  const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}[a-z-]*\\.ts$`).test(f));
  check(`${prefix} modules do not import the portfolio optimizer`, siblings.every((f) => !/product-portfolio-|portfolio-builder|portfolio-validator|portfolio-ranking|portfolio-snapshot/.test(readFileSync(join(dir, f), "utf8"))));
}
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the portfolio optimizer`, !sources.some((f) => /product-portfolio-|portfolio-builder|portfolio-ranking|portfolio-snapshot/.test(readFileSync(f, "utf8"))));
}

if (failures > 0) {
  console.log(`PORTFOLIO_FAILURES=${failures}`);
  process.exit(1);
}
console.log("PORTFOLIO_FAILURES=0");
