import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RECOMMENDATION_CONTEXT_MEMBERS } from "../src/lib/opportunity-recommendation/recommendation-context.ts";
import { createOpportunityRecommendationEngine } from "../src/lib/opportunity-recommendation/recommendation-engine.ts";
import { rulesForRecommendationPolicy } from "../src/lib/opportunity-recommendation/recommendation-policy.ts";
import {
  RECOMMENDATION_EVIDENCE_KEYS,
  RECOMMENDATION_RESULT_KEYS,
  RECOMMENDATION_SET_KEYS,
  RECOMMENDATION_SNAPSHOT_KEYS,
  RECOMMENDATION_STATISTICS_KEYS,
} from "../src/lib/opportunity-recommendation/recommendation-snapshot.ts";
import {
  RECOMMENDATION_ORIGINS,
  RECOMMENDATION_POLICY_IDS,
  RECOMMENDATION_PROVENANCE,
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_TYPES,
  type OpportunityMetrics,
} from "../src/lib/opportunity-recommendation/recommendation-types.ts";
import { createOpportunityPortfolioBuilder } from "../src/lib/opportunity-portfolio/portfolio-builder.ts";
import { createOpportunityRankingEngine } from "../src/lib/opportunity-ranking/opportunity-ranking-engine.ts";

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

function rankingOf(ids: string[]) {
  return {
    policyId: "balanced",
    ordered: ids.map((opportunityId, index) => ({ position: index + 1, opportunityId })),
    origin: "OBSERVED" as const,
    provenance: "DIRECT_SOURCE" as const,
  };
}

function portfolioOf(ids: string[], groups: { portfolioId: string; portfolioType: string; dimension: string; value: string; opportunityIds: string[] }[]) {
  return {
    policyId: "balanced",
    ordered: ids.map((opportunityId, index) => ({ position: index + 1, opportunityId })),
    portfolios: groups,
    statistics: {
      opportunityCount: ids.length,
      portfolioCount: groups.length,
      membershipCount: groups.reduce((sum, group) => sum + group.opportunityIds.length, 0),
    },
    origin: "OBSERVED" as const,
    provenance: "DIRECT_SOURCE" as const,
  };
}

const healthGroup = { portfolioId: "portfolio-1", portfolioType: "health", dimension: "category", value: "health", opportunityIds: ["zebra-offer"] };
const beautyGroup = { portfolioId: "portfolio-2", portfolioType: "beauty", dimension: "category", value: "beauty", opportunityIds: ["plain-offer"] };

function inputOf(policy: unknown = "balanced", over: Record<string, unknown> = {}) {
  return {
    ranking: rankingOf(["zebra-offer", "plain-offer"]),
    portfolio: portfolioOf(["zebra-offer", "plain-offer"], [healthGroup, beautyGroup]),
    metrics: [
      { opportunityId: "zebra-offer", metrics: metrics({ evidenceCompleteness: 1 }) },
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
    ],
    policy,
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function engine(idFactory?: () => string) {
  let tick = 0;
  return createOpportunityRecommendationEngine({ now: () => tick++, timestamp: () => T0, idFactory });
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
  check("statuses are OK and REJECTED", RECOMMENDATION_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", RECOMMENDATION_ORIGINS.join() === "OBSERVED" && RECOMMENDATION_PROVENANCE.join() === "DIRECT_SOURCE");
  check("types are TEST_FIRST, MONITOR, WATCH, SKIP, and MANUAL_REVIEW", RECOMMENDATION_TYPES.join() === "TEST_FIRST,MONITOR,WATCH,SKIP,MANUAL_REVIEW");
  check("named policies are balanced, portfolio coverage, and evidence coverage", RECOMMENDATION_POLICY_IDS.join() === "balanced,portfolio-coverage,evidence-coverage");
  check("context members name the ranking, the portfolio, the metrics, and the policy", RECOMMENDATION_CONTEXT_MEMBERS.join() === "ranking,portfolio,metrics,policy,executionMetadata,runtimeMetadata,configuration");
  check("balanced ends with an unconditional skip", rulesForRecommendationPolicy("balanced").length === 7 && rulesForRecommendationPolicy("balanced")[6]?.conditions.length === 0);

  const input = inputOf("balanced");
  const host = engine();
  const balanced = host.recommend(input);
  input.ranking.ordered[0].position = 9;
  input.metrics[0].metrics.evidenceCompleteness = 0;
  input.executionMetadata.note = "changed";
  const zebra = balanced.recommendations?.recommendations[0];
  const plain = balanced.recommendations?.recommendations[1];
  check(
    "balanced names TEST_FIRST and WATCH from the published rules",
    balanced.status === "OK" &&
      zebra?.recommendationType === "TEST_FIRST" &&
      zebra.reason === "Position 1, complete evidence, and at least one portfolio." &&
      zebra.evidence.selectedRuleId === "test-first" &&
      zebra.supportingMetrics.map((item) => `${item.metricId}:${item.value}`).join() === "evidenceCompleteness:1" &&
      zebra.triggeredRules.map((item) => item.ruleId).join() === "test-first,monitor,watch,skip" &&
      zebra.confidence.matchedRuleCount === 4 &&
      zebra.confidence.ruleCount === 7 &&
      zebra.confidence.value === Number((4 / 7).toFixed(6)) &&
      zebra.confidence.value === 0.571429 &&
      zebra.evidence.portfolioCount === 1 &&
      zebra.evidence.portfolioIds.join() === "portfolio-1" &&
      zebra.evidence.evaluations[0]?.conditions[0]?.kind === "positionEquals" &&
      zebra.evidence.evaluations[0]?.conditions[0]?.matched === true &&
      zebra.evidence.evaluations[0]?.conditions[0]?.actual === 1 &&
      zebra.evidence.evaluations[0]?.conditions[0]?.expected === 1 &&
      plain?.recommendationType === "WATCH" &&
      plain.reason === "At least one portfolio and numeric evidence completeness." &&
      plain.evidence.selectedRuleId === "watch" &&
      plain.supportingMetrics.map((item) => `${item.metricId}:${item.value}`).join() === "evidenceCompleteness:0.2" &&
      plain.triggeredRules.map((item) => item.ruleId).join() === "watch,skip" &&
      plain.confidence.value === Number((2 / 7).toFixed(6)) &&
      plain.confidence.value === 0.285714 &&
      balanced.evidence?.policyId === "balanced" &&
      balanced.evidence.rules.length === 7 &&
      balanced.evidence.opportunities.length === 2 &&
      balanced.statistics.opportunityCount === 2 &&
      balanced.statistics.recommendationCount === 2 &&
      balanced.statistics.testFirstCount === 1 &&
      balanced.statistics.watchCount === 1 &&
      balanced.statistics.monitorCount === 0 &&
      balanced.statistics.skipCount === 0 &&
      balanced.statistics.manualReviewCount === 0 &&
      balanced.statistics.issueCount === 0 &&
      Object.keys(zebra ?? {}).join() === "opportunityId,position,recommendationType,reason,evidence,supportingMetrics,triggeredRules,confidence" &&
      Object.keys(balanced).join() === RECOMMENDATION_RESULT_KEYS.join() &&
      Object.keys(balanced.recommendations ?? {}).join() === RECOMMENDATION_SET_KEYS.join() &&
      Object.keys(balanced.evidence ?? {}).join() === RECOMMENDATION_EVIDENCE_KEYS.join() &&
      Object.keys(balanced.statistics).join() === RECOMMENDATION_STATISTICS_KEYS.join() &&
      Object.keys(balanced.snapshot ?? {}).join() === RECOMMENDATION_SNAPSHOT_KEYS.join(),
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    balanced.snapshot !== null &&
      host.getSnapshot("opportunity-recommendation-1") === balanced.snapshot &&
      Object.isFrozen(balanced.snapshot) &&
      Object.isFrozen(balanced.recommendations) &&
      Object.isFrozen(balanced.evidence) &&
      balanced.snapshot?.metadata.note === "kept" &&
      balanced.snapshot?.recommendations.recommendations[0]?.supportingMetrics[0]?.value === 1 &&
      balanced.snapshot?.context.opportunityIds.join() === "zebra-offer,plain-offer",
  );

  const reversed = engine().recommend(inputOf("balanced", {
    metrics: [
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
      { opportunityId: "zebra-offer", metrics: metrics({ evidenceCompleteness: 1 }) },
    ],
  }));
  check(
    "metric record order does not change recommendation order",
    reversed.status === "OK" &&
      reversed.recommendations?.recommendations.map((item) => item.opportunityId).join() === "zebra-offer,plain-offer" &&
      JSON.stringify(reversed.recommendations?.recommendations.map((item) => item.recommendationType)) === JSON.stringify(balanced.recommendations?.recommendations.map((item) => item.recommendationType)),
  );

  const again = engine().recommend(inputOf("balanced"));
  check(
    "a second engine reproduces the recommendations and the evidence",
    again.status === "OK" &&
      again.snapshot !== balanced.snapshot &&
      JSON.stringify(again.recommendations) === JSON.stringify(balanced.recommendations) &&
      JSON.stringify(again.evidence) === JSON.stringify(balanced.evidence),
  );

  const coverage = engine().recommend(inputOf("portfolio-coverage"));
  const evidencePolicy = engine().recommend(inputOf("evidence-coverage"));
  check(
    "the same opportunities receive different types under independent policies",
    coverage.status === "OK" &&
      coverage.recommendations?.recommendations[0]?.recommendationType === "WATCH" &&
      coverage.recommendations.recommendations[0]?.confidence.value === 0.4 &&
      coverage.recommendations.recommendations[1]?.recommendationType === "WATCH" &&
      evidencePolicy.status === "OK" &&
      evidencePolicy.recommendations?.recommendations[0]?.recommendationType === "TEST_FIRST" &&
      evidencePolicy.recommendations.recommendations[1]?.recommendationType === "SKIP" &&
      evidencePolicy.recommendations.recommendations[1]?.confidence.value === Number((1 / 7).toFixed(6)) &&
      evidencePolicy.recommendations.recommendations[1]?.confidence.value === 0.142857,
  );

  const custom = engine().recommend(inputOf({
    policyId: "custom-policy",
    rules: [
      { ruleId: "only-first", recommendationType: "TEST_FIRST", reason: "Position is 1.", conditions: [{ kind: "positionEquals", value: 1 }] },
      { ruleId: "skip", recommendationType: "SKIP", reason: "No earlier rule matched.", conditions: [] },
    ],
  }));
  check(
    "a custom policy supplies its own rules",
    custom.status === "OK" &&
      custom.recommendations?.policyId === "custom-policy" &&
      custom.recommendations.recommendations[0]?.recommendationType === "TEST_FIRST" &&
      custom.recommendations.recommendations[1]?.recommendationType === "SKIP" &&
      custom.recommendations.recommendations[1]?.reason === "No earlier rule matched.",
  );

  const review = engine().recommend({
    ranking: rankingOf(["zebra-offer"]),
    portfolio: portfolioOf(["zebra-offer"], []),
    metrics: [{ opportunityId: "zebra-offer", metrics: metrics({ priceVariance: null }) }],
    policy: "balanced",
  });
  check(
    "an unmeasured price variance names MANUAL_REVIEW when no earlier rule matches",
    review.status === "OK" &&
      review.recommendations?.recommendations[0]?.recommendationType === "MANUAL_REVIEW" &&
      review.recommendations.recommendations[0]?.reason === "Price variance was not measured." &&
      review.recommendations.recommendations[0]?.supportingMetrics.map((item) => `${item.metricId}:${String(item.value)}`).join() === "priceVariance:null" &&
      review.statistics.manualReviewCount === 1,
  );

  const missingRanking = engine().recommend({ ...inputOf(), ranking: null });
  check("a missing ranking stores nothing", missingRanking.status === "REJECTED" && has(missingRanking.issues, /Missing Opportunity Ranking/) && missingRanking.snapshot === null && missingRanking.statistics.issueCount === missingRanking.issues.length && missingRanking.statistics.recommendationCount === 0);

  const missingPortfolio = engine().recommend({ ...inputOf(), portfolio: null });
  check("a missing portfolio stores nothing", missingPortfolio.status === "REJECTED" && has(missingPortfolio.issues, /Missing Portfolio/) && missingPortfolio.snapshot === null);

  const corrupted = engine().recommend(inputOf("balanced", {
    metrics: [
      { opportunityId: "zebra-offer", metrics: { ...metrics(), weight: 1 } },
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
    ],
  }));
  check("corrupted metrics store nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Metrics/) && corrupted.snapshot === null);

  const badPolicy = engine().recommend(inputOf("best"));
  check("an unknown policy stores nothing", badPolicy.status === "REJECTED" && has(badPolicy.issues, /Invalid Recommendation Policy/) && badPolicy.snapshot === null);

  const replaced = engine().recommend(inputOf({ policyId: "balanced", rules: [{ ruleId: "skip", recommendationType: "SKIP", reason: "No earlier rule matched.", conditions: [] }] }));
  check("a named policy does not accept replacement rules", replaced.status === "REJECTED" && has(replaced.issues, /Invalid Recommendation Policy/) && replaced.snapshot === null);

  const openEnded = engine().recommend(inputOf({
    policyId: "custom-policy",
    rules: [{ ruleId: "only-first", recommendationType: "TEST_FIRST", reason: "Position is 1.", conditions: [{ kind: "positionEquals", value: 1 }] }],
  }));
  check("a policy whose last rule has conditions stores nothing", openEnded.status === "REJECTED" && has(openEnded.issues, /Invalid Recommendation Policy/) && openEnded.snapshot === null);

  const nested = engine().recommend(inputOf("balanced", { configuration: { nested: { inner: true } } }));
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badId = engine(() => "BAD").recommend(inputOf("balanced"));
  check("a corrupted recommendation id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && engine().getSnapshot("opportunity-recommendation-1") === null);

  const ranker = createOpportunityRankingEngine({ now: () => 0, timestamp: () => T0 });
  const ranked = ranker.rank({
    opportunities: [
      { opportunityId: "zebra-offer", metrics: metrics({ evidenceCompleteness: 1 }) },
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
    ],
    policy: "balanced",
  });
  const builder = createOpportunityPortfolioBuilder({ now: () => 0, timestamp: () => T0 });
  const built = builder.build({
    ranking: ranked.ranking,
    opportunities: [
      { opportunityId: "zebra-offer", category: "health" },
      { opportunityId: "plain-offer", category: "beauty" },
    ],
  });
  const rankingBefore = JSON.stringify(ranked.ranking);
  const portfolioBefore = JSON.stringify(built.portfolio);
  const chained = engine().recommend({
    ranking: ranked.ranking,
    portfolio: built.portfolio,
    metrics: [
      { opportunityId: "zebra-offer", metrics: metrics({ evidenceCompleteness: 1 }) },
      { opportunityId: "plain-offer", metrics: metrics({ evidenceCompleteness: 0.2 }) },
    ],
    policy: "balanced",
  });
  check(
    "a ranking and a portfolio are accepted and left unchanged",
    ranked.status === "OK" &&
      built.status === "OK" &&
      chained.status === "OK" &&
      chained.recommendations?.recommendations.map((item) => `${item.opportunityId}:${item.recommendationType}`).join() === "zebra-offer:TEST_FIRST,plain-offer:WATCH" &&
      JSON.stringify(ranked.ranking) === rankingBefore &&
      JSON.stringify(built.portfolio) === portfolioBefore,
  );

  const dir = join(process.cwd(), "src/lib/opportunity-recommendation");
  const names = [
    "recommendation-engine.ts",
    "recommendation-policy.ts",
    "recommendation-validator.ts",
    "recommendation-types.ts",
    "recommendation-context.ts",
    "recommendation-snapshot.ts",
  ];
  check("six recommendation modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the engine does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|anthropic|openai|clickbank|product-intelligence|google-ads/i.test(line)));
  check("no hidden calculations in code", !code.some((line) => /\.sort\(|Math\.random|\bcampaign\b|\bdecision\b|\bweight\b|\brank\b/.test(line) || (/\brecommend\b/.test(line) && !/\brecommend\(/.test(line))));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "recommendation-context.ts"), "utf8")));
  check("recommendation imports scoring metric types only from outside its folder", !code.some((line) => /from\s+["']\.\.\/(?!opportunity-scoring\/opportunity-score-types)/.test(line)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the recommendation engine`, !sources.some((file) => /opportunity-recommendation/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`OPPORTUNITY_RECOMMENDATION_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("OPPORTUNITY_RECOMMENDATION_FAILURES=0");
}

main();
