/**
 * Host record domain: pause and resume action plan.
 *
 * Precedence is fixed: exclusion, then a lock, then opposite actions,
 * then an unevaluable rule, then a pause match, then a resume match.
 * A recommendation set that only says No Action disagrees with a pause
 * or resume match. Every pending action stays unexecuted and requires approval.
 */
import type { PendingAction, RecommendationCite, RuleEvidence } from "./rule-snapshot";
import type { CheckedRule, PlanOutcome, RuleEvidenceRow, RuleView } from "./rule-types";

export interface BuiltPlan {
  outcome: PlanOutcome;
  pendingActions: PendingAction[];
  evidence: RuleEvidence;
}

function copyRow(row: RuleEvidenceRow, detail = row.detail): RuleEvidenceRow {
  return {
    ruleId: row.ruleId,
    kind: row.kind,
    matched: row.matched,
    current: row.current,
    threshold: row.threshold,
    detail,
  };
}

function holdOthers(rows: readonly RuleEvidenceRow[], keeperId: string): RuleEvidenceRow[] {
  return rows.map((row) => (row.matched && row.ruleId !== keeperId ? copyRow(row, `${row.detail} Not applied.`) : copyRow(row)));
}

function holdMatched(rows: readonly RuleEvidenceRow[]): RuleEvidenceRow[] {
  return rows.map((row) => (row.matched ? copyRow(row, `${row.detail} Not applied.`) : copyRow(row)));
}

function actionFrom(item: CheckedRule, outcome: PlanOutcome, source: RuleEvidenceRow): PendingAction {
  return {
    actionId: item.rule.id,
    outcome,
    approval: "REQUIRED",
    executed: false,
    reason: source.detail,
    triggeredRules: [item.rule.id],
    evidence: { rows: [copyRow(source)] },
  };
}

function conflictAction(items: readonly CheckedRule[], sources: readonly RuleEvidenceRow[], prefix: string): PendingAction {
  const details = sources.map((row) => row.detail).join(" ");
  return {
    actionId: "rule-conflict",
    outcome: "Rule Conflict",
    approval: "REQUIRED",
    executed: false,
    reason: prefix === "" ? details : `${prefix} ${details}`,
    triggeredRules: items.map((item) => item.rule.id),
    evidence: { rows: sources.map((row) => copyRow(row)) },
  };
}

function citesOf(view: RuleView): RecommendationCite[] {
  return view.recommendationSet.recommendations.map((item) => ({
    recommendationId: item.recommendationId,
    kind: item.kind,
  }));
}

function evidenceOf(view: RuleView, rows: RuleEvidenceRow[]): RuleEvidence {
  return {
    campaignResourceName: view.report.campaignResourceName,
    currentWindow: view.report.comparison.currentWindow,
    historicalWindow: view.report.comparison.historicalWindow,
    recommendations: citesOf(view),
    rows,
  };
}

function onlyNoAction(cites: readonly RecommendationCite[]): boolean {
  return cites.length > 0 && cites.every((item) => item.kind === "No Action");
}

export function buildActionPlan(view: RuleView, checkedRules: readonly CheckedRule[]): BuiltPlan {
  const baseRows = checkedRules.map((item) => copyRow(item.row));
  const excluded = checkedRules.find((item) => item.state === "matched" && item.rule.kind === "MANUALLY_EXCLUDED");
  if (excluded) {
    const rows = holdOthers(baseRows, excluded.rule.id);
    return { outcome: "No Action", pendingActions: [], evidence: evidenceOf(view, rows) };
  }
  const locked = checkedRules.find((item) => item.state === "matched" && item.rule.kind === "MANUALLY_LOCKED");
  if (locked) {
    const rows = holdOthers(baseRows, locked.rule.id);
    const source = rows.find((row) => row.ruleId === locked.rule.id) ?? locked.row;
    return {
      outcome: "Manual Review Required",
      pendingActions: [actionFrom(locked, "Manual Review Required", source)],
      evidence: evidenceOf(view, rows),
    };
  }
  const pause = checkedRules.filter((item) => item.state === "matched" && item.rule.action === "PAUSE");
  const resume = checkedRules.filter((item) => item.state === "matched" && item.rule.action === "RESUME");
  if (pause.length > 0 && resume.length > 0) {
    const items = [...pause, ...resume];
    const sources = items.map((item) => item.row);
    return {
      outcome: "Rule Conflict",
      pendingActions: [conflictAction(items, sources, "")],
      evidence: evidenceOf(view, baseRows),
    };
  }
  const unevaluable = checkedRules.filter((item) => item.state === "unevaluable");
  if (unevaluable.length > 0) {
    const rows = holdMatched(baseRows);
    return {
      outcome: "Manual Review Required",
      pendingActions: unevaluable.map((item) => actionFrom(item, "Manual Review Required", item.row)),
      evidence: evidenceOf(view, rows),
    };
  }
  const cites = citesOf(view);
  if ((pause.length > 0 || resume.length > 0) && onlyNoAction(cites)) {
    const items = pause.length > 0 ? pause : resume;
    const prefix = cites.map((item) => `${item.recommendationId} is ${item.kind}.`).join(" ");
    return {
      outcome: "Rule Conflict",
      pendingActions: [conflictAction(items, items.map((item) => item.row), prefix)],
      evidence: evidenceOf(view, baseRows),
    };
  }
  if (pause.length > 0) {
    return {
      outcome: "Pause Candidate",
      pendingActions: pause.map((item) => actionFrom(item, "Pause Candidate", item.row)),
      evidence: evidenceOf(view, baseRows),
    };
  }
  if (resume.length > 0) {
    return {
      outcome: "Resume Candidate",
      pendingActions: resume.map((item) => actionFrom(item, "Resume Candidate", item.row)),
      evidence: evidenceOf(view, baseRows),
    };
  }
  return { outcome: "No Action", pendingActions: [], evidence: evidenceOf(view, baseRows) };
}
