/**
 * Host record domain: opportunity ranking validator.
 *
 * Pure local rules for one ordering. It rejects missing metrics, corrupted
 * metrics, duplicate opportunity ids, an invalid policy, and invalid
 * metadata. It does not change what it is given.
 */
import { RANKING_CONTEXT_MEMBERS, type RankingMetadata } from "./ranking-context";
import { isKnownMetricId, isRankingPolicyId } from "./ranking-policy";
import {
  RANKING_CONTEXT_RECORD_KEYS,
  RANKING_EVIDENCE_KEYS,
  RANKING_EXECUTION_STATISTICS_KEYS,
  RANKING_SNAPSHOT_KEYS,
  OPPORTUNITY_RANKING_KEYS,
} from "./ranking-snapshot";
import {
  NULLABLE_METRIC_KEYS,
  OPPORTUNITY_METRIC_KEYS,
  RANKING_DIRECTIONS,
  type RankingIssue,
} from "./ranking-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const NULLABLE = new Set<string>(NULLABLE_METRIC_KEYS);

export interface RankingValidator {
  validateInput(input: unknown): RankingIssue[];
  validateMetadata(input: unknown): RankingIssue[];
  validateSnapshot(input: unknown): RankingIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRankingMetadata(value: unknown): value is RankingMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RankingIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createRankingValidator(): RankingValidator {
  function validateMetadata(input: unknown): RankingIssue[] {
    if (input === undefined) return [];
    if (!isFlatRankingMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateMetrics(metrics: unknown, field: string): RankingIssue[] {
    if (!isPlainRecord(metrics)) return [{ field, message: "Corrupted Metrics: an opportunity needs a metrics record." }];
    const issues: RankingIssue[] = [];
    for (const key of Object.keys(metrics)) {
      if (!(OPPORTUNITY_METRIC_KEYS as readonly string[]).includes(key)) {
        issues.push({ field: `${field}.${key}`, message: "Corrupted Metrics: a metrics record has an unknown member." });
      }
    }
    for (const key of OPPORTUNITY_METRIC_KEYS) {
      const value = metrics[key];
      if (NULLABLE.has(key)) {
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
          issues.push({ field: `${field}.${key}`, message: "Corrupted Metrics: a nullable metric must be a finite number or null." });
        }
      } else if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ field: `${field}.${key}`, message: "Corrupted Metrics: a metric must be a finite number." });
      }
    }
    return issues;
  }

  function validateOpportunities(opportunities: unknown): RankingIssue[] {
    if (!Array.isArray(opportunities) || opportunities.length === 0) {
      return [{ field: "opportunities", message: "Missing Opportunity Metrics: opportunity metrics are required." }];
    }
    const issues: RankingIssue[] = [];
    const seen = new Set<string>();
    opportunities.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push({ field: `opportunities.${index}`, message: "Corrupted Metrics: an opportunity needs a metrics record." });
        return;
      }
      const extra = Object.keys(item).filter((key) => key !== "opportunityId" && key !== "metrics");
      for (const key of extra) {
        issues.push({ field: `opportunities.${index}.${key}`, message: "Corrupted Metrics: an opportunity has an unknown member." });
      }
      const opportunityId = textOf(item.opportunityId);
      if (!SNAPSHOT_ID.test(opportunityId)) {
        issues.push(invalid(`opportunities.${index}.opportunityId`, "an opportunity id is required."));
      } else if (seen.has(opportunityId)) {
        issues.push({ field: `opportunities.${index}.opportunityId`, message: `Duplicate Opportunity IDs: opportunity id "${opportunityId}" is repeated.` });
      } else {
        seen.add(opportunityId);
      }
      issues.push(...validateMetrics(item.metrics, `opportunities.${index}.metrics`));
    });
    return issues;
  }

  function validatePolicy(policy: unknown): RankingIssue[] {
    if (typeof policy === "string") {
      if (!isRankingPolicyId(policy)) return [{ field: "policy", message: `Invalid Ranking Policy: policy "${policy}" is not a ranking policy.` }];
      return [];
    }
    if (!isPlainRecord(policy)) return [{ field: "policy", message: "Invalid Ranking Policy: a ranking policy is required." }];
    const issues: RankingIssue[] = [];
    for (const key of Object.keys(policy)) {
      if (key !== "policyId" && key !== "rules") issues.push({ field: `policy.${key}`, message: "Invalid Ranking Policy: a custom policy has an unknown member." });
    }
    const policyId = textOf(policy.policyId);
    if (!SNAPSHOT_ID.test(policyId)) issues.push({ field: "policy.policyId", message: "Invalid Ranking Policy: a custom policy id is required." });
    else if (isRankingPolicyId(policyId)) issues.push({ field: "policy.policyId", message: "Invalid Ranking Policy: a named policy does not accept replacement rules." });
    if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
      issues.push({ field: "policy.rules", message: "Invalid Ranking Policy: a custom policy needs at least one rule." });
      return issues;
    }
    const seen = new Set<string>();
    policy.rules.forEach((rule, index) => {
      if (!isPlainRecord(rule)) {
        issues.push({ field: `policy.rules.${index}`, message: "Invalid Ranking Policy: a rule needs a metric and a direction." });
        return;
      }
      for (const key of Object.keys(rule)) {
        if (key !== "metricId" && key !== "direction") {
          issues.push({ field: `policy.rules.${index}.${key}`, message: "Invalid Ranking Policy: a rule has an unknown member." });
        }
      }
      const metricId = textOf(rule.metricId);
      if (!isKnownMetricId(metricId)) {
        issues.push({ field: `policy.rules.${index}.metricId`, message: "Invalid Ranking Policy: a rule must name an existing metric." });
      } else if (seen.has(metricId)) {
        issues.push({ field: `policy.rules.${index}.metricId`, message: "Invalid Ranking Policy: a metric is listed more than once." });
      } else {
        seen.add(metricId);
      }
      if (typeof rule.direction !== "string" || !(RANKING_DIRECTIONS as readonly string[]).includes(rule.direction)) {
        issues.push({ field: `policy.rules.${index}.direction`, message: "Invalid Ranking Policy: a direction must be higher or lower." });
      }
    });
    return issues;
  }

  function validateInput(input: unknown): RankingIssue[] {
    if (!isPlainRecord(input)) return [{ field: "opportunities", message: "Missing Opportunity Metrics: opportunity metrics are required." }];
    const issues: RankingIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(RANKING_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of METADATA_FIELDS) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    if (!("policy" in input) || input.policy === undefined) issues.push({ field: "policy", message: "Invalid Ranking Policy: a ranking policy is required." });
    else issues.push(...validatePolicy(input.policy));
    issues.push(...validateOpportunities(input.opportunities));
    return issues;
  }

  function validateSnapshot(input: unknown): RankingIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RankingIssue[] = [];
    for (const field of RANKING_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.rankingId !== "string" || !SNAPSHOT_ID.test(input.rankingId)) issues.push(invalid("rankingId", "a well-formed ranking id is required."));
    if (!isPlainRecord(input.ranking)) issues.push(invalid("ranking", "an opportunity ranking is required."));
    else {
      for (const field of OPPORTUNITY_RANKING_KEYS) {
        if (input.ranking[field] === undefined) issues.push(invalid(`ranking.${field}`, `ranking member "${field}" is missing.`));
      }
      if (!Array.isArray(input.ranking.ordered)) issues.push(invalid("ranking.ordered", "an ordered list is required."));
      else {
        input.ranking.ordered.forEach((item, index) => {
          if (!isPlainRecord(item) || item.position !== index + 1 || !SNAPSHOT_ID.test(textOf(item.opportunityId))) {
            issues.push(invalid(`ranking.ordered.${index}`, "a ranking position must follow the ordered list."));
          }
        });
      }
    }
    if (!isPlainRecord(input.evidence)) issues.push(invalid("evidence", "ranking evidence is required."));
    else {
      for (const field of RANKING_EVIDENCE_KEYS) {
        if (input.evidence[field] === undefined) issues.push(invalid(`evidence.${field}`, `evidence member "${field}" is missing.`));
      }
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "execution statistics are required."));
    else {
      for (const field of RANKING_EXECUTION_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a ranking context is required."));
    else {
      for (const field of RANKING_CONTEXT_RECORD_KEYS) {
        if (field === "policyId") {
          if (typeof input.context.policyId !== "string") issues.push(invalid("context.policyId", "policyId must be text."));
        } else if (!Array.isArray(input.context[field])) {
          issues.push(invalid(`context.${field}`, `${field} must be a list.`));
        }
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
