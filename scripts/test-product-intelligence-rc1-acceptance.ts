/**
 * Product Intelligence — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createClickBankImporter } from "../src/lib/product-intelligence/clickbank-importer.ts";
import { createLandingPageIntelligence } from "../src/lib/product-intelligence/landing-page-intelligence.ts";
import { createGoogleSearchIntelligence } from "../src/lib/product-intelligence/google-search-intelligence.ts";
import { createCompetitionIntelligence } from "../src/lib/product-intelligence/competition-intelligence.ts";
import { createCommercialIntelligence } from "../src/lib/product-intelligence/commercial-intelligence.ts";
import { createProductIntelligenceReport } from "../src/lib/product-intelligence/product-intelligence-report.ts";
import { createProductOpportunityAdapter } from "../src/lib/product-intelligence/product-opportunity-adapter.ts";
import { createProductAnalysisPipeline } from "../src/lib/product-intelligence/product-analysis-pipeline.ts";
import { PRODUCT_ANALYSIS_STAGES } from "../src/lib/product-intelligence/product-analysis-snapshot.ts";
import { createProductRecommendationEngine } from "../src/lib/product-intelligence/product-recommendation-engine.ts";
import { createProductBatchAnalyzer } from "../src/lib/product-intelligence/product-batch-analyzer.ts";
import { createProductPortfolioOptimizer } from "../src/lib/product-intelligence/product-portfolio-optimizer.ts";

const GATES = [
  "CLICKBANK_IMPORTER",
  "LANDING_PAGE_INTELLIGENCE",
  "GOOGLE_SEARCH_INTELLIGENCE",
  "COMPETITION_INTELLIGENCE",
  "COMMERCIAL_INTELLIGENCE",
  "PRODUCT_REPORT",
  "OPPORTUNITY_INTEGRATION",
  "END_TO_END_PIPELINE",
  "RECOMMENDATION_ENGINE",
  "BATCH_ANALYZER",
  "PORTFOLIO_OPTIMIZER",
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
async function timedAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
const meta = {
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "OFFLINE" },
};

function marketHtml(name: string, vendor: string, category: string) {
  return `
<dl>
  <dt>Product Name</dt><dd>${name}</dd>
  <dt>Vendor</dt><dd>${vendor}</dd>
  <dt>Vendor ID</dt><dd>${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</dd>
  <dt>Category</dt><dd>${category}</dd>
  <dt>Gravity</dt><dd>12.5</dd>
  <dt>Initial $/sale</dt><dd>$47.00</dd>
  <dt>Avg $/sale</dt><dd>$51.25</dd>
  <dt>Avg $/rebill</dt><dd>$19.00</dd>
  <dt>Commission Type</dt><dd>recurring</dd>
  <dt>Language</dt><dd>English</dd>
  <dt>Affiliate Page</dt><dd>https://example.test/offer</dd>
  <dt>Support URL</dt><dd>https://example.test/support</dd>
  <dt>Refund Policy</dt><dd>60-day refund window as stated by the vendor</dd>
  <dt>Description</dt><dd>A restated marketplace description.</dd>
  <dt>Disclaimer</dt><dd>Statements on the marketplace page are seller claims.</dd>
  <dt>Affiliate Resources</dt><dd>https://example.test/resources/one</dd>
</dl>`;
}
function landingHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <title>Offer page</title>
  <meta name="description" content="A restated destination page.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.test/offer">
</head>
<body>
  <h1 data-field="headline">Offer page</h1>
  <a data-field="primaryCta" class="cta" href="#buy">Get the offer</a>
  <p data-field="price">$47.00</p>
  <p data-field="guarantee">60-day refund as stated on the page.</p>
</body>
</html>`;
}
function searchHtml() {
  return `<div>
  <a data-field="organic" href="https://example.test/offer">A restated organic result</a>
  <a data-field="officialWebsite" href="https://example.test/offer">Official site</a>
  <a data-field="marketplace" href="https://example.test/marketplace/item">Marketplace listing</a>
  <a data-field="sponsored" data-advertiser="official" href="https://example.test/offer">Official</a>
  <a data-field="sponsored" data-advertiser="affiliate" href="https://hops.example.test/a">Affiliate</a>
</div>`;
}
function productInput(name: string, id: string, vendor = "Vendor North", category = "Outdoor") {
  return {
    marketplaceUrl: `https://example.test/marketplace/${id}`,
    marketplaceProductId: id,
    rawHtml: marketHtml(name, vendor, category),
    landingHtml: landingHtml(),
    searchContext: searchHtml(),
  };
}

async function main() {
  const importInput = {
    marketplaceUrl: "https://example.test/marketplace/alpha-1",
    marketplaceProductId: "alpha-1",
    rawHtml: marketHtml("Alpha Tonic", "Vendor North", "Outdoor"),
    ...meta,
  };
  const importBefore = JSON.stringify(importInput);
  const importer = createClickBankImporter(clocks("import"));
  const imported = importer.import(importInput);
  const facts = asRecord(imported.facts);
  check("CLICKBANK_IMPORTER", "Importer: a marketplace record imports frozen ProductFacts", imported.status === "OK" && imported.facts !== null && imported.snapshot !== null && Object.isFrozen(imported.facts) && Object.isFrozen(imported.snapshot));
  check("CLICKBANK_IMPORTER", "Importer: product, vendor, category, gravity, and marketplace URL are restated", facts.productName === "Alpha Tonic" && facts.vendor === "Vendor North" && facts.category === "Outdoor" && facts.marketplaceUrl === importInput.marketplaceUrl && facts.gravity === 12.5);
  check("CLICKBANK_IMPORTER", "Importer: the stored snapshot is the one returned", importer.getSnapshot("import-1") === imported.snapshot);

  const otherCategory = createClickBankImporter(clocks("import")).import({
    ...importInput,
    marketplaceProductId: "beta-1",
    rawHtml: marketHtml("Beta Capsule", "Vendor South", "Kitchen"),
  });
  const otherFacts = asRecord(otherCategory.facts);
  check("GENERICITY", "No Vendor Hardcoding: a second vendor is restated", otherFacts.vendor === "Vendor South", "MEDIUM");
  check("GENERICITY", "No Category Hardcoding: a second category is restated", otherFacts.category === "Kitchen", "MEDIUM");
  check("GENERICITY", "No Product Hardcoding: a second product name is restated", otherFacts.productName === "Beta Capsule");
  check("GENERICITY", "No Marketplace Mutation: the supplied URL and HTML stay on the input", importBefore === JSON.stringify(importInput) && facts.marketplaceUrl === "https://example.test/marketplace/alpha-1");

  const landingInput = { landingPageUrl: "https://example.test/offer", rawHtml: landingHtml(), ...meta };
  const landingBefore = JSON.stringify(landingInput);
  const landingHost = createLandingPageIntelligence(clocks("page"));
  const landing = landingHost.analyze(landingInput);
  check("LANDING_PAGE_INTELLIGENCE", "Landing Page: observed page evidence is frozen", landing.status === "OK" && landing.evidence !== null && landing.snapshot !== null && Object.isFrozen(landing.evidence) && landing.evidence.origin === "OBSERVED" && landing.evidence.provenance === "DIRECT_SOURCE");
  check("LANDING_PAGE_INTELLIGENCE", "Landing Page: headline and price visibility are restated", landing.evidence?.headline === "Offer page" && landing.evidence.priceVisibility === "PRESENT");
  check("REGRESSION", "No upstream mutation: landing analysis leaves its input unchanged", landingBefore === JSON.stringify(landingInput), "CRITICAL");

  const searchInput = {
    productFacts: imported.facts,
    productName: facts.productName,
    vendor: facts.vendor,
    category: facts.category,
    landingPage: facts.affiliatePage,
    searchContext: searchHtml(),
    ...meta,
  };
  const searchBefore = JSON.stringify(searchInput);
  const search = createGoogleSearchIntelligence(clocks("search")).analyze(searchInput);
  check("GOOGLE_SEARCH_INTELLIGENCE", "Search Intelligence: search evidence is frozen", search.status === "OK" && search.evidence !== null && search.snapshot !== null && Object.isFrozen(search.evidence) && search.evidence.provenance === "DIRECT_SOURCE");
  check("GOOGLE_SEARCH_INTELLIGENCE", "Search Intelligence: result presence is restated from the supplied context", search.evidence?.searchResultPresence === "PRESENT" && search.evidence.officialWebsite === "https://example.test/offer");
  check("REGRESSION", "No upstream mutation: search analysis leaves ProductFacts unchanged", searchBefore === JSON.stringify(searchInput) && facts.productName === "Alpha Tonic", "CRITICAL");

  const competitionInput = {
    productFacts: imported.facts,
    landingPageEvidence: landing.evidence,
    searchEvidence: search.evidence,
    ...meta,
  };
  const competitionBefore = JSON.stringify(competitionInput);
  const competition = createCompetitionIntelligence(clocks("competition")).analyze(competitionInput);
  check("COMPETITION_INTELLIGENCE", "Competition: competition evidence is frozen", competition.status === "OK" && competition.evidence !== null && competition.snapshot !== null && Object.isFrozen(competition.evidence));
  check("COMPETITION_INTELLIGENCE", "Competition: advertiser presence is an observed count", typeof competition.evidence?.numberOfAdvertisers === "number" && (competition.evidence.brandPresence === "PRESENT" || competition.evidence.brandPresence === "ABSENT"));
  check("REGRESSION", "No upstream mutation: competition analysis leaves search evidence unchanged", competitionBefore === JSON.stringify(competitionInput), "CRITICAL");

  const commercialInput = {
    productFacts: imported.facts,
    landingPageEvidence: landing.evidence,
    searchEvidence: search.evidence,
    competitionEvidence: competition.evidence,
    ...meta,
  };
  const commercialBefore = JSON.stringify(commercialInput);
  const commercial = createCommercialIntelligence(clocks("commercial")).analyze(commercialInput);
  check("COMMERCIAL_INTELLIGENCE", "Commercial Intelligence: commercial evidence is frozen", commercial.status === "OK" && commercial.evidence !== null && commercial.snapshot !== null && Object.isFrozen(commercial.evidence));
  check("COMMERCIAL_INTELLIGENCE", "Commercial Intelligence: purchase intent is an observed presence", (commercial.evidence?.directPurchaseIntent === "PRESENT" || commercial.evidence?.directPurchaseIntent === "ABSENT") && commercial.evidence.provenance === "DIRECT_SOURCE");
  check("REGRESSION", "No upstream mutation: commercial analysis leaves competition evidence unchanged", commercialBefore === JSON.stringify(commercialInput), "CRITICAL");

  const reportInput = {
    productFacts: imported.facts,
    landingPageEvidence: landing.evidence,
    searchEvidence: search.evidence,
    competitionEvidence: competition.evidence,
    commercialEvidence: commercial.evidence,
    ...meta,
  };
  const reportBefore = JSON.stringify(reportInput);
  const reportHost = createProductIntelligenceReport(clocks("report"));
  const reported = reportHost.build(reportInput);
  const graphNodes = reported.graph?.nodes ?? [];
  check("PRODUCT_REPORT", "Product Report: the report and evidence graph are frozen", reported.status === "OK" && reported.report !== null && reported.graph !== null && reported.snapshot !== null && Object.isFrozen(reported.report) && Object.isFrozen(reported.graph));
  check("PRODUCT_REPORT", "Evidence Graph: five observed nodes are present", graphNodes.length === 5 && graphNodes.every((node) => node.present === "PRESENT") && reported.report?.missingEvidence.length === 0 && reported.report.origin === "OBSERVED" && reported.report.provenance === "DIRECT_SOURCE");
  check("REGRESSION", "No upstream mutation: the report leaves the evidence records unchanged", reportBefore === JSON.stringify(reportInput), "CRITICAL");

  const adaptInput = {
    productIntelligenceReport: reported.report,
    evidenceGraph: reported.graph,
    productFacts: imported.facts,
    landingPageEvidence: landing.evidence,
    searchEvidence: search.evidence,
    competitionEvidence: competition.evidence,
    commercialEvidence: commercial.evidence,
    ...meta,
  };
  const adaptBefore = JSON.stringify(adaptInput);
  const adapted = createProductOpportunityAdapter(clocks("mapping")).adapt(adaptInput);
  check("OPPORTUNITY_INTEGRATION", "Opportunity Integration: discovery and opportunity contexts are frozen", adapted.status === "OK" && adapted.discoveryContext !== null && adapted.opportunityContext !== null && adapted.evidenceProvider !== null && adapted.snapshot !== null && Object.isFrozen(adapted.discoveryContext));
  check("OPPORTUNITY_INTEGRATION", "Opportunity Integration: the candidate id is the product slug and the status stays NEW", adapted.discoveryContext?.id === "alpha-tonic" && adapted.discoveryContext.source === "product-intelligence" && adapted.discoveryContext.status === "NEW");
  check("REGRESSION", "No upstream mutation: the adapter leaves the report unchanged", adaptBefore === JSON.stringify(adaptInput), "CRITICAL");

  const pipelineInput = { ...productInput("Alpha Tonic", "alpha-1"), ...meta };
  const pipelineBefore = JSON.stringify(pipelineInput);
  const pipelineHost = createProductAnalysisPipeline(clocks("analysis"));
  const pipeline = await pipelineHost.run(pipelineInput);
  const stageCounts = pipeline.executions.map((entry) => `${entry.stage}:${entry.count}`).join();
  check("END_TO_END_PIPELINE", "End-to-End Pipeline: one walk finishes with a frozen snapshot", pipeline.status === "OK" && pipeline.analysis !== null && pipeline.snapshot !== null && Object.isFrozen(pipeline.analysis) && Object.isFrozen(pipeline.snapshot) && pipeline.snapshot.productName === "Alpha Tonic");
  check("END_TO_END_PIPELINE", "End-to-End Pipeline: every stage runs once, including the in-memory ads draft", stageCounts === PRODUCT_ANALYSIS_STAGES.map((stage) => `${stage}:1`).join() && asRecord(pipeline.analysis?.googleAdsDraft).id === "campaign-1");
  check("REGRESSION", "No upstream mutation: the pipeline leaves the supplied HTML unchanged", pipelineBefore === JSON.stringify(pipelineInput), "CRITICAL");
  check("REGRESSION", "Immutable snapshots: the pipeline snapshot cannot be assigned into", (() => {
    try {
      if (pipeline.snapshot) (pipeline.snapshot.productName as string) = "hacked";
    } catch {
      /* frozen */
    }
    return pipeline.snapshot?.productName === "Alpha Tonic";
  })(), "CRITICAL");

  const analysis = pipeline.analysis;
  const recommendInput = {
    productIntelligenceReport: analysis?.report,
    evidenceGraph: analysis?.evidenceGraph,
    discoveryAnalysis: analysis?.discovery,
    opportunityAnalysis: analysis?.opportunityAnalysis,
    trafficAnalysis: analysis?.trafficAnalysis,
    decisionAnalysis: analysis?.decisionAnalysis,
    ...meta,
  };
  const recommendBefore = JSON.stringify(recommendInput);
  const recommendHost = createProductRecommendationEngine(clocks("recommendation"));
  const recommended = recommendHost.recommend(recommendInput);
  check("RECOMMENDATION_ENGINE", "Recommendation: the pipeline result ranks without approval", recommended.status === "OK" && recommended.recommendation !== null && recommended.snapshot !== null && Object.isFrozen(recommended.recommendation) && recommended.recommendation.recommendations.length === 1 && !JSON.stringify(recommended.recommendation).includes("APPROVED"));
  check("RECOMMENDATION_ENGINE", "Recommendation: the candidate and a confidence in range are restated", recommended.recommendation?.recommendations[0]?.candidateId === "alpha-tonic" && (recommended.recommendation?.recommendations[0]?.confidence ?? -1) >= 0 && (recommended.recommendation?.recommendations[0]?.confidence ?? 2) <= 1);
  check("REGRESSION", "No upstream mutation: recommendation leaves Discovery, Opportunity, Traffic, and Decision unchanged", recommendBefore === JSON.stringify(recommendInput), "CRITICAL");

  const batchInput = {
    products: [productInput("Alpha Tonic", "alpha-1", "Vendor North", "Outdoor"), productInput("Beta Capsule", "beta-1", "Vendor South", "Kitchen")],
    ...meta,
  };
  const batchBefore = JSON.stringify(batchInput);
  const batchHost = createProductBatchAnalyzer(clocks("batch"));
  const batched = await batchHost.analyze(batchInput);
  check("BATCH_ANALYZER", "Batch Analysis: two products finish in one frozen batch", batched.status === "OK" && batched.analysis !== null && batched.snapshot !== null && Object.isFrozen(batched.snapshot) && batched.statistics?.succeededCount === 2 && batched.analysis.rankedProducts.length === 2);
  check("BATCH_ANALYZER", "Batch Analysis: ranking positions are contiguous and do not approve", batched.analysis?.rankedProducts.map((item) => item.rankingPosition).join() === "1,2" && !JSON.stringify(batched.analysis).includes("APPROVED"));
  check("REGRESSION", "No upstream mutation: the batch leaves each product record unchanged", batchBefore === JSON.stringify(batchInput), "CRITICAL");
  check("REGRESSION", "Independent modules: a second batch host does not see the first snapshot", (await createProductBatchAnalyzer(clocks("batch")).analyze(null)).snapshot === null && batchHost.getSnapshot("batch-1")?.productCount === 2, "CRITICAL");

  const portfolioProducts = (batched.analysis?.products ?? []).filter((item) => item.status === "OK").map((item) => ({
    productIntelligenceReport: item.report,
    evidenceGraph: item.evidenceGraph,
    discoveryAnalysis: item.discovery,
    opportunityAnalysis: item.opportunityAnalysis,
    trafficAnalysis: item.trafficAnalysis,
    decisionAnalysis: item.decisionAnalysis,
  }));
  const portfolioInput = {
    products: portfolioProducts,
    recommendationReports: batched.analysis?.recommendations ? [batched.analysis.recommendations] : [],
    ...meta,
  };
  const portfolioBefore = JSON.stringify(portfolioInput);
  const portfolioHost = createProductPortfolioOptimizer(clocks("portfolio"));
  const portfolio = portfolioHost.optimize(portfolioInput);
  if (portfolio.status !== "OK") console.log(JSON.stringify(portfolio.issues));
  check("PORTFOLIO_OPTIMIZER", "Portfolio Ranking: compared reports produce a frozen ranked portfolio", portfolio.status === "OK" && portfolio.portfolio !== null && portfolio.snapshot !== null && Object.isFrozen(portfolio.portfolio) && Object.isFrozen(portfolio.snapshot) && portfolio.portfolio.ranking.length === 2);
  check("PORTFOLIO_OPTIMIZER", "Portfolio Ranking: statistics and best or weak groups are present", portfolio.statistics?.productCount === 2 && portfolio.portfolio?.bestOpportunities !== undefined && portfolio.portfolio.weakOpportunities !== undefined && portfolio.portfolio.riskSummary !== undefined && portfolio.portfolio.confidenceSummary !== undefined);
  check("REGRESSION", "No upstream mutation: the portfolio leaves the batch reports unchanged", portfolioBefore === JSON.stringify(portfolioInput), "CRITICAL");
  check("REGRESSION", "Immutable snapshots: the portfolio snapshot cannot be assigned into", (() => {
    try {
      if (portfolio.snapshot) (portfolio.snapshot.productName as string) = "hacked";
    } catch {
      /* frozen */
    }
    return portfolio.snapshot?.productName !== "hacked" && portfolio.snapshot?.productName !== undefined;
  })(), "CRITICAL");
  check("REGRESSION", "Independent modules: portfolio hosts do not share snapshots", portfolioHost.getSnapshot("portfolio-1") !== null && createProductPortfolioOptimizer(clocks("portfolio")).getSnapshot("portfolio-1") === null, "CRITICAL");

  const malformed = createClickBankImporter(clocks("import")).import({ ...importInput, marketplaceUrl: "ftp://example.test/marketplace/alpha-1" });
  check("NEGATIVE_TESTS", "Malformed URL: a non-https marketplace URL is rejected with no snapshot", malformed.status === "REJECTED" && has(malformed.issues, /Malformed URL/) && malformed.snapshot === null);
  const duplicateHost = createClickBankImporter(clocks("import"));
  duplicateHost.import(importInput);
  const duplicateImport = duplicateHost.import(importInput);
  const duplicatePortfolio = createProductPortfolioOptimizer(clocks("portfolio")).optimize({
    products: [portfolioProducts[0], portfolioProducts[0]],
    ...meta,
  });
  check("NEGATIVE_TESTS", "Duplicate Product: a repeated product is rejected with no snapshot", duplicateImport.status === "REJECTED" && has(duplicateImport.issues, /Duplicate Import/) && duplicatePortfolio.status === "REJECTED" && has(duplicatePortfolio.issues, /Duplicate Products/) && duplicatePortfolio.snapshot === null);
  const missingPage = createLandingPageIntelligence(clocks("page")).analyze({ landingPageUrl: "https://example.test/offer", rawHtml: "", ...meta });
  const pageOnlyFacts = createProductIntelligenceReport(clocks("report")).build({ productFacts: imported.facts, searchEvidence: search.evidence, ...meta });
  check("NEGATIVE_TESTS", "Missing Landing Page: empty markup is rejected and an omitted page is listed as absent", missingPage.status === "REJECTED" && has(missingPage.issues, /Missing HTML/) && missingPage.snapshot === null && pageOnlyFacts.report?.missingEvidence.includes("LandingPageEvidence") === true);
  const missingSearch = createCompetitionIntelligence(clocks("competition")).analyze({ productFacts: imported.facts, ...meta });
  const searchOmitted = createProductIntelligenceReport(clocks("report")).build({ productFacts: imported.facts, landingPageEvidence: landing.evidence, ...meta });
  check("NEGATIVE_TESTS", "Missing Search Evidence: competition refuses a missing search record and the report lists it absent", missingSearch.status === "REJECTED" && has(missingSearch.issues, /Missing SearchEvidence/) && missingSearch.snapshot === null && searchOmitted.report?.missingEvidence.includes("SearchEvidence") === true);
  const missingCompetition = createCommercialIntelligence(clocks("commercial")).analyze({ productFacts: imported.facts, searchEvidence: search.evidence, ...meta });
  const competitionOmitted = createProductIntelligenceReport(clocks("report")).build({ productFacts: imported.facts, searchEvidence: search.evidence, ...meta });
  check("NEGATIVE_TESTS", "Missing Competition Evidence: commercial intelligence refuses it and the report lists it absent", missingCompetition.status === "REJECTED" && has(missingCompetition.issues, /Missing CompetitionEvidence/) && missingCompetition.snapshot === null && competitionOmitted.report?.missingEvidence.includes("CompetitionEvidence") === true);
  const commercialOmitted = createProductIntelligenceReport(clocks("report")).build({ productFacts: imported.facts, competitionEvidence: competition.evidence, ...meta });
  check("NEGATIVE_TESTS", "Missing Commercial Evidence: an omitted commercial record is listed as absent", commercialOmitted.status === "OK" && commercialOmitted.report?.missingEvidence.includes("CommercialEvidence") === true && commercialOmitted.report.commercialSummary === null);
  const invalidFacts = createProductIntelligenceReport(clocks("report")).build({ productFacts: ["not-a-record"], commercialEvidence: commercial.evidence, ...meta });
  check("NEGATIVE_TESTS", "Invalid ProductFacts: a non-record facts value is rejected with no snapshot", invalidFacts.status === "REJECTED" && has(invalidFacts.issues, /ProductFacts/) && invalidFacts.snapshot === null);
  const invalidMeta = createClickBankImporter(clocks("import")).import({ ...importInput, marketplaceProductId: "meta-1", executionMetadata: { nested: { a: 1 } } });
  check("NEGATIVE_TESTS", "Invalid Metadata: nested metadata is rejected with no snapshot", invalidMeta.status === "REJECTED" && has(invalidMeta.issues, /Invalid Metadata/) && invalidMeta.snapshot === null);
  const corruptReport = reported.report
    ? {
        ...reported.report,
        evidenceGraph: {
          nodes: reported.report.evidenceGraph.nodes.map((node) => (node.kind === "LandingPageEvidence" ? { ...node, present: "ABSENT" } : node)),
          edges: reported.report.evidenceGraph.edges,
        },
      }
    : null;
  const corrupt = createProductPortfolioOptimizer(clocks("portfolio")).optimize({
    products: [{ productIntelligenceReport: corruptReport, evidenceGraph: corruptReport?.evidenceGraph }],
    ...meta,
  });
  check("NEGATIVE_TESTS", "Corrupted Evidence Graph: a graph that disagrees with the report is rejected with no snapshot", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Portfolio/) && corrupt.snapshot === null);

  const importerTimed = timed(() => createClickBankImporter(clocks("perf-import")).import(importInput));
  const landingTimed = timed(() => createLandingPageIntelligence(clocks("perf-page")).analyze(landingInput));
  const searchTimed = timed(() => createGoogleSearchIntelligence(clocks("perf-search")).analyze(searchInput));
  const competitionTimed = timed(() => createCompetitionIntelligence(clocks("perf-competition")).analyze(competitionInput));
  const commercialTimed = timed(() => createCommercialIntelligence(clocks("perf-commercial")).analyze(commercialInput));
  const recommendationTimed = timed(() => createProductRecommendationEngine(clocks("perf-recommendation")).recommend(recommendInput));
  const batchTimed = await timedAsync(() => createProductBatchAnalyzer(clocks("perf-batch")).analyze(batchInput));
  const portfolioTimed = timed(() => createProductPortfolioOptimizer(clocks("perf-portfolio")).optimize(portfolioInput));
  const perfRows: Array<[string, number, boolean]> = [
    ["Importer", importerTimed.ms, importerTimed.value.status === "OK"],
    ["Landing Page", landingTimed.ms, landingTimed.value.status === "OK"],
    ["Search", searchTimed.ms, searchTimed.value.status === "OK"],
    ["Competition", competitionTimed.ms, competitionTimed.value.status === "OK"],
    ["Commercial", commercialTimed.ms, commercialTimed.value.status === "OK"],
    ["Recommendation", recommendationTimed.ms, recommendationTimed.value.status === "OK"],
    ["Batch", batchTimed.ms, batchTimed.value.status === "OK"],
    ["Portfolio", portfolioTimed.ms, portfolioTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check("PERFORMANCE", `${name} completes in under 2000ms`, ok && ms < 2000, "MEDIUM");
  }

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const names = readdirSync(dir);
  const expected: Record<string, string[]> = {
    clickbank: ["clickbank-context.ts", "clickbank-importer.ts", "clickbank-normalizer.ts", "clickbank-parser.ts", "clickbank-types.ts", "clickbank-validator.ts"],
    "landing-page": ["landing-page-context.ts", "landing-page-evidence.ts", "landing-page-intelligence.ts", "landing-page-parser.ts", "landing-page-validator.ts"],
    "google-search": ["google-search-context.ts", "google-search-evidence.ts", "google-search-intelligence.ts", "google-search-parser.ts", "google-search-validator.ts"],
    competition: ["competition-context.ts", "competition-evidence.ts", "competition-intelligence.ts", "competition-parser.ts", "competition-validator.ts"],
    commercial: ["commercial-context.ts", "commercial-evidence.ts", "commercial-intelligence.ts", "commercial-parser.ts", "commercial-validator.ts"],
    report: ["product-intelligence-report.ts", "product-report-builder.ts", "product-report-snapshot.ts", "product-report-statistics.ts", "product-report-validator.ts"],
    opportunity: ["product-opportunity-adapter.ts", "product-opportunity-context.ts", "product-opportunity-mapper.ts", "product-opportunity-snapshot.ts", "product-opportunity-validator.ts"],
    analysis: ["product-analysis-pipeline.ts", "product-analysis-recorder.ts", "product-analysis-runner.ts", "product-analysis-snapshot.ts", "product-analysis-validator.ts"],
    recommendation: ["product-recommendation-engine.ts", "ranking-engine.ts", "recommendation-builder.ts", "recommendation-snapshot.ts", "recommendation-validator.ts"],
    batch: ["batch-context.ts", "batch-runner.ts", "batch-snapshot.ts", "batch-validator.ts", "product-batch-analyzer.ts"],
    portfolio: ["portfolio-builder.ts", "portfolio-ranking.ts", "portfolio-snapshot.ts", "portfolio-validator.ts", "product-portfolio-optimizer.ts"],
  };
  check("REGRESSION", "Backward compatibility: each Product Intelligence module set is still present", Object.values(expected).every((files) => files.every((file) => names.includes(file))), "HIGH");
  const libLines = walk(dir).filter((file) => file.endsWith(".ts")).flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/));
  const hardcodedProducts = libLines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line));
  if (hardcodedProducts) productHardcoding += 1;
  check("GENERICITY", "No Product Hardcoding: library source has no real product names", !hardcodedProducts);
  check("GENERICITY", "No Vendor Hardcoding: library source has no fixed vendor identity", !libLines.some((line) => /Vendor North|Vendor South|vendor-north/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Category Hardcoding: library source has no fixed category", !libLines.some((line) => /Health & Fitness|Health and Fitness|\bKitchen\b|\bOutdoor\b/.test(line)), "MEDIUM");
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "platform", "providers/google-ads"];
  check(
    "REGRESSION",
    "Backward compatibility: upstream modules do not import Product Intelligence",
    !folders.some((folder) => walk(join(process.cwd(), "src/lib", folder)).filter((file) => file.endsWith(".ts")).some((file) => /product-intelligence/.test(readFileSync(file, "utf8")))),
  );

  const dbDir = join(process.cwd(), "data");
  for (const name of readdirSync(dbDir).filter((item) => item.startsWith("presell-os.db"))) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  console.log("");
  for (const gate of GATES) {
    console.log(`${gate}=${failed.has(gate) ? "FAIL" : "PASS"}`);
  }
  const ready = failed.size === 0 && productHardcoding === 0;
  console.log(`PRODUCT_HARDCODING=${productHardcoding === 0 ? "NONE" : "FOUND"}`);
  console.log(`CRITICAL_BUGS=${bugs.CRITICAL}`);
  console.log(`HIGH_BUGS=${bugs.HIGH}`);
  console.log(`MEDIUM_BUGS=${bugs.MEDIUM}`);
  console.log(`LOW_BUGS=${bugs.LOW}`);
  console.log(`READY_FOR_RC1_REPLAY=${ready ? "YES" : "NO"}`);
  if (!ready) {
    console.error(`\n${[...failed.values()].reduce((sum, list) => sum + list.length, 0)} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT=PRODUCT_INTELLIGENCE_RC1_COMPLETE");
  console.log(`
Architecture Summary
Product Intelligence is a chain of offline hosts. The ClickBank importer restates a supplied marketplace page into ProductFacts. Landing page, search, competition, and commercial hosts restate supplied markup and prior evidence into frozen evidence records. The product report aggregates those records into one report and an evidence graph. The opportunity adapter maps that report into Discovery, Opportunity, and evidence-provider shapes without calling those engines. The analysis pipeline walks the same chain through Traffic, Decision, Workflow, the execution planner, and an in-memory Google Ads draft. The recommendation engine and the batch analyzer rank products from those finished records. The portfolio optimizer compares finished reports and does not run the earlier hosts again. Each host keeps its own snapshot map.

Regression Summary
This audit replayed the importer, landing page, search, competition, commercial intelligence, the product report, opportunity integration, the end-to-end pipeline, recommendation, batch analysis, and portfolio ranking. Snapshots stayed frozen. A second host did not see the first host's snapshot. Inputs were unchanged after each call. Upstream Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Platform Kernel, and Google Ads modules do not import Product Intelligence. The module file sets listed above are still present.

Known Limitations
The hosts do not fetch pages, call a model, or write a database. Gravity, presence, advertiser counts, and commercial signals are restated observations, not grades. An omitted optional evidence bundle is listed as absent and is not filled in. A recommendation level does not approve a product. The pipeline can record a decision that is not cleared and still finish that stage. The Google Ads draft stays in memory and is not sent. Snapshots live only inside the host that created them.

Operational Notes
Rejected inputs return REJECTED, a list of issues, and no snapshot. Clocks and id factories are injectable, and one call does not throw. Public pages still need publication approval. This audit does not publish, deploy, buy ads, or commit.
`);
  console.log("PUBLISH=NO");
  console.log("DEPLOY=NO");
  console.log("ADS=NO");
  console.log("COMMIT=NO");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
