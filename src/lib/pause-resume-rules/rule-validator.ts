/**
 * Host record domain: pause and resume rule validator.
 *
 * Pure local rules. It rejects a missing recommendation set, missing
 * metrics, missing operational rules, a conflicting rule table, a
 * corrupted snapshot, and invalid metadata. It does not send a request
 * and does not change what it is given.
 */
import { CAMPAIGN_METRIC_KEYS, METRIC_VALUE_KEYS } from "../optimization-metrics/metrics-snapshot";
import {
  EVIDENCE_KEYS,
  EVIDENCE_ROW_KEYS as RECOMMENDATION_EVIDENCE_ROW_KEYS,
  HISTORICAL_COMPARISON_KEYS,
  RECOMMENDATION_KEYS,
  RECOMMENDATION_SET_KEYS,
  SUPPORTING_METRIC_KEYS,
  SUPPORTING_METRICS_KEYS,
} from "../optimization-recommendation/optimization-snapshot";
import { CONFIDENCE_LEVELS, RECOMMENDATION_KINDS, RULE_IDS } from "../optimization-recommendation/optimization-types";
import {
  PERFORMANCE_CLASSIFICATIONS,
  PERFORMANCE_COMPARISON_KEYS,
  PERFORMANCE_DIRECTIONS,
  PERFORMANCE_FINDING_KEYS,
  PERFORMANCE_INDICATOR_KEYS,
  PERFORMANCE_LEVELS,
  PERFORMANCE_METHODS,
  PERFORMANCE_REPORT_KEYS,
} from "../performance-analysis/performance-snapshot";
import { RULE_CONTEXT_MEMBERS, type RuleMetadata } from "./rule-context";
import {
  ACTION_PLAN_KEYS,
  EVIDENCE_ROW_KEYS,
  PENDING_ACTION_KEYS,
  RECOMMENDATION_CITE_KEYS,
  RULE_CONTEXT_RECORD_KEYS,
  RULE_EVIDENCE_KEYS,
  RULE_ORIGINS,
  RULE_PROVENANCE,
  RULE_SNAPSHOT_KEYS,
  RULE_STATISTICS_KEYS,
  RULE_STATUSES,
} from "./rule-snapshot";
import {
  COST_THRESHOLD_KINDS,
  INTEGER_THRESHOLD_KINDS,
  OPERATIONAL_RULE_IDS,
  OPERATIONAL_RULE_KEYS,
  OPERATIONAL_RULE_KINDS,
  OPERATIONAL_RULES_KEYS,
  PLAN_OUTCOMES,
  RULE_ACTIONS,
  RULE_KIND_BY_ID,
  type OperationalRuleKind,
  type RuleIssue,
  type RuleView,
} from "./rule-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const WINDOW = /^[A-Z][A-Z0-9_]*$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;
const ALIGNED = [
  ["Impression Trend", "impressions"],
  ["Click Trend", "clicks"],
  ["Cost Trend", "costMicros"],
  ["Conversion Trend", "conversions"],
] as const;

export interface RuleValidator {
  validateInput(input: unknown): RuleIssue[];
  validateMetadata(input: unknown): RuleIssue[];
  validateSnapshot(input: unknown): RuleIssue[];
  parseInput(input: unknown): RuleView | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRuleMetadata(value: unknown): value is RuleMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RuleIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function missingRecommendations(field: string, message: string): RuleIssue {
  return { field, message: `Missing Recommendations: ${message}` };
}

function missingMetrics(field: string, message: string): RuleIssue {
  return { field, message: `Missing Metrics: ${message}` };
}

function missingRules(field: string, message: string): RuleIssue {
  return { field, message: `Missing Operational Rules: ${message}` };
}

function conflicting(field: string, message: string): RuleIssue {
  return { field, message: `Conflicting Rules: ${message}` };
}

function corrupted(field: string, message: string): RuleIssue {
  return { field, message: `Corrupted Snapshot: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

function positiveFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function includes(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.some((item) => item === value);
}

function validateMetadataRecord(value: unknown, field: string): RuleIssue[] {
  if (value === undefined) return [];
  if (!isPlainRecord(value)) return [invalid(field, "metadata must be a flat record.")];
  const issues: RuleIssue[] = [];
  for (const key of SECRET_KEYS) {
    if (key in value) issues.push(invalid(`${field}.${key}`, "a credential field is not allowed."));
  }
  if (!isFlatRuleMetadata(value)) issues.push(invalid(field, "metadata must be a flat record."));
  return issues;
}

function validateValues(record: Record<string, unknown>, field: string): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const key of METRIC_VALUE_KEYS) {
    if (!finiteOrNull(record[key])) issues.push(corrupted(`${field}.${key}`, `${key} must be a non-negative finite number or null.`));
  }
  return issues;
}

function validateIndicator(value: unknown, field: string): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, PERFORMANCE_INDICATOR_KEYS)) return [corrupted(field, "an indicator record is required.")];
  const issues: RuleIssue[] = [];
  if (textOf(value.name) === "" || textOf(value.resourceName) === "") issues.push(corrupted(field, "an indicator needs a name and a resource."));
  if (!includes(PERFORMANCE_LEVELS, value.level)) issues.push(corrupted(field, "an indicator level is not recognized."));
  const changeOk = value.change === null || (typeof value.change === "number" && Number.isFinite(value.change));
  if (!finiteOrNull(value.current) || !finiteOrNull(value.historical) || !changeOk) issues.push(corrupted(field, "an indicator figure must be a finite number or null."));
  if (!includes(PERFORMANCE_DIRECTIONS, value.direction)) issues.push(corrupted(field, "an indicator direction is not recognized."));
  if (!includes(PERFORMANCE_METHODS, value.method)) issues.push(corrupted(field, "an indicator method is not recognized."));
  return issues;
}

function validateCampaign(value: unknown): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, CAMPAIGN_METRIC_KEYS)) return [corrupted("campaignMetrics", "a campaign metric record is required.")];
  const issues = validateValues(value, "campaignMetrics");
  const match = CAMPAIGN_RESOURCE.exec(textOf(value.resourceName));
  if (match === null || textOf(value.campaignId) !== match[2] || textOf(value.status) === "") issues.push(corrupted("campaignMetrics", "the campaign resource does not match its id."));
  return issues;
}

function validateReport(value: unknown, campaign: Record<string, unknown> | null): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, PERFORMANCE_REPORT_KEYS)) return [corrupted("performanceReport", "a performance report is required.")];
  const issues: RuleIssue[] = [];
  const resourceName = textOf(value.campaignResourceName);
  if (CAMPAIGN_RESOURCE.exec(resourceName) === null || textOf(value.campaignId) === "" || textOf(value.status) === "") {
    issues.push(corrupted("performanceReport", "the report resource does not match its id."));
  }
  if (campaign !== null && (resourceName !== textOf(campaign.resourceName) || textOf(value.campaignId) !== textOf(campaign.campaignId) || textOf(value.status) !== textOf(campaign.status))) {
    issues.push(corrupted("performanceReport", "the report does not match the campaign metrics."));
  }
  if (!Array.isArray(value.indicators)) return [...issues, corrupted("performanceReport.indicators", "indicators are required.")];
  value.indicators.forEach((indicator, index) => issues.push(...validateIndicator(indicator, `performanceReport.indicators.${index}`)));
  if (!isPlainRecord(value.comparison) || !exactKeys(value.comparison, PERFORMANCE_COMPARISON_KEYS)) {
    issues.push(corrupted("performanceReport.comparison", "a comparison record is required."));
  } else {
    const currentWindow = textOf(value.comparison.currentWindow);
    const historicalWindow = textOf(value.comparison.historicalWindow);
    if (!WINDOW.test(currentWindow) || !WINDOW.test(historicalWindow) || currentWindow === historicalWindow) {
      issues.push(corrupted("performanceReport.comparison", "the time windows are not a current and a prior label."));
    }
    if (textOf(value.comparison.campaignResourceName) !== resourceName) issues.push(corrupted("performanceReport.comparison", "the comparison resource does not match the report."));
    if (!Array.isArray(value.comparison.rows)) issues.push(corrupted("performanceReport.comparison.rows", "comparison rows are required."));
    else value.comparison.rows.forEach((indicator, index) => issues.push(...validateIndicator(indicator, `performanceReport.comparison.rows.${index}`)));
  }
  if (!Array.isArray(value.findings)) issues.push(corrupted("performanceReport.findings", "findings are required."));
  else {
    value.findings.forEach((finding, index) => {
      if (!isPlainRecord(finding) || !exactKeys(finding, PERFORMANCE_FINDING_KEYS)) {
        issues.push(corrupted(`performanceReport.findings.${index}`, "a finding record is required."));
        return;
      }
      if (!includes(PERFORMANCE_LEVELS, finding.level) || !includes(PERFORMANCE_CLASSIFICATIONS, finding.classification) || textOf(finding.resourceName) === "" || textOf(finding.indicator) === "") {
        issues.push(corrupted(`performanceReport.findings.${index}`, "a finding is not recognized."));
      }
    });
  }
  if (campaign !== null) issues.push(...alignedFigures(value, campaign));
  return issues;
}

function alignedFigures(report: Record<string, unknown>, campaign: Record<string, unknown>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const pools = [report.indicators, isPlainRecord(report.comparison) ? report.comparison.rows : []];
  for (const [name, field] of ALIGNED) {
    let found = false;
    for (const pool of pools) {
      if (!Array.isArray(pool)) continue;
      for (const indicator of pool) {
        if (!isPlainRecord(indicator) || indicator.name !== name || indicator.level !== "CAMPAIGN" || indicator.resourceName !== campaign.resourceName) continue;
        found = true;
        if (indicator.method !== "DIFFERENCE" || indicator.current !== campaign[field]) {
          issues.push(corrupted("performanceReport", `${name} does not match the campaign ${field} figure.`));
        }
      }
    }
    if (!found) issues.push(corrupted("performanceReport", `${name} is missing for the campaign.`));
  }
  return issues;
}

function validateRecommendation(value: unknown, field: string, windows: { current: string; historical: string }): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, RECOMMENDATION_KEYS)) return [corrupted(field, "a recommendation record is required.")];
  const issues: RuleIssue[] = [];
  if (!includes(RULE_IDS, value.recommendationId) || !includes(RECOMMENDATION_KINDS, value.kind) || textOf(value.reason) === "" || !includes(CONFIDENCE_LEVELS, value.confidence)) {
    issues.push(corrupted(field, "a recommendation is not recognized."));
  }
  if (!Array.isArray(value.triggeredRules) || value.triggeredRules.length === 0 || value.triggeredRules.some((item) => typeof item !== "string") || !value.triggeredRules.includes(value.recommendationId)) {
    issues.push(corrupted(field, "a recommendation must cite its rule."));
  }
  if (!isPlainRecord(value.evidence) || !exactKeys(value.evidence, EVIDENCE_KEYS) || !Array.isArray(value.evidence.rows)) {
    issues.push(corrupted(`${field}.evidence`, "recommendation evidence is required."));
  } else {
    value.evidence.rows.forEach((row, index) => {
      if (!isPlainRecord(row) || !exactKeys(row, RECOMMENDATION_EVIDENCE_ROW_KEYS)) issues.push(corrupted(`${field}.evidence.rows.${index}`, "a recommendation evidence row is required."));
    });
  }
  if (!isPlainRecord(value.supportingMetrics) || !exactKeys(value.supportingMetrics, SUPPORTING_METRICS_KEYS) || !Array.isArray(value.supportingMetrics.rows)) {
    issues.push(corrupted(`${field}.supportingMetrics`, "supporting metrics are required."));
  } else {
    value.supportingMetrics.rows.forEach((row, index) => {
      if (!isPlainRecord(row) || !exactKeys(row, SUPPORTING_METRIC_KEYS)) issues.push(corrupted(`${field}.supportingMetrics.rows.${index}`, "a supporting metric row is required."));
    });
  }
  if (!isPlainRecord(value.historicalComparison) || !exactKeys(value.historicalComparison, HISTORICAL_COMPARISON_KEYS) || !Array.isArray(value.historicalComparison.rows)) {
    issues.push(corrupted(`${field}.historicalComparison`, "a historical comparison is required."));
  } else if (textOf(value.historicalComparison.currentWindow) !== windows.current || textOf(value.historicalComparison.historicalWindow) !== windows.historical) {
    issues.push(corrupted(`${field}.historicalComparison`, "the recommendation windows do not match the report."));
  }
  return issues;
}

function validateRecommendationSet(value: unknown, campaignResourceName: string, windows: { current: string; historical: string }): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, RECOMMENDATION_SET_KEYS)) return [corrupted("recommendationSet", "a recommendation set is required.")];
  const issues: RuleIssue[] = [];
  if (textOf(value.campaignResourceName) !== campaignResourceName) issues.push(corrupted("recommendationSet", "the recommendation set does not match the campaign."));
  if (!Array.isArray(value.recommendations) || value.recommendations.length === 0) {
    issues.push(missingRecommendations("recommendationSet.recommendations", "at least one recommendation is required."));
    return issues;
  }
  value.recommendations.forEach((item, index) => issues.push(...validateRecommendation(item, `recommendationSet.recommendations.${index}`, windows)));
  return issues;
}

function thresholdIssues(kind: OperationalRuleKind, enabled: boolean, threshold: unknown, field: string): RuleIssue[] {
  const integerKind = INTEGER_THRESHOLD_KINDS.some((item) => item === kind);
  const costKind = COST_THRESHOLD_KINDS.some((item) => item === kind);
  if (!integerKind && !costKind) {
    return threshold === null ? [] : [corrupted(field, "this rule does not take a threshold.")];
  }
  const valid = integerKind ? positiveInteger(threshold) : positiveFinite(threshold);
  if (threshold === null) return enabled ? [missingRules(field, "an enabled rule needs its threshold.")] : [];
  return valid ? [] : [corrupted(field, "a threshold must be a positive finite number.")];
}

function validateOperationalRules(value: unknown): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, OPERATIONAL_RULES_KEYS)) return [missingRules("operationalRules", "operational rules are required.")];
  const issues: RuleIssue[] = [];
  if (typeof value.locked !== "boolean" || typeof value.excluded !== "boolean") issues.push(corrupted("operationalRules", "locked and excluded must be booleans."));
  if (value.locked === true && value.excluded === true) issues.push(conflicting("operationalRules", "a campaign cannot be locked and excluded together."));
  if (value.observedPeriodDays !== null && (typeof value.observedPeriodDays !== "number" || !Number.isFinite(value.observedPeriodDays) || value.observedPeriodDays < 0)) {
    issues.push(corrupted("operationalRules.observedPeriodDays", "the observed period must be a non-negative finite number or null."));
  }
  if (value.policyApprovalStatus !== null && textOf(value.policyApprovalStatus) === "") {
    issues.push(corrupted("operationalRules.policyApprovalStatus", "the policy status must be text or null."));
  }
  const table = value.rules;
  if (!Array.isArray(table)) return [...issues, missingRules("operationalRules.rules", "the operational rule table is required.")];
  const seenIds = new Set<string>();
  const seenKinds = new Set<string>();
  table.forEach((rule, index) => {
    const field = `operationalRules.rules.${index}`;
    if (!isPlainRecord(rule) || !exactKeys(rule, OPERATIONAL_RULE_KEYS)) {
      issues.push(corrupted(field, "an operational rule record is required."));
      return;
    }
    const id = textOf(rule.id);
    const kind = textOf(rule.kind);
    if (!includes(OPERATIONAL_RULE_IDS, id) || !includes(OPERATIONAL_RULE_KINDS, kind) || RULE_KIND_BY_ID[id as keyof typeof RULE_KIND_BY_ID] !== kind) {
      issues.push(corrupted(field, "the rule id does not match its kind."));
    }
    if (seenIds.has(id) || seenKinds.has(kind)) issues.push(conflicting(field, "a rule id or kind is repeated."));
    seenIds.add(id);
    seenKinds.add(kind);
    if (typeof rule.enabled !== "boolean" || !includes(RULE_ACTIONS, rule.action)) issues.push(corrupted(field, "enabled and action must be explicit."));
    if (includes(OPERATIONAL_RULE_KINDS, kind)) issues.push(...thresholdIssues(kind as OperationalRuleKind, rule.enabled === true, rule.threshold, `${field}.threshold`));
    if (kind === "ZERO_IMPRESSIONS" && rule.enabled === true && typeof value.observedPeriodDays !== "number") {
      issues.push(missingRules(`${field}.observedPeriodDays`, "the zero-impression rule needs an observed period."));
    }
  });
  if (table.length !== OPERATIONAL_RULE_IDS.length || OPERATIONAL_RULE_IDS.some((id, index) => {
    const rule = table[index];
    return !isPlainRecord(rule) || rule.id !== id;
  })) {
    issues.push(corrupted("operationalRules.rules", "the rule table is not the operational rule set."));
  }
  return issues;
}

function windowsOf(report: unknown): { current: string; historical: string } {
  if (!isPlainRecord(report) || !isPlainRecord(report.comparison)) return { current: "", historical: "" };
  return { current: textOf(report.comparison.currentWindow), historical: textOf(report.comparison.historicalWindow) };
}

function validateEvidenceRow(value: unknown, field: string): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, EVIDENCE_ROW_KEYS)) return [corrupted(field, "a rule evidence row is required.")];
  const issues: RuleIssue[] = [];
  if (!includes(OPERATIONAL_RULE_IDS, value.ruleId) || !includes(OPERATIONAL_RULE_KINDS, value.kind) || typeof value.matched !== "boolean" || !finiteOrNull(value.current) || !finiteOrNull(value.threshold) || textOf(value.detail) === "") {
    issues.push(corrupted(field, "a rule evidence row is incomplete."));
  }
  return issues;
}

function validatePending(value: unknown, field: string, outcome: unknown): RuleIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, PENDING_ACTION_KEYS)) return [corrupted(field, "a pending action is required.")];
  const issues: RuleIssue[] = [];
  if (!SNAPSHOT_ID.test(textOf(value.actionId)) || value.outcome !== outcome || value.approval !== "REQUIRED" || value.executed !== false || textOf(value.reason) === "") {
    issues.push(corrupted(field, "a pending action must require approval and stay unexecuted."));
  }
  if (!Array.isArray(value.triggeredRules) || value.triggeredRules.length === 0 || value.triggeredRules.some((item) => typeof item !== "string" || item === "")) {
    issues.push(corrupted(field, "a pending action must cite its triggering rule."));
  }
  if (!isPlainRecord(value.evidence) || !exactKeys(value.evidence, ["rows"]) || !Array.isArray(value.evidence.rows) || value.evidence.rows.length === 0) {
    issues.push(corrupted(`${field}.evidence`, "a pending action must expose evidence."));
  } else value.evidence.rows.forEach((row, index) => issues.push(...validateEvidenceRow(row, `${field}.evidence.rows.${index}`)));
  return issues;
}

export function createRuleValidator(): RuleValidator {
  return {
    validateMetadata(input) {
      if (!isPlainRecord(input)) return [invalid("metadata", "metadata must be a flat record.")];
      return [...validateMetadataRecord(input.executionMetadata, "executionMetadata"), ...validateMetadataRecord(input.runtimeMetadata, "runtimeMetadata")];
    },
    validateInput(input) {
      if (!isPlainRecord(input)) return [invalid("input", "a rule context is required.")];
      const issues: RuleIssue[] = [];
      for (const key of Object.keys(input)) {
        if (!RULE_CONTEXT_MEMBERS.some((member) => member === key)) issues.push(invalid(key, "an unexpected field is present."));
      }
      issues.push(...this.validateMetadata(input));
      if (input.recommendationSet == null) issues.push(missingRecommendations("recommendationSet", "a recommendation set is required."));
      if (input.performanceReport == null) issues.push(missingMetrics("performanceReport", "a performance report is required."));
      if (input.campaignMetrics == null) issues.push(missingMetrics("campaignMetrics", "campaign metrics are required."));
      if (input.operationalRules == null) issues.push(missingRules("operationalRules", "operational rules are required."));
      const campaignIssues = input.campaignMetrics == null ? [] : validateCampaign(input.campaignMetrics);
      issues.push(...campaignIssues);
      const campaign = isPlainRecord(input.campaignMetrics) ? input.campaignMetrics : null;
      if (input.performanceReport != null) issues.push(...validateReport(input.performanceReport, campaign));
      if (input.operationalRules != null) issues.push(...validateOperationalRules(input.operationalRules));
      if (input.recommendationSet != null && campaign !== null && isPlainRecord(input.performanceReport)) {
        issues.push(...validateRecommendationSet(input.recommendationSet, textOf(campaign.resourceName), windowsOf(input.performanceReport)));
      }
      return issues;
    },
    validateSnapshot(input) {
      if (!isPlainRecord(input) || !exactKeys(input, RULE_SNAPSHOT_KEYS)) return [corrupted("snapshot", "a snapshot record is required.")];
      const issues: RuleIssue[] = [];
      if (!SNAPSHOT_ID.test(textOf(input.actionPlanId))) issues.push(corrupted("actionPlanId", "the action plan id is not usable."));
      if (!includes(RULE_STATUSES, "OK") || !includes(RULE_ORIGINS, input.origin) || !includes(RULE_PROVENANCE, input.provenance) || !ISO.test(textOf(input.createdAt))) {
        issues.push(corrupted("snapshot", "origin, provenance, or the timestamp is not usable."));
      }
      const statistics = input.statistics;
      if (!isPlainRecord(statistics) || !exactKeys(statistics, RULE_STATISTICS_KEYS)) issues.push(corrupted("statistics", "statistics are required."));
      else {
        const badFigure = RULE_STATISTICS_KEYS.some((key) => {
          const figure = statistics[key];
          return typeof figure !== "number" || !Number.isFinite(figure) || figure < 0;
        });
        if (badFigure || statistics.ruleCount !== OPERATIONAL_RULE_KINDS.length) issues.push(corrupted("statistics", "statistics must restate the rule table."));
      }
      if (!isPlainRecord(input.actionPlan) || !exactKeys(input.actionPlan, ACTION_PLAN_KEYS)) issues.push(corrupted("actionPlan", "an action plan is required."));
      const outcome = isPlainRecord(input.actionPlan) ? input.actionPlan.outcome : null;
      if (!includes(PLAN_OUTCOMES, outcome)) issues.push(corrupted("actionPlan.outcome", "the outcome is not recognized."));
      if (!Array.isArray(input.pendingActions) || (isPlainRecord(input.actionPlan) && input.actionPlan.pendingActions !== input.pendingActions)) {
        issues.push(corrupted("pendingActions", "pending actions must be the plan actions."));
      }
      if (Array.isArray(input.pendingActions)) {
        input.pendingActions.forEach((action, index) => issues.push(...validatePending(action, `pendingActions.${index}`, outcome)));
        if (outcome === "No Action" && input.pendingActions.length !== 0) issues.push(corrupted("pendingActions", "No Action has no pending action."));
        if (outcome !== "No Action" && input.pendingActions.length === 0) issues.push(corrupted("pendingActions", "the outcome has no pending action."));
      }
      if (!isPlainRecord(input.evidence) || !exactKeys(input.evidence, RULE_EVIDENCE_KEYS) || (isPlainRecord(input.actionPlan) && input.actionPlan.evidence !== input.evidence)) {
        issues.push(corrupted("evidence", "rule evidence is required."));
      } else {
        if (!Array.isArray(input.evidence.recommendations)) issues.push(corrupted("evidence.recommendations", "recommendation cites are required."));
        else {
          input.evidence.recommendations.forEach((cite, index) => {
            if (!isPlainRecord(cite) || !exactKeys(cite, RECOMMENDATION_CITE_KEYS) || textOf(cite.recommendationId) === "" || textOf(cite.kind) === "") {
              issues.push(corrupted(`evidence.recommendations.${index}`, "a recommendation cite is required."));
            }
          });
        }
        if (!Array.isArray(input.evidence.rows)) issues.push(corrupted("evidence.rows", "rule evidence rows are required."));
        else input.evidence.rows.forEach((row, index) => issues.push(...validateEvidenceRow(row, `evidence.rows.${index}`)));
      }
      if (!isPlainRecord(input.context) || !exactKeys(input.context, RULE_CONTEXT_RECORD_KEYS)) issues.push(corrupted("context", "a context record is required."));
      else if (isPlainRecord(input.evidence) && (input.context.campaignResourceName !== input.evidence.campaignResourceName || input.context.currentWindow !== input.evidence.currentWindow || input.context.historicalWindow !== input.evidence.historicalWindow)) {
        issues.push(corrupted("context", "the context does not match the evidence."));
      }
      if (!isPlainRecord(input.metadata) || !isFlatRuleMetadata(input.metadata)) issues.push(invalid("metadata", "metadata must be a flat record."));
      for (const key of SECRET_KEYS) {
        if (isPlainRecord(input.metadata) && key in input.metadata) issues.push(invalid(`metadata.${key}`, "a credential field is not allowed."));
      }
      if (isPlainRecord(input.statistics) && Array.isArray(input.pendingActions) && input.statistics.pendingActionCount !== input.pendingActions.length) {
        issues.push(corrupted("statistics.pendingActionCount", "the pending action count does not match."));
      }
      if (isPlainRecord(input.statistics) && isPlainRecord(input.evidence) && Array.isArray(input.evidence.rows)) {
        const matched = input.evidence.rows.filter((row) => isPlainRecord(row) && row.matched === true).length;
        if (input.statistics.matchedRuleCount !== matched) issues.push(corrupted("statistics.matchedRuleCount", "the matched rule count does not match the evidence."));
      }
      return issues;
    },
    parseInput(input) {
      if (!isPlainRecord(input) || !isPlainRecord(input.recommendationSet) || !isPlainRecord(input.performanceReport) || !isPlainRecord(input.campaignMetrics) || !isPlainRecord(input.operationalRules)) return null;
      return {
        recommendationSet: input.recommendationSet as unknown as RuleView["recommendationSet"],
        report: input.performanceReport as unknown as RuleView["report"],
        campaign: input.campaignMetrics as unknown as RuleView["campaign"],
        operationalRules: input.operationalRules as unknown as RuleView["operationalRules"],
      };
    },
  };
}
