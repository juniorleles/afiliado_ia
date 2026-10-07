/**
 * Host record domain: recommendation validator.
 *
 * Pure local rules. It rejects a missing report, a missing prior window,
 * a metric record that does not match the report, a broken rule table, and
 * invalid metadata. It does not send a request and does not change what it is given.
 */
import type { AdGroupMetrics, CampaignMetrics, MetricValues, RsaMetrics } from "../optimization-metrics/metrics-snapshot";
import { AD_GROUP_METRIC_KEYS, CAMPAIGN_METRIC_KEYS, METRIC_VALUE_KEYS, RSA_METRIC_KEYS } from "../optimization-metrics/metrics-snapshot";
import { budgetConsumption, combineSides, costPerConversion, differenceSide, returnOnAdSpend, type CombinedChange } from "../performance-analysis/performance-metrics";
import {
  CAMPAIGN_INDICATOR_NAMES,
  ENTITY_INDICATOR_NAMES,
  PERFORMANCE_CLASSIFICATIONS,
  PERFORMANCE_COMPARISON_KEYS,
  PERFORMANCE_DIRECTIONS,
  PERFORMANCE_FINDING_KEYS,
  PERFORMANCE_INDICATOR_KEYS,
  PERFORMANCE_LEVELS,
  PERFORMANCE_METHODS,
  PERFORMANCE_REPORT_KEYS,
  type PerformanceIndicator,
} from "../performance-analysis/performance-snapshot";
import { OPTIMIZATION_CONTEXT_MEMBERS, type OptimizationMetadata } from "./optimization-context";
import { OPTIMIZATION_RULES } from "./optimization-rules";
import {
  EVIDENCE_KEYS,
  EVIDENCE_ROW_KEYS,
  HISTORICAL_COMPARISON_KEYS,
  OPTIMIZATION_CONTEXT_RECORD_KEYS,
  OPTIMIZATION_EVIDENCE_KEYS,
  OPTIMIZATION_SNAPSHOT_KEYS,
  OPTIMIZATION_STATISTICS_KEYS,
  RECOMMENDATION_KEYS,
  RECOMMENDATION_SET_KEYS,
  SUPPORTING_METRIC_KEYS,
  SUPPORTING_METRICS_KEYS,
} from "./optimization-snapshot";
import { CONFIDENCE_LEVELS, RECOMMENDATION_KINDS, RULE_IDS, type OptimizationRule, type RecommendationIssue, type RecommendationView } from "./optimization-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const RULE_ID = /^[A-Z][A-Z0-9_]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const WINDOW = /^[A-Z][A-Z0-9_]*$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const AD_RESOURCE = /^customers\/(\d+)\/adGroupAds\/\d+~(\d+)$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;
const HISTORICAL_KEYS = ["campaignMetrics", "adGroupMetrics", "rsaMetrics", "budgetAmountMicros"] as const;
const DIFFERENCE_FIELDS = {
  "CTR Trend": "ctr",
  "CPC Trend": "averageCpc",
  "Cost Trend": "costMicros",
  "Conversion Trend": "conversions",
  "Impression Trend": "impressions",
  "Click Trend": "clicks",
  "Search Impression Share Trend": "searchImpressionShare",
  "Top Impression Share Trend": "searchTopImpressionShare",
  "Absolute Top Impression Share Trend": "searchAbsoluteTopImpressionShare",
} as const;

export interface OptimizationValidator {
  validateInput(input: unknown): RecommendationIssue[];
  validateMetadata(input: unknown): RecommendationIssue[];
  validateRules(rules: readonly OptimizationRule[]): RecommendationIssue[];
  validateSnapshot(input: unknown): RecommendationIssue[];
  parseInput(input: unknown): RecommendationView | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatOptimizationMetadata(value: unknown): value is OptimizationMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RecommendationIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function missingReport(field: string, message: string): RecommendationIssue {
  return { field, message: `Missing Performance Report: ${message}` };
}

function missingHistory(field: string, message: string): RecommendationIssue {
  return { field, message: `Missing Historical Metrics: ${message}` };
}

function corrupted(field: string, message: string): RecommendationIssue {
  return { field, message: `Corrupted Metrics: ${message}` };
}

function badRules(field: string, message: string): RecommendationIssue {
  return { field, message: `Invalid Recommendation Rules: ${message}` };
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

function optionalBudget(value: unknown, field: string): RecommendationIssue[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return [corrupted(field, "a budget figure must be a non-negative finite number or null.")];
  return [];
}

function validateValues(record: Record<string, unknown>, field: string): RecommendationIssue[] {
  const issues: RecommendationIssue[] = [];
  for (const key of METRIC_VALUE_KEYS) {
    if (!finiteOrNull(record[key])) issues.push(corrupted(`${field}.${key}`, `${key} must be a non-negative finite number or null.`));
  }
  return issues;
}

function validateCampaign(value: unknown, field: string): RecommendationIssue[] {
  if (!isPlainRecord(value) || !exactKeys(value, CAMPAIGN_METRIC_KEYS)) return [corrupted(field, "a campaign metric record is required.")];
  const issues = validateValues(value, field);
  const match = CAMPAIGN_RESOURCE.exec(textOf(value.resourceName));
  if (match === null || textOf(value.campaignId) !== match[2] || textOf(value.status) === "") issues.push(corrupted(field, "the campaign resource does not match its id."));
  return issues;
}

function validateGroups(value: unknown, field: string, campaignResourceName: string, customerId: string): RecommendationIssue[] {
  if (!Array.isArray(value)) return [corrupted(field, "ad group metrics are required.")];
  const issues: RecommendationIssue[] = [];
  const seen = new Set<string>();
  value.forEach((group, index) => {
    if (!isPlainRecord(group) || !exactKeys(group, AD_GROUP_METRIC_KEYS)) {
      issues.push(corrupted(`${field}.${index}`, "an ad group metric record is required."));
      return;
    }
    issues.push(...validateValues(group, `${field}.${index}`));
    const resourceName = textOf(group.resourceName);
    const match = AD_GROUP_RESOURCE.exec(resourceName);
    if (match === null || match[1] !== customerId || textOf(group.adGroupId) !== match[2] || textOf(group.campaignResourceName) !== campaignResourceName) {
      issues.push(corrupted(`${field}.${index}`, "the ad group resource does not match the campaign."));
    }
    if (seen.has(resourceName)) issues.push(corrupted(`${field}.${index}`, "the ad group resource is repeated."));
    seen.add(resourceName);
  });
  return issues;
}

function validateAds(value: unknown, field: string, campaignResourceName: string, customerId: string, groups: Set<string>): RecommendationIssue[] {
  if (!Array.isArray(value)) return [corrupted(field, "responsive search ad metrics are required.")];
  const issues: RecommendationIssue[] = [];
  const seen = new Set<string>();
  value.forEach((ad, index) => {
    if (!isPlainRecord(ad) || !exactKeys(ad, RSA_METRIC_KEYS)) {
      issues.push(corrupted(`${field}.${index}`, "a responsive search ad metric record is required."));
      return;
    }
    issues.push(...validateValues(ad, `${field}.${index}`));
    const resourceName = textOf(ad.resourceName);
    const match = AD_RESOURCE.exec(resourceName);
    if (match === null || match[1] !== customerId || textOf(ad.adId) !== match[2] || textOf(ad.campaignResourceName) !== campaignResourceName || textOf(ad.status) === "" || !groups.has(textOf(ad.adGroupResourceName))) {
      issues.push(corrupted(`${field}.${index}`, "the ad resource does not match the campaign."));
    }
    if (seen.has(resourceName)) issues.push(corrupted(`${field}.${index}`, "the ad resource is repeated."));
    seen.add(resourceName);
  });
  return issues;
}

function sameChange(indicator: PerformanceIndicator, expected: CombinedChange): boolean {
  return indicator.current === expected.current && indicator.historical === expected.historical && indicator.change === expected.change && indicator.direction === expected.direction;
}

function expectedChange(name: string, current: MetricValues, historical: MetricValues | null, currentBudget: number | null, historicalBudget: number | null): CombinedChange | null {
  const past = historical;
  if (name === "CPA") return combineSides(costPerConversion(current.costMicros, current.conversions), costPerConversion(past ? past.costMicros : null, past ? past.conversions : null));
  if (name === "ROAS") return combineSides(returnOnAdSpend(current.conversionValue, current.costMicros), returnOnAdSpend(past ? past.conversionValue : null, past ? past.costMicros : null));
  if (name === "Budget Consumption") return combineSides(budgetConsumption(current.costMicros, currentBudget), budgetConsumption(past ? past.costMicros : null, historicalBudget));
  const field = DIFFERENCE_FIELDS[name as keyof typeof DIFFERENCE_FIELDS];
  if (!field) return null;
  return combineSides(differenceSide(current[field]), differenceSide(past ? past[field] : null));
}

function byResource<T extends { resourceName: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.resourceName, row);
  return map;
}

export function createOptimizationValidator(): OptimizationValidator {
  function validateMetadata(input: unknown): RecommendationIssue[] {
    if (input === undefined) return [];
    if (!isFlatOptimizationMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateRules(rules: readonly OptimizationRule[]): RecommendationIssue[] {
    if (!Array.isArray(rules) || rules.length !== RECOMMENDATION_KINDS.length) return [badRules("rules", "the recommendation rule table is incomplete.")];
    const issues: RecommendationIssue[] = [];
    const seenIds = new Set<string>();
    const seenKinds = new Set<string>();
    rules.forEach((rule, index) => {
      if (!rule || typeof rule !== "object" || typeof rule.applies !== "function" || typeof rule.select !== "function") {
        issues.push(badRules(`rules.${index}`, "a recommendation rule is required."));
        return;
      }
      if (!RULE_ID.test(rule.id) || !(RULE_IDS as readonly string[]).includes(rule.id)) issues.push(badRules(`rules.${index}.id`, "a recommendation rule id is required."));
      if (!(RECOMMENDATION_KINDS as readonly string[]).includes(rule.kind)) issues.push(badRules(`rules.${index}.kind`, "a recommendation kind is required."));
      if (rule.independent !== (rule.kind !== "Monitor Performance" && rule.kind !== "No Action")) issues.push(badRules(`rules.${index}.independent`, "the fallback rules are not independent."));
      if (textOf(rule.boundNote) === "") issues.push(badRules(`rules.${index}.boundNote`, "a rule note is required."));
      if (seenIds.has(rule.id)) issues.push(badRules(`rules.${index}.id`, "the recommendation rule id is repeated."));
      if (seenKinds.has(rule.kind)) issues.push(badRules(`rules.${index}.kind`, "the recommendation kind is repeated."));
      seenIds.add(rule.id);
      seenKinds.add(rule.kind);
    });
    for (const kind of RECOMMENDATION_KINDS) {
      if (!seenKinds.has(kind)) issues.push(badRules("rules", `the recommendation kind ${kind} is missing.`));
    }
    return issues;
  }

  function validateIndicatorRecord(value: unknown, field: string): RecommendationIssue[] {
    if (!isPlainRecord(value) || !exactKeys(value, PERFORMANCE_INDICATOR_KEYS)) return [corrupted(field, "a performance indicator is required.")];
    const issues: RecommendationIssue[] = [];
    if (!(PERFORMANCE_LEVELS as readonly string[]).includes(String(value.level))) issues.push(corrupted(`${field}.level`, "a performance level is required."));
    if (!(PERFORMANCE_DIRECTIONS as readonly string[]).includes(String(value.direction))) issues.push(corrupted(`${field}.direction`, "a performance direction is required."));
    if (!(PERFORMANCE_METHODS as readonly string[]).includes(String(value.method))) issues.push(corrupted(`${field}.method`, "a performance method is required."));
    if (!(CAMPAIGN_INDICATOR_NAMES as readonly string[]).includes(String(value.name))) issues.push(corrupted(`${field}.name`, "a performance indicator name is required."));
    for (const key of ["current", "historical", "change"] as const) {
      const inner = value[key];
      if (inner === null) continue;
      if (typeof inner !== "number" || !Number.isFinite(inner)) issues.push(corrupted(`${field}.${key}`, `${key} must be a finite number or null.`));
      else if (key !== "change" && inner < 0) issues.push(corrupted(`${field}.${key}`, `${key} must not be negative.`));
    }
    return issues;
  }

  function validateReport(value: unknown): RecommendationIssue[] {
    if (!isPlainRecord(value)) return [missingReport("performanceReport", "a performance report is required.")];
    if (!exactKeys(value, PERFORMANCE_REPORT_KEYS)) return [missingReport("performanceReport", "a performance report is required.")];
    const issues: RecommendationIssue[] = [];
    const resourceName = textOf(value.campaignResourceName);
    const match = CAMPAIGN_RESOURCE.exec(resourceName);
    if (match === null || textOf(value.campaignId) !== match[2] || textOf(value.status) === "") issues.push(corrupted("performanceReport", "the report campaign identity is required."));
    if (!Array.isArray(value.indicators) || value.indicators.length === 0) issues.push(corrupted("performanceReport.indicators", "performance indicators are required."));
    else {
      value.indicators.forEach((indicator, index) => issues.push(...validateIndicatorRecord(indicator, `performanceReport.indicators.${index}`)));
      const names: string[] = [];
      let blockLevel = "";
      let blockResource = "";
      let count = 0;
      const flush = () => {
        if (count === 0) return;
        const expected = blockLevel === "CAMPAIGN" && blockResource === resourceName ? CAMPAIGN_INDICATOR_NAMES : ENTITY_INDICATOR_NAMES;
        if (names.length !== expected.length || expected.some((name, index) => names[index] !== name)) issues.push(corrupted("performanceReport.indicators", "the indicator set does not match the report."));
      };
      for (const indicator of value.indicators) {
        if (!isPlainRecord(indicator)) continue;
        const level = String(indicator.level);
        const resource = String(indicator.resourceName);
        if (count > 0 && (level !== blockLevel || resource !== blockResource)) {
          flush();
          names.length = 0;
          count = 0;
        }
        blockLevel = level;
        blockResource = resource;
        names.push(String(indicator.name));
        count += 1;
        if (level !== "CAMPAIGN" && indicator.name === "Budget Consumption") issues.push(corrupted("performanceReport.indicators", "budget consumption belongs to the campaign."));
      }
      flush();
    }
    if (!isPlainRecord(value.comparison) || !exactKeys(value.comparison, PERFORMANCE_COMPARISON_KEYS)) issues.push(corrupted("performanceReport.comparison", "a historical comparison is required."));
    else {
      const current = textOf(value.comparison.currentWindow);
      const historical = textOf(value.comparison.historicalWindow);
      if (!WINDOW.test(current) || !WINDOW.test(historical) || current === historical) issues.push(corrupted("performanceReport.comparison", "the current and historical windows must differ."));
      if (value.comparison.campaignResourceName !== resourceName) issues.push(corrupted("performanceReport.comparison", "the comparison campaign must match the report."));
      if (!Array.isArray(value.comparison.rows) || !Array.isArray(value.indicators) || value.comparison.rows.length !== value.indicators.length) {
        issues.push(corrupted("performanceReport.comparison.rows", "the comparison rows must match the indicators."));
      } else {
        value.comparison.rows.forEach((row, index) => {
          const indicator = (value.indicators as unknown[])[index];
          if (!isPlainRecord(row) || !isPlainRecord(indicator) || PERFORMANCE_INDICATOR_KEYS.some((key) => row[key] !== indicator[key])) {
            issues.push(corrupted(`performanceReport.comparison.rows.${index}`, "the comparison rows must match the indicators."));
          }
        });
      }
    }
    if (!Array.isArray(value.findings)) issues.push(corrupted("performanceReport.findings", "performance findings are required."));
    else {
      value.findings.forEach((finding, index) => {
        if (!isPlainRecord(finding) || !exactKeys(finding, PERFORMANCE_FINDING_KEYS)) issues.push(corrupted(`performanceReport.findings.${index}`, "a performance finding is required."));
        else if (!(PERFORMANCE_CLASSIFICATIONS as readonly string[]).includes(String(finding.classification))) issues.push(corrupted(`performanceReport.findings.${index}.classification`, "a performance classification is required."));
      });
    }
    return issues;
  }

  function validateAlignment(view: RecommendationView): RecommendationIssue[] {
    const issues: RecommendationIssue[] = [];
    const groups = byResource(view.adGroups);
    const ads = byResource(view.ads);
    const pastGroups = byResource(view.historicalAdGroups);
    const pastAds = byResource(view.historicalAds);
    view.report.indicators.forEach((indicator, index) => {
      const field = `performanceReport.indicators.${index}`;
      let current: MetricValues | null = null;
      let historical: MetricValues | null = null;
      let currentBudget: number | null = null;
      let historicalBudget: number | null = null;
      if (indicator.level === "CAMPAIGN") {
        current = view.campaign;
        historical = view.historicalCampaign;
        currentBudget = view.budgetAmountMicros;
        historicalBudget = view.historicalBudgetAmountMicros;
        if (indicator.resourceName !== view.campaign.resourceName) issues.push(corrupted(field, "the indicator campaign does not match the metric record."));
      } else if (indicator.level === "AD_GROUP") {
        current = groups.get(indicator.resourceName) ?? null;
        historical = pastGroups.get(indicator.resourceName) ?? null;
        if (current === null) issues.push(corrupted(field, "the ad group metric record is missing."));
      } else if (indicator.level === "RSA") {
        current = ads.get(indicator.resourceName) ?? null;
        historical = pastAds.get(indicator.resourceName) ?? null;
        if (current === null) issues.push(corrupted(field, "the responsive search ad metric record is missing."));
      }
      if (current === null) return;
      const expected = expectedChange(indicator.name, current, historical, currentBudget, historicalBudget);
      if (expected === null) issues.push(corrupted(field, "the indicator is not part of the collected set."));
      else if (!sameChange(indicator, expected)) issues.push(corrupted(field, "the indicator does not match the collected metrics."));
      const method = indicator.name === "CPA" ? "COST_DIVIDED_BY_CONVERSIONS" : indicator.name === "ROAS" ? "CONVERSION_VALUE_DIVIDED_BY_COST" : indicator.name === "Budget Consumption" ? "COST_DIVIDED_BY_BUDGET" : "DIFFERENCE";
      if (indicator.method !== method) issues.push(corrupted(field, "the indicator method does not match the collected metrics."));
    });
    return issues;
  }

  function validateInput(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) return [missingReport("performanceReport", "a performance report is required.")];
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(OPTIMIZATION_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored."));
    }
    if (!("performanceReport" in input) || input.performanceReport == null) issues.push(missingReport("performanceReport", "a performance report is required."));
    else issues.push(...validateReport(input.performanceReport));
    if (!("historicalMetrics" in input) || input.historicalMetrics == null) issues.push(missingHistory("historicalMetrics", "historical metrics are required."));
    else if (!isPlainRecord(input.historicalMetrics)) issues.push(missingHistory("historicalMetrics", "historical metrics are required."));
    else {
      for (const key of Object.keys(input.historicalMetrics)) {
        if (!(HISTORICAL_KEYS as readonly string[]).includes(key)) issues.push(corrupted(`historicalMetrics.${key}`, `unexpected member "${key}".`));
      }
      if (!("campaignMetrics" in input.historicalMetrics) || input.historicalMetrics.campaignMetrics == null) issues.push(missingHistory("historicalMetrics.campaignMetrics", "historical campaign metrics are required."));
      else issues.push(...validateCampaign(input.historicalMetrics.campaignMetrics, "historicalMetrics.campaignMetrics"));
    }
    if (!("campaignMetrics" in input) || input.campaignMetrics == null) issues.push(corrupted("campaignMetrics", "campaign metrics are required."));
    else issues.push(...validateCampaign(input.campaignMetrics, "campaignMetrics"));
    const campaign = isPlainRecord(input.campaignMetrics) ? input.campaignMetrics : null;
    const historical = isPlainRecord(input.historicalMetrics) ? input.historicalMetrics : null;
    const historicalCampaign = historical && isPlainRecord(historical.campaignMetrics) ? historical.campaignMetrics : null;
    const identity = campaign ? CAMPAIGN_RESOURCE.exec(textOf(campaign.resourceName)) : null;
    if (campaign && historicalCampaign && textOf(campaign.resourceName) !== textOf(historicalCampaign.resourceName)) {
      issues.push(missingHistory("historicalMetrics.campaignMetrics", "historical campaign metrics belong to another campaign."));
    }
    const report = isPlainRecord(input.performanceReport) ? input.performanceReport : null;
    if (report && campaign && textOf(report.campaignResourceName) !== textOf(campaign.resourceName)) issues.push(corrupted("performanceReport", "the report campaign does not match the metric record."));
    if (identity !== null) {
      if (!("adGroupMetrics" in input)) issues.push(corrupted("adGroupMetrics", "ad group metrics are required."));
      else issues.push(...validateGroups(input.adGroupMetrics, "adGroupMetrics", textOf(campaign?.resourceName), identity[1]));
      const groups = new Set<string>();
      if (Array.isArray(input.adGroupMetrics)) {
        for (const group of input.adGroupMetrics) if (isPlainRecord(group)) groups.add(textOf(group.resourceName));
      }
      if (!("rsaMetrics" in input)) issues.push(corrupted("rsaMetrics", "responsive search ad metrics are required."));
      else issues.push(...validateAds(input.rsaMetrics, "rsaMetrics", textOf(campaign?.resourceName), identity[1], groups));
      if (historical) {
        if (!("adGroupMetrics" in historical)) issues.push(missingHistory("historicalMetrics.adGroupMetrics", "historical ad group metrics are required."));
        else issues.push(...validateGroups(historical.adGroupMetrics, "historicalMetrics.adGroupMetrics", textOf(historicalCampaign?.resourceName), identity[1]));
        const pastGroups = new Set<string>();
        if (Array.isArray(historical.adGroupMetrics)) {
          for (const group of historical.adGroupMetrics) if (isPlainRecord(group)) pastGroups.add(textOf(group.resourceName));
        }
        if (!("rsaMetrics" in historical)) issues.push(missingHistory("historicalMetrics.rsaMetrics", "historical responsive search ad metrics are required."));
        else issues.push(...validateAds(historical.rsaMetrics, "historicalMetrics.rsaMetrics", textOf(historicalCampaign?.resourceName), identity[1], pastGroups));
        if ("budgetAmountMicros" in historical) issues.push(...optionalBudget(historical.budgetAmountMicros, "historicalMetrics.budgetAmountMicros"));
      }
    }
    if ("budgetAmountMicros" in input) issues.push(...optionalBudget(input.budgetAmountMicros, "budgetAmountMicros"));
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    if (issues.length === 0) {
      const parsed = parseInput(input);
      if (parsed === null) issues.push(corrupted("campaignMetrics", "the metrics could not be read."));
      else issues.push(...validateAlignment(parsed));
    }
    return issues;
  }

  function budgetOrNull(value: unknown): number | null {
    return typeof value === "number" ? value : null;
  }

  function parseInput(input: unknown): RecommendationView | null {
    if (!isPlainRecord(input) || !isPlainRecord(input.performanceReport) || !isPlainRecord(input.historicalMetrics) || !isPlainRecord(input.campaignMetrics)) return null;
    if (!Array.isArray(input.adGroupMetrics) || !Array.isArray(input.rsaMetrics) || !Array.isArray(input.historicalMetrics.adGroupMetrics) || !Array.isArray(input.historicalMetrics.rsaMetrics)) return null;
    return {
      report: input.performanceReport as unknown as RecommendationView["report"],
      campaign: input.campaignMetrics as unknown as CampaignMetrics,
      historicalCampaign: input.historicalMetrics.campaignMetrics as CampaignMetrics,
      adGroups: input.adGroupMetrics as AdGroupMetrics[],
      ads: input.rsaMetrics as RsaMetrics[],
      historicalAdGroups: input.historicalMetrics.adGroupMetrics as AdGroupMetrics[],
      historicalAds: input.historicalMetrics.rsaMetrics as RsaMetrics[],
      budgetAmountMicros: budgetOrNull(input.budgetAmountMicros),
      historicalBudgetAmountMicros: budgetOrNull(input.historicalMetrics.budgetAmountMicros),
      historicalMetrics: input.historicalMetrics as RecommendationView["historicalMetrics"],
    };
  }

  function validateSnapshot(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RecommendationIssue[] = [];
    for (const field of OPTIMIZATION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored."));
    }
    if (typeof input.recommendationSetId !== "string" || !SNAPSHOT_ID.test(input.recommendationSetId)) issues.push(invalid("recommendationSetId", "a well-formed recommendation set id is required."));
    const recommendationSet = isPlainRecord(input.recommendationSet) && exactKeys(input.recommendationSet, RECOMMENDATION_SET_KEYS) ? input.recommendationSet : null;
    if (recommendationSet === null || !Array.isArray(input.recommendationSet && (input.recommendationSet as { recommendations?: unknown }).recommendations)) {
      issues.push(invalid("recommendationSet", "a recommendation set is required."));
    }
    const recommendations = recommendationSet && Array.isArray(recommendationSet.recommendations) ? recommendationSet.recommendations : null;
    if (recommendations !== null) {
      if (recommendations.length === 0) issues.push(badRules("recommendationSet.recommendations", "a recommendation set must contain a recommendation."));
      recommendations.forEach((recommendation, index) => {
        if (!isPlainRecord(recommendation) || !exactKeys(recommendation, RECOMMENDATION_KEYS)) {
          issues.push(badRules(`recommendationSet.recommendations.${index}`, "a recommendation record is required."));
          return;
        }
        if (!(RECOMMENDATION_KINDS as readonly string[]).includes(String(recommendation.kind))) issues.push(badRules(`recommendationSet.recommendations.${index}.kind`, "a recommendation kind is required."));
        if (!(RULE_IDS as readonly string[]).includes(String(recommendation.recommendationId))) issues.push(badRules(`recommendationSet.recommendations.${index}.recommendationId`, "a recommendation id is required."));
        if (!(CONFIDENCE_LEVELS as readonly string[]).includes(String(recommendation.confidence))) issues.push(badRules(`recommendationSet.recommendations.${index}.confidence`, "a confidence level is required."));
        if (textOf(recommendation.reason) === "") issues.push(badRules(`recommendationSet.recommendations.${index}.reason`, "a reason is required."));
        if (!Array.isArray(recommendation.triggeredRules) || recommendation.triggeredRules.length === 0 || recommendation.triggeredRules.some((ruleId) => ruleId !== recommendation.recommendationId)) {
          issues.push(badRules(`recommendationSet.recommendations.${index}.triggeredRules`, "the triggered rule must be the recommendation id."));
        }
        if (!isPlainRecord(recommendation.evidence) || !exactKeys(recommendation.evidence, EVIDENCE_KEYS) || !Array.isArray(recommendation.evidence.rows) || recommendation.evidence.rows.length === 0) {
          issues.push(badRules(`recommendationSet.recommendations.${index}.evidence`, "recommendation evidence is required."));
        } else {
          recommendation.evidence.rows.forEach((row, rowIndex) => {
            if (!isPlainRecord(row) || !exactKeys(row, EVIDENCE_ROW_KEYS)) issues.push(corrupted(`recommendationSet.recommendations.${index}.evidence.rows.${rowIndex}`, "an evidence row is required."));
          });
        }
        if (!isPlainRecord(recommendation.supportingMetrics) || !exactKeys(recommendation.supportingMetrics, SUPPORTING_METRICS_KEYS) || !Array.isArray(recommendation.supportingMetrics.rows)) {
          issues.push(corrupted(`recommendationSet.recommendations.${index}.supportingMetrics`, "supporting metrics are required."));
        } else {
          recommendation.supportingMetrics.rows.forEach((row, rowIndex) => {
            if (!isPlainRecord(row) || !exactKeys(row, SUPPORTING_METRIC_KEYS)) issues.push(corrupted(`recommendationSet.recommendations.${index}.supportingMetrics.rows.${rowIndex}`, "a supporting metric is required."));
          });
        }
        if (!isPlainRecord(recommendation.historicalComparison) || !exactKeys(recommendation.historicalComparison, HISTORICAL_COMPARISON_KEYS)) {
          issues.push(missingHistory(`recommendationSet.recommendations.${index}.historicalComparison`, "a historical comparison is required."));
        }
      });
    }
    if (!isPlainRecord(input.evidence) || !exactKeys(input.evidence, OPTIMIZATION_EVIDENCE_KEYS) || !Array.isArray(input.evidence.rows)) issues.push(corrupted("evidence", "recommendation evidence is required."));
    if (!isPlainRecord(input.statistics) || !exactKeys(input.statistics, OPTIMIZATION_STATISTICS_KEYS)) issues.push(invalid("statistics", "recommendation statistics are required."));
    else {
      for (const field of OPTIMIZATION_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) issues.push(invalid(`statistics.${field}`, `${field} must be a non-negative finite number.`));
      }
      if (recommendations !== null && input.statistics.recommendationCount !== recommendations.length) issues.push(invalid("statistics.recommendationCount", "recommendationCount must match the recommendation set."));
      if (recommendations !== null && input.statistics.triggeredRuleCount !== recommendations.length) issues.push(invalid("statistics.triggeredRuleCount", "triggeredRuleCount must match the recommendation set."));
      if (input.statistics.ruleCount !== OPTIMIZATION_RULES.length) issues.push(invalid("statistics.ruleCount", "ruleCount must match the rule table."));
      if (input.statistics.issueCount !== 0) issues.push(invalid("statistics.issueCount", "a stored recommendation set has no issues."));
    }
    if (!isPlainRecord(input.context) || !exactKeys(input.context, OPTIMIZATION_CONTEXT_RECORD_KEYS)) issues.push(invalid("context", "a recommendation context is required."));
    else if (!WINDOW.test(textOf(input.context.currentWindow)) || !WINDOW.test(textOf(input.context.historicalWindow)) || input.context.currentWindow === input.context.historicalWindow) {
      issues.push(corrupted("context", "the collected windows must differ."));
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateRules, validateSnapshot, parseInput };
}
