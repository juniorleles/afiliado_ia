/**
 * Decision Resolver: validator.
 *
 * Adds the checks the pipeline needs. It rejects a missing candidate, a
 * missing analysis, a missing rule registry, an invalid rule result, circular
 * dependencies, and invalid metadata.
 *
 * It reports problems and never throws or changes its input. It knows the
 * Decision Rule Contract and nothing about any rule: results are judged by
 * their shape, never by what a particular rule measures.
 */
import type { DecisionRuleEntry, DecisionRuleRunResult } from "./decision-rule-contract";
import {
  isFlatDecisionMetadata,
  isPlainDecisionData,
  validateDecisionRuleDependencies,
  validateDecisionRuleOutput,
} from "./decision-rule-validator";
import type { DecisionIssue } from "./decision-validator";
import { DECISION_RESOLUTION_STATUSES, RESOLVED_DECISION_ANALYSIS_KEYS } from "./decision-resolver-analysis";

export interface RejectedDecisionRuleResult {
  ruleId: string;
  errors: string[];
}

export interface CheckedDecisionRuleResults {
  valid: DecisionRuleRunResult[];
  rejected: RejectedDecisionRuleResult[];
  issues: DecisionIssue[];
}

export interface DecisionResolverValidator {
  /** Missing Candidate, Invalid Metadata. */
  validateInput(input: unknown): DecisionIssue[];
  /** Missing Analysis: Opportunity. */
  validateOpportunityAnalysis(input: unknown): DecisionIssue[];
  /** Missing Analysis: Traffic. */
  validateTrafficAnalysis(input: unknown): DecisionIssue[];
  /** Missing Analysis: page. */
  validatePageAnalysis(input: unknown): DecisionIssue[];
  /** Missing Rule Registry. */
  validateRuleRegistry(input: unknown): DecisionIssue[];
  /** Circular Dependencies, conflicting enabled rules. */
  validateDependencies(entries: readonly DecisionRuleEntry[]): DecisionIssue[];
  /** Invalid Rule Result. */
  validateRuleResult(input: unknown): DecisionIssue[];
  /** Invalid Rule Result, a rule that ran more than once. */
  checkRuleResults(results: unknown): CheckedDecisionRuleResults;
  validateAnalysis(input: unknown): DecisionIssue[];
}

const BANNED_RESULT_KEYS = ["score", "recommendation", "ranking", "executionPlan", "plan"] as const;
const LIFECYCLE = ["COMPLETED", "FAILED"] as const;
const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const ISO_OK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const isIso = (value: unknown): boolean => isText(value) && ISO_OK.test(value) && !Number.isNaN(Date.parse(value));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const idOf = (value: unknown, key: string): string | null =>
  isPlainObject(value) && isNonEmptyText(value[key]) ? (value[key] as string) : null;

function validateCandidate(value: unknown): DecisionIssue[] {
  if (value === undefined || value === null) return [{ field: "candidate", message: "Missing candidate: a Discovery candidate is required." }];
  const bad = (message: string) => [{ field: "candidate", message: `Invalid candidate: ${message}` }];
  if (!isPlainObject(value) || !isPlainDecisionData(value)) return bad("an object of plain data is required.");
  for (const field of ["id", "source", "url", "title"] as const) {
    if (!isNonEmptyText(value[field])) return bad(`${field} must be non-empty text.`);
  }
  return [];
}

function validateMetadataBag(input: Record<string, unknown>, field: string): DecisionIssue[] {
  if (!isFlatDecisionMetadata(input[field])) {
    return [{ field, message: `Invalid metadata: "${field}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` }];
  }
  return [];
}

function validateInput(input: unknown): DecisionIssue[] {
  if (!isPlainObject(input)) return [{ field: "context", message: "Missing context: an execution context is required." }];
  const issues = validateCandidate(input.candidate);
  for (const field of ["executionMetadata", "runtimeMetadata", "configuration", "extensions"] as const) {
    if (!(field in input)) continue;
    issues.push(...validateMetadataBag(input, field));
  }
  return issues;
}

function validateNamedAnalysis(value: unknown, field: string, label: string, extra?: (record: Record<string, unknown>) => DecisionIssue[]): DecisionIssue[] {
  if (value === undefined || value === null) return [{ field, message: `Missing analysis: ${label} is required.` }];
  if (!isPlainObject(value) || !isPlainDecisionData(value)) {
    return [{ field, message: `Missing analysis: ${label} must be plain data.` }];
  }
  if (idOf(value, "id") === null) return [{ field, message: `Missing analysis: ${label} must carry a non-empty id.` }];
  return extra ? extra(value) : [];
}

function validateOpportunityAnalysis(input: unknown): DecisionIssue[] {
  const record = isPlainObject(input) ? input.opportunityAnalysis : input;
  const parent = isPlainObject(input) && "opportunityAnalysis" in input ? input : null;
  const issues = validateNamedAnalysis(record, "opportunityAnalysis", "an Opportunity analysis");
  if (issues.length > 0 || !isPlainObject(record) || parent === null) return issues;
  const candidateId = idOf(parent.candidate, "id");
  const analysisCandidate = record.candidateId;
  if (candidateId !== null && typeof analysisCandidate === "string" && analysisCandidate !== candidateId) {
    issues.push({ field: "opportunityAnalysis", message: "Invalid context: the Opportunity analysis belongs to a different candidate." });
  }
  return issues;
}

function validateTrafficAnalysis(input: unknown): DecisionIssue[] {
  const record = isPlainObject(input) ? input.trafficAnalysis : input;
  const parent = isPlainObject(input) && "trafficAnalysis" in input ? input : null;
  const issues = validateNamedAnalysis(record, "trafficAnalysis", "a Traffic analysis");
  if (issues.length > 0 || !isPlainObject(record) || parent === null) return issues;
  const candidateId = idOf(parent.candidate, "id");
  const analysisCandidate = record.candidateId;
  if (candidateId !== null && typeof analysisCandidate === "string" && analysisCandidate !== candidateId) {
    issues.push({ field: "trafficAnalysis", message: "Invalid context: the Traffic analysis belongs to a different candidate." });
  }
  const opportunityId = idOf(parent.opportunityAnalysis, "id");
  const analysisOpportunity = record.opportunityAnalysisId;
  if (opportunityId !== null && typeof analysisOpportunity === "string" && analysisOpportunity !== opportunityId) {
    issues.push({ field: "trafficAnalysis", message: "Invalid context: the Traffic analysis belongs to a different Opportunity analysis." });
  }
  return issues;
}

function validatePageAnalysis(input: unknown): DecisionIssue[] {
  const record = isPlainObject(input) ? input.pageAnalysis : input;
  const parent = isPlainObject(input) && "pageAnalysis" in input ? input : null;
  const issues = validateNamedAnalysis(record, "pageAnalysis", "a page analysis");
  if (issues.length > 0 || !isPlainObject(record) || parent === null) return issues;
  const candidateId = idOf(parent.candidate, "id");
  const pageCandidate = record.candidateId;
  if (candidateId !== null && typeof pageCandidate === "string" && pageCandidate !== candidateId) {
    issues.push({ field: "pageAnalysis", message: "Invalid context: the page analysis belongs to a different candidate." });
  }
  return issues;
}

function validateRuleRegistry(input: unknown): DecisionIssue[] {
  const source = input as { list?: unknown; get?: unknown } | null | undefined;
  const ok = typeof source === "object" && source !== null && typeof source.list === "function" && typeof source.get === "function";
  return ok ? [] : [{ field: "registry", message: "Missing Rule Registry: a decision rule registry is required." }];
}

function validateLoadedAnalysis(value: unknown, field: string, label: string): DecisionIssue[] {
  if (value === undefined || value === null) return [];
  return validateNamedAnalysis(value, field, label);
}

function validateRuleResult(input: unknown): DecisionIssue[] {
  const issues = validateDecisionRuleOutput(input);
  if (typeof input !== "object" || input === null) return issues.length > 0 ? issues.map((i) => ({ field: i.field, message: `Invalid rule result: ${i.message}` })) : issues;
  const record = input as Record<string, unknown>;
  const prefixed = issues.map((i) => ({ field: i.field, message: `Invalid rule result: ${i.message}` }));
  for (const key of BANNED_RESULT_KEYS) {
    if (key in record) prefixed.push({ field: key, message: "Invalid rule result: a decision result carries no plan and no numeric result." });
  }
  if ("ruleId" in record && !isNonEmptyText(record.ruleId)) {
    prefixed.push({ field: "ruleId", message: "Invalid rule result: ruleId must be non-empty text." });
  }
  if ("executionTime" in record) {
    if (typeof record.executionTime !== "number" || !Number.isFinite(record.executionTime) || record.executionTime < 0) {
      prefixed.push({ field: "executionTime", message: "Invalid rule result: executionTime must be a finite number that is not negative." });
    }
  }
  return prefixed;
}

function checkRuleResults(results: unknown): CheckedDecisionRuleResults {
  const issues: DecisionIssue[] = [];
  const rejected = new Map<string, string[]>();
  const valid: DecisionRuleRunResult[] = [];
  const reject = (ruleId: string, message: string) => {
    rejected.set(ruleId, [...(rejected.get(ruleId) ?? []), message]);
    issues.push({ field: "results", message: `${ruleId}: ${message}` });
  };
  if (!Array.isArray(results)) {
    return { valid: [], rejected: [{ ruleId: "results", errors: ["Invalid rule result: a list of results is required."] }], issues: [{ field: "results", message: "Invalid rule result: a list of results is required." }] };
  }
  const seen = new Set<string>();
  results.forEach((item, index) => {
    const problems = validateRuleResult(item);
    const ruleId = isPlainObject(item) && isNonEmptyText(item.ruleId) ? item.ruleId : `results[${index}]`;
    if (problems.length > 0) {
      for (const problem of problems) reject(ruleId, problem.message);
      return;
    }
    if (seen.has(ruleId)) {
      reject(ruleId, "Invalid rule result: the rule ran more than once.");
      return;
    }
    seen.add(ruleId);
    valid.push(item as DecisionRuleRunResult);
  });
  return { valid, rejected: [...rejected].map(([ruleId, errors]) => ({ ruleId, errors })), issues };
}

function validateAnalysis(input: unknown): DecisionIssue[] {
  if (!isPlainObject(input)) return [{ field: "analysis", message: "The analysis must be an object." }];
  const issues: DecisionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  for (const key of Object.keys(input)) {
    if (!oneOf(RESOLVED_DECISION_ANALYSIS_KEYS, key)) add(key, `Unexpected field "${key}": an analysis carries no plan and no numeric result.`);
  }
  for (const key of RESOLVED_DECISION_ANALYSIS_KEYS) {
    if (!(key in input)) add(key, `Field "${key}" is missing.`);
  }
  if (!isNonEmptyText(input.analysisId)) add("analysisId", "analysisId must be non-empty text.");
  if (input.candidateId !== null && !isNonEmptyText(input.candidateId)) add("candidateId", "candidateId must be non-empty text or null.");
  if (input.candidateId === null && input.decisionStatus !== "REFUSED") add("candidateId", "Only a refused analysis may have no candidate.");
  if (!oneOf(LIFECYCLE, input.status)) add("status", "status is not supported.");
  if (!oneOf(DECISION_RESOLUTION_STATUSES, input.decisionStatus)) add("decisionStatus", "decisionStatus is not supported.");
  if (input.decisionStatus === "REFUSED" && input.status !== "FAILED") add("status", "A refused analysis must be FAILED.");
  if (!isIso(input.startedAt)) add("startedAt", "startedAt must be an ISO timestamp.");
  if (!isIso(input.completedAt)) add("completedAt", "completedAt must be an ISO timestamp.");
  else if (isIso(input.startedAt) && Date.parse(input.completedAt as string) < Date.parse(input.startedAt as string)) {
    add("completedAt", "completedAt must not be before startedAt.");
  }
  for (const key of ["opportunityAnalysisId", "trafficAnalysisId", "pageAnalysisId"] as const) {
    if (input[key] !== null && !isNonEmptyText(input[key])) add(key, `"${key}" must be non-empty text or null.`);
  }

  const lists: Record<string, string[] | null> = {};
  for (const key of ["executedDimensions", "executedRules", "failedRules", "blockingRules", "conflictingRules", "missingEvidence", "skippedRules"] as const) {
    const value = input[key];
    if (!isTextList(value)) {
      add(key, `"${key}" must be a list of text.`);
      lists[key] = null;
      continue;
    }
    if (new Set(value).size !== value.length) add(key, `Duplicate id in "${key}".`);
    lists[key] = value;
  }
  const { executedRules, failedRules } = lists;
  if (executedRules && failedRules && failedRules.some((id) => !executedRules.includes(id))) {
    add("failedRules", "A failed rule is not among the executed rules.");
  }
  if (!isTextList(input.warnings)) add("warnings", '"warnings" must be a list of text.');
  if (!isTextList(input.errors)) add("errors", '"errors" must be a list of text.');
  if (!isFlatDecisionMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) {
    add("executionTime", "executionTime must be a number of at least 0.");
  }
  if (!Array.isArray(input.ruleResults)) add("ruleResults", '"ruleResults" must be a list.');
  if (!Array.isArray(input.recordedExecutions)) add("recordedExecutions", '"recordedExecutions" must be a list.');
  for (const key of ["executionMetadata", "pipelineMetadata"] as const) {
    if (key in input && !isFlatDecisionMetadata(input[key])) {
      add(key, `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
    }
  }
  return issues;
}

export function createDecisionResolverValidator(): DecisionResolverValidator {
  return {
    validateInput,
    validateOpportunityAnalysis,
    validateTrafficAnalysis,
    validatePageAnalysis,
    validateRuleRegistry,
    validateDependencies: (entries) => {
      const issues = validateDecisionRuleDependencies(entries);
      return issues.map((issue) =>
        /Circular dependency/.test(issue.message)
          ? { field: issue.field, message: `Circular Dependencies: ${issue.message}` }
          : issue,
      );
    },
    validateRuleResult,
    checkRuleResults,
    validateAnalysis,
  };
}

export { validateLoadedAnalysis };
