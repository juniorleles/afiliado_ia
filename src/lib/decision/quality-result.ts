/**
 * Quality Rule Set: the summary of one run.
 *
 * Collects which quality rules passed, failed, warned, or were skipped, and
 * the observations they recorded. It does not prioritize, recommend, or
 * execute anything. There is no score.
 */
import type { DecisionRulePipelineReport } from "./decision-rule-pipeline";
import { freezeDeepDecisionRule } from "./decision-rule-context";
import { QUALITY_OBSERVATION_BY_RULE } from "./quality-rules";

/** Outcome of one quality run. Frozen. */
export interface QualityResult {
  readonly passedRules: readonly string[];
  readonly failedRules: readonly string[];
  readonly warningRules: readonly string[];
  readonly skippedRules: readonly string[];
  readonly qualityObservations: readonly string[];
  readonly executionTime: number;
}

function observationOf(ruleId: string, status: string, value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  const mapped = QUALITY_OBSERVATION_BY_RULE[ruleId];
  if (!mapped) return null;
  if (status === "PASS") return mapped.pass;
  if (status === "FAIL") return mapped.fail;
  if (status === "WARNING") return mapped.warn;
  return null;
}

/** Builds a frozen summary from a pipeline report. SKIPPED rules add no observation. */
export function summarizeQuality(report: DecisionRulePipelineReport): QualityResult {
  const passedRules: string[] = [];
  const failedRules: string[] = [];
  const warningRules: string[] = [];
  const skippedRules: string[] = [];
  const observations = new Set<string>();

  for (const result of report.results) {
    if (result.status === "PASS") passedRules.push(result.ruleId);
    else if (result.status === "FAIL") failedRules.push(result.ruleId);
    else if (result.status === "WARNING") warningRules.push(result.ruleId);
    else skippedRules.push(result.ruleId);

    if (result.status !== "SKIPPED") {
      const observation = observationOf(result.ruleId, result.status, result.metadata.observation);
      if (observation !== null) observations.add(observation);
    }
  }

  return freezeDeepDecisionRule({
    passedRules,
    failedRules,
    warningRules,
    skippedRules,
    qualityObservations: [...observations].sort((a, b) => a.localeCompare(b)),
    executionTime: report.results.reduce((total, result) => total + result.executionTime, 0),
  });
}
