import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RANKING_CONTEXT_MEMBERS } from "../src/lib/opportunity-ranking/ranking-context.ts";
import { rulesForPolicy } from "../src/lib/opportunity-ranking/ranking-policy.ts";
import {
  OPPORTUNITY_RANKING_KEYS,
  RANKING_EVIDENCE_KEYS,
  RANKING_EXECUTION_STATISTICS_KEYS,
  RANKING_RESULT_KEYS,
  RANKING_SNAPSHOT_KEYS,
} from "../src/lib/opportunity-ranking/ranking-snapshot.ts";
import {
  OPPORTUNITY_METRIC_KEYS,
  RANKING_ORIGINS,
  RANKING_POLICY_IDS,
  RANKING_PROVENANCE,
  RANKING_STATUSES,
  type OpportunityMetrics,
} from "../src/lib/opportunity-ranking/ranking-types.ts";
import { createOpportunityRankingEngine } from "../src/lib/opportunity-ranking/opportunity-ranking-engine.ts";
import { createOpportunityScoringEngine } from "../src/lib/opportunity-scoring/opportunity-scoring-engine.ts";
import { OPPORTUNITY_COVERAGE_FIELDS } from "../src/lib/opportunity-scoring/opportunity-score-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

function metrics(over: Partial<OpportunityMetrics> = {}): OpportunityMetrics {
  return {
    sponsoredAdvertiserCount: 1,
    uniqueDomainCount: 1,
    uniqueLandingPageCount: 1,
    observedProductCount: 1,
    observedBrandCount: 1,
    observedCategoryCount: 1,
    priceVariance: 0,
    languageConsistency: 1,
    serpCoverage: 1,
    evidenceCompleteness: 1,
    ...over,
  };
}

function opportunity(opportunityId: string, over: Partial<OpportunityMetrics> = {}) {
  return { opportunityId, metrics: metrics(over) };
}

function inputOf(opportunities: ReturnType<typeof opportunity>[], policy: unknown = "balanced", over: Record<string, unknown> = {}) {
  return { opportunities, policy, executionMetadata: { note: "kept" }, ...over };
}

function engine(idFactory?: () => string) {
  let tick = 0;
  return createOpportunityRankingEngine({ now: () => tick++, timestamp: () => T0, idFactory });
}

function idsOf(ranking: { ordered: readonly { opportunityId: string }[] } | null): string {
  return ranking?.ordered.map((item) => item.opportunityId).join() ?? "";
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
  check("statuses are OK and REJECTED", RANKING_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", RANKING_ORIGINS.join() === "OBSERVED" && RANKING_PROVENANCE.join() === "DIRECT_SOURCE");
  check("named policies are balanced, competition first, low competition, and high commercial intent", RANKING_POLICY_IDS.join() === "balanced,competition-first,low-competition,high-commercial-intent");
  check("context members name the metrics and the policy", RANKING_CONTEXT_MEMBERS.join() === "opportunities,policy,executionMetadata,runtimeMetadata,configuration");

  const pair = [
    opportunity("plain-offer", { evidenceCompleteness: 1, sponsoredAdvertiserCount: 1, uniqueDomainCount: 1, priceVariance: 10 }),
    opportunity("zebra-offer", { evidenceCompleteness: 0.4, sponsoredAdvertiserCount: 6, uniqueDomainCount: 4, priceVariance: 1 }),
  ];
  const input = inputOf(pair, "balanced");
  const ranking = engine();
  const balanced = ranking.rank(input);
  pair[0].metrics.sponsoredAdvertiserCount = 99;
  pair[0].opportunityId = "changed-offer";
  input.executionMetadata.note = "changed";
  check(
    "balanced orders by the published metric sequence and stores the deciding evidence",
    balanced.status === "OK" &&
      idsOf(balanced.ranking) === "plain-offer,zebra-offer" &&
      balanced.ranking?.ordered[0]?.position === 1 &&
      balanced.ranking.ordered[1]?.position === 2 &&
      balanced.evidence?.rules[0]?.metricId === "evidenceCompleteness" &&
      balanced.evidence.rules.length === OPPORTUNITY_METRIC_KEYS.length &&
      balanced.evidence.steps[0]?.decidedBy === "evidenceCompleteness" &&
      balanced.evidence.steps[0]?.direction === "higher" &&
      balanced.evidence.steps[0]?.aheadValue === 1 &&
      balanced.evidence.steps[0]?.behindValue === 0.4 &&
      balanced.evidence.nullPlacement === "after-measured" &&
      balanced.evidence.tieBreak === "opportunityId" &&
      balanced.statistics.opportunityCount === 2 &&
      balanced.statistics.ruleCount === 10 &&
      balanced.statistics.tieCount === 0 &&
      Object.keys(balanced.ranking?.ordered[0] ?? {}).join() === "position,opportunityId" &&
      Object.keys(balanced).join() === RANKING_RESULT_KEYS.join() &&
      Object.keys(balanced.statistics).join() === RANKING_EXECUTION_STATISTICS_KEYS.join() &&
      Object.keys(balanced.ranking ?? {}).join() === OPPORTUNITY_RANKING_KEYS.join() &&
      Object.keys(balanced.evidence ?? {}).join() === RANKING_EVIDENCE_KEYS.join() &&
      Object.keys(balanced.snapshot ?? {}).join() === RANKING_SNAPSHOT_KEYS.join(),
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    balanced.snapshot !== null &&
      ranking.getSnapshot("opportunity-ranking-1") === balanced.snapshot &&
      Object.isFrozen(balanced.snapshot) &&
      Object.isFrozen(balanced.ranking) &&
      Object.isFrozen(balanced.evidence) &&
      balanced.snapshot?.context.orderedIds.join() === "plain-offer,zebra-offer" &&
      balanced.snapshot?.metadata.note === "kept" &&
      balanced.evidence?.opportunities[0]?.metrics.sponsoredAdvertiserCount === 1,
  );

  const reversed = engine().rank(inputOf([
    opportunity("zebra-offer", { evidenceCompleteness: 0.4, sponsoredAdvertiserCount: 6, uniqueDomainCount: 4, priceVariance: 1 }),
    opportunity("plain-offer", { evidenceCompleteness: 1, sponsoredAdvertiserCount: 1, uniqueDomainCount: 1, priceVariance: 10 }),
  ], "balanced"));
  check("the same metrics in another input order produce the same ranking", reversed.status === "OK" && idsOf(reversed.ranking) === "plain-offer,zebra-offer" && JSON.stringify(reversed.evidence?.steps) === JSON.stringify(balanced.evidence?.steps));

  const competition = engine().rank(inputOf([
    opportunity("plain-offer", { evidenceCompleteness: 1, sponsoredAdvertiserCount: 1, uniqueDomainCount: 1 }),
    opportunity("zebra-offer", { evidenceCompleteness: 0.4, sponsoredAdvertiserCount: 6, uniqueDomainCount: 4 }),
  ], "competition-first"));
  const low = engine().rank(inputOf([
    opportunity("plain-offer", { evidenceCompleteness: 1, sponsoredAdvertiserCount: 1, uniqueDomainCount: 1 }),
    opportunity("zebra-offer", { evidenceCompleteness: 0.4, sponsoredAdvertiserCount: 6, uniqueDomainCount: 4 }),
  ], "low-competition"));
  const commercial = engine().rank(inputOf([
    opportunity("plain-offer", { observedProductCount: 1, evidenceCompleteness: 1 }),
    opportunity("zebra-offer", { observedProductCount: 4, evidenceCompleteness: 0.2 }),
  ], "high-commercial-intent"));
  check(
    "each named policy orders from its own first rule",
    idsOf(competition.ranking) === "zebra-offer,plain-offer" &&
      competition.evidence?.rules[0]?.metricId === "sponsoredAdvertiserCount" &&
      competition.evidence.rules[0]?.direction === "higher" &&
      idsOf(low.ranking) === "plain-offer,zebra-offer" &&
      low.evidence?.rules[0]?.direction === "lower" &&
      idsOf(commercial.ranking) === "zebra-offer,plain-offer" &&
      commercial.evidence?.rules[0]?.metricId === "observedProductCount" &&
      competition.evidence?.rules.map((rule) => rule.metricId).slice().sort().join() === OPPORTUNITY_METRIC_KEYS.slice().sort().join(),
  );

  const tied = engine().rank(inputOf([
    opportunity("zebra-offer"),
    opportunity("plain-offer"),
  ], "balanced"));
  const tiedAgain = engine().rank(inputOf([
    opportunity("plain-offer"),
    opportunity("zebra-offer"),
  ], "balanced"));
  check(
    "equal metrics are ordered by opportunity id and the evidence says so",
    idsOf(tied.ranking) === "plain-offer,zebra-offer" &&
      idsOf(tiedAgain.ranking) === idsOf(tied.ranking) &&
      tied.evidence?.steps[0]?.decidedBy === "opportunityId" &&
      tied.evidence.steps[0]?.direction === "ascending" &&
      tied.statistics.tieCount === 1,
  );

  const missing = engine().rank(inputOf([
    opportunity("zebra-offer", { priceVariance: null }),
    opportunity("plain-offer", { priceVariance: 10 }),
  ], "balanced"));
  check("a missing measurement stays behind a measured value", idsOf(missing.ranking) === "plain-offer,zebra-offer" && missing.evidence?.steps[0]?.decidedBy === "priceVariance" && missing.evidence.steps[0]?.aheadValue === 10 && missing.evidence.steps[0]?.behindValue === null);

  const custom = engine().rank(inputOf([
    opportunity("plain-offer", { evidenceCompleteness: 1, priceVariance: 10 }),
    opportunity("zebra-offer", { evidenceCompleteness: 0.2, priceVariance: 1 }),
  ], { policyId: "custom-policy", rules: [{ metricId: "priceVariance", direction: "lower" }] }));
  check("a custom policy uses only its own rules", custom.status === "OK" && idsOf(custom.ranking) === "zebra-offer,plain-offer" && custom.evidence?.rules.length === 1 && custom.statistics.ruleCount === 1 && idsOf(balanced.ranking) !== idsOf(custom.ranking));

  const scored = createOpportunityScoringEngine({ now: () => 0, timestamp: () => T0 }).evaluate({
    report: {
      searchSummary: { snapshotId: "search-1", query: "zebra offer", language: "en", country: "US", device: "desktop", market: "us", searchUrl: "https://example.test/search", htmlLength: 4, collectedAt: T0 },
      serpSummary: { count: 1, titles: ["Desk"], urls: ["https://example.test/buy"], descriptions: ["A"], positions: [1] },
      sponsoredSummary: { count: 1, titles: ["Desk"], urls: ["https://example.test/buy"], descriptions: ["A"], positions: [1] },
      landingPageSummary: { count: 1, landingPageIds: ["page-1"], originalUrls: ["https://example.test/buy"], finalUrls: ["https://example.test/buy"], htmlLength: 8 },
      observedProductSummary: { count: 1, productNames: ["Zebra Offer"], brands: ["North Brand"], vendors: ["Vendor North"], prices: ["47.00"], currencies: ["USD"], languages: ["en"], categories: ["Outdoor"], domains: ["example.test"], landingPageIds: ["page-1"], offerUrls: ["https://example.test/buy"] },
      observedBrands: ["North Brand"],
      observedDomains: ["example.test"],
      observedCategories: ["Outdoor"],
      observedPrices: ["47.00 USD"],
      observedLanguages: ["en"],
      evidenceCoverage: Object.fromEntries(OPPORTUNITY_COVERAGE_FIELDS.map((field) => [field, "PRESENT"])),
      missingEvidence: [],
      warnings: [],
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
    },
    graph: {
      nodes: [
        { id: "search", kind: "SearchSnapshot", label: "search-1", present: "PRESENT" },
        { id: "serp", kind: "SERPRecords", label: "1", present: "PRESENT" },
        { id: "sponsored", kind: "SponsoredResults", label: "1", present: "PRESENT" },
        { id: "landing-pages", kind: "LandingPageSnapshots", label: "1", present: "PRESENT" },
        { id: "observed-products", kind: "ObservedProducts", label: "1", present: "PRESENT" },
      ],
      edges: [
        { from: "search", to: "serp" },
        { from: "serp", to: "sponsored" },
        { from: "sponsored", to: "landing-pages" },
        { from: "landing-pages", to: "observed-products" },
      ],
    },
    statistics: { searchCount: 1, serpCount: 1, sponsoredCount: 1, landingPageCount: 1, observedProductCount: 1, brandCount: 1, domainCount: 1, categoryCount: 1, priceCount: 1, languageCount: 1, warningCount: 0, missingCount: 0, executionTime: 0 },
  });
  const fromScore = engine().rank({
    opportunities: [
      { opportunityId: "zebra-offer", metrics: scored.metrics },
      opportunity("plain-offer", { sponsoredAdvertiserCount: 4 }),
    ],
    policy: "competition-first",
  });
  check("metrics from the scoring engine can be ordered without a new measurement", scored.status === "OK" && fromScore.status === "OK" && scored.metrics?.sponsoredAdvertiserCount === 1 && idsOf(fromScore.ranking) === "plain-offer,zebra-offer" && Object.keys(fromScore.evidence?.opportunities[0]?.metrics ?? {}).join() === OPPORTUNITY_METRIC_KEYS.join());

  const named = RANKING_POLICY_IDS.map((policyId) => rulesForPolicy(policyId).map((rule) => rule.metricId).slice().sort().join());
  check("named policies stay on the scoring metrics", named.every((value) => value === OPPORTUNITY_METRIC_KEYS.slice().sort().join()) && rulesForPolicy("balanced").map((rule) => `${rule.metricId}:${rule.direction}`).join() !== rulesForPolicy("low-competition").map((rule) => `${rule.metricId}:${rule.direction}`).join());

  const missingMetrics = engine().rank(inputOf([], "balanced"));
  check("missing opportunity metrics store nothing", missingMetrics.status === "REJECTED" && has(missingMetrics.issues, /Missing Opportunity Metrics/) && missingMetrics.snapshot === null && missingMetrics.ranking === null);

  const corrupted = engine().rank(inputOf([{ opportunityId: "plain-offer", metrics: { ...metrics(), weight: 2 } as OpportunityMetrics }], "balanced"));
  check("corrupted metrics store nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Metrics/) && corrupted.snapshot === null);

  const duplicate = engine().rank(inputOf([opportunity("plain-offer"), opportunity("plain-offer", { sponsoredAdvertiserCount: 3 })], "balanced"));
  check("duplicate opportunity ids store nothing", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Opportunity IDs/) && duplicate.snapshot === null);

  const badPolicy = engine().rank(inputOf([opportunity("plain-offer")], "best"));
  check("an unknown policy stores nothing", badPolicy.status === "REJECTED" && has(badPolicy.issues, /Invalid Ranking Policy/) && badPolicy.snapshot === null);

  const replaced = engine().rank(inputOf([opportunity("plain-offer")], { policyId: "balanced", rules: [{ metricId: "serpCoverage", direction: "higher" }] }));
  check("a named policy does not accept replacement rules", replaced.status === "REJECTED" && has(replaced.issues, /Invalid Ranking Policy/) && replaced.snapshot === null);

  const nested = engine().rank(inputOf([opportunity("plain-offer")], "balanced", { configuration: { nested: { inner: true } } }));
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badId = engine(() => "BAD").rank(inputOf([opportunity("plain-offer")], "balanced"));
  check("a corrupted ranking id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && engine().getSnapshot("opportunity-ranking-1") === null);

  const dir = join(process.cwd(), "src/lib/opportunity-ranking");
  const names = [
    "opportunity-ranking-engine.ts",
    "ranking-policy.ts",
    "ranking-validator.ts",
    "ranking-types.ts",
    "ranking-context.ts",
    "ranking-snapshot.ts",
  ];
  check("six opportunity ranking modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the engine does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|anthropic|openai|clickbank|product-intelligence|google-ads/i.test(line)));
  check("no hidden weights, model calls, or outside catalogs in code", !code.some((line) => /Math\.random|campaign|recommend|\bdecision\b|\bweight\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "ranking-context.ts"), "utf8")));
  check("ranking imports scoring metric types only from outside its folder", !code.some((line) => /from\s+["']\.\.\/(?!opportunity-scoring\/opportunity-score-types)/.test(line)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the ranking engine`, !sources.some((file) => /opportunity-ranking/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`OPPORTUNITY_RANKING_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("OPPORTUNITY_RANKING_FAILURES=0");
}

main();
