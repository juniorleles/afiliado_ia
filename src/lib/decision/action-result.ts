/**
 * Action Rule Set: the summary of one run.
 *
 * Collects which actions are eligible, blocked, warned, or skipped, and the
 * blocking reasons. It does not execute an action and does not emit a plan.
 */
import type { DecisionRulePipelineReport } from "./decision-rule-pipeline";
import { freezeDeepDecisionRule } from "./decision-rule-context";

/** Outcome of one action run. Frozen. */
export interface ActionResult {
  readonly eligibleActions: readonly string[];
  readonly blockedActions: readonly string[];
  readonly warningActions: readonly string[];
  readonly skippedActions: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly executionTime: number;
}

function actionId(result: { ruleId: string; metadata: { eligibleAction?: unknown } }): string {
  const named = result.metadata.eligibleAction;
  return typeof named === "string" && named.trim() !== "" ? named : result.ruleId;
}

function listedReasons(value: unknown, errors: readonly string[]): string[] {
  if (typeof value === "string" && value.trim() !== "") {
    return value.split(",").map((item) => item.trim()).filter((item) => item !== "");
  }
  return [...errors];
}

/** Builds a frozen summary from a pipeline report. */
export function summarizeAction(report: DecisionRulePipelineReport): ActionResult {
  const eligibleActions: string[] = [];
  const blockedActions: string[] = [];
  const warningActions: string[] = [];
  const skippedActions: string[] = [];
  const reasons = new Set<string>();

  for (const result of report.results) {
    const action = actionId(result);
    if (result.status === "PASS") eligibleActions.push(action);
    else if (result.status === "FAIL") blockedActions.push(action);
    else if (result.status === "WARNING") warningActions.push(action);
    else skippedActions.push(action);

    if (result.status === "FAIL") {
      for (const reason of listedReasons(result.metadata.blockingReasons, result.errors)) reasons.add(reason);
    }
  }

  return freezeDeepDecisionRule({
    eligibleActions,
    blockedActions,
    warningActions,
    skippedActions,
    blockingReasons: [...reasons].sort((a, b) => a.localeCompare(b)),
    executionTime: report.results.reduce((total, result) => total + result.executionTime, 0),
  });
}
