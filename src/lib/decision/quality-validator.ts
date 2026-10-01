/**
 * Quality Rule Set: validator.
 *
 * Reports problems with a quality context, a rule result, a summary, and a
 * list of modules. It rejects a duplicate rule, a missing analysis, invalid
 * metadata, and an invalid rule result. It only reports: it never registers,
 * enables, or runs a rule, and it never changes what it is given.
 */
import type { DecisionIssue } from "./decision-validator";
import { validateDecisionRuleContext, validateDecisionRuleModule, validateDecisionRuleOutput } from "./decision-rule-validator";
import type { DecisionRuleModule } from "./decision-rule-contract";

const BANNED_RESULT_KEYS = ["score", "recommendation", "ranking", "actions", "action"] as const;

export interface QualityValidator {
  validateContext(input: unknown): DecisionIssue[];
  validateRuleResult(input: unknown): DecisionIssue[];
  validateSummary(input: unknown): DecisionIssue[];
  validateRules(modules: readonly unknown[]): DecisionIssue[];
}

/** Shared context rules, including invalid metadata. */
export function validateQualityContext(input: unknown): DecisionIssue[] {
  return validateDecisionRuleContext(input, true);
}

/** A quality rule result: a valid rule output, with no score, recommendation, or action. */
export function validateQualityRuleResult(input: unknown): DecisionIssue[] {
  const issues = validateDecisionRuleOutput(input);
  if (typeof input !== "object" || input === null) return issues;
  const record = input as Record<string, unknown>;
  for (const key of BANNED_RESULT_KEYS) {
    if (key in record) issues.push({ field: key, message: "Invalid rule result: a quality result carries no score, recommendation, or action." });
  }
  if ("ruleId" in record) {
    if (typeof record.ruleId !== "string" || record.ruleId.trim() === "") {
      issues.push({ field: "ruleId", message: "Invalid rule result: ruleId must be non-empty text." });
    }
  }
  if ("executionTime" in record) {
    if (typeof record.executionTime !== "number" || !Number.isFinite(record.executionTime) || record.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Invalid rule result: executionTime must be a finite number that is not negative." });
    }
  }
  return issues;
}

/** Duplicate ids among modules, and each module against the rule contract. */
export function validateQualityRules(modules: readonly unknown[]): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  const seen = new Map<string, number>();
  modules.forEach((module, index) => {
    issues.push(...validateDecisionRuleModule(module).map((issue) => ({ field: `rules[${index}].${issue.field}`, message: issue.message })));
    if (typeof module === "object" && module !== null && "id" in module && typeof (module as { id: unknown }).id === "string") {
      const id = (module as { id: string }).id;
      if (seen.has(id)) issues.push({ field: "id", message: `Duplicate rule: rule "${id}" is already registered.` });
      else seen.set(id, index);
    }
  });
  return issues;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Checks a QualityResult shape. */
export function validateQualitySummary(input: unknown): DecisionIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "summary", message: "Invalid rule result: a quality summary must be an object." }];
  }
  const record = input as Record<string, unknown>;
  const issues: DecisionIssue[] = [];
  for (const key of ["passedRules", "failedRules", "warningRules", "skippedRules", "qualityObservations"] as const) {
    if (!isStringList(record[key])) issues.push({ field: key, message: `"${key}" must be a list of text.` });
  }
  if (typeof record.executionTime !== "number" || !Number.isFinite(record.executionTime) || record.executionTime < 0) {
    issues.push({ field: "executionTime", message: "executionTime must be a finite number that is not negative." });
  }
  for (const key of BANNED_RESULT_KEYS) {
    if (key in record) issues.push({ field: key, message: "Invalid rule result: a quality summary carries no score, recommendation, or action." });
  }
  return issues;
}

export function createQualityValidator(): QualityValidator {
  return {
    validateContext: validateQualityContext,
    validateRuleResult: validateQualityRuleResult,
    validateSummary: validateQualitySummary,
    validateRules: validateQualityRules,
  };
}
