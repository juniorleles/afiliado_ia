import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";
import type { CampaignMetrics, MetricValues } from "../src/lib/optimization-metrics/metrics-snapshot.ts";
import { createPerformanceAnalyzer } from "../src/lib/performance-analysis/performance-analyzer.ts";
import { createOptimizationRecommendationEngine } from "../src/lib/optimization-recommendation/optimization-recommendation-engine.ts";
import { RULE_CONTEXT_MEMBERS } from "../src/lib/pause-resume-rules/rule-context.ts";
import { createPauseResumeRulesEngine } from "../src/lib/pause-resume-rules/pause-resume-rules-engine.ts";
import {
  RULE_ORIGINS,
  RULE_PROVENANCE,
  RULE_RESULT_KEYS,
  RULE_SNAPSHOT_KEYS,
  RULE_STATUSES,
  type PendingAction,
  type RuleResult,
} from "../src/lib/pause-resume-rules/rule-snapshot.ts";
import { OPERATIONAL_RULE_IDS, OPERATIONAL_RULE_KINDS, PLAN_OUTCOMES, RULE_KIND_BY_ID, type OperationalRuleId, type RuleAction } from "../src/lib/pause-resume-rules/rule-types.ts";

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

function campaignOf(metrics: MetricValues, status = "PAUSED"): CampaignMetrics {
  return { resourceName: CAMPAIGN, campaignId: "999", status, ...metrics };
}

function recommendation(kind: string, id: string) {
  return {
    recommendationId: id,
    kind,
    reason: `${kind}. Rule ${id}.`,
    evidence: { rows: [] },
    supportingMetrics: { rows: [] },
    historicalComparison: { currentWindow: "LAST_30_DAYS", historicalWindow: "PREVIOUS_30_DAYS", rows: [] },
    confidence: "FULL" as const,
    triggeredRules: [id],
  };
}

function recommendationSet(kind = "Monitor Performance", id = "MONITOR_PERFORMANCE") {
  return { campaignResourceName: CAMPAIGN, recommendations: [recommendation(kind, id)] };
}

function reportOf(metrics: CampaignMetrics) {
  const pairs = [
    ["Impression Trend", metrics.impressions],
    ["Click Trend", metrics.clicks],
    ["Cost Trend", metrics.costMicros],
    ["Conversion Trend", metrics.conversions],
  ] as const;
  const indicators = pairs.map(([name, current]) => ({
    name,
    resourceName: metrics.resourceName,
    level: "CAMPAIGN" as const,
    current,
    historical: current,
    change: current === null ? null : 0,
    direction: current === null ? ("Missing Metrics" as const) : ("Stable Performance" as const),
    method: "DIFFERENCE" as const,
  }));
  return {
    campaignResourceName: metrics.resourceName,
    campaignId: metrics.campaignId,
    status: metrics.status,
    indicators,
    comparison: {
      currentWindow: "LAST_30_DAYS",
      historicalWindow: "PREVIOUS_30_DAYS",
      campaignResourceName: metrics.resourceName,
      rows: indicators.map((item) => ({ ...item })),
    },
    findings: [],
  };
}

function rulesOf(options: {
  locked?: boolean;
  excluded?: boolean;
  observedPeriodDays?: number | null;
  policyApprovalStatus?: string | null;
  enable?: Partial<Record<OperationalRuleId, { action?: RuleAction; threshold?: number | null }>>;
} = {}) {
  const enable = options.enable ?? {};
  return {
    locked: options.locked ?? false,
    excluded: options.excluded ?? false,
    observedPeriodDays: options.observedPeriodDays === undefined ? null : options.observedPeriodDays,
    policyApprovalStatus: options.policyApprovalStatus === undefined ? null : options.policyApprovalStatus,
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

function inputOf(metrics: CampaignMetrics, rules = rulesOf(), set = recommendationSet()) {
  return {
    recommendationSet: set,
    performanceReport: reportOf(metrics),
    campaignMetrics: metrics,
    operationalRules: rules,
    executionMetadata: { note: "kept" },
  };
}

function hostOf(idFactory?: () => string) {
  let tick = 0;
  return createPauseResumeRulesEngine({ now: () => tick++, timestamp: () => T0, idFactory });
}

function pending(result: RuleResult | null): PendingAction[] {
  return result?.pendingActions ?? [];
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

function unexecuted(actions: readonly PendingAction[]): boolean {
  return actions.every((action) => action.executed === false && action.approval === "REQUIRED" && action.triggeredRules.length > 0 && action.evidence.rows.length > 0);
}

async function main() {
  check("statuses are OK and REJECTED", RULE_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", RULE_ORIGINS.join() === "OBSERVED" && RULE_PROVENANCE.join() === "DIRECT_SOURCE");
  check("outcomes stay in the stated order", PLAN_OUTCOMES.join("|") === "Pause Candidate|Resume Candidate|No Action|Manual Review Required|Rule Conflict");
  check("rule kinds stay in the stated order", OPERATIONAL_RULE_KINDS.join("|") === "ZERO_IMPRESSIONS|POLICY_REJECTED|COST_THRESHOLD|NO_CLICKS|NO_CONVERSIONS|MANUALLY_LOCKED|MANUALLY_EXCLUDED");
  check(
    "context members name the recommendation set, the report, the metrics, and the rules",
    RULE_CONTEXT_MEMBERS.join() === "recommendationSet,performanceReport,campaignMetrics,operationalRules,executionMetadata,runtimeMetadata",
  );

  const paused = campaignOf(values());
  const idle = hostOf().evaluate(inputOf(paused));
  check(
    "a paused campaign with no enabled rule produces No Action",
    idle.status === "OK" &&
      idle.actionPlan?.status === "PAUSED" &&
      idle.actionPlan.outcome === "No Action" &&
      pending(idle).length === 0 &&
      idle.evidence?.recommendations[0]?.kind === "Monitor Performance" &&
      idle.statistics.ruleCount === OPERATIONAL_RULE_KINDS.length &&
      idle.statistics.matchedRuleCount === 0 &&
      idle.statistics.pendingActionCount === 0 &&
      idle.statistics.issueCount === 0 &&
      idle.metadata.note === "kept" &&
      idle.snapshot?.actionPlanId === "action-plan-1" &&
      idle.snapshot.origin === "OBSERVED" &&
      idle.snapshot.provenance === "DIRECT_SOURCE" &&
      Object.isFrozen(idle.snapshot) &&
      Object.keys(idle).join() === RULE_RESULT_KEYS.join() &&
      Object.keys(idle.snapshot).join() === RULE_SNAPSHOT_KEYS.join(),
  );

  const zeroMetrics = campaignOf(values({ impressions: 0, clicks: 0, ctr: 0, conversions: 0, conversionValue: 0, costMicros: 0 }));
  const zeroInput = inputOf(zeroMetrics, rulesOf({ observedPeriodDays: 30, enable: { "zero-impressions": { action: "PAUSE", threshold: 14 } } }));
  const zero = hostOf().evaluate(zeroInput);
  const zeroAction = pending(zero)[0];
  check(
    "zero impressions after the configured period produce a pause candidate that stays unexecuted",
    zero.actionPlan?.outcome === "Pause Candidate" &&
      zeroAction?.actionId === "zero-impressions" &&
      zeroAction.triggeredRules.join() === "zero-impressions" &&
      zeroAction.evidence.rows[0]?.current === 0 &&
      zeroAction.evidence.rows[0].threshold === 14 &&
      zeroAction.evidence.rows[0].detail.includes("observedPeriodDays is 30") &&
      unexecuted(pending(zero)) &&
      zero.actionPlan.status === "PAUSED" &&
      zeroMetrics.status === "PAUSED" &&
      !JSON.stringify(zero).includes("mutate"),
  );

  const early = hostOf().evaluate(inputOf(zeroMetrics, rulesOf({ observedPeriodDays: 3, enable: { "zero-impressions": { action: "PAUSE", threshold: 14 } } })));
  check("zero impressions before the configured period produce No Action", early.actionPlan?.outcome === "No Action" && pending(early).length === 0);

  const resume = hostOf().evaluate(inputOf(paused, rulesOf({ enable: { "cost-threshold": { action: "RESUME", threshold: 1000000 } } })));
  check(
    "cost above the configured threshold with a resume action produces a resume candidate",
    resume.actionPlan?.outcome === "Resume Candidate" && pending(resume)[0]?.triggeredRules.join() === "cost-threshold" && pending(resume)[0].evidence.rows[0]?.current === 5000000 && unexecuted(pending(resume)),
  );

  const equalCost = hostOf().evaluate(inputOf(paused, rulesOf({ enable: { "cost-threshold": { action: "PAUSE", threshold: 5000000 } } })));
  check("cost equal to the threshold does not exceed it", equalCost.actionPlan?.outcome === "No Action" && equalCost.statistics.matchedRuleCount === 0);

  const conflictMetrics = campaignOf(values({ impressions: 0, clicks: 0, ctr: 0, conversions: 0, conversionValue: 0 }));
  const conflict = hostOf().evaluate(inputOf(conflictMetrics, rulesOf({
    observedPeriodDays: 30,
    enable: {
      "zero-impressions": { action: "PAUSE", threshold: 14 },
      "cost-threshold": { action: "RESUME", threshold: 1 },
    },
  })));
  check(
    "a pause match and a resume match produce a rule conflict and stay unexecuted",
    conflict.actionPlan?.outcome === "Rule Conflict" &&
      pending(conflict).length === 1 &&
      pending(conflict)[0]?.triggeredRules.join() === "zero-impressions,cost-threshold" &&
      unexecuted(pending(conflict)) &&
      conflict.actionPlan.status === "PAUSED",
  );

  const disagreed = hostOf().evaluate(inputOf(
    zeroMetrics,
    rulesOf({ observedPeriodDays: 30, enable: { "zero-impressions": { action: "PAUSE", threshold: 14 } } }),
    recommendationSet("No Action", "NO_ACTION"),
  ));
  check(
    "a No Action recommendation disagrees with a pause match",
    disagreed.actionPlan?.outcome === "Rule Conflict" &&
      pending(disagreed)[0]?.reason.includes("NO_ACTION is No Action.") &&
      pending(disagreed)[0].triggeredRules.join() === "zero-impressions" &&
      disagreed.evidence?.recommendations[0]?.kind === "No Action" &&
      unexecuted(pending(disagreed)),
  );

  const budgetPause = hostOf().evaluate(inputOf(
    paused,
    rulesOf({ enable: { "cost-threshold": { action: "PAUSE", threshold: 1000000 } } }),
    recommendationSet("Increase Budget", "INCREASE_BUDGET"),
  ));
  check(
    "a budget recommendation beside a pause match stays a pause candidate",
    budgetPause.actionPlan?.outcome === "Pause Candidate" && budgetPause.evidence?.recommendations[0]?.kind === "Increase Budget" && unexecuted(pending(budgetPause)),
  );

  const locked = hostOf().evaluate(inputOf(zeroMetrics, rulesOf({
    locked: true,
    observedPeriodDays: 30,
    enable: {
      "zero-impressions": { action: "PAUSE", threshold: 14 },
      "manually-locked": { action: "PAUSE" },
    },
  })));
  check(
    "a locked campaign requires manual review and does not emit a pause candidate",
    locked.actionPlan?.outcome === "Manual Review Required" &&
      pending(locked).every((action) => action.outcome === "Manual Review Required") &&
      pending(locked)[0]?.triggeredRules.join() === "manually-locked" &&
      locked.evidence?.rows.some((row) => row.ruleId === "zero-impressions" && row.detail.includes("Not applied.")) &&
      unexecuted(pending(locked)),
  );

  const excluded = hostOf().evaluate(inputOf(zeroMetrics, rulesOf({
    excluded: true,
    observedPeriodDays: 30,
    enable: {
      "zero-impressions": { action: "PAUSE", threshold: 14 },
      "manually-excluded": { action: "PAUSE" },
    },
  })));
  check(
    "an excluded campaign produces No Action",
    excluded.actionPlan?.outcome === "No Action" &&
      pending(excluded).length === 0 &&
      excluded.evidence?.rows.some((row) => row.ruleId === "manually-excluded" && row.matched) &&
      excluded.evidence.rows.some((row) => row.ruleId === "zero-impressions" && row.detail.includes("Not applied.")),
  );

  const bothFlags = hostOf().evaluate(inputOf(paused, rulesOf({ locked: true, excluded: true })));
  check("locked and excluded together store nothing", bothFlags.status === "REJECTED" && has(bothFlags.issues, /Conflicting Rules/) && bothFlags.snapshot === null && bothFlags.actionPlan === null);

  const policy = hostOf().evaluate(inputOf(paused, rulesOf({ policyApprovalStatus: "DISAPPROVED", enable: { "policy-rejected": { action: "PAUSE" } } })));
  check(
    "a disapproved policy status produces a pause candidate",
    policy.actionPlan?.outcome === "Pause Candidate" && pending(policy)[0]?.evidence.rows[0]?.detail.includes("DISAPPROVED") && unexecuted(pending(policy)),
  );

  const quiet = hostOf().evaluate(inputOf(campaignOf(values({ clicks: 0, conversions: 0, conversionValue: 0, impressions: 100 })), rulesOf({ enable: { "no-clicks": { action: "PAUSE", threshold: 50 } } })));
  check("no clicks after the configured impressions produce a pause candidate", quiet.actionPlan?.outcome === "Pause Candidate" && pending(quiet)[0]?.triggeredRules.join() === "no-clicks" && unexecuted(pending(quiet)));

  const unconverted = hostOf().evaluate(inputOf(campaignOf(values({ conversions: 0, conversionValue: 0 })), rulesOf({ enable: { "no-conversions": { action: "PAUSE", threshold: 1000000 } } })));
  check("no conversions after the configured cost produce a pause candidate", unconverted.actionPlan?.outcome === "Pause Candidate" && pending(unconverted)[0]?.evidence.rows[0]?.current === 0 && unexecuted(pending(unconverted)));

  const missingFigure = hostOf().evaluate(inputOf(campaignOf(values({ impressions: null })), rulesOf({ observedPeriodDays: 30, enable: { "zero-impressions": { action: "PAUSE", threshold: 14 } } })));
  check(
    "a null impression figure requires manual review",
    missingFigure.actionPlan?.outcome === "Manual Review Required" && pending(missingFigure)[0]?.triggeredRules.join() === "zero-impressions" && unexecuted(pending(missingFigure)),
  );

  const repeated = hostOf().evaluate(zeroInput);
  check("a second run repeats the action plan", JSON.stringify(repeated.actionPlan) === JSON.stringify(zero.actionPlan));
  check("a second engine does not see the first snapshot", hostOf().getSnapshot("action-plan-1") === null);

  const mutable = inputOf(campaignOf(values()), rulesOf());
  const kept = hostOf().evaluate(mutable);
  mutable.executionMetadata.note = "changed";
  mutable.campaignMetrics.impressions = 0;
  check("later input edits do not change the snapshot", kept.metadata.note === "kept" && kept.evidence?.rows.length === 0 && kept.actionPlan?.campaignId === "999");

  const missingRecommendations = hostOf().evaluate({ ...inputOf(paused), recommendationSet: null });
  check("missing recommendations store nothing", missingRecommendations.status === "REJECTED" && has(missingRecommendations.issues, /Missing Recommendations/) && missingRecommendations.snapshot === null);

  const missingMetrics = hostOf().evaluate({ ...inputOf(paused), campaignMetrics: null });
  check("missing metrics store nothing", missingMetrics.status === "REJECTED" && has(missingMetrics.issues, /Missing Metrics/) && missingMetrics.snapshot === null);

  const missingRules = hostOf().evaluate({ ...inputOf(paused), operationalRules: null });
  check("missing operational rules store nothing", missingRules.status === "REJECTED" && has(missingRules.issues, /Missing Operational Rules/) && missingRules.snapshot === null);

  const broken = inputOf(paused);
  broken.performanceReport.indicators[0].current = 99;
  broken.performanceReport.comparison.rows[0].current = 99;
  const corrupt = hostOf().evaluate(broken);
  check("an indicator that disagrees with the campaign stores nothing", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Snapshot/) && corrupt.snapshot === null);

  const nested = hostOf().evaluate({ ...inputOf(paused), executionMetadata: { nested: { inner: true } } });
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null && !JSON.stringify(nested).includes("inner"));

  const secret = hostOf().evaluate({ ...inputOf(paused), executionMetadata: { accessToken: "access-marker" } });
  check("a credential field stores nothing", secret.status === "REJECTED" && has(secret.issues, /Invalid Metadata/) && secret.snapshot === null && !JSON.stringify(secret).includes("access-marker"));

  const badHost = hostOf(() => "BAD");
  const badId = badHost.evaluate(inputOf(paused));
  check("a corrupted action plan id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Corrupted Snapshot/) && badId.snapshot === null && badHost.getSnapshot("BAD") === null && badId.metadata.note === "kept");

  const duplicated = rulesOf();
  duplicated.rules[6] = { ...duplicated.rules[0] };
  const duplicate = hostOf().evaluate(inputOf(paused, duplicated));
  check("a repeated rule stores nothing", duplicate.status === "REJECTED" && has(duplicate.issues, /Conflicting Rules/) && duplicate.snapshot === null);

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
  const analyzed = createPerformanceAnalyzer({ now: () => tick++, timestamp: () => T0 }).analyze({
    campaignMetrics: collectedCampaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    historicalMetrics: {
      campaignMetrics: collectedCampaign,
      adGroupMetrics: collected.adGroupMetrics,
      rsaMetrics: collected.rsaMetrics,
      budgetAmountMicros: 10000000,
    },
    budgetAmountMicros: 10000000,
    timeWindow: { current: "LAST_30_DAYS", historical: "PREVIOUS_30_DAYS" },
    executionMetadata: { note: "kept" },
  });
  const generated = analyzed.report === null ? null : createOptimizationRecommendationEngine({ now: () => tick++, timestamp: () => T0 }).generate({
    performanceReport: analyzed.report,
    historicalMetrics: {
      campaignMetrics: collectedCampaign,
      adGroupMetrics: collected.adGroupMetrics,
      rsaMetrics: collected.rsaMetrics,
      budgetAmountMicros: 10000000,
    },
    campaignMetrics: collectedCampaign,
    adGroupMetrics: collected.adGroupMetrics,
    rsaMetrics: collected.rsaMetrics,
    budgetAmountMicros: 10000000,
    executionMetadata: { note: "kept" },
  });
  const before = calls.length;
  const fromChain = collectedCampaign === undefined || generated?.recommendationSet == null || analyzed.report === null
    ? null
    : hostOf().evaluate({
      recommendationSet: generated.recommendationSet,
      performanceReport: analyzed.report,
      campaignMetrics: collectedCampaign,
      operationalRules: rulesOf({ enable: { "cost-threshold": { action: "PAUSE", threshold: 1000000 } } }),
      executionMetadata: { note: "kept" },
    });
  check(
    "one paused campaign is evaluated without another request and without an executed action",
    collected.status === "OK" &&
      analyzed.status === "OK" &&
      generated?.status === "OK" &&
      generated.recommendationSet?.recommendations[0]?.kind === "Monitor Performance" &&
      calls.length === 3 &&
      calls.length === before &&
      calls.every((call) => call.url.endsWith("/googleAds:search") && !(call.body ?? "").includes("mutate")) &&
      fromChain?.status === "OK" &&
      fromChain.actionPlan?.outcome === "Pause Candidate" &&
      fromChain.actionPlan.status === "PAUSED" &&
      unexecuted(pending(fromChain)) &&
      fromChain.evidence?.rows.some((row) => row.ruleId === "cost-threshold" && row.current === 2500000 && row.matched) &&
      !JSON.stringify(fromChain).includes("access-marker") &&
      !JSON.stringify(fromChain).includes("developer-marker") &&
      !JSON.stringify(fromChain).includes("mutate"),
  );

  const dir = join(process.cwd(), "src/lib/pause-resume-rules");
  const names = ["pause-resume-rules-engine.ts", "rule-evaluator.ts", "rule-validator.ts", "rule-types.ts", "rule-context.ts", "rule-snapshot.ts", "action-plan-builder.ts"];
  check("seven rule modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const lines = bundled.split(/\r?\n/).filter(isCode);
  const code = lines.filter((line) => !/from\s+["']/.test(line));
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check(
    "the engine does not send, execute, or hide a calculation",
    !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync|mutate|openai|anthropic|\.sort\(|Promise\.all|\bscor(?:e|es|ing)\b|\brank\b|\bweight\b|\bformula\b|optimiz|executed:\s*true/.test(line)) &&
      /pause/.test(bundled) &&
      /resume/.test(bundled),
  );
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "rule-context.ts"), "utf8")));
  const outside = [...lines.join("\n").matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
  const allowed = new Set(["../optimization-metrics/metrics-snapshot", "../optimization-recommendation/optimization-snapshot", "../optimization-recommendation/optimization-types", "../performance-analysis/performance-snapshot"]);
  check("outside imports stay on the recommendation set, the report, and the metric records", outside.length > 0 && outside.every((from) => allowed.has(from)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation", "google-ads-live", "optimization-metrics", "performance-analysis", "optimization-recommendation"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the pause and resume rules`, !sources.some((file) => /pause-resume-rules/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`PAUSE_RESUME_RULES_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("PAUSE_RESUME_RULES_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
