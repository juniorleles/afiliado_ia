/**
 * Opportunity Explanation Engine: formatter.
 *
 * Renders one finished explanation five ways, none of which adds a fact:
 *   - a short summary (one paragraph);
 *   - a detailed explanation (plain text);
 *   - a section breakdown (plain text, one block per section);
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
import {
  EXPLANATION_SCOPE_NOTE,
  type OpportunityExplanation,
  type SignalBreakdownEntry,
} from "./opportunity-explanation-result";
import { COLLECTING_SECTION_KINDS, type ExplanationItem, type ExplanationItemKind, type ExplanationSection } from "./opportunity-explanation-section";

export const EXPLANATION_SCHEMA_VERSION = 1;

export type ViewTone = "positive" | "negative" | "caution" | "neutral";

export interface ViewItem {
  id: string;
  tone: ViewTone;
  kind: ExplanationItemKind;
  text: string;
  source: { signalId: string | null; category: string | null; dimension: string | null };
}

export interface ViewSection {
  id: string;
  title: string;
  state: string;
  summary: string;
  items: ViewItem[];
}

export interface ViewSignal {
  id: string;
  name: string;
  category: string | null;
  status: string;
  statement: string;
  notes: string[];
}

export interface ExplanationViewModel {
  schemaVersion: number;
  analysisId: string;
  candidateId: string | null;
  title: string;
  summary: string;
  sections: ViewSection[];
  signals: ViewSignal[];
  note: string;
}

export interface MachineReadableExplanation {
  schemaVersion: number;
  format: "opportunity-explanation";
  explanation: OpportunityExplanation;
}

export interface ExplanationFormatter {
  formatShortSummary(explanation: OpportunityExplanation): string;
  formatDetailed(explanation: OpportunityExplanation): string;
  formatSection(section: ExplanationSection): string;
  /** The section breakdown: one block per section, in the explanation's order. */
  formatSections(explanation: OpportunityExplanation): string[];
  toMachineReadable(explanation: OpportunityExplanation): MachineReadableExplanation;
  toJson(explanation: OpportunityExplanation): string;
  toViewModel(explanation: OpportunityExplanation): ExplanationViewModel;
}

const TONES: Readonly<Record<ExplanationItemKind, ViewTone>> = Object.freeze({
  STRENGTH: "positive",
  WEAKNESS: "negative",
  ERROR: "negative",
  WARNING: "caution",
  MISSING: "caution",
  FINDING: "neutral",
});

/** A collecting section mixes signals, so each line says which signal it came from. */
const itemLine = (item: ExplanationItem, withSource: boolean) =>
  `  - [${item.kind}] ${item.text}${withSource && item.signalId !== null ? ` (from ${item.signalId})` : ""}`;

function formatSection(section: ExplanationSection): string {
  const lines = [`${section.title} (${section.state})`, `  ${section.summary}`];
  const collecting = (COLLECTING_SECTION_KINDS as readonly string[]).includes(section.kind);
  for (const item of section.items) lines.push(itemLine(item, collecting));
  return lines.join("\n");
}

function signalLine(entry: SignalBreakdownEntry): string {
  const lines = [`- ${entry.name} [${entry.category ?? "no category"}] ${entry.status}: ${entry.statement}`];
  for (const note of entry.notes) lines.push(`    Note: ${note}`);
  return lines.join("\n");
}

/** A deep copy through JSON: the explanation is plain data, so nothing is lost and nothing is shared. */
const plainCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createExplanationFormatter(): ExplanationFormatter {
  return {
    formatShortSummary: (explanation) => explanation.summary,

    formatDetailed(explanation) {
      const blocks = [
        "Opportunity explanation",
        `Analysis: ${explanation.analysisId}`,
        `Candidate: ${explanation.candidateId ?? "none"}`,
        "",
        explanation.summary,
        "",
        "Signals",
        explanation.signalBreakdown.length > 0 ? explanation.signalBreakdown.map(signalLine).join("\n") : "- No signal is registered.",
        "",
        ...explanation.sections.flatMap((section) => [formatSection(section), ""]),
        EXPLANATION_SCOPE_NOTE,
      ];
      return blocks.join("\n");
    },

    formatSection,

    formatSections: (explanation) => explanation.sections.map(formatSection),

    toMachineReadable: (explanation) => ({ schemaVersion: EXPLANATION_SCHEMA_VERSION, format: "opportunity-explanation", explanation: plainCopy(explanation) }),

    toJson(explanation) {
      return JSON.stringify({ schemaVersion: EXPLANATION_SCHEMA_VERSION, format: "opportunity-explanation", explanation }, null, 2);
    },

    toViewModel(explanation) {
      return {
        schemaVersion: EXPLANATION_SCHEMA_VERSION,
        analysisId: explanation.analysisId,
        candidateId: explanation.candidateId,
        title: "Opportunity explanation",
        summary: explanation.summary,
        sections: explanation.sections.map((section) => ({
          id: section.kind,
          title: section.title,
          state: section.state,
          summary: section.summary,
          items: section.items.map((item, index) => ({
            id: `${section.kind}-${index + 1}`,
            tone: TONES[item.kind],
            kind: item.kind,
            text: item.text,
            source: { signalId: item.signalId, category: item.category, dimension: item.dimension },
          })),
        })),
        signals: explanation.signalBreakdown.map((entry) => ({
          id: entry.signalId,
          name: entry.name,
          category: entry.category,
          status: entry.status,
          statement: entry.statement,
          notes: [...entry.notes],
        })),
        note: EXPLANATION_SCOPE_NOTE,
      };
    },
  };
}
