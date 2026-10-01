/**
 * Readiness Rule Set: the summary of one run.
 *
 * Collects which readiness rules passed, failed, warned, or were skipped, and
 * the requirements that were missing. It does not prioritize, recommend, or
 * execute anything. There is no score.
 */
import type { DecisionRulePipelineReport } from "./decision-rule-pipeline";
import { freezeDeepDecisionRule } from "./decision-rule-context";
import { READINESS_REQUIREMENT_BY_RULE } from "./readiness-rules";

/** Outcome of one readiness run. Frozen. */
export interface ReadinessResult {
  readonly passedRules: readonly string[];
  readonly failedRules: readonly string[];
  readonly warningRules: readonly string[];
  readonly skippedRules: readonly string[];
  readonly missingRequirements: readonly string[];
  readonly executionTime: number;
}

function listedMissing(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value.split(",").map((item) => item.trim()).filter((item) => item !== "");
}

/** Builds a frozen summary from a pipeline report. Unknown FAIL rules contribute their mapped requirement. */
export function summarizeReadiness(report: DecisionRulePipelineReport): ReadinessResult {
  const passedRules: string[] = [];
  const failedRules: string[] = [];
  const warningRules: string[] = [];
  const skippedRules: string[] = [];
  const missing = new Set<string>();

  for (const result of report.results) {
    if (result.status === "PASS") passedRules.push(result.ruleId);
    else if (result.status === "FAIL") failedRules.push(result.ruleId);
    else if (result.status === "WARNING") warningRules.push(result.ruleId);
    else skippedRules.push(result.ruleId);

    if (result.status === "FAIL") {
      const listed = listedMissing(result.metadata.missing);
      if (listed.length > 0) for (const item of listed) missing.add(item);
      else missing.add(READINESS_REQUIREMENT_BY_RULE[result.ruleId] ?? result.ruleId);
    }
  }

  return freezeDeepDecisionRule({
    passedRules,
    failedRules,
    warningRules,
    skippedRules,
    missingRequirements: [...missing].sort((a, b) => a.localeCompare(b)),
    executionTime: report.results.reduce((total, result) => total + result.executionTime, 0),
  });
}
