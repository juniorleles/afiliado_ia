/**
 * Host record domain: recommendation validator.
 *
 * Pure local rules for one recommendation run. It rejects a missing ranking,
 * a missing portfolio, corrupted metrics, an invalid policy, and invalid
 * metadata. It does not change what it is given.
 */
import { RECOMMENDATION_CONTEXT_MEMBERS, type RecommendationMetadata } from "./recommendation-context";
import { isMetricKey, isNullableMetricKey, isRecommendationPolicyId } from "./recommendation-policy";
import {
  RECOMMENDATION_CONTEXT_RECORD_KEYS,
  RECOMMENDATION_EVIDENCE_KEYS,
  RECOMMENDATION_SET_KEYS,
  RECOMMENDATION_SNAPSHOT_KEYS,
  RECOMMENDATION_STATISTICS_KEYS,
} from "./recommendation-snapshot";
import {
  CONDITION_KINDS,
  RECOMMENDATION_CONFIDENCE_KEYS,
  RECOMMENDATION_TYPES,
  type RecommendationIssue,
} from "./recommendation-types";
import { OPPORTUNITY_METRIC_KEYS } from "../opportunity-scoring/opportunity-score-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const RANKING_KEYS = ["policyId", "ordered", "origin", "provenance"] as const;
const PORTFOLIO_KEYS = ["policyId", "ordered", "portfolios", "statistics", "origin", "provenance"] as const;
const GROUP_KEYS = ["portfolioId", "portfolioType", "dimension", "value", "opportunityIds"] as const;
const PORTFOLIO_TYPE_NAMES = ["health", "beauty", "finance", "software", "pets", "education", "custom"] as const;
const PORTFOLIO_DIMENSIONS = ["category", "market", "language", "country", "priceRange", "brand", "merchant", "affiliateNetwork", "searchIntent", "portfolioType"] as const;
const POSITION_KINDS = new Set(["positionEquals", "positionAtMost", "positionAtLeast"]);
const PORTFOLIO_COUNT_KINDS = new Set(["portfolioCountAtLeast", "portfolioCountAtMost"]);
const METRIC_VALUE_KINDS = new Set(["metricAtLeast", "metricAtMost"]);

export interface RecommendationValidator {
  validateInput(input: unknown): RecommendationIssue[];
  validateMetadata(input: unknown): RecommendationIssue[];
  validateSnapshot(input: unknown): RecommendationIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRecommendationMetadata(value: unknown): value is RecommendationMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RecommendationIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createRecommendationValidator(): RecommendationValidator {
  function validateMetadata(input: unknown): RecommendationIssue[] {
    if (input === undefined) return [];
    if (!isFlatRecommendationMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function readOrdered(ordered: unknown, field: string, missing: string): { issues: RecommendationIssue[]; ids: string[] } {
    if (!Array.isArray(ordered) || ordered.length === 0) return { issues: [{ field, message: missing }], ids: [] };
    const issues: RecommendationIssue[] = [];
    const ids: string[] = [];
    const seen = new Set<string>();
    ordered.forEach((item, index) => {
      if (!isPlainRecord(item) || Object.keys(item).some((key) => key !== "position" && key !== "opportunityId") || item.position !== index + 1) {
        issues.push({ field: `${field}.${index}`, message: missing });
        return;
      }
      const opportunityId = textOf(item.opportunityId);
      if (!SNAPSHOT_ID.test(opportunityId)) {
        issues.push({ field: `${field}.${index}.opportunityId`, message: missing });
        return;
      }
      if (seen.has(opportunityId)) issues.push({ field: `${field}.${index}.opportunityId`, message: `${missing.slice(0, missing.indexOf(":"))}: opportunity id "${opportunityId}" is repeated.` });
      seen.add(opportunityId);
      ids.push(opportunityId);
    });
    return { issues, ids };
  }

  function validateRanking(ranking: unknown): { issues: RecommendationIssue[]; ids: string[] } {
    const missing = "Missing Opportunity Ranking: an opportunity ranking is required.";
    if (!isPlainRecord(ranking)) return { issues: [{ field: "ranking", message: missing }], ids: [] };
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(ranking)) {
      if (!(RANKING_KEYS as readonly string[]).includes(key)) issues.push({ field: `ranking.${key}`, message: missing });
    }
    if (!SNAPSHOT_ID.test(textOf(ranking.policyId))) issues.push({ field: "ranking.policyId", message: missing });
    if (ranking.origin !== "OBSERVED" || ranking.provenance !== "DIRECT_SOURCE") issues.push({ field: "ranking.origin", message: missing });
    const ordered = readOrdered(ranking.ordered, "ranking.ordered", missing);
    issues.push(...ordered.issues);
    return { issues, ids: ordered.ids };
  }

  function validatePortfolio(portfolio: unknown, rankedIds: readonly string[]): RecommendationIssue[] {
    const missing = "Missing Portfolio: an opportunity portfolio is required.";
    if (!isPlainRecord(portfolio)) return [{ field: "portfolio", message: missing }];
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(portfolio)) {
      if (!(PORTFOLIO_KEYS as readonly string[]).includes(key)) issues.push({ field: `portfolio.${key}`, message: missing });
    }
    if (!SNAPSHOT_ID.test(textOf(portfolio.policyId))) issues.push({ field: "portfolio.policyId", message: missing });
    if (portfolio.origin !== "OBSERVED" || portfolio.provenance !== "DIRECT_SOURCE") issues.push({ field: "portfolio.origin", message: missing });
    const ordered = readOrdered(portfolio.ordered, "portfolio.ordered", missing);
    issues.push(...ordered.issues);
    if (ordered.ids.join() !== rankedIds.join()) issues.push({ field: "portfolio.ordered", message: "Missing Portfolio: the portfolio order must match the ranking." });
    if (!Array.isArray(portfolio.portfolios)) issues.push({ field: "portfolio.portfolios", message: missing });
    else {
      const ranked = new Set(rankedIds);
      portfolio.portfolios.forEach((group, index) => {
        if (!isPlainRecord(group)) {
          issues.push({ field: `portfolio.portfolios.${index}`, message: missing });
          return;
        }
        for (const key of Object.keys(group)) {
          if (!(GROUP_KEYS as readonly string[]).includes(key)) issues.push({ field: `portfolio.portfolios.${index}.${key}`, message: missing });
        }
        if (!SNAPSHOT_ID.test(textOf(group.portfolioId))) issues.push({ field: `portfolio.portfolios.${index}.portfolioId`, message: missing });
        if (typeof group.portfolioType !== "string" || !(PORTFOLIO_TYPE_NAMES as readonly string[]).includes(group.portfolioType)) {
          issues.push({ field: `portfolio.portfolios.${index}.portfolioType`, message: missing });
        }
        if (typeof group.dimension !== "string" || !(PORTFOLIO_DIMENSIONS as readonly string[]).includes(group.dimension)) {
          issues.push({ field: `portfolio.portfolios.${index}.dimension`, message: missing });
        }
        if (typeof group.value !== "string" || group.value.trim() === "") issues.push({ field: `portfolio.portfolios.${index}.value`, message: missing });
        if (!Array.isArray(group.opportunityIds)) {
          issues.push({ field: `portfolio.portfolios.${index}.opportunityIds`, message: missing });
          return;
        }
        const seen = new Set<string>();
        group.opportunityIds.forEach((opportunityId, memberIndex) => {
          const id = textOf(opportunityId);
          if (!ranked.has(id)) issues.push({ field: `portfolio.portfolios.${index}.opportunityIds.${memberIndex}`, message: missing });
          if (seen.has(id)) issues.push({ field: `portfolio.portfolios.${index}.opportunityIds.${memberIndex}`, message: "Missing Portfolio: a portfolio entry is repeated." });
          seen.add(id);
        });
      });
    }
    if (!isPlainRecord(portfolio.statistics)) issues.push({ field: "portfolio.statistics", message: missing });
    return issues;
  }

  function validateMetrics(metrics: unknown, rankedIds: readonly string[]): RecommendationIssue[] {
    if (!Array.isArray(metrics)) return [{ field: "metrics", message: "Corrupted Metrics: opportunity metrics are required." }];
    const issues: RecommendationIssue[] = [];
    const seen = new Set<string>();
    const ranked = new Set(rankedIds);
    metrics.forEach((item, index) => {
      if (!isPlainRecord(item) || Object.keys(item).some((key) => key !== "opportunityId" && key !== "metrics")) {
        issues.push({ field: `metrics.${index}`, message: "Corrupted Metrics: an opportunity needs a metrics record." });
        return;
      }
      const opportunityId = textOf(item.opportunityId);
      if (!SNAPSHOT_ID.test(opportunityId) || !ranked.has(opportunityId)) {
        issues.push({ field: `metrics.${index}.opportunityId`, message: "Corrupted Metrics: a metrics record must name a ranked opportunity." });
      } else if (seen.has(opportunityId)) {
        issues.push({ field: `metrics.${index}.opportunityId`, message: `Corrupted Metrics: opportunity id "${opportunityId}" is repeated.` });
      } else {
        seen.add(opportunityId);
      }
      const record = item.metrics;
      if (!isPlainRecord(record)) {
        issues.push({ field: `metrics.${index}.metrics`, message: "Corrupted Metrics: an opportunity needs a metrics record." });
        return;
      }
      for (const key of Object.keys(record)) {
        if (!(OPPORTUNITY_METRIC_KEYS as readonly string[]).includes(key)) {
          issues.push({ field: `metrics.${index}.metrics.${key}`, message: "Corrupted Metrics: a metrics record has an unknown member." });
        }
      }
      for (const key of OPPORTUNITY_METRIC_KEYS) {
        const value = record[key];
        const nullable = isNullableMetricKey(key);
        if (nullable) {
          if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
            issues.push({ field: `metrics.${index}.metrics.${key}`, message: "Corrupted Metrics: a nullable metric must be a finite number or null." });
          }
        } else if (typeof value !== "number" || !Number.isFinite(value)) {
          issues.push({ field: `metrics.${index}.metrics.${key}`, message: "Corrupted Metrics: a metric must be a finite number." });
        }
      }
    });
    for (const opportunityId of rankedIds) {
      if (!seen.has(opportunityId)) issues.push({ field: "metrics", message: `Corrupted Metrics: ranked opportunity "${opportunityId}" has no metrics record.` });
    }
    return issues;
  }

  function validateCondition(condition: unknown, field: string): RecommendationIssue[] {
    if (!isPlainRecord(condition) || typeof condition.kind !== "string" || !(CONDITION_KINDS as readonly string[]).includes(condition.kind)) {
      return [{ field, message: "Invalid Recommendation Policy: a condition needs a known kind." }];
    }
    const keys = Object.keys(condition);
    const issues: RecommendationIssue[] = [];
    if (POSITION_KINDS.has(condition.kind) || PORTFOLIO_COUNT_KINDS.has(condition.kind)) {
      if (keys.some((key) => key !== "kind" && key !== "value")) issues.push({ field, message: "Invalid Recommendation Policy: a condition has an unknown member." });
      const minimum = PORTFOLIO_COUNT_KINDS.has(condition.kind) ? 0 : 1;
      if (typeof condition.value !== "number" || !Number.isInteger(condition.value) || condition.value < minimum) {
        issues.push({ field: `${field}.value`, message: "Invalid Recommendation Policy: a count comparison needs an integer." });
      }
      return issues;
    }
    if (METRIC_VALUE_KINDS.has(condition.kind)) {
      if (keys.some((key) => key !== "kind" && key !== "metricId" && key !== "value")) issues.push({ field, message: "Invalid Recommendation Policy: a condition has an unknown member." });
      if (!isMetricKey(textOf(condition.metricId))) issues.push({ field: `${field}.metricId`, message: "Invalid Recommendation Policy: a condition must name an existing metric." });
      if (typeof condition.value !== "number" || !Number.isFinite(condition.value)) issues.push({ field: `${field}.value`, message: "Invalid Recommendation Policy: a metric comparison needs a finite number." });
      return issues;
    }
    if (condition.kind === "metricIsNull") {
      if (keys.some((key) => key !== "kind" && key !== "metricId")) issues.push({ field, message: "Invalid Recommendation Policy: a condition has an unknown member." });
      if (!isNullableMetricKey(textOf(condition.metricId))) issues.push({ field: `${field}.metricId`, message: "Invalid Recommendation Policy: only an unmeasured nullable metric can be checked." });
      return issues;
    }
    if (keys.some((key) => key !== "kind" && key !== "metricId")) issues.push({ field, message: "Invalid Recommendation Policy: a condition has an unknown member." });
    if (!isMetricKey(textOf(condition.metricId))) issues.push({ field: `${field}.metricId`, message: "Invalid Recommendation Policy: a condition must name an existing metric." });
    return issues;
  }

  function validateRules(rules: unknown, field: string): RecommendationIssue[] {
    if (!Array.isArray(rules) || rules.length === 0) return [{ field, message: "Invalid Recommendation Policy: a policy needs at least one rule." }];
    const issues: RecommendationIssue[] = [];
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
      const ruleField = `${field}.${index}`;
      if (!isPlainRecord(rule)) {
        issues.push({ field: ruleField, message: "Invalid Recommendation Policy: a rule needs an id, a type, a reason, and conditions." });
        return;
      }
      for (const key of Object.keys(rule)) {
        if (key !== "ruleId" && key !== "recommendationType" && key !== "reason" && key !== "conditions") {
          issues.push({ field: `${ruleField}.${key}`, message: "Invalid Recommendation Policy: a rule has an unknown member." });
        }
      }
      const ruleId = textOf(rule.ruleId);
      if (!SNAPSHOT_ID.test(ruleId)) issues.push({ field: `${ruleField}.ruleId`, message: "Invalid Recommendation Policy: a rule id is required." });
      else if (seen.has(ruleId)) issues.push({ field: `${ruleField}.ruleId`, message: "Invalid Recommendation Policy: a rule id is listed more than once." });
      else seen.add(ruleId);
      if (typeof rule.recommendationType !== "string" || !(RECOMMENDATION_TYPES as readonly string[]).includes(rule.recommendationType)) {
        issues.push({ field: `${ruleField}.recommendationType`, message: "Invalid Recommendation Policy: a rule type must be TEST_FIRST, MONITOR, WATCH, SKIP, or MANUAL_REVIEW." });
      }
      if (typeof rule.reason !== "string" || rule.reason.trim() === "") issues.push({ field: `${ruleField}.reason`, message: "Invalid Recommendation Policy: a rule reason is required." });
      if (!Array.isArray(rule.conditions)) issues.push({ field: `${ruleField}.conditions`, message: "Invalid Recommendation Policy: a rule needs a condition list." });
      else rule.conditions.forEach((condition, conditionIndex) => issues.push(...validateCondition(condition, `${ruleField}.conditions.${conditionIndex}`)));
      if (index === rules.length - 1 && (!Array.isArray(rule.conditions) || rule.conditions.length !== 0)) {
        issues.push({ field: `${ruleField}.conditions`, message: "Invalid Recommendation Policy: the last rule must match when no earlier rule does." });
      }
    });
    return issues;
  }

  function validatePolicy(policy: unknown): RecommendationIssue[] {
    if (typeof policy === "string") {
      if (!isRecommendationPolicyId(policy)) return [{ field: "policy", message: `Invalid Recommendation Policy: policy "${policy}" is not a recommendation policy.` }];
      return [];
    }
    if (!isPlainRecord(policy)) return [{ field: "policy", message: "Invalid Recommendation Policy: a recommendation policy is required." }];
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(policy)) {
      if (key !== "policyId" && key !== "rules") issues.push({ field: `policy.${key}`, message: "Invalid Recommendation Policy: a custom policy has an unknown member." });
    }
    const policyId = textOf(policy.policyId);
    if (!SNAPSHOT_ID.test(policyId)) issues.push({ field: "policy.policyId", message: "Invalid Recommendation Policy: a custom policy id is required." });
    else if (isRecommendationPolicyId(policyId)) issues.push({ field: "policy.policyId", message: "Invalid Recommendation Policy: a named policy does not accept replacement rules." });
    issues.push(...validateRules(policy.rules, "policy.rules"));
    return issues;
  }

  function validateInput(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) return [{ field: "ranking", message: "Missing Opportunity Ranking: an opportunity ranking is required." }];
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(RECOMMENDATION_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of METADATA_FIELDS) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    const ranking = validateRanking(input.ranking);
    issues.push(...ranking.issues);
    issues.push(...validatePortfolio(input.portfolio, ranking.ids));
    issues.push(...validateMetrics(input.metrics, ranking.ids));
    if (!("policy" in input) || input.policy === undefined) issues.push({ field: "policy", message: "Invalid Recommendation Policy: a recommendation policy is required." });
    else issues.push(...validatePolicy(input.policy));
    return issues;
  }

  function validateSnapshot(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RecommendationIssue[] = [];
    for (const field of RECOMMENDATION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.recommendationId !== "string" || !SNAPSHOT_ID.test(input.recommendationId)) issues.push(invalid("recommendationId", "a well-formed recommendation id is required."));
    if (!isPlainRecord(input.recommendations)) issues.push(invalid("recommendations", "a recommendation set is required."));
    else {
      for (const field of RECOMMENDATION_SET_KEYS) {
        if (input.recommendations[field] === undefined) issues.push(invalid(`recommendations.${field}`, `set member "${field}" is missing.`));
      }
      if (!Array.isArray(input.recommendations.recommendations)) issues.push(invalid("recommendations.recommendations", "recommendations are required."));
      else {
        input.recommendations.recommendations.forEach((item, index) => {
          if (!isPlainRecord(item)) {
            issues.push(invalid(`recommendations.recommendations.${index}`, "a recommendation is required."));
            return;
          }
          if (typeof item.reason !== "string" || item.reason.trim() === "") issues.push(invalid(`recommendations.recommendations.${index}.reason`, "a reason is required."));
          if (typeof item.recommendationType !== "string" || !(RECOMMENDATION_TYPES as readonly string[]).includes(item.recommendationType)) {
            issues.push(invalid(`recommendations.recommendations.${index}.recommendationType`, "a recommendation type is required."));
          }
          if (!Array.isArray(item.supportingMetrics) || !Array.isArray(item.triggeredRules) || !isPlainRecord(item.evidence)) {
            issues.push(invalid(`recommendations.recommendations.${index}`, "evidence, supporting metrics, and triggered rules are required."));
          }
          if (!isPlainRecord(item.confidence)) issues.push(invalid(`recommendations.recommendations.${index}.confidence`, "confidence is required."));
          else {
            for (const field of RECOMMENDATION_CONFIDENCE_KEYS) {
              const value = item.confidence[field];
              if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`recommendations.recommendations.${index}.confidence.${field}`, `${field} must be a finite number.`));
            }
          }
        });
      }
    }
    if (!isPlainRecord(input.evidence)) issues.push(invalid("evidence", "recommendation evidence is required."));
    else {
      for (const field of RECOMMENDATION_EVIDENCE_KEYS) {
        if (input.evidence[field] === undefined) issues.push(invalid(`evidence.${field}`, `evidence member "${field}" is missing.`));
      }
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "recommendation statistics are required."));
    else {
      for (const field of RECOMMENDATION_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a recommendation context is required."));
    else {
      for (const field of RECOMMENDATION_CONTEXT_RECORD_KEYS) {
        if (field === "policyId") {
          if (typeof input.context.policyId !== "string") issues.push(invalid("context.policyId", "policyId must be text."));
        } else if (!Array.isArray(input.context[field])) issues.push(invalid(`context.${field}`, `${field} must be a list.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
