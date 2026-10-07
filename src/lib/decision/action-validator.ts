/**
 * Action Rule Set: validator.
 *
 * Reports problems with an action context, a rule result, a summary, and a
 * list of modules. It rejects a duplicate rule, a duplicate action, a missing
 * context, invalid metadata, and an invalid rule result. It only reports: it
 * never registers, enables, or runs a rule, and it never changes what it is given.
 */
import type { DecisionIssue } from "./decision-validator";
import { isFlatDecisionMetadata, validateDecisionRuleContext, validateDecisionRuleModule, validateDecisionRuleOutput } from "./decision-rule-validator";

const BANNED_RESULT_KEYS = ["score", "recommendation", "ranking", "executionPlan", "plan"] as const;
const ACTION_ID = /^[a-z][a-z0-9-]*$/;

export interface ActionValidator {
  validateContext(input: unknown): DecisionIssue[];
  validateRuleResult(input: unknown): DecisionIssue[];
  validateSummary(input: unknown): DecisionIssue[];
  validateRules(modules: readonly unknown[]): DecisionIssue[];
}

/** Missing context, then the shared context rules (including invalid metadata). */
export function validateActionContext(input: unknown): DecisionIssue[] {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "context", message: "Missing context: a context object is required." }];
  }
  return validateDecisionRuleContext(input, true);
}

function actionFrom(record: Record<string, unknown>): string | null {
  const metadata = record.metadata;
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    const named = (metadata as Record<string, unknown>).eligibleAction;
    if (typeof named === "string" && named.trim() !== "") return named;
  }
  if (typeof record.ruleId === "string" && record.ruleId.trim() !== "") return record.ruleId;
  return null;
}

/** An action rule result: a valid rule output, with an eligible action and no plan. */
export function validateActionRuleResult(input: unknown): DecisionIssue[] {
  const issues = validateDecisionRuleOutput(input);
  if (typeof input !== "object" || input === null) return issues;
  const record = input as Record<string, unknown>;
  for (const key of BANNED_RESULT_KEYS) {
    if (key in record) issues.push({ field: key, message: "Invalid rule result: an action result carries no plan and no numeric result." });
  }
  const action = actionFrom(record);
  if (action === null || !ACTION_ID.test(action)) {
    issues.push({ field: "eligibleAction", message: "Invalid rule result: eligibleAction must be a valid action id." });
  }
  if (record.metadata !== undefined && !isFlatDecisionMetadata(record.metadata)) {
    issues.push({ field: "metadata", message: "Invalid metadata: metadata must be a flat object of strings, numbers, booleans, or null." });
  }
  if ("executionTime" in record) {
    if (typeof record.executionTime !== "number" || !Number.isFinite(record.executionTime) || record.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Invalid rule result: executionTime must be a finite number that is not negative." });
    }
  }
  return issues;
}

/** Duplicate rule ids, duplicate eligible actions, and each module against the contract. */
export function validateActionRules(modules: readonly unknown[]): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  const seenIds = new Map<string, number>();
  const seenActions = new Map<string, number>();
  modules.forEach((module, index) => {
    issues.push(...validateDecisionRuleModule(module).map((issue) => ({ field: `rules[${index}].${issue.field}`, message: issue.message })));
    if (typeof module !== "object" || module === null) return;
    const record = module as Record<string, unknown>;
    if (typeof record.id === "string") {
      if (seenIds.has(record.id)) issues.push({ field: "id", message: `Duplicate rule: rule "${record.id}" is already registered.` });
      else seenIds.set(record.id, index);
    }
    const action = typeof record.eligibleAction === "string" ? record.eligibleAction : typeof record.id === "string" ? record.id : "";
    if (action !== "") {
      if (seenActions.has(action)) issues.push({ field: "eligibleAction", message: `Duplicate action: action "${action}" is already registered.` });
      else seenActions.set(action, index);
    }
  });
  return issues;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Checks an ActionResult shape. */
export function validateActionSummary(input: unknown): DecisionIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "summary", message: "Invalid rule result: an action summary must be an object." }];
  }
  const record = input as Record<string, unknown>;
  const issues: DecisionIssue[] = [];
  for (const key of ["eligibleActions", "blockedActions", "warningActions", "skippedActions", "blockingReasons"] as const) {
    if (!isStringList(record[key])) issues.push({ field: key, message: `"${key}" must be a list of text.` });
  }
  if (typeof record.executionTime !== "number" || !Number.isFinite(record.executionTime) || record.executionTime < 0) {
    issues.push({ field: "executionTime", message: "executionTime must be a finite number that is not negative." });
  }
  for (const key of BANNED_RESULT_KEYS) {
    if (key in record) issues.push({ field: key, message: "Invalid rule result: an action summary carries no plan and no numeric result." });
  }
  return issues;
}

export function createActionValidator(): ActionValidator {
  return {
    validateContext: validateActionContext,
    validateRuleResult: validateActionRuleResult,
    validateSummary: validateActionSummary,
    validateRules: validateActionRules,
  };
}
