/**
 * Host record domain: pause and resume rule evaluation.
 *
 * Each enabled rule is checked in the supplied order. A missing figure
 * stays unevaluable. Disabled rules are not checked.
 */
import type { CampaignMetrics } from "../optimization-metrics/metrics-snapshot";
import type { CheckedRule, OperationalRule, OperationalRules, RuleEvidenceRow, RuleView } from "./rule-types";

function show(value: number | string | null): string {
  return value === null ? "null" : String(value);
}

function row(rule: OperationalRule, matched: boolean, current: number | null, detail: string): RuleEvidenceRow {
  return {
    ruleId: rule.id,
    kind: rule.kind,
    matched,
    current,
    threshold: rule.threshold,
    detail,
  };
}

function checked(rule: OperationalRule, state: CheckedRule["state"], current: number | null, detail: string): CheckedRule {
  const matched = state === "matched";
  return { rule, state, row: row(rule, matched, current, detail) };
}

function zeroImpressions(rule: OperationalRule, campaign: CampaignMetrics, rules: OperationalRules): CheckedRule {
  const impressions = campaign.impressions;
  const period = rules.observedPeriodDays;
  const detail = `impressions are ${show(impressions)}; observedPeriodDays is ${show(period)}; threshold is ${show(rule.threshold)}.`;
  if (impressions === null || period === null || rule.threshold === null) return checked(rule, "unevaluable", impressions, detail);
  const matched = impressions === 0 && period >= rule.threshold;
  return checked(rule, matched ? "matched" : "clear", impressions, detail);
}

function policyRejected(rule: OperationalRule, rules: OperationalRules): CheckedRule {
  const status = rules.policyApprovalStatus;
  const detail = `policyApprovalStatus is ${show(status)}.`;
  if (status === null || status === "") return checked(rule, "unevaluable", null, detail);
  return checked(rule, status === "DISAPPROVED" ? "matched" : "clear", null, detail);
}

function costThreshold(rule: OperationalRule, campaign: CampaignMetrics): CheckedRule {
  const cost = campaign.costMicros;
  const detail = `costMicros is ${show(cost)}; threshold is ${show(rule.threshold)}.`;
  if (cost === null || rule.threshold === null) return checked(rule, "unevaluable", cost, detail);
  return checked(rule, cost > rule.threshold ? "matched" : "clear", cost, detail);
}

function noClicks(rule: OperationalRule, campaign: CampaignMetrics): CheckedRule {
  const clicks = campaign.clicks;
  const impressions = campaign.impressions;
  const detail = `clicks are ${show(clicks)}; impressions are ${show(impressions)}; threshold is ${show(rule.threshold)}.`;
  if (clicks === null || impressions === null || rule.threshold === null) return checked(rule, "unevaluable", clicks, detail);
  const matched = clicks === 0 && impressions >= rule.threshold;
  return checked(rule, matched ? "matched" : "clear", clicks, detail);
}

function noConversions(rule: OperationalRule, campaign: CampaignMetrics): CheckedRule {
  const conversions = campaign.conversions;
  const cost = campaign.costMicros;
  const detail = `conversions are ${show(conversions)}; costMicros is ${show(cost)}; threshold is ${show(rule.threshold)}.`;
  if (conversions === null || cost === null || rule.threshold === null) return checked(rule, "unevaluable", conversions, detail);
  const matched = conversions === 0 && cost >= rule.threshold;
  return checked(rule, matched ? "matched" : "clear", conversions, detail);
}

function manuallyLocked(rule: OperationalRule, rules: OperationalRules): CheckedRule {
  const detail = `locked is ${rules.locked ? "true" : "false"}.`;
  return checked(rule, rules.locked ? "matched" : "clear", null, detail);
}

function manuallyExcluded(rule: OperationalRule, rules: OperationalRules): CheckedRule {
  const detail = `excluded is ${rules.excluded ? "true" : "false"}.`;
  return checked(rule, rules.excluded ? "matched" : "clear", null, detail);
}

function checkRule(rule: OperationalRule, view: RuleView): CheckedRule {
  if (rule.kind === "ZERO_IMPRESSIONS") return zeroImpressions(rule, view.campaign, view.operationalRules);
  if (rule.kind === "POLICY_REJECTED") return policyRejected(rule, view.operationalRules);
  if (rule.kind === "COST_THRESHOLD") return costThreshold(rule, view.campaign);
  if (rule.kind === "NO_CLICKS") return noClicks(rule, view.campaign);
  if (rule.kind === "NO_CONVERSIONS") return noConversions(rule, view.campaign);
  if (rule.kind === "MANUALLY_LOCKED") return manuallyLocked(rule, view.operationalRules);
  return manuallyExcluded(rule, view.operationalRules);
}

/** Enabled rules only, in the order they were supplied. */
export function evaluateOperationalRules(view: RuleView): CheckedRule[] {
  const checkedRules: CheckedRule[] = [];
  for (const rule of view.operationalRules.rules) {
    if (!rule.enabled) continue;
    checkedRules.push(checkRule(rule, view));
  }
  return checkedRules;
}
