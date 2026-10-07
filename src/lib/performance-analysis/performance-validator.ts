/**
 * Host record domain: performance validator.
 *
 * Pure local rules. It rejects a missing metric record, a missing prior
 * window, a bad time window, a corrupted metric record, and invalid metadata.
 * It does not send a request and does not change what it is given.
 */
import type { AdGroupMetrics, CampaignMetrics, RsaMetrics } from "../optimization-metrics/metrics-snapshot";
import { AD_GROUP_METRIC_KEYS, CAMPAIGN_METRIC_KEYS, METRIC_VALUE_KEYS, RSA_METRIC_KEYS } from "../optimization-metrics/metrics-snapshot";
import { PERFORMANCE_CONTEXT_MEMBERS, type PerformanceMetadata } from "./performance-context";
import {
  CAMPAIGN_INDICATOR_NAMES,
  ENTITY_INDICATOR_NAMES,
  PERFORMANCE_CLASSIFICATIONS,
  PERFORMANCE_COMPARISON_KEYS,
  PERFORMANCE_CONTEXT_RECORD_KEYS,
  PERFORMANCE_DIRECTIONS,
  PERFORMANCE_FINDING_KEYS,
  PERFORMANCE_INDICATOR_KEYS,
  PERFORMANCE_LEVELS,
  PERFORMANCE_METHODS,
  PERFORMANCE_REPORT_KEYS,
  PERFORMANCE_SNAPSHOT_KEYS,
  PERFORMANCE_STATISTICS_KEYS,
  type PerformanceIssue,
} from "./performance-snapshot";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const WINDOW = /^[A-Z][A-Z0-9_]*$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const AD_RESOURCE = /^customers\/(\d+)\/adGroupAds\/\d+~(\d+)$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;
const HISTORICAL_KEYS = ["campaignMetrics", "adGroupMetrics", "rsaMetrics", "budgetAmountMicros"] as const;
const WINDOW_KEYS = ["current", "historical"] as const;

export interface ParsedPerformanceInput {
  campaign: CampaignMetrics;
  adGroups: AdGroupMetrics[];
  ads: RsaMetrics[];
  historicalCampaign: CampaignMetrics;
  historicalAdGroups: AdGroupMetrics[];
  historicalAds: RsaMetrics[];
  budgetAmountMicros: number | null;
  historicalBudgetAmountMicros: number | null;
  currentWindow: string;
  historicalWindow: string;
  metadata: PerformanceMetadata;
}

export interface PerformanceValidator {
  validateInput(input: unknown): PerformanceIssue[];
  validateMetadata(input: unknown): PerformanceIssue[];
  validateSnapshot(input: unknown): PerformanceIssue[];
  parseInput(input: unknown): ParsedPerformanceInput | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatPerformanceMetadata(value: unknown): value is PerformanceMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): PerformanceIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function missingMetrics(field: string, message: string): PerformanceIssue {
  return { field, message: `Missing Metrics: ${message}` };
}

function missingHistory(field: string, message: string): PerformanceIssue {
  return { field, message: `Missing Historical Data: ${message}` };
}

function badWindow(field: string, message: string): PerformanceIssue {
  return { field, message: `Invalid Time Window: ${message}` };
}

function corrupted(field: string, message: string): PerformanceIssue {
  return { field, message: `Corrupted Snapshot: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function finiteOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function validateValues(record: Record<string, unknown>, field: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  for (const key of METRIC_VALUE_KEYS) {
    if (!finiteOrNull(record[key])) issues.push(corrupted(`${field}.${key}`, `${key} must be a non-negative finite number or null.`));
  }
  return issues;
}

function optionalBudget(value: unknown, field: string): PerformanceIssue[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return [corrupted(field, "a budget figure must be a non-negative finite number or null.")];
  return [];
}

function validateCampaign(value: unknown, field: string): PerformanceIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, CAMPAIGN_METRIC_KEYS)) return [corrupted(field, "a campaign metric record is required.")];
  const issues = validateValues(value, field);
  const resourceName = textOf(value.resourceName);
  const match = CAMPAIGN_RESOURCE.exec(resourceName);
  if (match === null || textOf(value.campaignId) !== match[2]) issues.push(corrupted(field, "the campaign resource does not match its id."));
  if (textOf(value.status) === "") issues.push(corrupted(`${field}.status`, "a campaign status is required."));
  return issues;
}

function validateGroups(value: unknown, field: string, campaignResourceName: string, customerId: string): PerformanceIssue[] {
  if (!Array.isArray(value)) return [corrupted(field, "ad group metrics are required.")];
  const issues: PerformanceIssue[] = [];
  const seen = new Set<string>();
  value.forEach((group, index) => {
    const item = `${field}.${index}`;
    if (!isPlainRecord(group) || !exactKeys(group, AD_GROUP_METRIC_KEYS)) {
      issues.push(corrupted(item, "an ad group metric record is required."));
      return;
    }
    issues.push(...validateValues(group, item));
    const resourceName = textOf(group.resourceName);
    const match = AD_GROUP_RESOURCE.exec(resourceName);
    if (match === null || match[1] !== customerId || textOf(group.adGroupId) !== match[2] || textOf(group.campaignResourceName) !== campaignResourceName) {
      issues.push(corrupted(item, "the ad group resource does not match the campaign."));
    }
    if (seen.has(resourceName)) issues.push(corrupted(item, "the ad group resource is repeated."));
    seen.add(resourceName);
  });
  return issues;
}

function groupNames(value: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(value)) return names;
  for (const group of value) {
    if (isPlainRecord(group) && typeof group.resourceName === "string") names.add(group.resourceName);
  }
  return names;
}

function validateAds(value: unknown, field: string, campaignResourceName: string, customerId: string, groups: Set<string>): PerformanceIssue[] {
  if (!Array.isArray(value)) return [corrupted(field, "responsive search ad metrics are required.")];
  const issues: PerformanceIssue[] = [];
  const seen = new Set<string>();
  value.forEach((ad, index) => {
    const item = `${field}.${index}`;
    if (!isPlainRecord(ad) || !exactKeys(ad, RSA_METRIC_KEYS)) {
      issues.push(corrupted(item, "a responsive search ad metric record is required."));
      return;
    }
    issues.push(...validateValues(ad, item));
    const resourceName = textOf(ad.resourceName);
    const match = AD_RESOURCE.exec(resourceName);
    const groupResource = textOf(ad.adGroupResourceName);
    if (match === null || match[1] !== customerId || textOf(ad.adId) !== match[2] || textOf(ad.campaignResourceName) !== campaignResourceName || !groups.has(groupResource)) {
      issues.push(corrupted(item, "the ad resource does not match the campaign."));
    }
    if (textOf(ad.status) === "") issues.push(corrupted(`${item}.status`, "an ad status is required."));
    if (ad.approvalStatus !== null && textOf(ad.approvalStatus) === "") issues.push(corrupted(`${item}.approvalStatus`, "a policy status must be text or null."));
    if (ad.policyReviewStatus !== null && textOf(ad.policyReviewStatus) === "") issues.push(corrupted(`${item}.policyReviewStatus`, "a policy status must be text or null."));
    if (seen.has(resourceName)) issues.push(corrupted(item, "the ad resource is repeated."));
    seen.add(resourceName);
  });
  return issues;
}

function campaignResource(value: unknown): { resourceName: string; customerId: string } | null {
  if (!isPlainRecord(value)) return null;
  const resourceName = textOf(value.resourceName);
  const match = CAMPAIGN_RESOURCE.exec(resourceName);
  if (match === null) return null;
  return { resourceName, customerId: match[1] };
}

export function createPerformanceValidator(): PerformanceValidator {
  function validateMetadata(input: unknown): PerformanceIssue[] {
    if (input === undefined) return [];
    if (!isFlatPerformanceMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateHistorical(value: unknown, campaignResourceName: string): PerformanceIssue[] {
    if (!isPlainRecord(value)) return [missingHistory("historicalMetrics", "historical metrics are required.")];
    const issues: PerformanceIssue[] = [];
    for (const key of Object.keys(value)) {
      if (!(HISTORICAL_KEYS as readonly string[]).includes(key)) issues.push(corrupted(`historicalMetrics.${key}`, `unexpected member "${key}".`));
    }
    if (!("campaignMetrics" in value) || value.campaignMetrics == null) issues.push(missingHistory("historicalMetrics.campaignMetrics", "historical campaign metrics are required."));
    else {
      issues.push(...validateCampaign(value.campaignMetrics, "historicalMetrics.campaignMetrics").map((item) => (item.message.startsWith("Corrupted Snapshot:") ? item : missingHistory(item.field, item.message))));
      const identity = campaignResource(value.campaignMetrics);
      if (identity !== null && identity.resourceName !== campaignResourceName) {
        issues.push(missingHistory("historicalMetrics.campaignMetrics", "historical campaign metrics belong to another campaign."));
      }
    }
    const identity = campaignResource(value.campaignMetrics);
    if (!("adGroupMetrics" in value)) issues.push(missingHistory("historicalMetrics.adGroupMetrics", "historical ad group metrics are required."));
    else if (identity !== null) issues.push(...validateGroups(value.adGroupMetrics, "historicalMetrics.adGroupMetrics", identity.resourceName, identity.customerId));
    if (!("rsaMetrics" in value)) issues.push(missingHistory("historicalMetrics.rsaMetrics", "historical responsive search ad metrics are required."));
    else if (identity !== null && Array.isArray(value.adGroupMetrics)) issues.push(...validateAds(value.rsaMetrics, "historicalMetrics.rsaMetrics", identity.resourceName, identity.customerId, groupNames(value.adGroupMetrics)));
    if ("budgetAmountMicros" in value) issues.push(...optionalBudget(value.budgetAmountMicros, "historicalMetrics.budgetAmountMicros"));
    return issues;
  }

  function validateWindow(value: unknown): PerformanceIssue[] {
    if (!isPlainRecord(value)) return [badWindow("timeWindow", "a current window and a historical window are required.")];
    const issues: PerformanceIssue[] = [];
    for (const key of Object.keys(value)) {
      if (!(WINDOW_KEYS as readonly string[]).includes(key)) issues.push(badWindow(`timeWindow.${key}`, `unexpected member "${key}".`));
    }
    const current = textOf(value.current);
    const historical = textOf(value.historical);
    if (!WINDOW.test(current) || !WINDOW.test(historical)) issues.push(badWindow("timeWindow", "a current window and a historical window are required."));
    else if (current === historical) issues.push(badWindow("timeWindow", "the current and historical windows must differ."));
    return issues;
  }

  function validateInput(input: unknown): PerformanceIssue[] {
    if (!isPlainRecord(input)) return [missingMetrics("campaignMetrics", "campaign metrics are required.")];
    const issues: PerformanceIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PERFORMANCE_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored."));
    }
    if (!("campaignMetrics" in input) || input.campaignMetrics == null) issues.push(missingMetrics("campaignMetrics", "campaign metrics are required."));
    else issues.push(...validateCampaign(input.campaignMetrics, "campaignMetrics"));
    const identity = campaignResource(input.campaignMetrics);
    if (!("adGroupMetrics" in input)) issues.push(missingMetrics("adGroupMetrics", "ad group metrics are required."));
    else if (identity !== null) issues.push(...validateGroups(input.adGroupMetrics, "adGroupMetrics", identity.resourceName, identity.customerId));
    if (!("rsaMetrics" in input)) issues.push(missingMetrics("rsaMetrics", "responsive search ad metrics are required."));
    else if (identity !== null && Array.isArray(input.adGroupMetrics)) issues.push(...validateAds(input.rsaMetrics, "rsaMetrics", identity.resourceName, identity.customerId, groupNames(input.adGroupMetrics)));
    if (!("historicalMetrics" in input) || input.historicalMetrics == null) issues.push(missingHistory("historicalMetrics", "historical metrics are required."));
    else if (identity !== null) issues.push(...validateHistorical(input.historicalMetrics, identity.resourceName));
    if ("budgetAmountMicros" in input) issues.push(...optionalBudget(input.budgetAmountMicros, "budgetAmountMicros"));
    if (!("timeWindow" in input) || input.timeWindow == null) issues.push(badWindow("timeWindow", "a current window and a historical window are required."));
    else issues.push(...validateWindow(input.timeWindow));
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function budgetOrNull(value: unknown): number | null {
    return typeof value === "number" ? value : null;
  }

  function parseInput(input: unknown): ParsedPerformanceInput | null {
    if (validateInput(input).length > 0 || !isPlainRecord(input) || !isPlainRecord(input.historicalMetrics) || !isPlainRecord(input.timeWindow)) return null;
    const metadata = isPlainRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as PerformanceMetadata) : {};
    return {
      campaign: input.campaignMetrics as CampaignMetrics,
      adGroups: input.adGroupMetrics as AdGroupMetrics[],
      ads: input.rsaMetrics as RsaMetrics[],
      historicalCampaign: input.historicalMetrics.campaignMetrics as CampaignMetrics,
      historicalAdGroups: input.historicalMetrics.adGroupMetrics as AdGroupMetrics[],
      historicalAds: input.historicalMetrics.rsaMetrics as RsaMetrics[],
      budgetAmountMicros: budgetOrNull(input.budgetAmountMicros),
      historicalBudgetAmountMicros: budgetOrNull(input.historicalMetrics.budgetAmountMicros),
      currentWindow: textOf(input.timeWindow.current),
      historicalWindow: textOf(input.timeWindow.historical),
      metadata,
    };
  }

  function sameIndicator(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
    return PERFORMANCE_INDICATOR_KEYS.every((key) => left[key] === right[key]);
  }

  function validateSnapshot(input: unknown): PerformanceIssue[] {
    if (!isPlainRecord(input)) return [corrupted("snapshot", "a snapshot record is required.")];
    const issues: PerformanceIssue[] = [];
    for (const field of PERFORMANCE_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(corrupted(field, `snapshot member "${field}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored."));
    }
    if (typeof input.analysisId !== "string" || !SNAPSHOT_ID.test(input.analysisId)) issues.push(corrupted("analysisId", "a well-formed analysis id is required."));
    if (!isPlainRecord(input.report) || !exactKeys(input.report, PERFORMANCE_REPORT_KEYS)) issues.push(corrupted("report", "a performance report is required."));
    const report = isPlainRecord(input.report) ? input.report : null;
    const indicators = Array.isArray(input.indicators) ? input.indicators : null;
    if (indicators === null) issues.push(corrupted("indicators", "performance indicators are required."));
    else {
      indicators.forEach((indicator, index) => {
        if (!isPlainRecord(indicator) || !exactKeys(indicator, PERFORMANCE_INDICATOR_KEYS)) issues.push(corrupted(`indicators.${index}`, "a performance indicator is required."));
        else {
          if (!(PERFORMANCE_LEVELS as readonly string[]).includes(String(indicator.level))) issues.push(corrupted(`indicators.${index}.level`, "a performance level is required."));
          if (!(PERFORMANCE_DIRECTIONS as readonly string[]).includes(String(indicator.direction))) issues.push(corrupted(`indicators.${index}.direction`, "a performance direction is required."));
          if (!(PERFORMANCE_METHODS as readonly string[]).includes(String(indicator.method))) issues.push(corrupted(`indicators.${index}.method`, "a performance method is required."));
          if (!(CAMPAIGN_INDICATOR_NAMES as readonly string[]).includes(String(indicator.name))) issues.push(corrupted(`indicators.${index}.name`, "a performance indicator name is required."));
          if (indicator.level !== "CAMPAIGN" && indicator.name === "Budget Consumption") issues.push(corrupted(`indicators.${index}.name`, "budget consumption belongs to the campaign."));
          for (const key of ["current", "historical", "change"] as const) {
            const value = indicator[key];
            if (value === null) continue;
            if (typeof value !== "number" || !Number.isFinite(value)) issues.push(corrupted(`indicators.${index}.${key}`, `${key} must be a finite number or null.`));
            else if (key !== "change" && value < 0) issues.push(corrupted(`indicators.${index}.${key}`, `${key} must not be negative.`));
          }
        }
      });
    }
    if (report !== null && indicators !== null) {
      if (!Array.isArray(report.indicators) || report.indicators.length !== indicators.length) issues.push(corrupted("report.indicators", "the report indicators must match the analysis."));
      else report.indicators.forEach((indicator, index) => {
        const top = indicators[index];
        if (!isPlainRecord(indicator) || !isPlainRecord(top) || !sameIndicator(indicator, top)) issues.push(corrupted(`report.indicators.${index}`, "the report indicators must match the analysis."));
      });
      if (textOf(report.campaignResourceName) === "" || textOf(report.campaignId) === "" || textOf(report.status) === "") issues.push(corrupted("report", "the report campaign identity is required."));
      if (!Array.isArray(report.findings)) issues.push(corrupted("report.findings", "performance findings are required."));
      else {
        report.findings.forEach((finding, index) => {
          if (!isPlainRecord(finding) || !exactKeys(finding, PERFORMANCE_FINDING_KEYS)) issues.push(corrupted(`report.findings.${index}`, "a performance finding is required."));
          else if (!(PERFORMANCE_CLASSIFICATIONS as readonly string[]).includes(String(finding.classification))) issues.push(corrupted(`report.findings.${index}.classification`, "a performance classification is required."));
        });
      }
    }
    if (!isPlainRecord(input.comparison) || !exactKeys(input.comparison, PERFORMANCE_COMPARISON_KEYS)) issues.push(corrupted("comparison", "a historical comparison is required."));
    else if (indicators !== null) {
      if (!Array.isArray(input.comparison.rows) || input.comparison.rows.length !== indicators.length) issues.push(corrupted("comparison.rows", "the comparison rows must match the indicators."));
      else input.comparison.rows.forEach((row, index) => {
        const top = indicators[index];
        if (!isPlainRecord(row) || !isPlainRecord(top) || !sameIndicator(row, top)) issues.push(corrupted(`comparison.rows.${index}`, "the comparison rows must match the indicators."));
      });
      if (report !== null && input.comparison.campaignResourceName !== report.campaignResourceName) issues.push(corrupted("comparison.campaignResourceName", "the comparison campaign must match the report."));
    }
    if (!isPlainRecord(input.statistics) || !exactKeys(input.statistics, PERFORMANCE_STATISTICS_KEYS)) issues.push(corrupted("statistics", "analysis statistics are required."));
    else {
      for (const field of PERFORMANCE_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) issues.push(corrupted(`statistics.${field}`, `${field} must be a non-negative finite number.`));
      }
      if (input.statistics.campaignCount !== 1) issues.push(corrupted("statistics.campaignCount", "campaignCount must be one."));
      if (input.statistics.issueCount !== 0) issues.push(corrupted("statistics.issueCount", "a stored analysis has no issues."));
      if (indicators !== null && input.statistics.indicatorCount !== indicators.length) issues.push(corrupted("statistics.indicatorCount", "indicatorCount must match the indicators."));
      if (report !== null && Array.isArray(report.findings) && input.statistics.findingCount !== report.findings.length) issues.push(corrupted("statistics.findingCount", "findingCount must match the findings."));
      if (indicators !== null) {
        const groups = new Set(indicators.filter((item) => isPlainRecord(item) && item.level === "AD_GROUP").map((item) => (item as { resourceName: string }).resourceName));
        const ads = new Set(indicators.filter((item) => isPlainRecord(item) && item.level === "RSA").map((item) => (item as { resourceName: string }).resourceName));
        if (input.statistics.adGroupCount !== groups.size) issues.push(corrupted("statistics.adGroupCount", "adGroupCount must match the ad group indicators."));
        if (input.statistics.adCount !== ads.size) issues.push(corrupted("statistics.adCount", "adCount must match the ad indicators."));
        const campaignRows = indicators.filter((item) => isPlainRecord(item) && item.level === "CAMPAIGN").length;
        if (campaignRows !== CAMPAIGN_INDICATOR_NAMES.length) issues.push(corrupted("indicators", "the campaign indicator set is incomplete."));
        if (groups.size > 0) {
          const perGroup = indicators.filter((item) => isPlainRecord(item) && item.level === "AD_GROUP").length / groups.size;
          if (perGroup !== ENTITY_INDICATOR_NAMES.length) issues.push(corrupted("indicators", "the ad group indicator set is incomplete."));
        }
        if (ads.size > 0) {
          const perAd = indicators.filter((item) => isPlainRecord(item) && item.level === "RSA").length / ads.size;
          if (perAd !== ENTITY_INDICATOR_NAMES.length) issues.push(corrupted("indicators", "the responsive search ad indicator set is incomplete."));
        }
      }
    }
    if (!isPlainRecord(input.context) || !exactKeys(input.context, PERFORMANCE_CONTEXT_RECORD_KEYS)) issues.push(corrupted("context", "an analysis context is required."));
    else {
      if (textOf(input.context.campaignResourceName) === "") issues.push(corrupted("context.campaignResourceName", "a campaign resource is required."));
      if (!WINDOW.test(textOf(input.context.currentWindow)) || !WINDOW.test(textOf(input.context.historicalWindow)) || input.context.currentWindow === input.context.historicalWindow) {
        issues.push(badWindow("context", "the collected windows must differ."));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot, parseInput };
}
