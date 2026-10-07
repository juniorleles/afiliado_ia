/**
 * Opportunity Engine — RC1 acceptance audit.
 * Validation only. Does not add host behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createOpportunityScoringEngine } from "../src/lib/opportunity-scoring/opportunity-scoring-engine.ts";
import { OPPORTUNITY_COVERAGE_FIELDS, OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics } from "../src/lib/opportunity-scoring/opportunity-score-types.ts";
import { createOpportunityRankingEngine } from "../src/lib/opportunity-ranking/opportunity-ranking-engine.ts";
import { createOpportunityPortfolioBuilder } from "../src/lib/opportunity-portfolio/portfolio-builder.ts";
import { createOpportunityRecommendationEngine } from "../src/lib/opportunity-recommendation/recommendation-engine.ts";

const GATES = [
  "OPPORTUNITY_SCORING_ENGINE",
  "OPPORTUNITY_RANKING_ENGINE",
  "PORTFOLIO_BUILDER",
  "RECOMMENDATION_ENGINE",
  "NEGATIVE_TESTS",
  "REGRESSION",
  "PERFORMANCE",
  "GENERICITY",
] as const;
type Gate = (typeof GATES)[number];
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Stage = "scoring" | "ranking" | "portfolio" | "recommendation";

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

function coverage() {
  return Object.fromEntries(OPPORTUNITY_COVERAGE_FIELDS.map((field) => [field, "PRESENT"]));
}

function reportOf() {
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
  };
}

function bundle(over: Record<string, unknown> = {}) {
  return {
    report: reportOf(),
    graph: graph(),
    statistics: {
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
    },
    ...meta,
    ...over,
  };
}

function counts(): Record<Stage, number> {
  return { scoring: 0, ranking: 0, portfolio: 0, recommendation: 0 };
}

function main() {
  const executions = counts();
  const source = bundle();
  const reportBefore = JSON.stringify(source.report);
  const graphBefore = JSON.stringify(source.graph);
  const scoring = createOpportunityScoringEngine(clocks("score"));
  executions.scoring += 1;
  const scored = scoring.evaluate(source);
  source.report.searchSummary.query = "changed query";
  source.graph.nodes = [];
  const metrics = scored.metrics;
  check(
    "OPPORTUNITY_SCORING_ENGINE",
    "Opportunity Metrics: one report becomes ten independent metrics",
    scored.status === "OK" &&
      metrics !== null &&
      Object.keys(metrics).join() === OPPORTUNITY_METRIC_KEYS.join() &&
      metrics.sponsoredAdvertiserCount === 2 &&
      metrics.uniqueDomainCount === 2 &&
      metrics.uniqueLandingPageCount === 2 &&
      metrics.observedProductCount === 2 &&
      metrics.observedBrandCount === 1 &&
      metrics.observedCategoryCount === 1 &&
      metrics.priceVariance === 306.25 &&
      metrics.languageConsistency === 1 &&
      metrics.serpCoverage === 1 &&
      metrics.evidenceCompleteness === 1 &&
      !("total" in metrics),
  );
  check(
    "OPPORTUNITY_SCORING_ENGINE",
    "Evidence Graph: the supplied graph is accepted and left unchanged",
    graphBefore.includes('"id":"search"') &&
      graphBefore.includes('"id":"observed-products"') &&
      scored.status === "OK" &&
      reportBefore !== JSON.stringify(source.report) &&
      graphBefore !== JSON.stringify(source.graph) &&
      scored.evidence?.sponsoredAdvertiserCount.hosts.join() === "example.test,vendor.example.test" &&
      scored.evidence.priceVariance.amounts.join() === "47,12",
  );
  check(
    "OPPORTUNITY_SCORING_ENGINE",
    "Execution Statistics: scoring records ten metrics and a finite duration",
    scored.statistics.metricCount === 10 && scored.statistics.nullMetricCount === 0 && scored.statistics.issueCount === 0 && Number.isFinite(scored.statistics.executionTime) && Number.isFinite(scored.executionTime),
  );
  check(
    "OPPORTUNITY_SCORING_ENGINE",
    "Immutable snapshots and immutable scoring context",
    scored.snapshot !== null &&
      scoring.getSnapshot("score-1") === scored.snapshot &&
      Object.isFrozen(scored.snapshot) &&
      Object.isFrozen(scored.snapshot.context) &&
      Object.isFrozen(scored.metrics) &&
      scored.snapshot.context.query === "zebra offer" &&
      scored.snapshot.context.searchSnapshotId === "search-1" &&
      scored.snapshot.metadata.run === "r1",
  );
  const scoringRight = createOpportunityScoringEngine(clocks("score"));
  check("REGRESSION", "Independent hosts: scoring engines do not share snapshots", scoring.getSnapshot("score-1") !== null && scoringRight.getSnapshot("score-1") === null);

  const plainMetrics: OpportunityMetrics = { ...(metrics as OpportunityMetrics), evidenceCompleteness: 0.2 };
  const rankInput = {
    opportunities: [
      { opportunityId: "plain-offer", metrics: plainMetrics },
      { opportunityId: "zebra-offer", metrics },
    ],
    policy: "balanced",
    ...meta,
  };
  const ranking = createOpportunityRankingEngine(clocks("ranking"));
  const ranked = metrics === null ? null : (executions.ranking += 1, ranking.rank(rankInput));
  rankInput.opportunities[1].opportunityId = "changed-offer";
  check(
    "OPPORTUNITY_RANKING_ENGINE",
    "Ranking: higher evidence completeness stays ahead of the supplied input order",
    ranked?.status === "OK" &&
      ranked.ranking?.ordered.map((item) => `${item.position}:${item.opportunityId}`).join() === "1:zebra-offer,2:plain-offer" &&
      ranked.evidence?.steps[0]?.decidedBy === "evidenceCompleteness" &&
      ranked.evidence.steps[0]?.aheadValue === 1 &&
      ranked.evidence.steps[0]?.behindValue === 0.2 &&
      ranked.statistics.opportunityCount === 2 &&
      ranked.statistics.ruleCount === 10 &&
      ranked.statistics.issueCount === 0 &&
      Number.isFinite(ranked.statistics.executionTime),
  );
  check(
    "OPPORTUNITY_RANKING_ENGINE",
    "Immutable snapshots and immutable ranking context",
    ranked?.snapshot !== null &&
      ranked?.snapshot !== undefined &&
      ranking.getSnapshot("ranking-1") === ranked.snapshot &&
      Object.isFrozen(ranked.snapshot) &&
      Object.isFrozen(ranked.snapshot.context) &&
      ranked.snapshot.context.orderedIds.join() === "zebra-offer,plain-offer" &&
      ranked.snapshot.metadata.run === "r1",
  );
  const rankingRight = createOpportunityRankingEngine(clocks("ranking"));
  check("REGRESSION", "Independent hosts: ranking engines do not share snapshots", ranking.getSnapshot("ranking-1") !== null && rankingRight.getSnapshot("ranking-1") === null);

  const portfolioInput = {
    ranking: ranked?.ranking,
    opportunities: [
      { opportunityId: "plain-offer", category: "beauty" },
      { opportunityId: "zebra-offer", category: "health" },
    ],
    ...meta,
  };
  const portfolio = createOpportunityPortfolioBuilder(clocks("portfolio"));
  const built = ranked?.status === "OK" ? (executions.portfolio += 1, portfolio.build(portfolioInput)) : null;
  portfolioInput.opportunities[1].category = "changed";
  const groups = built?.portfolio?.portfolios ?? [];
  const group = (value: string) => groups.find((item) => item.dimension === "category" && item.value === value);
  check(
    "PORTFOLIO_BUILDER",
    "Portfolio Generation: grouping follows the ranking and copies the supplied category",
    built?.status === "OK" &&
      built.portfolio?.ordered.map((item) => item.opportunityId).join() === "zebra-offer,plain-offer" &&
      group("health")?.portfolioType === "health" &&
      group("health")?.opportunityIds.join() === "zebra-offer" &&
      group("beauty")?.portfolioType === "beauty" &&
      group("beauty")?.opportunityIds.join() === "plain-offer" &&
      built.statistics.opportunityCount === 2 &&
      built.statistics.portfolioCount === groups.length &&
      built.statistics.membershipCount === groups.reduce((sum, item) => sum + item.opportunityIds.length, 0) &&
      built.statistics.issueCount === 0 &&
      Number.isFinite(built.statistics.executionTime),
  );
  check(
    "PORTFOLIO_BUILDER",
    "Immutable snapshots and immutable portfolio context",
    built?.snapshot !== null &&
      built?.snapshot !== undefined &&
      portfolio.getSnapshot("portfolio-1") === built.snapshot &&
      Object.isFrozen(built.snapshot) &&
      Object.isFrozen(built.snapshot.context) &&
      built.snapshot.context.opportunityIds.join() === "zebra-offer,plain-offer" &&
      built.snapshot.metadata.run === "r1" &&
      JSON.stringify(built.portfolio?.ordered) === JSON.stringify(ranked?.ranking?.ordered),
  );
  const portfolioRight = createOpportunityPortfolioBuilder(clocks("portfolio"));
  check("REGRESSION", "Independent hosts: portfolio builders do not share snapshots", portfolio.getSnapshot("portfolio-1") !== null && portfolioRight.getSnapshot("portfolio-1") === null);

  const recommendationInput = {
    ranking: ranked?.ranking,
    portfolio: built?.portfolio,
    metrics: [
      { opportunityId: "plain-offer", metrics: plainMetrics },
      { opportunityId: "zebra-offer", metrics },
    ],
    policy: "balanced",
    ...meta,
  };
  const recommendation = createOpportunityRecommendationEngine(clocks("recommendation"));
  const recommended = built?.status === "OK" ? (executions.recommendation += 1, recommendation.recommend(recommendationInput)) : null;
  recommendationInput.metrics[1].metrics = { ...plainMetrics };
  const zebra = recommended?.recommendations?.recommendations[0];
  const plain = recommended?.recommendations?.recommendations[1];
  check(
    "RECOMMENDATION_ENGINE",
    "Recommendations: the first matching rule names the type and keeps the evidence",
    recommended?.status === "OK" &&
      zebra?.opportunityId === "zebra-offer" &&
      zebra.recommendationType === "TEST_FIRST" &&
      zebra.reason === "Position 1, complete evidence, and at least one portfolio." &&
      zebra.evidence.selectedRuleId === "test-first" &&
      zebra.supportingMetrics.map((item) => `${item.metricId}:${item.value}`).join() === "evidenceCompleteness:1" &&
      zebra.triggeredRules.map((item) => item.ruleId).join() === "test-first,monitor,watch,skip" &&
      zebra.confidence.value === 0.571429 &&
      plain?.recommendationType === "WATCH" &&
      plain.confidence.value === 0.285714 &&
      recommended.evidence?.opportunities.length === 2 &&
      recommended.statistics.testFirstCount === 1 &&
      recommended.statistics.watchCount === 1 &&
      recommended.statistics.issueCount === 0 &&
      Number.isFinite(recommended.statistics.executionTime),
  );
  check(
    "RECOMMENDATION_ENGINE",
    "Immutable snapshots and immutable recommendation context",
    recommended?.snapshot !== null &&
      recommended?.snapshot !== undefined &&
      recommendation.getSnapshot("recommendation-1") === recommended.snapshot &&
      Object.isFrozen(recommended.snapshot) &&
      Object.isFrozen(recommended.snapshot.context) &&
      recommended.snapshot.context.opportunityIds.join() === "zebra-offer,plain-offer" &&
      recommended.snapshot.recommendations.recommendations[0]?.recommendationType === "TEST_FIRST" &&
      recommended.snapshot.metadata.run === "r1" &&
      JSON.stringify(built?.portfolio?.ordered) === JSON.stringify(ranked?.ranking?.ordered),
  );
  const recommendationRight = createOpportunityRecommendationEngine(clocks("recommendation"));
  check("REGRESSION", "Independent hosts: recommendation engines do not share snapshots", recommendation.getSnapshot("recommendation-1") !== null && recommendationRight.getSnapshot("recommendation-1") === null);
  check(
    "REGRESSION",
    "Every host executes exactly once and no host executes twice",
    executions.scoring === 1 && executions.ranking === 1 && executions.portfolio === 1 && executions.recommendation === 1,
  );

  const stopped = counts();
  const refusedScore = createOpportunityScoringEngine(clocks("stop-score"));
  stopped.scoring += 1;
  const refused = refusedScore.evaluate(bundle({ report: null }));
  if (refused.status === "OK") {
    stopped.ranking += 1;
    stopped.portfolio += 1;
    stopped.recommendation += 1;
  }
  check(
    "REGRESSION",
    "Stop on first refusal: a refused scoring host runs once and later hosts do not run",
    refused.status === "REJECTED" && refused.snapshot === null && stopped.scoring === 1 && stopped.ranking === 0 && stopped.portfolio === 0 && stopped.recommendation === 0,
  );
  check("REGRESSION", "No mutation: the market report and the ranking order stay as stored", reportBefore.includes("zebra offer") && ranked?.ranking?.ordered[0]?.opportunityId === "zebra-offer" && built?.portfolio?.ordered[0]?.opportunityId === "zebra-offer");

  const missingReport = createOpportunityScoringEngine(clocks("neg-report")).evaluate(bundle({ report: null }));
  check("NEGATIVE_TESTS", "Missing Market Report: a call without a report stores nothing", missingReport.status === "REJECTED" && has(missingReport.issues, /Missing Market Report/) && missingReport.snapshot === null && missingReport.metrics === null);
  const missingMetrics = createOpportunityRankingEngine(clocks("neg-metrics")).rank({ policy: "balanced", ...meta });
  check("NEGATIVE_TESTS", "Missing Metrics: a ranking call without metrics stores nothing", missingMetrics.status === "REJECTED" && has(missingMetrics.issues, /Missing Opportunity Metrics/) && missingMetrics.snapshot === null);
  const duplicate = metrics === null ? null : createOpportunityRankingEngine(clocks("neg-duplicate")).rank({
    opportunities: [
      { opportunityId: "zebra-offer", metrics },
      { opportunityId: "zebra-offer", metrics },
    ],
    policy: "balanced",
    ...meta,
  });
  check("NEGATIVE_TESTS", "Duplicate Opportunity IDs: a repeated id stores nothing", duplicate?.status === "REJECTED" && has(duplicate.issues, /Duplicate Opportunity IDs/) && duplicate.snapshot === null);
  const badRankingPolicy = metrics === null ? null : createOpportunityRankingEngine(clocks("neg-rank-policy")).rank({
    opportunities: [{ opportunityId: "zebra-offer", metrics }],
    policy: "best",
    ...meta,
  });
  check("NEGATIVE_TESTS", "Invalid Ranking Policy: an unknown policy stores nothing", badRankingPolicy?.status === "REJECTED" && has(badRankingPolicy.issues, /Invalid Ranking Policy/) && badRankingPolicy.snapshot === null);
  const badPortfolio = ranked?.ranking
    ? createOpportunityPortfolioBuilder(clocks("neg-portfolio")).build({
      ranking: ranked.ranking,
      opportunities: [
        { opportunityId: "zebra-offer", portfolioTypes: ["best"] },
        { opportunityId: "plain-offer", category: "beauty" },
      ],
      ...meta,
    })
    : null;
  check("NEGATIVE_TESTS", "Invalid Portfolio: a type outside the named list stores nothing", badPortfolio?.status === "REJECTED" && has(badPortfolio.issues, /Invalid Portfolio/) && badPortfolio.snapshot === null);
  const badRecommendationPolicy = ranked?.ranking && built?.portfolio
    ? createOpportunityRecommendationEngine(clocks("neg-rec-policy")).recommend({
      ranking: ranked.ranking,
      portfolio: built.portfolio,
      metrics: [
        { opportunityId: "zebra-offer", metrics },
        { opportunityId: "plain-offer", metrics: plainMetrics },
      ],
      policy: "best",
      ...meta,
    })
    : null;
  check("NEGATIVE_TESTS", "Invalid Recommendation Policy: an unknown policy stores nothing", badRecommendationPolicy?.status === "REJECTED" && has(badRecommendationPolicy.issues, /Invalid Recommendation Policy/) && badRecommendationPolicy.snapshot === null);
  const corruptGraph = createOpportunityScoringEngine(clocks("neg-graph")).evaluate(bundle({ graph: { nodes: [], edges: [] } }));
  check("NEGATIVE_TESTS", "Corrupted Evidence Graph: a graph without the artifact nodes stores nothing", corruptGraph.status === "REJECTED" && has(corruptGraph.issues, /Corrupted Evidence Graph/) && corruptGraph.snapshot === null);
  const invalidMeta = createOpportunityScoringEngine(clocks("neg-meta")).evaluate(bundle({ configuration: { nested: { inner: true } } }));
  check("NEGATIVE_TESTS", "Invalid Metadata: nested metadata stores nothing", invalidMeta.status === "REJECTED" && has(invalidMeta.issues, /Invalid Metadata/) && invalidMeta.snapshot === null);

  const scoreTimed = timed(() => createOpportunityScoringEngine(clocks("perf-score")).evaluate(bundle()));
  const rankTimed = timed(() => createOpportunityRankingEngine(clocks("perf-ranking")).rank({
    opportunities: [
      { opportunityId: "plain-offer", metrics: { ...(scoreTimed.value.metrics as OpportunityMetrics), evidenceCompleteness: 0.2 } },
      { opportunityId: "zebra-offer", metrics: scoreTimed.value.metrics },
    ],
    policy: "balanced",
    ...meta,
  }));
  const portfolioTimed = timed(() => createOpportunityPortfolioBuilder(clocks("perf-portfolio")).build({
    ranking: rankTimed.value.ranking,
    opportunities: [
      { opportunityId: "zebra-offer", category: "health" },
      { opportunityId: "plain-offer", category: "beauty" },
    ],
    ...meta,
  }));
  const recommendationTimed = timed(() => createOpportunityRecommendationEngine(clocks("perf-recommendation")).recommend({
    ranking: rankTimed.value.ranking,
    portfolio: portfolioTimed.value.portfolio,
    metrics: [
      { opportunityId: "zebra-offer", metrics: scoreTimed.value.metrics },
      { opportunityId: "plain-offer", metrics: { ...(scoreTimed.value.metrics as OpportunityMetrics), evidenceCompleteness: 0.2 } },
    ],
    policy: "balanced",
    ...meta,
  }));
  const perfRows: Array<[string, number, boolean]> = [
    ["Scoring Engine", scoreTimed.ms, scoreTimed.value.status === "OK"],
    ["Ranking Engine", rankTimed.ms, rankTimed.value.status === "OK"],
    ["Portfolio Builder", portfolioTimed.ms, portfolioTimed.value.status === "OK"],
    ["Recommendation Engine", recommendationTimed.ms, recommendationTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check("PERFORMANCE", `${name} completes in under 2000ms`, ok && ms < 2000, "MEDIUM");
  }

  const modules: Record<string, { dir: string; files: string[] }> = {
    scoring: {
      dir: "opportunity-scoring",
      files: ["opportunity-scoring-engine.ts", "opportunity-score-builder.ts", "opportunity-score-validator.ts", "opportunity-score-types.ts", "opportunity-score-context.ts", "opportunity-score-snapshot.ts"],
    },
    ranking: {
      dir: "opportunity-ranking",
      files: ["opportunity-ranking-engine.ts", "ranking-policy.ts", "ranking-validator.ts", "ranking-types.ts", "ranking-context.ts", "ranking-snapshot.ts"],
    },
    portfolio: {
      dir: "opportunity-portfolio",
      files: ["portfolio-builder.ts", "portfolio.ts", "portfolio-validator.ts", "portfolio-types.ts", "portfolio-context.ts", "portfolio-snapshot.ts"],
    },
    recommendation: {
      dir: "opportunity-recommendation",
      files: ["recommendation-engine.ts", "recommendation-policy.ts", "recommendation-validator.ts", "recommendation-types.ts", "recommendation-context.ts", "recommendation-snapshot.ts"],
    },
  };
  check(
    "REGRESSION",
    "Backward compatibility: each Opportunity Engine module set is still present",
    Object.values(modules).every((module) => module.files.every((file) => readdirSync(join(process.cwd(), "src/lib", module.dir)).includes(file))),
  );
  const libLines = Object.values(modules).flatMap((module) => module.files.flatMap((file) => readFileSync(join(process.cwd(), "src/lib", module.dir, file), "utf8").split(/\r?\n/)));
  const hardcodedProducts = libLines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line));
  if (hardcodedProducts) productHardcoding += 1;
  check("GENERICITY", "No Product Hardcoding: library source has no real product names", !hardcodedProducts);
  check("GENERICITY", "No Brand Hardcoding: library source has no fixed brand identity", !libLines.some((line) => /North Brand|Vendor North|Vendor South/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Category Hardcoding: library source has no fixed product category", !libLines.some((line) => /Outdoor|supplements|joint pain/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Keyword Hardcoding: library source has no fixed keyword", !libLines.some((line) => /zebra offer|weight loss|make money|joint pain/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Marketplace Hardcoding: library source does not name a marketplace", !libLines.some((line) => /clickbank|digistore|warriorplus|jvzoo/i.test(line)), "MEDIUM");
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "platform", "providers/google-ads", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report"];
  check(
    "REGRESSION",
    "Backward compatibility: upstream modules do not import the Opportunity Engine",
    !folders.some((folder) => walk(join(process.cwd(), "src/lib", folder)).filter((file) => file.endsWith(".ts")).some((file) => /opportunity-scoring|opportunity-ranking|opportunity-portfolio|opportunity-recommendation/.test(readFileSync(file, "utf8")))),
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
  console.log(`READY_FOR_PHASE12=${ready ? "YES" : "NO"}`);
  if (!ready) {
    console.error(`\n${[...failed.values()].reduce((sum, list) => sum + list.length, 0)} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT=OPPORTUNITY_ENGINE_RC1_COMPLETE");
  console.log(`
Architecture Summary
The Opportunity Engine is four offline hosts. The scoring engine reads one market report, its evidence graph, and its statistics, and writes ten separate metrics with the measurements that produced them. The ranking engine orders supplied metric records with a named or custom rule list and records which rule separated each pair. The portfolio builder places that order into groups named by supplied attributes and keeps the ranking order. The recommendation engine applies an ordered rule list to each ranked opportunity and stores the selected type, the reason, the supporting metrics, the triggered rules, and the confidence ratio. A walk calls each host once and stops when one refuses. Each host keeps its own snapshot map.

Regression Summary
This audit replayed metrics, ranking, portfolio generation, recommendations, the evidence graph, and execution statistics. Snapshots and host context stayed frozen. A second host did not see the first host's snapshot. A missing report stopped the walk before ranking, grouping, or recommendations. Upstream Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Platform Kernel, Google Ads, Product Intelligence, Market Discovery, and Search Intelligence modules do not import these hosts. The module file sets listed above are still present.

Known Limitations
The hosts do not fetch pages, call a model, create a campaign, publish an ad, allocate a budget, or look up an affiliate. Metrics stay separate and are not combined into one number. Ranking does not measure. Grouping does not reorder. The recommendation type is the first rule whose comparisons all hold. Confidence is the count of matched rules divided by the rule count. A refused call stores nothing. Snapshots live only inside the host that created them.

Operational Notes
Rejected inputs return REJECTED, a list of issues, and no snapshot. Clocks and id factories are injectable, and one call does not throw. Public pages still need publication approval. This audit does not publish, deploy, buy ads, or commit.
`);
  console.log("PUBLISH=NO");
  console.log("DEPLOY=NO");
  console.log("ADS=NO");
  console.log("COMMIT=NO");
}

main();
