/**
 * Opportunity Resolver: validator.
 *
 * Implements the OpportunityValidator contract (opportunity-validator.ts) for
 * the resolver and adds the checks the pipeline needs. It rejects a missing
 * candidate, a missing context, a missing signal registry, an invalid signal
 * result, a duplicate signal, and invalid metadata.
 *
 * It reports problems and never throws or changes its input. It knows the
 * Signal Contract and nothing about any signal: results are judged by their
 * shape, never by what a particular signal measures.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import type { OpportunityIssue, OpportunityValidator } from "./opportunity-validator";
import { SIGNAL_RESULT_STATUSES, type SignalResult } from "./opportunity-signal-contract";
import { validateSignalModule } from "./opportunity-signal-validator";
import { OPPORTUNITY_ANALYSIS_STATUSES } from "./opportunity-resolver-decision";
import { RESOLVED_ANALYSIS_KEYS } from "./opportunity-resolver-analysis";
import type { OpportunityExecutionPlan } from "./opportunity-resolver-plan";
import { isPlainObject } from "./providers/evidence-provider-context";
import { validateEvidenceContext } from "./providers/evidence-provider-validator";
import { EVIDENCE_RESULT_STATUSES } from "./providers/evidence-provider-contract";

export interface RejectedSignalResult {
  signalId: string;
  errors: string[];
}

/** What result checking found: results that may be aggregated, and signals whose result may not. */
export interface CheckedSignalResults {
  valid: SignalResult[];
  rejected: RejectedSignalResult[];
  issues: OpportunityIssue[];
}

export interface OpportunityResolverValidator extends OpportunityValidator {
  /** Missing Candidate, Missing Context, Invalid Evidence Context, Invalid Metadata. */
  validateInput(input: unknown): OpportunityIssue[];
  /** Missing Signal Registry. */
  validateSignalSource(input: unknown): OpportunityIssue[];
  /** Duplicate Signal, an unrunnable plan. */
  validatePlan(plan: unknown): OpportunityIssue[];
  /** Invalid Signal Result, Duplicate Signal, results that do not match the plan. */
  checkSignalResults(results: unknown, plan: OpportunityExecutionPlan): CheckedSignalResults;
}

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const isIso = (value: unknown): boolean => isText(value) && ISO.test(value) && !Number.isNaN(Date.parse(value));

function isFlatMetadata(value: unknown): value is OpportunityMetadata {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(
      ([key, v]) => key.trim() !== "" && (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))),
    )
  );
}

function validateCandidate(value: unknown): OpportunityIssue[] {
  if (value === undefined || value === null) return [{ field: "candidate", message: "Missing candidate: a Discovery candidate is required." }];
  const bad = (message: string) => [{ field: "candidate", message: `Invalid candidate: ${message}` }];
  if (!isPlainObject(value)) return bad("an object is required.");
  for (const field of ["id", "source", "url", "title"] as const) {
    if (!isNonEmptyText(value[field])) return bad(`${field} must be non-empty text.`);
  }
  return [];
}

function validateInput(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "context", message: "Missing context: an execution context is required." }];
  const issues = validateCandidate(input.candidate);

  const evidence = input.evidenceContext;
  if (evidence === undefined || evidence === null) {
    issues.push({ field: "evidenceContext", message: "Missing context: an evidence context is required." });
  } else {
    issues.push(...validateEvidenceContext(evidence).map((i) => ({ field: `evidenceContext.${i.field}`, message: `Invalid evidence context: ${i.message}` })));
    if (isPlainObject(evidence) && isPlainObject(evidence.candidate) && isPlainObject(input.candidate) && evidence.candidate.id !== input.candidate.id) {
      issues.push({ field: "evidenceContext.candidate", message: "Invalid evidence context: it belongs to a different candidate than the one under analysis." });
    }
  }
  for (const field of ["executionMetadata", "runtimeMetadata", "configuration"] as const) {
    if (!isFlatMetadata(input[field])) {
      issues.push({ field, message: `Invalid metadata: "${field}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
    }
  }
  return issues;
}

function validateSignalSource(input: unknown): OpportunityIssue[] {
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

function validatePlan(plan: unknown): OpportunityIssue[] {
  if (!isPlainObject(plan) || !Array.isArray(plan.signals) || !Array.isArray(plan.order) || !Array.isArray(plan.issues)) {
    return [{ field: "plan", message: "The execution plan is missing or malformed." }];
  }
  const issues: OpportunityIssue[] = [];
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
  for (const issue of plan.issues as OpportunityIssue[]) issues.push({ field: issue.field, message: issue.message });
  if (plan.issues.length === 0 && plan.order.length === 0) issues.push({ field: "order", message: "No signal is enabled, so there is nothing to run." });
  return issues;
}

function validateSignalResult(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "result", message: "Invalid signal result: an object is required." }];
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid signal result: ${message}` });
  if (!isNonEmptyText(input.signalId)) add("signalId", "signalId must be non-empty text.");
  if (!oneOf(SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence))) add("confidence", "confidence must be a finite number or null.");
  if (!isFlatMetadata(input.metadata)) add("metadata", "metadata must be a flat object of strings, numbers, booleans, or null.");
  if (!isTextList(input.warnings)) add("warnings", "warnings must be a list of text.");
  if (!isTextList(input.errors)) add("errors", "errors must be a list of text.");
  else if (input.status === "FAILED" && input.errors.length === 0) add("errors", "a FAILED result requires at least one error.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}

function checkSignalResults(results: unknown, plan: OpportunityExecutionPlan): CheckedSignalResults {
  const issues: OpportunityIssue[] = [];
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
  const valid: SignalResult[] = [];
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
    valid.push(item as unknown as SignalResult);
  }
  for (const id of plan.order) {
    if (!seen.has(id)) reject(id, "No result was returned for this enabled signal.");
  }
  return { valid, rejected: [...rejected].map(([signalId, errors]) => ({ signalId, errors })), issues };
}

function validateAnalysis(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "analysis", message: "The analysis must be an object." }];
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  for (const key of Object.keys(input)) {
    if (!oneOf(RESOLVED_ANALYSIS_KEYS, key)) add(key, `Unexpected field "${key}": an analysis carries no score, ranking, or recommendation.`);
  }
  for (const key of RESOLVED_ANALYSIS_KEYS) {
    if (!(key in input)) add(key, `Field "${key}" is missing.`);
  }
  if (!isNonEmptyText(input.analysisId)) add("analysisId", "analysisId must be non-empty text.");
  if (input.candidateId !== null && !isNonEmptyText(input.candidateId)) add("candidateId", "candidateId must be non-empty text or null.");
  if (input.candidateId === null && input.status !== "REFUSED") add("candidateId", "Only a refused analysis may have no candidate.");
  if (!isIso(input.startedAt)) add("startedAt", "startedAt must be an ISO timestamp.");
  if (!isIso(input.completedAt)) add("completedAt", "completedAt must be an ISO timestamp.");
  else if (isIso(input.startedAt) && Date.parse(input.completedAt as string) < Date.parse(input.startedAt as string)) add("completedAt", "completedAt must not be before startedAt.");
  if (!oneOf(OPPORTUNITY_ANALYSIS_STATUSES, input.status)) add("status", "status is not supported.");

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
  if (!isFlatMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  issues.push(...validateSnapshot(input, lists));
  return issues;
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

function validateProviderResult(value: unknown): string | null {
  if (!isPlainObject(value)) return "an object is required.";
  if (!isNonEmptyText(value.providerId)) return "providerId must be non-empty text.";
  if (!isNonEmptyText(value.providerVersion)) return "providerVersion must be non-empty text.";
  if (!isNonEmptyText(value.kind)) return "kind must be non-empty text.";
  if (!(typeof value.priority === "number" && Number.isFinite(value.priority))) return "priority must be a finite number.";
  if (!oneOf(EVIDENCE_RESULT_STATUSES, value.status)) return "status is not supported.";
  if (!isFlatMetadata(value.metadata)) return "metadata must be a flat object of strings, numbers, booleans, or null.";
  if (!isTextList(value.warnings)) return "warnings must be a list of text.";
  if (!isTextList(value.errors)) return "errors must be a list of text.";
  if (!(typeof value.executionTime === "number" && Number.isFinite(value.executionTime) && value.executionTime >= 0)) return "executionTime must be a number of at least 0.";
  return null;
}

/** The snapshot fields: present, well-formed, and consistent with the lists above. */
function validateSnapshot(input: Record<string, unknown>, lists: Record<string, string[] | null>): OpportunityIssue[] {
  const issues: OpportunityIssue[] = [];
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
      const result = item as unknown as SignalResult;
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
      const claimed = isFlatMetadata(input.metadata) ? input.metadata[`signal.${result.signalId}.status`] : undefined;
      if (typeof claimed === "string" && claimed !== result.status) add(`signalResults[${index}].status`, `Invalid signal result: "${result.signalId}" is ${result.status} but the analysis says ${claimed}.`);
    });
    // An executed signal that did not fail has a result; one that failed may have none, because its result may have been rejected.
    if (executedSignals && failedSignals) {
      for (const id of executedSignals) {
        if (!failedSignals.includes(id) && !seen.has(id)) add("signalResults", `Missing signals: the executed signal "${id}" has no result.`);
      }
    }
  }

  if (!Array.isArray(input.providerResults)) {
    if ("providerResults" in input) add("providerResults", '"providerResults" must be a list.');
  } else {
    input.providerResults.forEach((item, index) => {
      const problem = validateProviderResult(item);
      if (problem !== null) add(`providerResults[${index}]`, `Invalid provider result: ${problem}`);
    });
  }

  for (const key of ["executionMetadata", "pipelineMetadata"] as const) {
    if (key in input && !isFlatMetadata(input[key])) add(key, `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
  }
  return issues;
}

export function createOpportunityValidator(): OpportunityResolverValidator {
  return {
    validateSignal: (input) => validateSignalModule(input),
    validateAnalysis,
    validateResult: validateSignalResult,
    validateInput,
    validateSignalSource,
    validatePlan,
    checkSignalResults,
  };
}
