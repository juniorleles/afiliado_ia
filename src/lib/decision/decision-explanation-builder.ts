/**
 * Decision Explanation Engine: builder.
 *
 * Turns a Decision Analysis into the structured explanation: a decision
 * trace, eligible actions, blocking reasons, warnings, missing information,
 * and ten sections. It writes sentences from fixed templates and from the
 * words the analysis itself recorded. There is no model and no plan.
 *
 * It is rule-agnostic. It groups recorded executions by category and reads
 * only the flat-metadata conventions any rule may follow:
 *   eligibleAction     the action a PASS result names
 *   blockingReasons    comma-separated reasons a FAIL result names
 *   missing            comma-separated ids a result reported absent
 * A rule that follows none of them still appears, with its status, its
 * warnings, and its errors.
 *
 * The builder assumes its input passed validation, never changes it, and
 * never executes a rule or an action. The snapshot is enough.
 */
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleCategory, DecisionRuleRunResult } from "./decision-rule-contract";
import type { ResolvedDecisionAnalysis } from "./decision-resolver-analysis";
import { createDecisionSectionBuilder } from "./decision-explanation-section";
import {
  DECISION_EXPLANATION_SCOPE_NOTE,
  type DecisionExplanation,
  type DecisionTraceEntry,
} from "./decision-explanation-result";

export type BuiltDecisionExplanation = Omit<DecisionExplanation, "executionTime">;

export interface DecisionExplanationBuilder {
  build(analysis: ResolvedDecisionAnalysis): BuiltDecisionExplanation;
}

const splitList = (value: unknown): string[] =>
  typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()).filter((part) => part !== "") : [];
const unique = (ids: readonly string[]) => [...new Set(ids)];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function actionId(result: DecisionRuleRunResult): string {
  const named = result.metadata.eligibleAction;
  return typeof named === "string" && named.trim() !== "" ? named : result.ruleId;
}

function categoryOf(analysis: ResolvedDecisionAnalysis): Map<string, DecisionRuleCategory> {
  const map = new Map<string, DecisionRuleCategory>();
  for (const entry of analysis.recordedExecutions) map.set(entry.ruleId, entry.category);
  return map;
}

export function createDecisionExplanationBuilder(): DecisionExplanationBuilder {
  const sections = createDecisionSectionBuilder();

  function build(analysis: ResolvedDecisionAnalysis): BuiltDecisionExplanation {
    const categories = categoryOf(analysis);
    const results = new Map<string, DecisionRuleRunResult>();
    for (const result of analysis.ruleResults) if (!results.has(result.ruleId)) results.set(result.ruleId, result);

    const byCategory = new Map<DecisionRuleCategory, DecisionRuleRunResult[]>();
    const trace: DecisionTraceEntry[] = [];
    for (const entry of analysis.recordedExecutions) {
      const result = results.get(entry.ruleId);
      const status = result?.status ?? entry.status;
      trace.push({
        ruleId: entry.ruleId,
        category: entry.category,
        status,
        executionTime: result?.executionTime ?? entry.executionTime,
        statement: `${entry.ruleId} (${entry.category}) ended ${status}.`,
      });
      const list = byCategory.get(entry.category) ?? [];
      if (result !== undefined) list.push(result);
      byCategory.set(entry.category, list);
    }

    const eligibleActions: string[] = [];
    const blockingReasons: string[] = [];
    const warnings = unique(analysis.warnings);
    const missing: string[] = [];

    for (const result of analysis.ruleResults) {
      const category = categories.get(result.ruleId);
      if (category === "ACTION" && result.status === "PASS") eligibleActions.push(actionId(result));
      if (result.status === "FAIL") {
        const listed = splitList(result.metadata.blockingReasons);
        if (listed.length > 0) blockingReasons.push(...listed);
        else blockingReasons.push(...result.errors);
      }
      if (typeof result.metadata.missing === "string" && result.metadata.missing.trim() !== "") {
        missing.push(...splitList(result.metadata.missing).map((id) => `${result.ruleId}: ${id}`));
      }
    }
    for (const id of analysis.missingEvidence) {
      if (!missing.some((text) => text.startsWith(`${id}:`) || text === id)) missing.push(`Rule ${id} reported missing evidence.`);
    }

    const sectionBreakdown = sections.build({
      analysis,
      trace,
      byCategory,
      eligibleActions: unique(eligibleActions),
      blockingReasons: unique(blockingReasons),
      blockingRuleIds: unique(analysis.blockingRules),
      warnings,
      missing: unique(missing),
    });

    const subject = analysis.candidateId === null ? "no candidate" : analysis.candidateId;
    const extra = [
      analysis.failedRules.length > 0 ? `${analysis.failedRules.length} failed` : null,
      analysis.skippedRules.length > 0 ? `${analysis.skippedRules.length} skipped` : null,
    ].filter((part): part is string => part !== null);
    const summary =
      `Decision ${analysis.decisionStatus} for ${subject}: analysis ${analysis.status}. ` +
      `${analysis.executedRules.length} of ${plural(analysis.recordedExecutions.length, "recorded rule")} executed${extra.length > 0 ? `, ${extra.join(", ")}` : ""}. ` +
      `Eligible actions: ${eligibleActions.length}. Blocking rules: ${analysis.blockingRules.length}.`;

    const metadata: DecisionMetadata = {
      analysisStatus: analysis.status,
      decisionStatus: analysis.decisionStatus,
      recordedCount: analysis.recordedExecutions.length,
      executedCount: analysis.executedRules.length,
      failedCount: analysis.failedRules.length,
      skippedCount: analysis.skippedRules.length,
      eligibleCount: unique(eligibleActions).length,
      blockingCount: analysis.blockingRules.length,
      warningCount: warnings.length,
      missingCount: unique(missing).length,
      sectionStates: sectionBreakdown.map((section) => `${section.kind}=${section.state}`).join(","),
      scopeNote: DECISION_EXPLANATION_SCOPE_NOTE,
      pipelineMetadataKeys: Object.keys(analysis.pipelineMetadata).length,
      executionMetadataKeys: Object.keys(analysis.executionMetadata).length,
      analysisExecutionTime: analysis.executionTime,
      opportunityAnalysisId: analysis.opportunityAnalysisId,
      trafficAnalysisId: analysis.trafficAnalysisId,
      pageAnalysisId: analysis.pageAnalysisId,
    };
    for (const [key, value] of Object.entries(analysis.executionMetadata)) metadata[`execution.${key}`] = value;

    return {
      analysisId: analysis.analysisId,
      candidateId: analysis.candidateId,
      summary,
      sectionBreakdown,
      decisionTrace: trace,
      blockingReasons: unique(blockingReasons),
      eligibleActions: unique(eligibleActions),
      warnings,
      missingInformation: unique(missing),
      metadata,
    };
  }

  return { build };
}
