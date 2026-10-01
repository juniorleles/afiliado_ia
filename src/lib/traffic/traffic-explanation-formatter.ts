/**
 * Traffic Explanation Engine: formatter.
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
import { TRAFFIC_EXPLANATION_SCOPE_NOTE, type TrafficExplanation, type TrafficSignalBreakdownEntry } from "./traffic-explanation-result";
import {
  TRAFFIC_COLLECTING_SECTION_KINDS,
  type TrafficExplanationItem,
  type TrafficExplanationItemKind,
  type TrafficExplanationSection,
} from "./traffic-explanation-section";

export const TRAFFIC_EXPLANATION_SCHEMA_VERSION = 1;

export type TrafficViewTone = "positive" | "negative" | "caution" | "neutral";

export interface TrafficViewItem {
  id: string;
  tone: TrafficViewTone;
  kind: TrafficExplanationItemKind;
  text: string;
  source: { signalId: string | null; category: string | null; dimension: string | null };
}

export interface TrafficViewSection {
  id: string;
  title: string;
  state: string;
  summary: string;
  items: TrafficViewItem[];
}

export interface TrafficViewSignal {
  id: string;
  name: string;
  category: string | null;
  status: string;
  statement: string;
  notes: string[];
}

export interface TrafficExplanationViewModel {
  schemaVersion: number;
  analysisId: string;
  candidateId: string | null;
  title: string;
  summary: string;
  sections: TrafficViewSection[];
  signals: TrafficViewSignal[];
  note: string;
}

export interface MachineReadableTrafficExplanation {
  schemaVersion: number;
  format: "traffic-explanation";
  explanation: TrafficExplanation;
}

export interface TrafficExplanationFormatter {
  formatShortSummary(explanation: TrafficExplanation): string;
  formatCompact(explanation: TrafficExplanation): string;
  formatDetailed(explanation: TrafficExplanation): string;
  formatSection(section: TrafficExplanationSection): string;
  /** The section breakdown: one block per section, in the explanation's order. */
  formatSections(explanation: TrafficExplanation): string[];
  toMachineReadable(explanation: TrafficExplanation): MachineReadableTrafficExplanation;
  toJson(explanation: TrafficExplanation): string;
  toViewModel(explanation: TrafficExplanation): TrafficExplanationViewModel;
}

const TONES: Readonly<Record<TrafficExplanationItemKind, TrafficViewTone>> = Object.freeze({
  STRENGTH: "positive",
  WEAKNESS: "negative",
  ERROR: "negative",
  WARNING: "caution",
  MISSING: "caution",
  FINDING: "neutral",
});

/** A collecting section mixes signals, so each line says which signal it came from. */
const itemLine = (item: TrafficExplanationItem, withSource: boolean) =>
  `  - [${item.kind}] ${item.text}${withSource && item.signalId !== null ? ` (from ${item.signalId})` : ""}`;

function formatSection(section: TrafficExplanationSection): string {
  const lines = [`${section.title} (${section.state})`, `  ${section.summary}`];
  const collecting = (TRAFFIC_COLLECTING_SECTION_KINDS as readonly string[]).includes(section.kind);
  for (const item of section.items) lines.push(itemLine(item, collecting));
  return lines.join("\n");
}

function signalLine(entry: TrafficSignalBreakdownEntry): string {
  const lines = [`- ${entry.name} [${entry.category ?? "no category"}] ${entry.status}: ${entry.statement}`];
  for (const note of entry.notes) lines.push(`    Note: ${note}`);
  return lines.join("\n");
}

/** A deep copy through JSON: the explanation is plain data, so nothing is lost and nothing is shared. */
const plainCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createTrafficExplanationFormatter(): TrafficExplanationFormatter {
  return {
    formatShortSummary: (explanation) => explanation.summary,

    formatCompact(explanation) {
      const blocks = [
        "Traffic explanation",
        `Analysis: ${explanation.analysisId}`,
        `Candidate: ${explanation.candidateId ?? "none"}`,
        "",
        explanation.summary,
        "",
        ...explanation.sectionBreakdown.map((section) => `${section.title} (${section.state})\n  ${section.summary}`),
        "",
        TRAFFIC_EXPLANATION_SCOPE_NOTE,
      ];
      return blocks.join("\n");
    },

    formatDetailed(explanation) {
      const blocks = [
        "Traffic explanation",
        `Analysis: ${explanation.analysisId}`,
        `Candidate: ${explanation.candidateId ?? "none"}`,
        "",
        explanation.summary,
        "",
        "Signals",
        explanation.signalBreakdown.length > 0 ? explanation.signalBreakdown.map(signalLine).join("\n") : "- No signal is registered.",
        "",
        ...explanation.sectionBreakdown.flatMap((section) => [formatSection(section), ""]),
        TRAFFIC_EXPLANATION_SCOPE_NOTE,
      ];
      return blocks.join("\n");
    },

    formatSection,

    formatSections: (explanation) => explanation.sectionBreakdown.map(formatSection),

    toMachineReadable: (explanation) => ({
      schemaVersion: TRAFFIC_EXPLANATION_SCHEMA_VERSION,
      format: "traffic-explanation",
      explanation: plainCopy(explanation),
    }),

    toJson(explanation) {
      return JSON.stringify(
        { schemaVersion: TRAFFIC_EXPLANATION_SCHEMA_VERSION, format: "traffic-explanation", explanation },
        null,
        2,
      );
    },

    toViewModel(explanation) {
      return {
        schemaVersion: TRAFFIC_EXPLANATION_SCHEMA_VERSION,
        analysisId: explanation.analysisId,
        candidateId: explanation.candidateId,
        title: "Traffic explanation",
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
        note: TRAFFIC_EXPLANATION_SCOPE_NOTE,
      };
    },
  };
}
