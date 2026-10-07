/**
 * Optimization Engine — RC1 acceptance audit.
 * Validation only. Does not add host behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";
import { createPerformanceAnalyzer } from "../src/lib/performance-analysis/performance-analyzer.ts";
import { createOptimizationRecommendationEngine } from "../src/lib/optimization-recommendation/optimization-recommendation-engine.ts";
import { createPauseResumeRulesEngine } from "../src/lib/pause-resume-rules/pause-resume-rules-engine.ts";
import { OPERATIONAL_RULE_IDS, RULE_KIND_BY_ID, type OperationalRuleId, type RuleAction } from "../src/lib/pause-resume-rules/rule-types.ts";

const GATES = [
  "METRICS_COLLECTOR",
  "PERFORMANCE_ANALYZER",
  "OPTIMIZATION_RECOMMENDATION_ENGINE",
  "PAUSE_RESUME_RULES_ENGINE",
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
const T0 = "2026-01-01T00:00:00.000Z";
const CUSTOMER = "1111111111";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/999`;
const GROUP = `customers/${CUSTOMER}/adGroups/777`;
const AD = `customers/${CUSTOMER}/adGroupAds/777~555`;
const SECRETS = ["access-marker", "developer-marker"];

function check(gate: Gate, label: string, ok: boolean, severity: Severity = "HIGH") {
  if (!ok) {
    const list = failed.get(gate) ?? [];
    list.push(label);
    failed.set(gate, list);
    bugs[severity] += 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[] | undefined, text: RegExp) => (issues ?? []).some((item) => text.test(`${item.field} ${item.message}`));
function clocks(prefix: string) {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `${prefix}-${(n += 1)}` };
}
async function timed<T>(fn: () => Promise<T> | T): Promise<{ ms: number; value: T }> {
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
function rows(body: unknown) {
  return { httpStatus: 200, bodyText: JSON.stringify({ results: Array.isArray(body) ? body : [body] }) };
}
function scripted() {
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
function counts() {
  return { metrics: 0, analyzer: 0, recommendation: 0, rules: 0 };
}
function rulesOf(enable: Partial<Record<OperationalRuleId, { action?: RuleAction; threshold?: number | null }>> = {}, flags: { locked?: boolean; excluded?: boolean } = {}) {
  return {
    locked: flags.locked ?? false,
    excluded: flags.excluded ?? false,
    observedPeriodDays: null,
    policyApprovalStatus: null,
    rules: OPERATIONAL_RULE_IDS.map((id) => {
      const kind = RULE_KIND_BY_ID[id];
      const spec = enable[id];
      const needsThreshold = kind === "ZERO_IMPRESSIONS" || kind === "NO_CLICKS" || kind === "COST_THRESHOLD" || kind === "NO_CONVERSIONS";
      return {
        id,
        kind,
        enabled: spec !== undefined,
        action: spec?.action ?? "PAUSE",
        threshold: spec === undefined ? null : spec.threshold === undefined ? (needsThreshold ? 1 : null) : spec.threshold,
      };
    }),
  };
}

async function main() {
  const executions = counts();
  const live = scripted();
  const session = { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" };
  const collectInput = {
    session,
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  };
  const metricsHost = createMetricsCollector({ ...clocks("metrics"), transport: live.transport });
  executions.metrics += 1;
  const collected = await metricsHost.collect(collectInput);
  collectInput.executionMetadata.note = "changed";
  const campaign = collected.campaignMetrics?.[0];
  check(
    "METRICS_COLLECTOR",
    "Metrics Collection: one paused campaign, its ad group, and its responsive search ad are copied from the read",
    collected.status === "OK" &&
      campaign?.resourceName === CAMPAIGN &&
      campaign.status === "PAUSED" &&
      campaign.impressions === 10 &&
      campaign.clicks === 1 &&
      campaign.costMicros === 2500000 &&
      campaign.conversions === 0 &&
      collected.adGroupMetrics?.[0]?.resourceName === GROUP &&
      collected.rsaMetrics?.[0]?.resourceName === AD &&
      collected.rsaMetrics[0]?.approvalStatus === "UNKNOWN" &&
      live.calls.length === 3 &&
      live.calls.every((call) => call.url.endsWith("/googleAds:search") && !(call.body ?? "").includes("mutate")) &&
      collected.snapshot !== null &&
      Object.isFrozen(collected.snapshot) &&
      collected.snapshot.metadata.note === "kept" &&
      collected.statistics.requestCount === 3 &&
      collected.statistics.campaignCount === 1 &&
      collected.statistics.issueCount === 0 &&
      SECRETS.every((secret) => !JSON.stringify(collected).includes(secret)),
  );

  const analyzeInput = {
    campaignMetrics: campaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    historicalMetrics: {
      campaignMetrics: campaign,
      adGroupMetrics: collected.adGroupMetrics,
      rsaMetrics: collected.rsaMetrics,
      budgetAmountMicros: 10000000,
    },
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
  };
  const analyzerHost = createPerformanceAnalyzer(clocks("performance"));
  let analyzed: ReturnType<typeof analyzerHost.analyze> | null = null;
  if (collected.status === "OK") {
    executions.analyzer += 1;
    analyzed = analyzerHost.analyze(analyzeInput);
  }
  analyzeInput.executionMetadata.note = "changed";
  const impression = analyzed?.indicators?.find((item) => item.name === "Impression Trend" && item.level === "CAMPAIGN");
  check(
    "PERFORMANCE_ANALYZER",
    "Performance Analysis: historical metrics become a frozen report for the paused campaign",
    analyzed?.status === "OK" &&
      analyzed.report?.campaignResourceName === CAMPAIGN &&
      analyzed.report.status === "PAUSED" &&
      analyzed.comparison?.currentWindow === "LAST_30_DAYS" &&
      analyzed.comparison.historicalWindow === "PREVIOUS_30_DAYS" &&
      impression?.current === 10 &&
      impression.historical === 10 &&
      analyzed.indicators !== null &&
      analyzed.indicators.length > 0 &&
      analyzed.snapshot !== null &&
      Object.isFrozen(analyzed.snapshot) &&
      analyzed.snapshot.metadata.note === "kept" &&
      analyzed.statistics.issueCount === 0 &&
      live.calls.length === 3,
  );

  const recommendInput = {
    performanceReport: analyzed?.report,
    historicalMetrics: analyzeInput.historicalMetrics,
    campaignMetrics: campaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    budgetAmountMicros: 10000000,
    executionMetadata: { note: "kept" },
  };
  const recommendationHost = createOptimizationRecommendationEngine(clocks("recommendation"));
  let generated: ReturnType<typeof recommendationHost.generate> | null = null;
  if (analyzed?.status === "OK") {
    executions.recommendation += 1;
    generated = recommendationHost.generate(recommendInput);
  }
  recommendInput.executionMetadata.note = "changed";
  const firstRecommendation = generated?.recommendationSet?.recommendations[0];
  check(
    "OPTIMIZATION_RECOMMENDATION_ENGINE",
    "Optimization Recommendations: the paused campaign report produces Monitor Performance with evidence",
    generated?.status === "OK" &&
      firstRecommendation?.kind === "Monitor Performance" &&
      firstRecommendation.recommendationId === "MONITOR_PERFORMANCE" &&
      firstRecommendation.triggeredRules.join() === "MONITOR_PERFORMANCE" &&
      firstRecommendation.evidence.rows.length > 0 &&
      firstRecommendation.historicalComparison.currentWindow === "LAST_30_DAYS" &&
      firstRecommendation.historicalComparison.historicalWindow === "PREVIOUS_30_DAYS" &&
      generated.snapshot !== null &&
      Object.isFrozen(generated.snapshot) &&
      generated.snapshot.metadata.note === "kept" &&
      generated.statistics.recommendationCount === 1 &&
      generated.statistics.issueCount === 0 &&
      live.calls.length === 3,
  );

  const rulesInput = {
    recommendationSet: generated?.recommendationSet,
    performanceReport: analyzed?.report,
    campaignMetrics: campaign,
    operationalRules: rulesOf({ "cost-threshold": { action: "PAUSE", threshold: 1000000 } }),
    executionMetadata: { note: "kept" },
  };
  const rulesHost = createPauseResumeRulesEngine(clocks("action-plan"));
  let planned: ReturnType<typeof rulesHost.evaluate> | null = null;
  if (generated?.status === "OK") {
    executions.rules += 1;
    planned = rulesHost.evaluate(rulesInput);
  }
  rulesInput.executionMetadata.note = "changed";
  const pending = planned?.pendingActions ?? [];
  check(
    "PAUSE_RESUME_RULES_ENGINE",
    "Rule Evaluation: the cost rule produces one unexecuted pause candidate with evidence",
    planned?.status === "OK" &&
      planned.actionPlan?.outcome === "Pause Candidate" &&
      planned.actionPlan.status === "PAUSED" &&
      pending.length === 1 &&
      pending[0]?.approval === "REQUIRED" &&
      pending[0].executed === false &&
      pending[0].triggeredRules.join() === "cost-threshold" &&
      pending[0].evidence.rows[0]?.current === 2500000 &&
      pending[0].evidence.rows[0].ruleId === "cost-threshold" &&
      planned.evidence?.recommendations[0]?.kind === "Monitor Performance" &&
      planned.snapshot !== null &&
      Object.isFrozen(planned.snapshot) &&
      planned.snapshot.metadata.note === "kept" &&
      planned.statistics.pendingActionCount === 1 &&
      planned.statistics.issueCount === 0 &&
      live.calls.length === 3 &&
      !JSON.stringify(planned).includes("mutate"),
  );
  check(
    "REGRESSION",
    "Execution Metadata and immutable snapshots survive the walk",
    collected.snapshot?.metadata.note === "kept" &&
      analyzed?.snapshot?.metadata.note === "kept" &&
      generated?.snapshot?.metadata.note === "kept" &&
      planned?.snapshot?.metadata.note === "kept" &&
      Object.isFrozen(collected.snapshot) &&
      Object.isFrozen(analyzed?.snapshot) &&
      Object.isFrozen(generated?.snapshot) &&
      Object.isFrozen(planned?.snapshot),
  );
  check(
    "REGRESSION",
    "Every host executes exactly once",
    executions.metrics === 1 && executions.analyzer === 1 && executions.recommendation === 1 && executions.rules === 1,
  );
  check(
    "REGRESSION",
    "Independent execution context: a second host does not see the first snapshot",
    createMetricsCollector(clocks("metrics")).getSnapshot("metrics-1") === null &&
      metricsHost.getSnapshot("metrics-1") === collected.snapshot &&
      createPerformanceAnalyzer(clocks("performance")).getSnapshot("performance-1") === null &&
      analyzerHost.getSnapshot("performance-1") === analyzed?.snapshot &&
      createOptimizationRecommendationEngine(clocks("recommendation")).getSnapshot("recommendation-1") === null &&
      recommendationHost.getSnapshot("recommendation-1") === generated?.snapshot &&
      createPauseResumeRulesEngine(clocks("action-plan")).getSnapshot("action-plan-1") === null &&
      rulesHost.getSnapshot("action-plan-1") === planned?.snapshot,
  );

  const stopped = counts();
  const emptyScript = scripted();
  stopped.metrics += 1;
  const missingCampaign = await createMetricsCollector({ ...clocks("missing-campaign"), transport: emptyScript.transport }).collect({
    session,
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [],
    executionMetadata: { note: "kept" },
  });
  if (missingCampaign.status === "OK") {
    stopped.analyzer += 1;
    stopped.recommendation += 1;
    stopped.rules += 1;
  }
  check(
    "NEGATIVE_TESTS",
    "Missing Campaign Metrics: an empty campaign list stores nothing and the walk stops",
    missingCampaign.status === "REJECTED" && has(missingCampaign.issues, /Unknown Campaign/) && missingCampaign.snapshot === null && missingCampaign.campaignMetrics === null && emptyScript.calls.length === 0 && stopped.metrics === 1 && stopped.analyzer === 0 && stopped.recommendation === 0 && stopped.rules === 0,
  );

  const missingHistory = createPerformanceAnalyzer(clocks("missing-history")).analyze({
    campaignMetrics: campaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    historicalMetrics: null,
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Missing Historical Metrics: analysis without a prior window stores nothing", missingHistory.status === "REJECTED" && has(missingHistory.issues, /Missing Historical Data/) && missingHistory.snapshot === null && missingHistory.report === null);

  const missingRecommendationHistory = createOptimizationRecommendationEngine(clocks("missing-recommendation-history")).generate({
    ...recommendInput,
    historicalMetrics: null,
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Missing Historical Metrics: a recommendation without the prior window stores nothing", missingRecommendationHistory.status === "REJECTED" && has(missingRecommendationHistory.issues, /Missing Historical Metrics/) && missingRecommendationHistory.snapshot === null);

  const brokenReport = analyzed?.report === null || analyzed?.report === undefined ? null : (JSON.parse(JSON.stringify(analyzed.report)) as { indicators: { current: number }[]; comparison: { rows: { current: number }[] } });
  if (brokenReport !== null) {
    brokenReport.indicators[0].current = 99;
    brokenReport.comparison.rows[0].current = 99;
  }
  const corrupt = createOptimizationRecommendationEngine(clocks("corrupt")).generate({ ...recommendInput, performanceReport: brokenReport, executionMetadata: { note: "kept" } });
  check("NEGATIVE_TESTS", "Corrupted Metrics: a report that disagrees with the campaign stores nothing", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Metrics/) && corrupt.snapshot === null && corrupt.recommendationSet === null);

  const invalidRules = createOptimizationRecommendationEngine({
    ...clocks("invalid-rules"),
    rules: [{ id: "NOPE", kind: "No Action", independent: false, boundNote: "x", applies: () => false, select: () => [] }] as never,
  }).generate({ ...recommendInput, executionMetadata: { note: "kept" } });
  check("NEGATIVE_TESTS", "Invalid Recommendation Rules: a broken rule table stores nothing", invalidRules.status === "REJECTED" && has(invalidRules.issues, /Invalid Recommendation Rules/) && invalidRules.snapshot === null);

  const invalidOperational = createPauseResumeRulesEngine(clocks("invalid-rules")).evaluate({ ...rulesInput, operationalRules: null, executionMetadata: { note: "kept" } });
  check("NEGATIVE_TESTS", "Invalid Operational Rules: a missing rule table stores nothing", invalidOperational.status === "REJECTED" && has(invalidOperational.issues, /Missing Operational Rules/) && invalidOperational.snapshot === null && invalidOperational.actionPlan === null);

  const conflicted = createPauseResumeRulesEngine(clocks("conflict")).evaluate({
    ...rulesInput,
    operationalRules: rulesOf({}, { locked: true, excluded: true }),
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Rule Conflicts: locked and excluded together store nothing", conflicted.status === "REJECTED" && has(conflicted.issues, /Conflicting Rules/) && conflicted.snapshot === null);

  const opposed = createPauseResumeRulesEngine(clocks("opposed")).evaluate({
    ...rulesInput,
    operationalRules: rulesOf({
      "cost-threshold": { action: "PAUSE", threshold: 1000000 },
      "no-conversions": { action: "RESUME", threshold: 1000000 },
    }),
    executionMetadata: { note: "kept" },
  });
  const opposedAction = opposed.pendingActions?.[0];
  check(
    "NEGATIVE_TESTS",
    "Rule Conflicts: opposite actions stay pending and unexecuted",
    opposed.status === "OK" &&
      opposed.actionPlan?.outcome === "Rule Conflict" &&
      opposedAction?.executed === false &&
      opposedAction.approval === "REQUIRED" &&
      opposedAction.triggeredRules.join() === "cost-threshold,no-conversions" &&
      opposedAction.evidence.rows.length === 2 &&
      live.calls.length === 3,
  );

  const nestedScript = scripted();
  const nestedMetrics = await createMetricsCollector({ ...clocks("nested-metrics"), transport: nestedScript.transport }).collect({
    ...collectInput,
    executionMetadata: { nested: { inner: true } },
  });
  const nestedAnalysis = createPerformanceAnalyzer(clocks("nested-analysis")).analyze({ ...analyzeInput, executionMetadata: { nested: { inner: true } } });
  const nestedRecommendation = createOptimizationRecommendationEngine(clocks("nested-recommendation")).generate({ ...recommendInput, executionMetadata: { nested: { inner: true } } });
  const nestedRules = createPauseResumeRulesEngine(clocks("nested-rules")).evaluate({ ...rulesInput, executionMetadata: { nested: { inner: true } } });
  check(
    "NEGATIVE_TESTS",
    "Malformed Metadata: nested metadata stores nothing and sends no request",
    nestedMetrics.status === "REJECTED" &&
      has(nestedMetrics.issues, /Invalid Metadata/) &&
      nestedMetrics.snapshot === null &&
      nestedScript.calls.length === 0 &&
      nestedAnalysis.status === "REJECTED" &&
      has(nestedAnalysis.issues, /Invalid Metadata/) &&
      nestedAnalysis.snapshot === null &&
      nestedRecommendation.status === "REJECTED" &&
      has(nestedRecommendation.issues, /Invalid Metadata/) &&
      nestedRecommendation.snapshot === null &&
      nestedRules.status === "REJECTED" &&
      has(nestedRules.issues, /Invalid Metadata/) &&
      nestedRules.snapshot === null,
  );

  const badMetrics = await createMetricsCollector({ ...clocks("bad"), transport: scripted().transport, idFactory: () => "BAD" }).collect({
    session,
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  });
  const badAnalysis = createPerformanceAnalyzer({ ...clocks("bad"), idFactory: () => "BAD" }).analyze({ ...analyzeInput, executionMetadata: { note: "kept" } });
  const badRecommendation = createOptimizationRecommendationEngine({ ...clocks("bad"), idFactory: () => "BAD" }).generate({ ...recommendInput, executionMetadata: { note: "kept" } });
  const badRules = createPauseResumeRulesEngine({ ...clocks("bad"), idFactory: () => "BAD" }).evaluate({ ...rulesInput, executionMetadata: { note: "kept" } });
  check(
    "NEGATIVE_TESTS",
    "Corrupted Snapshots: a bad id stores nothing",
    badMetrics.status === "REJECTED" &&
      badMetrics.snapshot === null &&
      badAnalysis.status === "REJECTED" &&
      has(badAnalysis.issues, /Corrupted Snapshot/) &&
      badAnalysis.snapshot === null &&
      badRecommendation.status === "REJECTED" &&
      badRecommendation.snapshot === null &&
      badRules.status === "REJECTED" &&
      has(badRules.issues, /Corrupted Snapshot/) &&
      badRules.snapshot === null,
  );

  const metricsTimed = await timed(() => createMetricsCollector({ ...clocks("perf-metrics"), transport: scripted().transport }).collect({
    session,
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  }));
  const analysisTimed = await timed(() => createPerformanceAnalyzer(clocks("perf-analysis")).analyze({ ...analyzeInput, executionMetadata: { note: "kept" } }));
  const recommendationTimed = await timed(() => createOptimizationRecommendationEngine(clocks("perf-recommendation")).generate({ ...recommendInput, executionMetadata: { note: "kept" } }));
  const rulesTimed = await timed(() => createPauseResumeRulesEngine(clocks("perf-rules")).evaluate({ ...rulesInput, executionMetadata: { note: "kept" } }));
  const perfRows: Array<[string, number, boolean]> = [
    ["Metrics Collector", metricsTimed.ms, metricsTimed.value.status === "OK"],
    ["Performance Analyzer", analysisTimed.ms, analysisTimed.value.status === "OK"],
    ["Recommendation Engine", recommendationTimed.ms, recommendationTimed.value.status === "OK"],
    ["Pause / Resume Rules", rulesTimed.ms, rulesTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check("PERFORMANCE", `${name} completes in under 2000ms`, ok && ms < 2000, "MEDIUM");
  }

  const modules: Record<string, string[]> = {
    metrics: ["metrics-collector.ts", "google-metrics-client.ts", "metrics-mapper.ts", "metrics-validator.ts", "metrics-context.ts", "metrics-snapshot.ts"],
    analysis: ["performance-analyzer.ts", "performance-metrics.ts", "performance-comparator.ts", "performance-validator.ts", "performance-context.ts", "performance-snapshot.ts"],
    recommendation: ["optimization-recommendation-engine.ts", "optimization-rules.ts", "optimization-validator.ts", "optimization-types.ts", "optimization-context.ts", "optimization-snapshot.ts"],
    rules: ["pause-resume-rules-engine.ts", "rule-evaluator.ts", "rule-validator.ts", "rule-types.ts", "rule-context.ts", "rule-snapshot.ts", "action-plan-builder.ts"],
  };
  const roots: Record<string, string> = {
    metrics: join(process.cwd(), "src/lib/optimization-metrics"),
    analysis: join(process.cwd(), "src/lib/performance-analysis"),
    recommendation: join(process.cwd(), "src/lib/optimization-recommendation"),
    rules: join(process.cwd(), "src/lib/pause-resume-rules"),
  };
  check("REGRESSION", "Backward compatibility: each Optimization Engine module set is still present", Object.entries(modules).every(([key, files]) => files.every((file) => readdirSync(roots[key]).includes(file))));
  const libLines = Object.entries(modules).flatMap(([key, files]) => files.flatMap((file) => readFileSync(join(roots[key], file), "utf8").split(/\r?\n/)));
  const hardcodedProducts = libLines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line));
  if (hardcodedProducts) productHardcoding += 1;
  check("GENERICITY", "No Product Hardcoding: library source has no real product names", !hardcodedProducts);
  check("GENERICITY", "No Brand Hardcoding: library source has no fixed brand identity", !libLines.some((line) => /North Brand|Vendor North|Manager North|Plain Account|Child Desk/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Marketplace Hardcoding: library source does not name a marketplace", !libLines.some((line) => /clickbank|digistore|warriorplus|jvzoo|amazon|shopify/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Campaign Hardcoding: library source has no fixed campaign resource", !libLines.some((line) => /customers\/\d+\/campaigns\/\d+/.test(line)), "MEDIUM");
  check("GENERICITY", "No Rule Hardcoding: library source has no campaign-specific rule", !libLines.some((line) => /campaignId\s*===?\s*["']\d+|customers\/\d{6,}/.test(line)), "MEDIUM");
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "platform", "providers/google-ads", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation", "google-ads-live"];
  check(
    "REGRESSION",
    "Backward compatibility: upstream modules do not import the Optimization Engine",
    !folders.some((folder) => walk(join(process.cwd(), "src/lib", folder)).filter((file) => file.endsWith(".ts")).some((file) => /optimization-metrics|performance-analysis|optimization-recommendation|pause-resume-rules/.test(readFileSync(file, "utf8")))),
  );
  check("REGRESSION", "No mutation: the collected campaign status stays PAUSED", campaign?.status === "PAUSED" && planned?.actionPlan?.status === "PAUSED");

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
  console.log(`READY_FOR_FINAL_VALIDATION=${ready ? "YES" : "NO"}`);
  if (!ready) {
    console.error(`\n${[...failed.values()].reduce((sum, list) => sum + list.length, 0)} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT=OPTIMIZATION_ENGINE_RC1_COMPLETE");
  console.log(`
Architecture Summary
The Optimization Engine is four hosts. The metrics collector searches one campaign, its ad groups, and its responsive search ads, then freezes the returned figures. The performance analyzer turns those figures and a supplied prior window into indicators, a comparison, and a report. The recommendation engine restates that report as explainable recommendations. The pause and resume rules engine compares those recommendations with the caller's operational rules and freezes an action plan. Pending actions require approval and stay unexecuted. A walk calls each host once and stops when a host refuses. Each host keeps its own snapshot map. Credentials stay on the collector request and are not stored.

Regression Summary
This audit replayed collection, analysis, recommendation, and rule evaluation for one paused campaign. The recommendation was Monitor Performance. The cost rule produced one Pause Candidate. Snapshots stayed frozen. A second host did not see the first snapshot. An empty campaign list stopped the walk before analysis. Opposite pause and resume rules stayed pending. Upstream Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Platform Kernel, Product Intelligence, Market Discovery, Search Intelligence, the Opportunity Engine, and Google Ads Live do not import these hosts. The module file sets listed above are still present.

Known Limitations
The collector does not read credentials from the environment. A later read has to be given the session again. The analyzer copies supplied historical figures and does not fetch them. The recommendation engine does not change a budget, a bid, or a serving status. The rules engine does not send a mutate. A refused call stores nothing. Snapshots live only inside the host that created them. This audit replays a scripted account service.

Operational Notes
Rejected inputs return REJECTED, a list of issues, and no snapshot. Clocks and id factories are injectable, and one call does not throw. A live read still needs a developer token, an access grant, and a customer id supplied on the collector call. Pause and resume candidates wait for explicit approval. This audit does not publish, deploy, enable an ad, or commit.
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
