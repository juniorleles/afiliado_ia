/**
 * Traffic Resolver: validator.
 *
 * Implements the TrafficValidator contract (traffic-validator.ts) for the
 * resolver and adds the checks the pipeline needs. It rejects a missing
 * candidate, a missing Opportunity analysis, a missing signal registry, an
 * invalid signal result, a duplicate signal, and invalid metadata.
 *
 * It reports problems and never throws or changes its input. It knows the
 * Signal Contract and nothing about any signal: results are judged by their
 * shape, never by what a particular signal measures.
 */
import type { TrafficIssue, TrafficValidator } from "./traffic-validator";
import { TRAFFIC_SIGNAL_RESULT_STATUSES, type TrafficSignalResult } from "./traffic-signal-contract";
import { isFlatTrafficMetadata, isPlainTrafficData, validateTrafficSignalModule } from "./traffic-signal-validator";
import { TRAFFIC_ANALYSIS_STATUSES } from "./traffic-resolver-decision";
import { RESOLVED_TRAFFIC_ANALYSIS_KEYS } from "./traffic-resolver-analysis";
import type { TrafficExecutionPlan } from "./traffic-resolver-plan";

export interface RejectedTrafficSignalResult {
  signalId: string;
  errors: string[];
}

/** What result checking found: results that may be aggregated, and signals whose result may not. */
export interface CheckedTrafficSignalResults {
  valid: TrafficSignalResult[];
  rejected: RejectedTrafficSignalResult[];
  issues: TrafficIssue[];
}

export interface TrafficResolverValidator extends TrafficValidator {
  /** Missing Candidate, Invalid Metadata. */
  validateInput(input: unknown): TrafficIssue[];
  /** Missing Opportunity Analysis, and an Opportunity analysis that cannot be read. */
  validateOpportunityAnalysis(input: unknown): TrafficIssue[];
  /** Missing Signal Registry. */
  validateSignalSource(input: unknown): TrafficIssue[];
  /** Duplicate Signal, an unrunnable plan. */
  validatePlan(plan: unknown): TrafficIssue[];
  /** Invalid Signal Result, Duplicate Signal, results that do not match the plan. */
  checkSignalResults(results: unknown, plan: TrafficExecutionPlan): CheckedTrafficSignalResults;
}

const USABLE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;
const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const isIso = (value: unknown): boolean => isText(value) && ISO.test(value) && !Number.isNaN(Date.parse(value));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateCandidate(value: unknown): TrafficIssue[] {
  if (value === undefined || value === null) return [{ field: "candidate", message: "Missing candidate: a Discovery candidate is required." }];
  const bad = (message: string) => [{ field: "candidate", message: `Invalid candidate: ${message}` }];
  if (!isPlainObject(value)) return bad("an object is required.");
  for (const field of ["id", "source", "url", "title"] as const) {
    if (!isNonEmptyText(value[field])) return bad(`${field} must be non-empty text.`);
  }
  return [];
}

function validateInput(input: unknown): TrafficIssue[] {
  if (!isPlainObject(input)) return [{ field: "context", message: "Missing context: an execution context is required." }];
  const issues = validateCandidate(input.candidate);
  for (const field of ["executionMetadata", "runtimeMetadata", "configuration"] as const) {
    if (!isFlatTrafficMetadata(input[field])) {
      issues.push({ field, message: `Invalid metadata: "${field}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
    }
  }
  return issues;
}

function validateOpportunityAnalysis(input: unknown): TrafficIssue[] {
  if (!isPlainObject(input)) return [{ field: "context", message: "Missing context: an execution context is required." }];
  const issues: TrafficIssue[] = [];
  const analysis = input.opportunityAnalysis;
  if (analysis === undefined || analysis === null) {
    issues.push({ field: "opportunityAnalysis", message: "Missing Opportunity analysis: an Opportunity analysis is required." });
    return issues;
  }
  if (!isPlainObject(analysis) || !isPlainTrafficData(analysis)) {
    issues.push({ field: "opportunityAnalysis", message: "Invalid context: the Opportunity analysis must be plain data." });
    return issues;
  }
  if (!isNonEmptyText(analysis.analysisId)) issues.push({ field: "opportunityAnalysis.analysisId", message: "Invalid context: the Opportunity analysis must carry a non-empty analysisId." });
  if (!oneOf(USABLE_ANALYSIS_STATUSES, analysis.status)) {
    issues.push({ field: "opportunityAnalysis.status", message: `Invalid context: the Opportunity analysis is ${String(analysis.status)}, and only a ${USABLE_ANALYSIS_STATUSES.join(" or ")} analysis can be read.` });
  }
  if (!Array.isArray(analysis.signalResults)) {
    issues.push({ field: "opportunityAnalysis.signalResults", message: 'Invalid context: the Opportunity analysis carries no "signalResults" list.' });
  }
  const candidateId = isPlainObject(input.candidate) && isNonEmptyText(input.candidate.id) ? input.candidate.id : null;
  if (candidateId !== null && isNonEmptyText(analysis.candidateId) && analysis.candidateId !== candidateId) {
    issues.push({ field: "opportunityAnalysis", message: "Invalid context: the Opportunity analysis belongs to a different candidate." });
  }
  const explanation = input.opportunityExplanation;
  if (explanation !== undefined && explanation !== null) {
    if (!isPlainObject(explanation) || !isPlainTrafficData(explanation)) {
      issues.push({ field: "opportunityExplanation", message: "Invalid context: the Opportunity explanation must be plain data." });
    } else {
      if (isNonEmptyText(analysis.analysisId) && isNonEmptyText(explanation.analysisId) && explanation.analysisId !== analysis.analysisId) {
        issues.push({ field: "opportunityExplanation", message: "Invalid context: the Opportunity explanation belongs to a different analysis." });
      }
      if (candidateId !== null && isNonEmptyText(explanation.candidateId) && explanation.candidateId !== candidateId) {
        issues.push({ field: "opportunityExplanation", message: "Invalid context: the Opportunity explanation belongs to a different candidate." });
      }
    }
  }
  return issues;
}

function validateSignalSource(input: unknown): TrafficIssue[] {
  const source = input as { registry?: { list?: unknown }; run?: unknown; resolveExecutionOrder?: unknown } | null | undefined;
  const ok =
    typeof source === "object" &&
    source !== null &&
    typeof source.registry === "object" &&
    source.registry !== null &&
    typeof source.registry.list === "function" &&
    typeof source.run === "function" &&
    typeof source.resolveExecutionOrder === "function";
  return ok ? [] : [{ field: "signals", message: "Missing signal registry: a signal pipeline with a registry is required." }];
}

function validatePlan(plan: unknown): TrafficIssue[] {
  if (!isPlainObject(plan) || !Array.isArray(plan.signals) || !Array.isArray(plan.order) || !Array.isArray(plan.issues)) {
    return [{ field: "plan", message: "The execution plan is missing or malformed." }];
  }
  const issues: TrafficIssue[] = [];
  const registered = new Set<unknown>();
  for (const signal of plan.signals) {
    const id = isPlainObject(signal) ? signal.signalId : undefined;
    if (registered.has(id)) issues.push({ field: "signals", message: `Duplicate signal "${String(id)}".` });
    registered.add(id);
  }
  const ordered = new Set<unknown>();
  for (const id of plan.order) {
    if (ordered.has(id)) issues.push({ field: "order", message: `Duplicate signal "${String(id)}" in the run order.` });
    else if (!registered.has(id)) issues.push({ field: "order", message: `Signal "${String(id)}" is in the run order but not registered.` });
    ordered.add(id);
  }
  for (const issue of plan.issues as TrafficIssue[]) issues.push({ field: issue.field, message: issue.message });
  if (plan.issues.length === 0 && plan.order.length === 0) issues.push({ field: "order", message: "No signal is enabled, so there is nothing to run." });
  return issues;
}

function validateSignalResult(input: unknown): TrafficIssue[] {
  if (!isPlainObject(input)) return [{ field: "result", message: "Invalid signal result: an object is required." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid signal result: ${message}` });
  if (!isNonEmptyText(input.signalId)) add("signalId", "signalId must be non-empty text.");
  if (!oneOf(TRAFFIC_SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence))) add("confidence", "confidence must be a finite number or null.");
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "metadata must be a flat object of strings, numbers, booleans, or null.");
  if (!isTextList(input.warnings)) add("warnings", "warnings must be a list of text.");
  if (!isTextList(input.errors)) add("errors", "errors must be a list of text.");
  else if (input.status === "FAILED" && input.errors.length === 0) add("errors", "a FAILED result requires at least one error.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}

function checkSignalResults(results: unknown, plan: TrafficExecutionPlan): CheckedTrafficSignalResults {
  const issues: TrafficIssue[] = [];
  const rejected = new Map<string, string[]>();
  const reject = (signalId: string, message: string) => {
    rejected.set(signalId, [...(rejected.get(signalId) ?? []), message]);
    issues.push({ field: "results", message: `${signalId}: ${message}` });
  };
  const list: unknown[] = Array.isArray(results) ? results : [];
  if (!Array.isArray(results)) issues.push({ field: "results", message: "Invalid signal result: the results are not a list." });

  const planned = new Set(plan.order);
  const seen = new Map<string, number>();
  for (const item of list) {
    const id = isPlainObject(item) && isNonEmptyText(item.signalId) ? item.signalId : null;
    if (id !== null) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const valid: TrafficSignalResult[] = [];
  for (const item of list) {
    const id = isPlainObject(item) && isNonEmptyText(item.signalId) ? item.signalId : null;
    const problems = validateSignalResult(item);
    if (id === null) {
      issues.push({ field: "results", message: problems[0]?.message ?? "Invalid signal result: a result has no signal id." });
      continue;
    }
    if ((seen.get(id) ?? 0) > 1) {
      if (!rejected.has(id)) reject(id, `Duplicate signal: ${seen.get(id)} results were returned for it.`);
      continue;
    }
    if (!planned.has(id)) {
      reject(id, "Unplanned signal result: it is not an enabled signal in the plan.");
      continue;
    }
    if (problems.length > 0) {
      for (const problem of problems) reject(id, problem.message);
      continue;
    }
    valid.push(item as unknown as TrafficSignalResult);
  }
  for (const id of plan.order) {
    if (!seen.has(id)) reject(id, "No result was returned for this enabled signal.");
  }
  return { valid, rejected: [...rejected].map(([signalId, errors]) => ({ signalId, errors })), issues };
}

function validatePlannedSignal(value: unknown): string | null {
  if (!isPlainObject(value)) return "an object is required.";
  for (const field of ["signalId", "name", "version", "category"] as const) {
    if (!isNonEmptyText(value[field])) return `${field} must be non-empty text.`;
  }
  if (!(typeof value.priority === "number" && Number.isFinite(value.priority))) return "priority must be a finite number.";
  if (typeof value.enabled !== "boolean") return "enabled must be true or false.";
  if (!isTextList(value.requires)) return "requires must be a list of signal ids.";
  if (!isTextList(value.optional)) return "optional must be a list of signal ids.";
  if (value.position !== null && !(typeof value.position === "number" && Number.isInteger(value.position) && value.position >= 0)) return "position must be a whole number of at least 0, or null.";
  return null;
}

function validateAnalysis(input: unknown): TrafficIssue[] {
  if (!isPlainObject(input)) return [{ field: "analysis", message: "The analysis must be an object." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  for (const key of Object.keys(input)) {
    if (!oneOf(RESOLVED_TRAFFIC_ANALYSIS_KEYS, key)) add(key, `Unexpected field "${key}": an analysis carries no score, ranking, or recommendation.`);
  }
  for (const key of RESOLVED_TRAFFIC_ANALYSIS_KEYS) {
    if (!(key in input)) add(key, `Field "${key}" is missing.`);
  }
  if (!isNonEmptyText(input.analysisId)) add("analysisId", "analysisId must be non-empty text.");
  if (input.candidateId !== null && !isNonEmptyText(input.candidateId)) add("candidateId", "candidateId must be non-empty text or null.");
  if (input.candidateId === null && input.status !== "REFUSED") add("candidateId", "Only a refused analysis may have no candidate.");
  if (input.opportunityAnalysisId !== null && !isNonEmptyText(input.opportunityAnalysisId)) add("opportunityAnalysisId", "opportunityAnalysisId must be non-empty text or null.");
  if (input.opportunityAnalysisId === null && input.status !== "REFUSED") add("opportunityAnalysisId", "Only a refused analysis may have no Opportunity analysis.");
  if (!isIso(input.startedAt)) add("startedAt", "startedAt must be an ISO timestamp.");
  if (!isIso(input.completedAt)) add("completedAt", "completedAt must be an ISO timestamp.");
  else if (isIso(input.startedAt) && Date.parse(input.completedAt as string) < Date.parse(input.startedAt as string)) add("completedAt", "completedAt must not be before startedAt.");
  if (!oneOf(TRAFFIC_ANALYSIS_STATUSES, input.status)) add("status", "status is not supported.");

  const lists: Record<string, string[] | null> = {};
  for (const key of ["registeredSignals", "executedSignals", "failedSignals"] as const) {
    const value = input[key];
    if (!isTextList(value)) {
      add(key, `"${key}" must be a list of signal ids.`);
      lists[key] = null;
      continue;
    }
    if (new Set(value).size !== value.length) add(key, `Duplicate signal in "${key}".`);
    lists[key] = value;
  }
  const { registeredSignals, executedSignals, failedSignals } = lists;
  if (registeredSignals && executedSignals && executedSignals.some((id) => !registeredSignals.includes(id))) add("executedSignals", "An executed signal is not registered.");
  if (executedSignals && failedSignals && failedSignals.some((id) => !executedSignals.includes(id))) add("failedSignals", "A failed signal is not among the executed signals.");
  if (!isTextList(input.warnings)) add("warnings", '"warnings" must be a list of text.');
  if (!isTextList(input.errors)) add("errors", '"errors" must be a list of text.');
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  issues.push(...validateSnapshot(input, lists));
  return issues;
}

function validateSnapshot(input: Record<string, unknown>, lists: Record<string, string[] | null>): TrafficIssue[] {
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const { registeredSignals, executedSignals, failedSignals } = lists;

  if (!Array.isArray(input.resolvedSignals)) {
    if ("resolvedSignals" in input) add("resolvedSignals", 'Missing signals: "resolvedSignals" must be a list.');
  } else {
    const ids: string[] = [];
    let ok = true;
    input.resolvedSignals.forEach((item, index) => {
      const problem = validatePlannedSignal(item);
      if (problem !== null) {
        ok = false;
        add(`resolvedSignals[${index}]`, `Invalid resolved signal: ${problem}`);
      } else ids.push((item as { signalId: string }).signalId);
    });
    if (ok) {
      const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
      if (repeated !== undefined) add("resolvedSignals", `Duplicate signal "${repeated}" in "resolvedSignals".`);
      if (registeredSignals && (ids.length !== registeredSignals.length || ids.some((id, i) => id !== registeredSignals[i]))) {
        add("resolvedSignals", "The resolved signals do not match the registered signals.");
      }
    }
  }

  let orderIds: string[] | null = null;
  if (!isTextList(input.executionOrder)) {
    if ("executionOrder" in input) add("executionOrder", '"executionOrder" must be a list of signal ids.');
  } else {
    orderIds = input.executionOrder;
    if (new Set(orderIds).size !== orderIds.length) add("executionOrder", 'Duplicate signal in "executionOrder".');
    if (registeredSignals && orderIds.some((id) => !registeredSignals.includes(id))) add("executionOrder", "A signal in the execution order is not registered.");
  }

  if (!Array.isArray(input.signalResults)) {
    if ("signalResults" in input) add("signalResults", 'Missing signals: "signalResults" must be a list.');
  } else {
    const seen = new Set<string>();
    input.signalResults.forEach((item, index) => {
      const problems = validateSignalResult(item);
      if (problems.length > 0) {
        for (const problem of problems) add(`signalResults[${index}].${problem.field}`, problem.message);
        return;
      }
      const result = item as unknown as TrafficSignalResult;
      if (seen.has(result.signalId)) add("signalResults", `Duplicate signal "${result.signalId}" in "signalResults".`);
      seen.add(result.signalId);
      if (registeredSignals && !registeredSignals.includes(result.signalId)) add(`signalResults[${index}]`, `The result belongs to "${result.signalId}", which is not registered.`);
      if (orderIds && !orderIds.includes(result.signalId)) add(`signalResults[${index}]`, `The result belongs to "${result.signalId}", which was not in the execution order.`);
      if (executedSignals) {
        const ran = executedSignals.includes(result.signalId);
        if (result.status === "SKIPPED" && ran) add(`signalResults[${index}]`, `"${result.signalId}" was skipped but is listed as executed.`);
        if (result.status !== "SKIPPED" && !ran) add(`signalResults[${index}]`, `"${result.signalId}" has a ${result.status} result but is not listed as executed.`);
      }
      if (failedSignals && result.status === "FAILED" && !failedSignals.includes(result.signalId)) add(`signalResults[${index}]`, `"${result.signalId}" failed but is not listed as failed.`);
      const metadata = isFlatTrafficMetadata(input.metadata) ? (input.metadata as Record<string, string | number | boolean | null>) : null;
      const claimed = metadata ? metadata[`signal.${result.signalId}.status`] : undefined;
      if (typeof claimed === "string" && claimed !== result.status) add(`signalResults[${index}].status`, `Invalid signal result: "${result.signalId}" is ${result.status} but the analysis says ${claimed}.`);
    });
    if (executedSignals && failedSignals) {
      for (const id of executedSignals) {
        if (!failedSignals.includes(id) && !seen.has(id)) add("signalResults", `Missing signals: the executed signal "${id}" has no result.`);
      }
    }
  }

  for (const key of ["executionMetadata", "pipelineMetadata"] as const) {
    if (key in input && !isFlatTrafficMetadata(input[key])) add(key, `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
  }
  return issues;
}

export function createTrafficValidator(): TrafficResolverValidator {
  return {
    validateSignal: (input) => validateTrafficSignalModule(input),
    validateAnalysis,
    validateResult: validateSignalResult,
    validateInput,
    validateOpportunityAnalysis,
    validateSignalSource,
    validatePlan,
    checkSignalResults,
  };
}
