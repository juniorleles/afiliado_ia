import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";
import type { AdGroupMetrics, CampaignMetrics, MetricValues, RsaMetrics } from "../src/lib/optimization-metrics/metrics-snapshot.ts";
import { createPerformanceAnalyzer } from "../src/lib/performance-analysis/performance-analyzer.ts";
import { OPTIMIZATION_CONTEXT_MEMBERS } from "../src/lib/optimization-recommendation/optimization-context.ts";
import { createOptimizationRecommendationEngine } from "../src/lib/optimization-recommendation/optimization-recommendation-engine.ts";
import { HIGH_BUDGET_CONSUMPTION, LOW_BUDGET_CONSUMPTION } from "../src/lib/optimization-recommendation/optimization-rules.ts";
import {
  OPTIMIZATION_ORIGINS,
  OPTIMIZATION_PROVENANCE,
  OPTIMIZATION_RESULT_KEYS,
  OPTIMIZATION_SNAPSHOT_KEYS,
  OPTIMIZATION_STATUSES,
  type OptimizationResult,
} from "../src/lib/optimization-recommendation/optimization-snapshot.ts";
import { RECOMMENDATION_KINDS } from "../src/lib/optimization-recommendation/optimization-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const CUSTOMER = "1111111111";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/999`;
const GROUP = `customers/${CUSTOMER}/adGroups/777`;
const AD = `customers/${CUSTOMER}/adGroupAds/777~555`;

function values(over: Partial<MetricValues> = {}): MetricValues {
  return {
    impressions: 10,
    clicks: 2,
    ctr: 0.5,
    averageCpc: 1500000,
    costMicros: 5000000,
    conversions: 2,
    conversionValue: 5000000,
    averageCpm: 1000000,
    searchImpressionShare: 0.5,
    searchTopImpressionShare: 0.25,
    searchAbsoluteTopImpressionShare: 0.125,
    ...over,
  };
}

function campaignOf(metrics: MetricValues, status = "PAUSED", resourceName = CAMPAIGN, campaignId = "999"): CampaignMetrics {
  return { resourceName, campaignId, status, ...metrics };
}

function groupOf(metrics: MetricValues, resourceName = GROUP): AdGroupMetrics {
  return { resourceName, adGroupId: "777", campaignResourceName: CAMPAIGN, ...metrics };
}

function adOf(metrics: MetricValues, resourceName = AD): RsaMetrics {
  return {
    resourceName,
    adId: "555",
    adGroupResourceName: GROUP,
    campaignResourceName: CAMPAIGN,
    status: "PAUSED",
    approvalStatus: "UNKNOWN",
    policyReviewStatus: "REVIEW_IN_PROGRESS",
    ...metrics,
  };
}

function performanceInput(over: Record<string, unknown> = {}) {
  const current = values();
  const past = values();
  return {
    campaignMetrics: campaignOf(current),
    adGroupMetrics: [groupOf(current)],
    rsaMetrics: [adOf(current)],
    historicalMetrics: {
      campaignMetrics: campaignOf(past),
      adGroupMetrics: [groupOf(past)],
      rsaMetrics: [adOf(past)],
      budgetAmountMicros: 10000000,
    },
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function hostOf(idFactory?: () => string, rules?: readonly never[]) {
  let tick = 0;
  return createOptimizationRecommendationEngine({ now: () => tick++, timestamp: () => T0, idFactory, rules });
}

function analyzerOf() {
  let tick = 0;
  return createPerformanceAnalyzer({ now: () => tick++, timestamp: () => T0 });
}

function generatedFrom(source: ReturnType<typeof performanceInput>, engine = hostOf()) {
  const analyzed = analyzerOf().analyze(source);
  const generated = analyzed.report === null ? null : engine.generate({
    performanceReport: analyzed.report,
    historicalMetrics: source.historicalMetrics,
    campaignMetrics: source.campaignMetrics,
    adGroupMetrics: source.adGroupMetrics,
    rsaMetrics: source.rsaMetrics,
    budgetAmountMicros: source.budgetAmountMicros,
    executionMetadata: source.executionMetadata,
  });
  return { analyzed, generated };
}

function kinds(result: OptimizationResult | null): string[] {
  return result?.recommendationSet?.recommendations.map((item) => item.kind) ?? [];
}

function one(result: OptimizationResult | null, kind: string) {
  return result?.recommendationSet?.recommendations.find((item) => item.kind === kind) ?? null;
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

function rows(body: unknown) {
  return { httpStatus: 200, bodyText: JSON.stringify({ results: Array.isArray(body) ? body : [body] }) };
}

async function main() {
  check("statuses are OK and REJECTED", OPTIMIZATION_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", OPTIMIZATION_ORIGINS.join() === "OBSERVED" && OPTIMIZATION_PROVENANCE.join() === "DIRECT_SOURCE");
  check("recommendation kinds stay in the stated order", RECOMMENDATION_KINDS.join("|") === "Increase Budget|Reduce Budget|Review RSA Headlines|Review RSA Descriptions|Review Landing Page|Review Keywords|Review Search Terms|Review Audience|Review Device Targeting|Monitor Performance|No Action");
  check(
    "context members name the report, the metrics, and the prior window",
    OPTIMIZATION_CONTEXT_MEMBERS.join() === "performanceReport,historicalMetrics,campaignMetrics,adGroupMetrics,rsaMetrics,budgetAmountMicros,executionMetadata,runtimeMetadata",
  );
  check("budget bounds are the stated consumption figures", HIGH_BUDGET_CONSUMPTION === 0.8 && LOW_BUDGET_CONSUMPTION === 0.2);

  const stableSource = performanceInput();
  const stable = generatedFrom(stableSource);
  stableSource.executionMetadata.note = "changed";
  stableSource.campaignMetrics.ctr = 0.1;
  const noAction = one(stable.generated, "No Action");
  const ctrSupport = noAction?.supportingMetrics.rows.find((row) => row.name === "ctr" && row.resourceName === CAMPAIGN);
  check(
    "a stable paused campaign produces No Action",
    stable.analyzed.status === "OK" &&
      stable.analyzed.report?.status === "PAUSED" &&
      stable.generated?.status === "OK" &&
      kinds(stable.generated).join() === "No Action" &&
      noAction?.recommendationId === "NO_ACTION" &&
      noAction.triggeredRules.join() === "NO_ACTION" &&
      noAction.confidence === "FULL" &&
      noAction.reason.includes("NO_ACTION") &&
      noAction.reason.includes("No independent action rule matched.") &&
      noAction.historicalComparison.currentWindow === "LAST_30_DAYS" &&
      noAction.historicalComparison.historicalWindow === "PREVIOUS_30_DAYS" &&
      ctrSupport?.current === 0.5 &&
      ctrSupport.historical === 0.5 &&
      stable.generated?.statistics.ruleCount === RECOMMENDATION_KINDS.length &&
      stable.generated.statistics.recommendationCount === 1 &&
      stable.generated.statistics.triggeredRuleCount === 1 &&
      stable.generated.statistics.issueCount === 0 &&
      stable.generated.metadata.note === "kept" &&
      stable.generated.snapshot?.recommendationSetId === "recommendation-set-1" &&
      stable.generated.snapshot.origin === "OBSERVED" &&
      Object.isFrozen(stable.generated.snapshot) &&
      Object.keys(stable.generated).join() === OPTIMIZATION_RESULT_KEYS.join() &&
      Object.keys(stable.generated.snapshot).join() === OPTIMIZATION_SNAPSHOT_KEYS.join(),
  );

  const raised = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ ctr: 0.75 })) }));
  check(
    "a CTR rise without an action rule stays No Action and keeps the rise in the evidence",
    kinds(raised.generated).join() === "No Action" && one(raised.generated, "No Action")?.evidence.rows.some((row) => row.name === "CTR Trend" && row.direction === "Performance Increase" && row.current === 0.75 && row.change === 0.25),
  );

  const increase = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ costMicros: 9000000, conversionValue: 9000000 })) }));
  const increaseRow = one(increase.generated, "Increase Budget");
  check(
    "budget consumption at or above 0.8 produces Increase Budget",
    kinds(increase.generated).join() === "Increase Budget" &&
      increaseRow?.recommendationId === "INCREASE_BUDGET" &&
      increaseRow.confidence === "FULL" &&
      increaseRow.reason.includes("0.8") &&
      increaseRow.evidence.rows[0]?.current === 9000000 / 10000000 &&
      increaseRow.evidence.rows[0].direction === "Performance Increase" &&
      increaseRow.supportingMetrics.rows.some((row) => row.name === "budgetAmountMicros" && row.current === 10000000 && row.historical === 10000000),
  );

  const reduce = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ costMicros: 1000000 })) }));
  check(
    "budget consumption below 0.2 produces Reduce Budget",
    kinds(reduce.generated).join() === "Reduce Budget" && one(reduce.generated, "Reduce Budget")?.evidence.rows[0]?.current === 1000000 / 10000000 && one(reduce.generated, "Reduce Budget")?.reason.includes("0.2"),
  );

  const headlines = generatedFrom(performanceInput({ rsaMetrics: [adOf(values({ ctr: 0.1 }))] }));
  check("a falling RSA CTR produces Review RSA Headlines", kinds(headlines.generated).join() === "Review RSA Headlines" && one(headlines.generated, "Review RSA Headlines")?.evidence.rows[0]?.resourceName === AD);

  const descriptions = generatedFrom(performanceInput({ rsaMetrics: [adOf(values({ conversions: 1 }))] }));
  check("a falling RSA conversion count produces Review RSA Descriptions", kinds(descriptions.generated).join() === "Review RSA Descriptions");

  const landing = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ conversions: 1 })) }));
  check("a falling campaign conversion count produces Review Landing Page", kinds(landing.generated).join() === "Review Landing Page" && one(landing.generated, "Review Landing Page")?.triggeredRules.join() === "REVIEW_LANDING_PAGE");

  const keywords = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ ctr: 0.25, clicks: 1, impressions: 10 })) }));
  const pastClicks = values({ ctr: 0.5, clicks: 2, impressions: 10 });
  const keywordRun = generatedFrom(performanceInput({
    campaignMetrics: campaignOf(values({ ctr: 0.25, clicks: 1 })),
    historicalMetrics: {
      campaignMetrics: campaignOf(pastClicks),
      adGroupMetrics: [groupOf(values())],
      rsaMetrics: [adOf(values())],
      budgetAmountMicros: 10000000,
    },
  }));
  check(
    "falling CTR and falling clicks produce Review Keywords",
    kinds(keywordRun.generated).join() === "Review Keywords" && one(keywordRun.generated, "Review Keywords")?.evidence.rows.map((row) => row.name).join() === "CTR Trend,Click Trend",
  );
  void keywords;

  const searchTerms = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ searchImpressionShare: 0.25 })) }));
  check("a falling search impression share produces Review Search Terms", kinds(searchTerms.generated).join() === "Review Search Terms" && one(searchTerms.generated, "Review Search Terms")?.evidence.rows[0]?.name === "Search Impression Share Trend");

  const audience = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ conversionValue: 1000000 })) }));
  check("falling ROAS with CTR held produces Review Audience", kinds(audience.generated).join() === "Review Audience" && one(audience.generated, "Review Audience")?.confidence === "FULL");

  const device = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ averageCpc: 2000000, ctr: 0.25 })) }));
  check("rising CPC and falling CTR produce Review Device Targeting", kinds(device.generated).join() === "Review Device Targeting");

  const both = generatedFrom(performanceInput({ campaignMetrics: campaignOf(values({ ctr: 0.25, clicks: 1, averageCpc: 2000000 })) }));
  const bothPast = generatedFrom(performanceInput({
    campaignMetrics: campaignOf(values({ ctr: 0.25, clicks: 1, averageCpc: 2000000 })),
    historicalMetrics: {
      campaignMetrics: campaignOf(values({ ctr: 0.5, clicks: 2, averageCpc: 1000000 })),
      adGroupMetrics: [groupOf(values())],
      rsaMetrics: [adOf(values())],
      budgetAmountMicros: 10000000,
    },
  }));
  check(
    "independent rules both stay in the stated order",
    kinds(bothPast.generated).join() === "Review Keywords,Review Device Targeting",
  );
  void both;

  const monitor = generatedFrom(performanceInput({
    campaignMetrics: campaignOf(values({ ctr: null })),
    historicalMetrics: {
      campaignMetrics: campaignOf(values({ ctr: null })),
      adGroupMetrics: [groupOf(values())],
      rsaMetrics: [adOf(values())],
      budgetAmountMicros: 10000000,
    },
  }));
  check(
    "a missing CTR produces Monitor Performance",
    kinds(monitor.generated).join() === "Monitor Performance" && one(monitor.generated, "Monitor Performance")?.confidence === "PARTIAL" && one(monitor.generated, "Monitor Performance")?.triggeredRules.join() === "MONITOR_PERFORMANCE",
  );

  const repeated = generatedFrom(performanceInput());
  check("a second run repeats the recommendation set", JSON.stringify(repeated.generated?.recommendationSet?.recommendations) === JSON.stringify(stable.generated?.recommendationSet?.recommendations));
  check("a second engine does not see the first snapshot", hostOf().getSnapshot("recommendation-set-1") === null);

  const missingReport = hostOf().generate(performanceInput());
  check("a missing performance report stores nothing", missingReport.status === "REJECTED" && has(missingReport.issues, /Missing Performance Report/) && missingReport.snapshot === null && missingReport.recommendationSet === null);

  const missingHistory = hostOf().generate({ ...bundle(stable), historicalMetrics: null });
  check("missing historical metrics store nothing", missingHistory.status === "REJECTED" && has(missingHistory.issues, /Missing Historical Metrics/) && missingHistory.snapshot === null);

  const brokenReport = JSON.parse(JSON.stringify(stable.analyzed.report)) as { indicators: { current: number }[]; comparison: { rows: { current: number }[] } };
  brokenReport.indicators[0].current = 0.9;
  brokenReport.comparison.rows[0].current = 0.9;
  const corrupt = hostOf().generate({ ...bundle(stable), performanceReport: brokenReport });
  check("metrics that disagree with the report store nothing", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Metrics/) && corrupt.snapshot === null);

  const invalidRules = createOptimizationRecommendationEngine({
    rules: [{ id: "NOPE", kind: "No Action", independent: false, boundNote: "x", applies: () => false, select: () => [] }] as never,
  });
  const invalid = invalidRules.generate(bundle(stable));
  check("an invalid rule table stores nothing", invalid.status === "REJECTED" && has(invalid.issues, /Invalid Recommendation Rules/) && invalid.snapshot === null);

  const nested = hostOf().generate({ ...bundle(stable), executionMetadata: { nested: { inner: true } } });
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badHost = hostOf(() => "BAD");
  const badId = badHost.generate(bundle(stable));
  check("a corrupted recommendation set id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badHost.getSnapshot("BAD") === null && badId.metadata.note === "kept");

  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    const query = request.body ?? "";
    if (query.includes("FROM ad_group_ad")) {
      return rows({
        campaign: { resourceName: CAMPAIGN },
        adGroup: { resourceName: GROUP },
        adGroupAd: { resourceName: AD, status: "PAUSED", ad: { id: "555" }, policySummary: { approvalStatus: "UNKNOWN", reviewStatus: "REVIEW_IN_PROGRESS" } },
        metrics: { impressions: 2, clicks: 2, ctr: 0.1, averageCpc: 900000, costMicros: 1800000, conversions: 0, conversionsValue: 0, averageCpm: 500000 },
      });
    }
    if (query.includes("FROM ad_group")) {
      return rows({
        campaign: { resourceName: CAMPAIGN },
        adGroup: { resourceName: GROUP, id: "777" },
        metrics: { impressions: 4, clicks: 3, ctr: 0.25, averageCpc: 1500000, costMicros: "2500000", conversions: 0, conversionsValue: 0, averageCpm: 1000000, searchImpressionShare: 0.4, searchTopImpressionShare: 0.2, searchAbsoluteTopImpressionShare: 0.1 },
      });
    }
    return rows({
      campaign: { resourceName: CAMPAIGN, id: "999", status: "PAUSED" },
      metrics: { impressions: 10, clicks: 1, ctr: 0.5, averageCpc: 1500000, costMicros: "2500000", conversions: 0, conversionsValue: 0, averageCpm: 1000000, searchImpressionShare: 0.4, searchTopImpressionShare: 0.2, searchAbsoluteTopImpressionShare: 0.1 },
    });
  };
  let tick = 0;
  const collected = await createMetricsCollector({ now: () => tick++, timestamp: () => T0, transport }).collect({
    session: { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" },
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  });
  const collectedCampaign = collected.campaignMetrics?.[0];
  const collectedGroup = collected.adGroupMetrics?.[0];
  const collectedAd = collected.rsaMetrics?.[0];
  const collectedSource = performanceInput({
    campaignMetrics: collectedCampaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    historicalMetrics: {
      campaignMetrics: collectedCampaign,
      adGroupMetrics: collectedGroup ? [collectedGroup] : [],
      rsaMetrics: collectedAd ? [collectedAd] : [],
      budgetAmountMicros: 10000000,
    },
  });
  const before = calls.length;
  const fromCollected = generatedFrom(collectedSource);
  check(
    "one paused campaign report is turned into a recommendation without another request",
    collected.status === "OK" &&
      collectedCampaign?.status === "PAUSED" &&
      calls.length === 3 &&
      calls.length === before &&
      calls.every((call) => call.url.endsWith("/googleAds:search") && !(call.body ?? "").includes("mutate")) &&
      fromCollected.generated?.status === "OK" &&
      fromCollected.generated.recommendationSet?.recommendations[0]?.kind === "Monitor Performance" &&
      !JSON.stringify(fromCollected.generated).includes("access-marker") &&
      !JSON.stringify(fromCollected.generated).includes("developer-marker"),
  );

  const dir = join(process.cwd(), "src/lib/optimization-recommendation");
  const names = ["optimization-recommendation-engine.ts", "optimization-rules.ts", "optimization-validator.ts", "optimization-types.ts", "optimization-context.ts", "optimization-snapshot.ts"];
  check("six recommendation modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const lines = bundled.split(/\r?\n/).filter(isCode);
  const code = lines.filter((line) => !/from\s+["']/.test(line));
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check(
    "the engine does not retrieve, publish, or hide a calculation",
    !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync|mutate|\brecommend\b|pause|resume|openai|anthropic|\.sort\(|Promise\.all|\bscor(?:e|es|ing)\b|\brank\b|\bweight\b|\bformula\b|optimiz/.test(line)),
  );
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "optimization-context.ts"), "utf8")));
  const outside = [...lines.join("\n").matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
  const allowed = new Set(["../optimization-metrics/metrics-snapshot", "../performance-analysis/performance-snapshot", "../performance-analysis/performance-metrics", "../performance-analysis/performance-context"]);
  check("outside imports stay on the report and the metric records", outside.length > 0 && outside.every((from) => allowed.has(from)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation", "google-ads-live", "optimization-metrics", "performance-analysis"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the recommendation engine`, !sources.some((file) => /optimization-recommendation/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`OPTIMIZATION_RECOMMENDATION_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("OPTIMIZATION_RECOMMENDATION_FAILURES=0");
}

function bundle(stable: { analyzed: { report: unknown }; generated: OptimizationResult | null } & { source?: unknown }, source?: ReturnType<typeof performanceInput>) {
  const input = source ?? performanceInput();
  return {
    performanceReport: stable.analyzed.report,
    historicalMetrics: input.historicalMetrics,
    campaignMetrics: input.campaignMetrics,
    adGroupMetrics: input.adGroupMetrics,
    rsaMetrics: input.rsaMetrics,
    budgetAmountMicros: input.budgetAmountMicros,
    executionMetadata: { note: "kept" },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
