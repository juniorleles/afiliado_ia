/**
 * Decision Explanation Engine: sections and items.
 *
 * An explanation is made of ten sections. Four collect the decision itself
 * (state, trace, blocking rules, eligible actions); three summarise one
 * dimension; three collect warnings, missing information, and how the run
 * ended.
 *
 * Every statement is an item that keeps where it came from: the rule and its
 * category. Nothing here invents a fact: an item restates what the analysis
 * recorded.
 */
import { freezeDeepDecisionRule } from "./decision-rule-context";
import type { DecisionRuleCategory, DecisionRuleRunResult } from "./decision-rule-contract";
import type { ResolvedDecisionAnalysis } from "./decision-resolver-analysis";
import type { DecisionTraceEntry } from "./decision-explanation-result";

export const DECISION_EXPLANATION_SECTION_KINDS = [
  "DECISION_STATE",
  "DECISION_TRACE",
  "READINESS_SUMMARY",
  "QUALITY_SUMMARY",
  "PRIORITY_SUMMARY",
  "ELIGIBLE_ACTIONS",
  "BLOCKING_RULES",
  "WARNINGS",
  "MISSING_INFORMATION",
  "EXECUTION_SUMMARY",
] as const;
export type DecisionExplanationSectionKind = (typeof DECISION_EXPLANATION_SECTION_KINDS)[number];

export const DECISION_DIMENSION_SECTION_KINDS = ["READINESS_SUMMARY", "QUALITY_SUMMARY", "PRIORITY_SUMMARY"] as const;
export type DecisionDimensionSectionKind = (typeof DECISION_DIMENSION_SECTION_KINDS)[number];

export const DECISION_COLLECTING_SECTION_KINDS = [
  "DECISION_STATE",
  "DECISION_TRACE",
  "ELIGIBLE_ACTIONS",
  "BLOCKING_RULES",
  "WARNINGS",
  "MISSING_INFORMATION",
  "EXECUTION_SUMMARY",
] as const;
export type DecisionCollectingSectionKind = (typeof DECISION_COLLECTING_SECTION_KINDS)[number];

export const DECISION_EXPLANATION_SECTION_TITLES: Readonly<Record<DecisionExplanationSectionKind, string>> = Object.freeze({
  DECISION_STATE: "Decision State",
  DECISION_TRACE: "Decision Trace",
  READINESS_SUMMARY: "Readiness Summary",
  QUALITY_SUMMARY: "Quality Summary",
  PRIORITY_SUMMARY: "Priority Summary",
  ELIGIBLE_ACTIONS: "Eligible Actions",
  BLOCKING_RULES: "Blocking Rules",
  WARNINGS: "Warnings",
  MISSING_INFORMATION: "Missing Information",
  EXECUTION_SUMMARY: "Execution Summary",
});

export const DECISION_EXPLANATION_SECTION_STATES = ["REPORTED", "NONE", "NOT_RUN"] as const;
export type DecisionExplanationSectionState = (typeof DECISION_EXPLANATION_SECTION_STATES)[number];

export const DECISION_EXPLANATION_ITEM_KINDS = ["FINDING", "WARNING", "ERROR", "MISSING"] as const;
export type DecisionExplanationItemKind = (typeof DECISION_EXPLANATION_ITEM_KINDS)[number];

export const DECISION_COLLECTING_SECTION_ITEM_KINDS: Readonly<Record<DecisionCollectingSectionKind, readonly DecisionExplanationItemKind[]>> =
  Object.freeze({
    DECISION_STATE: ["FINDING"],
    DECISION_TRACE: ["FINDING"],
    ELIGIBLE_ACTIONS: ["FINDING"],
    BLOCKING_RULES: ["ERROR", "FINDING"],
    WARNINGS: ["WARNING"],
    MISSING_INFORMATION: ["MISSING"],
    EXECUTION_SUMMARY: ["FINDING"],
  });

export const DECISION_CATEGORY_TO_SECTION: Readonly<Record<string, DecisionDimensionSectionKind>> = Object.freeze({
  READINESS: "READINESS_SUMMARY",
  QUALITY: "QUALITY_SUMMARY",
  PRIORITY: "PRIORITY_SUMMARY",
});

export interface DecisionExplanationItem {
  kind: DecisionExplanationItemKind;
  text: string;
  /** The rule the statement came from, or null for a run-level statement. */
  ruleId: string | null;
  /** The rule's category, or null when there is none. */
  category: string | null;
}

export interface DecisionExplanationSection {
  kind: DecisionExplanationSectionKind;
  title: string;
  state: DecisionExplanationSectionState;
  summary: string;
  items: DecisionExplanationItem[];
  /** The rules that contributed to the section, in analysis order. */
  ruleIds: string[];
}

export type DecisionExplanationSectionInit = Omit<DecisionExplanationSection, "title" | "ruleIds"> & { ruleIds?: string[] };

export function isDecisionDimensionSectionKind(kind: string): kind is DecisionDimensionSectionKind {
  return (DECISION_DIMENSION_SECTION_KINDS as readonly string[]).includes(kind);
}

export function decisionSectionKindForCategory(category: string | null): DecisionDimensionSectionKind | null {
  if (category === null) return null;
  return Object.prototype.hasOwnProperty.call(DECISION_CATEGORY_TO_SECTION, category) ? DECISION_CATEGORY_TO_SECTION[category] : null;
}

/** A frozen section whose title comes from its kind. The items are copied. */
export function createDecisionExplanationSection(init: DecisionExplanationSectionInit): DecisionExplanationSection {
  const items = init.items.map((item) => ({ ...item }));
  const ruleIds = init.ruleIds ?? [...new Set(items.map((item) => item.ruleId).filter((id): id is string => id !== null))];
  return freezeDeepDecisionRule({
    kind: init.kind,
    title: DECISION_EXPLANATION_SECTION_TITLES[init.kind],
    state: init.state,
    summary: init.summary,
    items,
    ruleIds: [...ruleIds],
  });
}

export interface DecisionSectionBuilderInput {
  analysis: ResolvedDecisionAnalysis;
  trace: readonly DecisionTraceEntry[];
  byCategory: ReadonlyMap<DecisionRuleCategory, readonly DecisionRuleRunResult[]>;
  eligibleActions: readonly string[];
  blockingReasons: readonly string[];
  blockingRuleIds: readonly string[];
  warnings: readonly string[];
  missing: readonly string[];
}

export interface DecisionSectionBuilder {
  build(input: DecisionSectionBuilderInput): DecisionExplanationSection[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function finding(text: string, ruleId: string | null = null, category: string | null = null): DecisionExplanationItem {
  return { kind: "FINDING", text, ruleId, category };
}

function executionFindings(analysis: ResolvedDecisionAnalysis): DecisionExplanationItem[] {
  const items: DecisionExplanationItem[] = [];
  items.push(finding(`The analysis ended ${analysis.status}.`));
  items.push(finding(`Decision status: ${analysis.decisionStatus}.`));
  items.push(finding(analysis.candidateId === null ? "No candidate id was recorded." : `Candidate: ${analysis.candidateId}.`));
  items.push(
    finding(
      analysis.opportunityAnalysisId === null
        ? "No Opportunity analysis id was recorded."
        : `Opportunity analysis: ${analysis.opportunityAnalysisId}.`,
    ),
  );
  items.push(
    finding(analysis.trafficAnalysisId === null ? "No Traffic analysis id was recorded." : `Traffic analysis: ${analysis.trafficAnalysisId}.`),
  );
  items.push(finding(analysis.pageAnalysisId === null ? "No page analysis id was recorded." : `Page analysis: ${analysis.pageAnalysisId}.`));
  items.push(
    finding(
      `Dimensions executed: ${analysis.executedDimensions.length === 0 ? "none" : analysis.executedDimensions.join(", ")}. Rules executed: ${analysis.executedRules.length}. Failed: ${analysis.failedRules.length}.`,
    ),
  );
  for (const [key, value] of Object.entries(analysis.pipelineMetadata)) {
    if (key.startsWith("stage.") && key.length > "stage.".length && typeof value === "string") {
      items.push(finding(`Stage ${key.slice("stage.".length)}: ${value}.`));
    }
  }
  items.push(finding(`The analysis run took ${analysis.executionTime} ms.`));
  return items;
}

function dimensionItems(category: DecisionRuleCategory, results: readonly DecisionRuleRunResult[]): DecisionExplanationItem[] {
  return results.map((result) => finding(`${result.ruleId} ended ${result.status}.`, result.ruleId, category));
}

function dimensionSummary(results: readonly DecisionRuleRunResult[]): string {
  const count = (status: string) => results.filter((result) => result.status === status).length;
  return `${plural(results.length, "rule")}: ${count("PASS")} passed, ${count("FAIL")} failed, ${count("WARNING")} warned, ${count("SKIPPED")} skipped.`;
}

/** Builds the ten sections from the items the builder already classified. */
export function createDecisionSectionBuilder(): DecisionSectionBuilder {
  return {
    build(input) {
      const analysis = input.analysis;
      const stateItems = [
        finding(`Analysis status: ${analysis.status}.`),
        finding(`Decision status: ${analysis.decisionStatus}.`),
        finding(analysis.candidateId === null ? "No candidate id was recorded." : `Candidate: ${analysis.candidateId}.`),
      ];
      const traceItems = input.trace.map((entry) => finding(entry.statement, entry.ruleId, entry.category));
      const eligibleItems = input.eligibleActions.map((id) => finding(`Action ${id} is eligible.`, id, "ACTION"));
      const blockingItems = [
        ...input.blockingRuleIds.map((id) => finding(`Rule ${id} blocked the decision.`, id, null)),
        ...input.blockingReasons.map((text) => ({ kind: "ERROR" as const, text, ruleId: null, category: null })),
      ];
      const warningItems = input.warnings.map((text) => ({ kind: "WARNING" as const, text, ruleId: null, category: null }));
      const missingItems = input.missing.map((text) => ({ kind: "MISSING" as const, text, ruleId: null, category: null }));
      const execution = executionFindings(analysis);

      const sections: DecisionExplanationSection[] = [
        createDecisionExplanationSection({
          kind: "DECISION_STATE",
          state: "REPORTED",
          summary: `The analysis is ${analysis.status} with decision status ${analysis.decisionStatus}.`,
          items: stateItems,
          ruleIds: [],
        }),
        createDecisionExplanationSection({
          kind: "DECISION_TRACE",
          state: traceItems.length > 0 ? "REPORTED" : "NONE",
          summary:
            traceItems.length > 0
              ? `${plural(traceItems.length, "rule")} recorded in the order they ran.`
              : "No rule execution was recorded.",
          items: traceItems,
          ruleIds: input.trace.map((entry) => entry.ruleId),
        }),
      ];

      for (const [category, kind] of Object.entries(DECISION_CATEGORY_TO_SECTION) as Array<[DecisionRuleCategory, DecisionDimensionSectionKind]>) {
        const ran = analysis.executedDimensions.includes(category);
        const results = input.byCategory.get(category) ?? [];
        if (!ran) {
          sections.push(
            createDecisionExplanationSection({
              kind,
              state: "NOT_RUN",
              summary: "This dimension did not run.",
              items: [],
              ruleIds: [],
            }),
          );
        } else {
          const items = dimensionItems(category, results);
          sections.push(
            createDecisionExplanationSection({
              kind,
              state: items.length > 0 ? "REPORTED" : "NONE",
              summary: dimensionSummary(results),
              items,
              ruleIds: results.map((result) => result.ruleId),
            }),
          );
        }
      }

      sections.push(
        createDecisionExplanationSection({
          kind: "ELIGIBLE_ACTIONS",
          state: eligibleItems.length > 0 ? "REPORTED" : "NONE",
          summary:
            eligibleItems.length > 0
              ? `${plural(eligibleItems.length, "action")} ${eligibleItems.length === 1 ? "is" : "are"} eligible.`
              : "No action is eligible.",
          items: eligibleItems,
          ruleIds: [...input.eligibleActions],
        }),
        createDecisionExplanationSection({
          kind: "BLOCKING_RULES",
          state: blockingItems.length > 0 ? "REPORTED" : "NONE",
          summary:
            blockingItems.length > 0
              ? `${plural(input.blockingRuleIds.length, "blocking rule")} and ${plural(input.blockingReasons.length, "reason")}.`
              : "No blocking rule was recorded.",
          items: blockingItems,
          ruleIds: [...input.blockingRuleIds],
        }),
        createDecisionExplanationSection({
          kind: "WARNINGS",
          state: warningItems.length > 0 ? "REPORTED" : "NONE",
          summary:
            warningItems.length > 0 ? `${plural(warningItems.length, "warning")} ${warningItems.length === 1 ? "was" : "were"} reported.` : "No warnings were reported.",
          items: warningItems,
          ruleIds: [],
        }),
        createDecisionExplanationSection({
          kind: "MISSING_INFORMATION",
          state: missingItems.length > 0 ? "REPORTED" : "NONE",
          summary:
            missingItems.length > 0
              ? `${plural(missingItems.length, "item")} of information ${missingItems.length === 1 ? "is" : "are"} missing.`
              : "No missing information was reported.",
          items: missingItems,
          ruleIds: [],
        }),
        createDecisionExplanationSection({
          kind: "EXECUTION_SUMMARY",
          state: execution.length > 0 ? "REPORTED" : "NONE",
          summary:
            execution.length > 0
              ? `${plural(execution.length, "finding")} about how the analysis run ended.`
              : "No execution facts were recorded.",
          items: execution,
          ruleIds: [],
        }),
      );
      return sections;
    },
  };
}
