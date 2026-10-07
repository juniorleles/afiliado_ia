import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";
import type { AdGroupMetrics, CampaignMetrics, MetricValues, RsaMetrics } from "../src/lib/optimization-metrics/metrics-snapshot.ts";
import { PERFORMANCE_CONTEXT_MEMBERS } from "../src/lib/performance-analysis/performance-context.ts";
import { createPerformanceAnalyzer } from "../src/lib/performance-analysis/performance-analyzer.ts";
import {
  CAMPAIGN_INDICATOR_NAMES,
  ENTITY_INDICATOR_NAMES,
  PERFORMANCE_ORIGINS,
  PERFORMANCE_PROVENANCE,
  PERFORMANCE_RESULT_KEYS,
  PERFORMANCE_SNAPSHOT_KEYS,
  PERFORMANCE_STATUSES,
  type PerformanceResult,
} from "../src/lib/performance-analysis/performance-snapshot.ts";

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
    clicks: 1,
    ctr: 0.5,
    averageCpc: 1500000,
    costMicros: 2500000,
    conversions: 2,
    conversionValue: 5000000,
    averageCpm: 1000000,
    searchImpressionShare: 0.5,
    searchTopImpressionShare: 0.25,
    searchAbsoluteTopImpressionShare: 0.125,
    ...over,
  };
}

function campaignOf(status: string, over: Partial<MetricValues> = {}, resourceName = CAMPAIGN, campaignId = "999"): CampaignMetrics {
  return { resourceName, campaignId, status, ...values(over) };
}

function groupOf(over: Partial<MetricValues> = {}, resourceName = GROUP): AdGroupMetrics {
  return { resourceName, adGroupId: "777", campaignResourceName: CAMPAIGN, ...values(over) };
}

function adOf(over: Partial<MetricValues> = {}, resourceName = AD): RsaMetrics {
  return {
    resourceName,
    adId: "555",
    adGroupResourceName: GROUP,
    campaignResourceName: CAMPAIGN,
    status: "PAUSED",
    approvalStatus: "UNKNOWN",
    policyReviewStatus: "REVIEW_IN_PROGRESS",
    ...values(over),
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    campaignMetrics: campaignOf("PAUSED"),
    adGroupMetrics: [groupOf({ impressions: 4, clicks: 1, ctr: 0.25 })],
    rsaMetrics: [adOf({ impressions: 2, clicks: 2, ctr: 0.1, averageCpc: 900000, costMicros: 1800000, conversions: 0, conversionValue: null, searchImpressionShare: null, searchTopImpressionShare: null, searchAbsoluteTopImpressionShare: null })],
    historicalMetrics: {
      campaignMetrics: campaignOf("PAUSED", { impressions: 8, clicks: 1, ctr: 0.25, averageCpc: 2000000, costMicros: 1000000, conversions: 1, conversionValue: 2000000, searchImpressionShare: 0.25, searchTopImpressionShare: 0.125, searchAbsoluteTopImpressionShare: 0.0625 }),
      adGroupMetrics: [groupOf({ impressions: 4, clicks: 1, ctr: 0.25 })],
      rsaMetrics: [adOf({ impressions: 2, clicks: 2, ctr: 0.1, averageCpc: 900000, costMicros: 1800000, conversions: 0, conversionValue: null, searchImpressionShare: null, searchTopImpressionShare: null, searchAbsoluteTopImpressionShare: null })],
      budgetAmountMicros: 10000000,
    },
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function hostOf(idFactory?: () => string) {
  let tick = 0;
  return createPerformanceAnalyzer({ now: () => tick++, timestamp: () => T0, idFactory });
}

function named(result: PerformanceResult, name: string, resourceName = CAMPAIGN) {
  return result.indicators?.find((item) => item.name === name && item.resourceName === resourceName) ?? null;
}

function classes(result: PerformanceResult, name: string, resourceName = CAMPAIGN) {
  return result.report?.findings.filter((item) => item.indicator === name && item.resourceName === resourceName).map((item) => item.classification) ?? [];
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

function collectedTransport() {
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
  return { calls, transport };
}

async function main() {
  check("statuses are OK and REJECTED", PERFORMANCE_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", PERFORMANCE_ORIGINS.join() === "OBSERVED" && PERFORMANCE_PROVENANCE.join() === "DIRECT_SOURCE");
  check(
    "context members name the collected metrics and the prior window",
    PERFORMANCE_CONTEXT_MEMBERS.join() === "campaignMetrics,adGroupMetrics,rsaMetrics,historicalMetrics,budgetAmountMicros,timeWindow,executionMetadata,runtimeMetadata",
  );

  const input = inputOf();
  const host = hostOf();
  const analyzed = host.analyze(input);
  input.executionMetadata.note = "changed";
  input.campaignMetrics.impressions = 99;
  input.adGroupMetrics.push(groupOf({}, `customers/${CUSTOMER}/adGroups/1`));
  const ctr = named(analyzed, "CTR Trend");
  const cpc = named(analyzed, "CPC Trend");
  const cost = named(analyzed, "Cost Trend");
  const conversions = named(analyzed, "Conversion Trend");
  const cpa = named(analyzed, "CPA");
  const roas = named(analyzed, "ROAS");
  const impressions = named(analyzed, "Impression Trend");
  const clicks = named(analyzed, "Click Trend");
  const budget = named(analyzed, "Budget Consumption");
  const share = named(analyzed, "Search Impression Share Trend");
  const topShare = named(analyzed, "Top Impression Share Trend");
  const absoluteShare = named(analyzed, "Absolute Top Impression Share Trend");
  const rsaShare = named(analyzed, "Search Impression Share Trend", AD);
  check(
    "one paused campaign is analyzed into frozen indicators",
    analyzed.status === "OK" &&
      analyzed.report?.campaignResourceName === CAMPAIGN &&
      analyzed.report.campaignId === "999" &&
      analyzed.report.status === "PAUSED" &&
      analyzed.indicators?.length === CAMPAIGN_INDICATOR_NAMES.length + ENTITY_INDICATOR_NAMES.length * 2 &&
      analyzed.indicators === analyzed.report.indicators &&
      JSON.stringify(analyzed.comparison?.rows) === JSON.stringify(analyzed.indicators) &&
      analyzed.comparison?.currentWindow === "LAST_30_DAYS" &&
      analyzed.comparison.historicalWindow === "PREVIOUS_30_DAYS" &&
      ctr?.current === 0.5 &&
      ctr.historical === 0.25 &&
      ctr.change === 0.25 &&
      ctr.direction === "Performance Increase" &&
      ctr.method === "DIFFERENCE" &&
      ctr.current !== 1 / 10 &&
      cpc?.change === -500000 &&
      cpc.direction === "Performance Decrease" &&
      cpc.method === "DIFFERENCE" &&
      cost?.current === 2500000 &&
      cost.change === 1500000 &&
      conversions?.change === 1 &&
      cpa?.current === 2500000 / 2 &&
      cpa.historical === 1000000 / 1 &&
      cpa.change === 250000 &&
      cpa.method === "COST_DIVIDED_BY_CONVERSIONS" &&
      roas?.current === 5000000 / 2500000 &&
      roas.historical === 2000000 / 1000000 &&
      roas.change === 0 &&
      roas.direction === "Stable Performance" &&
      roas.method === "CONVERSION_VALUE_DIVIDED_BY_COST" &&
      impressions?.change === 2 &&
      clicks?.change === 0 &&
      clicks.direction === "Stable Performance" &&
      budget?.current === 2500000 / 10000000 &&
      budget.historical === 1000000 / 10000000 &&
      budget.change === 2500000 / 10000000 - 1000000 / 10000000 &&
      budget.method === "COST_DIVIDED_BY_BUDGET" &&
      share?.change === 0.5 - 0.25 &&
      topShare?.change === 0.25 - 0.125 &&
      absoluteShare?.change === 0.125 - 0.0625 &&
      rsaShare?.current === null &&
      rsaShare.historical === null &&
      rsaShare.direction === "Missing Metrics" &&
      named(analyzed, "CPA", AD)?.direction === "Incomplete Data" &&
      named(analyzed, "ROAS", AD)?.direction === "Missing Metrics" &&
      analyzed.statistics.campaignCount === 1 &&
      analyzed.statistics.adGroupCount === 1 &&
      analyzed.statistics.adCount === 1 &&
      analyzed.statistics.indicatorCount === analyzed.indicators.length &&
      analyzed.statistics.findingCount === analyzed.report.findings.length &&
      analyzed.statistics.issueCount === 0 &&
      analyzed.snapshot?.analysisId === "performance-analyze-1" &&
      analyzed.snapshot.origin === "OBSERVED" &&
      analyzed.snapshot.provenance === "DIRECT_SOURCE" &&
      analyzed.snapshot.createdAt === T0 &&
      analyzed.metadata.note === "kept" &&
      analyzed.indicators[0]?.current === 0.5 &&
      host.getSnapshot("performance-analyze-1") === analyzed.snapshot &&
      Object.isFrozen(analyzed.snapshot) &&
      Object.keys(analyzed).join() === PERFORMANCE_RESULT_KEYS.join() &&
      Object.keys(analyzed.snapshot).join() === PERFORMANCE_SNAPSHOT_KEYS.join() &&
      classes(analyzed, "CTR Trend").join() === "Performance Increase" &&
      classes(analyzed, "CPC Trend").join() === "Performance Decrease" &&
      classes(analyzed, "ROAS").join() === "Stable Performance",
  );

  const again = hostOf().analyze(inputOf());
  check("a second analysis repeats the same indicators", JSON.stringify(again.indicators) === JSON.stringify(analyzed.indicators) && again.snapshot !== analyzed.snapshot);
  check("a second analyzer does not see the first snapshot", hostOf().getSnapshot("performance-analyze-1") === null);

  const anomaly = hostOf().analyze(inputOf({
    campaignMetrics: campaignOf("PAUSED", { impressions: 4, clicks: 5, ctr: 1.2, conversions: 6, costMicros: 1000, conversionValue: 2000, searchImpressionShare: 1.5 }),
    adGroupMetrics: [],
    rsaMetrics: [],
    historicalMetrics: {
      campaignMetrics: campaignOf("PAUSED", { impressions: 4, clicks: 1, ctr: 0.25, conversions: 1, costMicros: 100, conversionValue: 100, searchImpressionShare: 0.5 }),
      adGroupMetrics: [],
      rsaMetrics: [],
      budgetAmountMicros: 1000,
    },
    budgetAmountMicros: 500,
  }));
  check(
    "inconsistent figures are marked as anomalies beside the direction",
    anomaly.status === "OK" &&
      classes(anomaly, "CTR Trend").join() === "Performance Increase,Anomalies" &&
      classes(anomaly, "Click Trend").join() === "Performance Increase,Anomalies" &&
      classes(anomaly, "Conversion Trend").join() === "Performance Increase,Anomalies" &&
      classes(anomaly, "Search Impression Share Trend").join() === "Performance Increase,Anomalies" &&
      classes(anomaly, "Budget Consumption").join() === "Performance Increase,Anomalies" &&
      named(anomaly, "Budget Consumption")?.current === 1000 / 500,
  );

  const unmatched = hostOf().analyze(inputOf({
    historicalMetrics: {
      campaignMetrics: campaignOf("PAUSED", { impressions: 8 }),
      adGroupMetrics: [],
      rsaMetrics: [],
      budgetAmountMicros: 10000000,
    },
  }));
  check("an ad group without a prior record is incomplete data", unmatched.status === "OK" && named(unmatched, "Impression Trend", GROUP)?.direction === "Incomplete Data" && named(unmatched, "Impression Trend", GROUP)?.current === 4);

  const missing = hostOf().analyze(null);
  check("missing metrics store nothing", missing.status === "REJECTED" && has(missing.issues, /Missing Metrics/) && missing.snapshot === null && missing.report === null);

  const missingHistory = hostOf().analyze(inputOf({ historicalMetrics: null }));
  check("missing historical data stores nothing", missingHistory.status === "REJECTED" && has(missingHistory.issues, /Missing Historical Data/) && missingHistory.snapshot === null);

  const otherCampaign = hostOf().analyze(inputOf({
    historicalMetrics: {
      campaignMetrics: campaignOf("PAUSED", {}, `customers/${CUSTOMER}/campaigns/1`, "1"),
      adGroupMetrics: [],
      rsaMetrics: [],
    },
  }));
  check("historical metrics for another campaign store nothing", otherCampaign.status === "REJECTED" && has(otherCampaign.issues, /Missing Historical Data/) && otherCampaign.snapshot === null);

  const sameWindow = hostOf().analyze(inputOf({ timeWindow: { current: "LAST_30_DAYS", historical: "LAST_30_DAYS" } }));
  check("one repeated window stores nothing", sameWindow.status === "REJECTED" && has(sameWindow.issues, /Invalid Time Window/) && sameWindow.snapshot === null && sameWindow.statistics.campaignCount === 0);

  const openWindow = hostOf().analyze(inputOf({ timeWindow: { current: "last_30_days", historical: "PREVIOUS_30_DAYS" } }));
  check("an unusable window stores nothing", openWindow.status === "REJECTED" && has(openWindow.issues, /Invalid Time Window/) && openWindow.snapshot === null);

  const nested = hostOf().analyze(inputOf({ executionMetadata: { nested: { inner: true } } }));
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const corrupt = hostOf().analyze(inputOf({ campaignMetrics: { ...campaignOf("PAUSED"), ctr: "nope" } }));
  check("a corrupted metric record stores nothing", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Snapshot/) && corrupt.snapshot === null);

  const repeated = hostOf().analyze(inputOf({ adGroupMetrics: [groupOf(), groupOf()] }));
  check("a repeated ad group stores nothing", repeated.status === "REJECTED" && has(repeated.issues, /Corrupted Snapshot/) && repeated.snapshot === null);

  const badHost = hostOf(() => "BAD");
  const badId = badHost.analyze(inputOf());
  check("a corrupted analysis id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Corrupted Snapshot/) && badId.snapshot === null && badHost.getSnapshot("BAD") === null && badId.metadata.note === "kept");

  const secret = hostOf().analyze(inputOf({ developerToken: "developer-marker" }));
  check("a credential member stores nothing", secret.status === "REJECTED" && has(secret.issues, /Invalid Metadata/) && !JSON.stringify(secret).includes("developer-marker"));

  const live = collectedTransport();
  let tick = 0;
  const collector = createMetricsCollector({ now: () => tick++, timestamp: () => T0, transport: live.transport });
  const collected = await collector.collect({
    session: { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" },
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  });
  const callsBefore = live.calls.length;
  const fromCollector = hostOf().analyze({
    campaignMetrics: collected.campaignMetrics?.[0],
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    historicalMetrics: {
      campaignMetrics: campaignOf("PAUSED", { impressions: 8, clicks: 1, ctr: 0.25, averageCpc: 2000000, costMicros: 1000000, conversions: 0, conversionValue: 0, searchImpressionShare: 0.25, searchTopImpressionShare: 0.125, searchAbsoluteTopImpressionShare: 0.0625 }),
      adGroupMetrics: [groupOf({ impressions: 4, clicks: 3, ctr: 0.25, conversions: 0, conversionValue: 0, searchImpressionShare: 0.25, searchTopImpressionShare: 0.125, searchAbsoluteTopImpressionShare: 0.0625 })],
      rsaMetrics: [adOf({ impressions: 1, clicks: 1, ctr: 0.1, averageCpc: 900000, costMicros: 900000, conversions: 0, conversionValue: 0, averageCpm: 500000, searchImpressionShare: null, searchTopImpressionShare: null, searchAbsoluteTopImpressionShare: null })],
      budgetAmountMicros: 10000000,
    },
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
  });
  const collectedCtr = named(fromCollector, "CTR Trend");
  const collectedCost = named(fromCollector, "Cost Trend");
  check(
    "metrics collected for one paused campaign are analyzed without another request",
    collected.status === "OK" &&
      collected.campaignMetrics?.[0]?.status === "PAUSED" &&
      live.calls.length === 3 &&
      live.calls.length === callsBefore &&
      live.calls.every((call) => call.url.endsWith("/googleAds:search") && !(call.body ?? "").includes("mutate")) &&
      fromCollector.status === "OK" &&
      fromCollector.report?.status === "PAUSED" &&
      collectedCtr?.current === 0.5 &&
      collectedCtr.historical === 0.25 &&
      collectedCtr.change === 0.25 &&
      collectedCtr.current !== 1 / 10 &&
      collectedCost?.current === 2500000 &&
      named(fromCollector, "CPA")?.direction === "Incomplete Data" &&
      named(fromCollector, "ROAS")?.current === 0 &&
      named(fromCollector, "ROAS")?.direction === "Stable Performance" &&
      !JSON.stringify(fromCollector).includes("access-marker") &&
      !JSON.stringify(fromCollector).includes("developer-marker"),
  );

  const dir = join(process.cwd(), "src/lib/performance-analysis");
  const names = ["performance-analyzer.ts", "performance-metrics.ts", "performance-comparator.ts", "performance-validator.ts", "performance-context.ts", "performance-snapshot.ts"];
  check("six performance modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const lines = bundled.split(/\r?\n/).filter(isCode);
  const code = lines.filter((line) => !/from\s+["']\.\.\/optimization-metrics\/metrics-snapshot["']/.test(line));
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check(
    "the analyzer does not retrieve, write, or hide a calculation",
    !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync|mutate|recommend|\bkeyword\b|biddingStrategy|\.sort\(|Promise\.all|\bscor(?:e|es|ing)\b|\brank\b|\bweight\b|\bformula\b|optimiz/.test(line)),
  );
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "performance-context.ts"), "utf8")));
  const outside = [...lines.join("\n").matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
  check("the only outside import is the metrics snapshot", outside.length > 0 && outside.every((from) => from === "../optimization-metrics/metrics-snapshot"));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation", "google-ads-live", "optimization-metrics"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the performance analyzer`, !sources.some((file) => /performance-analysis|performance-analyzer/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`PERFORMANCE_ANALYZER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("PERFORMANCE_ANALYZER_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
