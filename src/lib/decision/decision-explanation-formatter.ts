/**
 * Decision Explanation Engine: formatter.
 *
 * Renders one finished explanation four ways, none of which adds a fact:
 *   - a compact report (the summary and each section's summary);
 *   - a detailed report (plain text);
 *   - a machine-readable object and its JSON text;
 *   - a view model a future UI can draw as it likes.
 *
 * The view model is plain data: stable ids, tones, and text. It has no markup
 * and no framework in it, so any front end can use it. A tone is how an item
 * may be drawn, never a judgement about the candidate.
 *
 * Formatting reads the explanation and never changes it, and the same
 * explanation always renders the same way.
 */
import { DECISION_EXPLANATION_SCOPE_NOTE, type DecisionExplanation, type DecisionTraceEntry } from "./decision-explanation-result";
import {
  DECISION_COLLECTING_SECTION_KINDS,
  type DecisionExplanationItem,
  type DecisionExplanationItemKind,
  type DecisionExplanationSection,
} from "./decision-explanation-section";

export const DECISION_EXPLANATION_SCHEMA_VERSION = 1;

export type DecisionViewTone = "negative" | "caution" | "neutral";

export interface DecisionViewItem {
  id: string;
  tone: DecisionViewTone;
  kind: DecisionExplanationItemKind;
  text: string;
  source: { ruleId: string | null; category: string | null };
}

export interface DecisionViewSection {
  id: string;
  title: string;
  state: string;
  summary: string;
  items: DecisionViewItem[];
}

export interface DecisionViewTrace {
  id: string;
  category: string | null;
  status: string;
  statement: string;
}

export interface DecisionExplanationViewModel {
  schemaVersion: number;
  analysisId: string;
  candidateId: string | null;
  title: string;
  summary: string;
  sections: DecisionViewSection[];
  trace: DecisionViewTrace[];
  eligibleActions: string[];
  blockingReasons: string[];
  note: string;
}

export interface MachineReadableDecisionExplanation {
  schemaVersion: number;
  format: "decision-explanation";
  explanation: DecisionExplanation;
}

export interface DecisionExplanationFormatter {
  formatShortSummary(explanation: DecisionExplanation): string;
  formatCompact(explanation: DecisionExplanation): string;
  formatDetailed(explanation: DecisionExplanation): string;
  formatSection(section: DecisionExplanationSection): string;
  /** The section breakdown: one block per section, in the explanation's order. */
  formatSections(explanation: DecisionExplanation): string[];
  toMachineReadable(explanation: DecisionExplanation): MachineReadableDecisionExplanation;
  toJson(explanation: DecisionExplanation): string;
  toViewModel(explanation: DecisionExplanation): DecisionExplanationViewModel;
}

const TONES: Readonly<Record<DecisionExplanationItemKind, DecisionViewTone>> = Object.freeze({
  ERROR: "negative",
  WARNING: "caution",
  MISSING: "caution",
  FINDING: "neutral",
});

const itemLine = (item: DecisionExplanationItem, withSource: boolean) =>
  `  - [${item.kind}] ${item.text}${withSource && item.ruleId !== null ? ` (from ${item.ruleId})` : ""}`;

function formatSection(section: DecisionExplanationSection): string {
  const lines = [`${section.title} (${section.state})`, `  ${section.summary}`];
  const collecting = (DECISION_COLLECTING_SECTION_KINDS as readonly string[]).includes(section.kind);
  for (const item of section.items) lines.push(itemLine(item, collecting));
  return lines.join("\n");
}

function traceLine(entry: DecisionTraceEntry): string {
  return `- ${entry.ruleId} [${entry.category ?? "no category"}] ${entry.status}: ${entry.statement}`;
}

/** A deep copy through JSON: the explanation is plain data, so nothing is lost and nothing is shared. */
const plainCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createDecisionExplanationFormatter(): DecisionExplanationFormatter {
  return {
    formatShortSummary: (explanation) => explanation.summary,

    formatCompact(explanation) {
      const blocks = [
        "Decision explanation",
        `Analysis: ${explanation.analysisId}`,
        `Candidate: ${explanation.candidateId ?? "none"}`,
        "",
        explanation.summary,
        "",
        ...explanation.sectionBreakdown.map((section) => `${section.title} (${section.state})\n  ${section.summary}`),
        "",
        DECISION_EXPLANATION_SCOPE_NOTE,
      ];
      return blocks.join("\n");
    },

    formatDetailed(explanation) {
      const blocks = [
        "Decision explanation",
        `Analysis: ${explanation.analysisId}`,
        `Candidate: ${explanation.candidateId ?? "none"}`,
        "",
        explanation.summary,
        "",
        "Decision trace",
        explanation.decisionTrace.length > 0 ? explanation.decisionTrace.map(traceLine).join("\n") : "- No rule execution was recorded.",
        "",
        ...explanation.sectionBreakdown.flatMap((section) => [formatSection(section), ""]),
        DECISION_EXPLANATION_SCOPE_NOTE,
      ];
      return blocks.join("\n");
    },

    formatSection,

    formatSections: (explanation) => explanation.sectionBreakdown.map(formatSection),

    toMachineReadable: (explanation) => ({
      schemaVersion: DECISION_EXPLANATION_SCHEMA_VERSION,
      format: "decision-explanation",
      explanation: plainCopy(explanation),
    }),

    toJson(explanation) {
      return JSON.stringify(
        { schemaVersion: DECISION_EXPLANATION_SCHEMA_VERSION, format: "decision-explanation", explanation },
        null,
        2,
      );
    },

    toViewModel(explanation) {
      return {
        schemaVersion: DECISION_EXPLANATION_SCHEMA_VERSION,
        analysisId: explanation.analysisId,
        candidateId: explanation.candidateId,
        title: "Decision explanation",
        summary: explanation.summary,
        sections: explanation.sectionBreakdown.map((section) => ({
          id: section.kind,
          title: section.title,
          state: section.state,
          summary: section.summary,
          items: section.items.map((item, index) => ({
            id: `${section.kind}-${index + 1}`,
            tone: TONES[item.kind],
            kind: item.kind,
            text: item.text,
            source: { ruleId: item.ruleId, category: item.category },
          })),
        })),
        trace: explanation.decisionTrace.map((entry) => ({
          id: entry.ruleId,
          category: entry.category,
          status: entry.status,
          statement: entry.statement,
        })),
        eligibleActions: [...explanation.eligibleActions],
        blockingReasons: [...explanation.blockingReasons],
        note: DECISION_EXPLANATION_SCOPE_NOTE,
      };
    },
  };
}
