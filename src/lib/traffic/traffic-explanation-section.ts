/**
 * Traffic Explanation Engine: sections and items.
 *
 * An explanation is made of eight sections. Five describe one group of signals
 * (named after the Signal Contract categories they cover); three collect one
 * kind of statement across every signal, including how the run itself ended.
 *
 * Every statement is an item that keeps where it came from: the signal, its
 * category, and the dimension it is about. Nothing here scores, ranks, or
 * recommends, and nothing is invented: an item restates what a signal reported.
 */
import type { TrafficMetadata } from "./traffic-types";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficSignalBreakdownEntry } from "./traffic-explanation-result";

export const TRAFFIC_EXPLANATION_SECTION_KINDS = [
  "CHANNEL_COMPATIBILITY",
  "POLICY_RISKS",
  "AUDIENCE_FIT",
  "OFFER_READINESS",
  "CREATIVE_READINESS",
  "WARNINGS",
  "MISSING_INFORMATION",
  "EXECUTION_SUMMARY",
] as const;
export type TrafficExplanationSectionKind = (typeof TRAFFIC_EXPLANATION_SECTION_KINDS)[number];

/** The sections that describe one group of signals. */
export const TRAFFIC_CATEGORY_SECTION_KINDS = [
  "CHANNEL_COMPATIBILITY",
  "POLICY_RISKS",
  "AUDIENCE_FIT",
  "OFFER_READINESS",
  "CREATIVE_READINESS",
] as const;
export type TrafficCategorySectionKind = (typeof TRAFFIC_CATEGORY_SECTION_KINDS)[number];

/** The sections that collect one kind of statement across all signals. */
export const TRAFFIC_COLLECTING_SECTION_KINDS = ["WARNINGS", "MISSING_INFORMATION", "EXECUTION_SUMMARY"] as const;
export type TrafficCollectingSectionKind = (typeof TRAFFIC_COLLECTING_SECTION_KINDS)[number];

export const TRAFFIC_EXPLANATION_SECTION_TITLES: Readonly<Record<TrafficExplanationSectionKind, string>> = Object.freeze({
  CHANNEL_COMPATIBILITY: "Channel Compatibility",
  POLICY_RISKS: "Policy Risks",
  AUDIENCE_FIT: "Audience Fit",
  OFFER_READINESS: "Offer Readiness",
  CREATIVE_READINESS: "Creative Readiness",
  WARNINGS: "Warnings",
  MISSING_INFORMATION: "Missing Information",
  EXECUTION_SUMMARY: "Execution Summary",
});

/**
 * COMPLETED, NOT_COMPLETED, NO_SIGNAL: for a section about a group of signals.
 * REPORTED, NONE: for a section that collects statements.
 */
export const TRAFFIC_EXPLANATION_SECTION_STATES = ["COMPLETED", "NOT_COMPLETED", "NO_SIGNAL", "REPORTED", "NONE"] as const;
export type TrafficExplanationSectionState = (typeof TRAFFIC_EXPLANATION_SECTION_STATES)[number];
export const TRAFFIC_CATEGORY_SECTION_STATES: readonly TrafficExplanationSectionState[] = ["COMPLETED", "NOT_COMPLETED", "NO_SIGNAL"];
export const TRAFFIC_COLLECTING_SECTION_STATES: readonly TrafficExplanationSectionState[] = ["REPORTED", "NONE"];

export const TRAFFIC_EXPLANATION_ITEM_KINDS = ["FINDING", "STRENGTH", "WEAKNESS", "MISSING", "WARNING", "ERROR"] as const;
export type TrafficExplanationItemKind = (typeof TRAFFIC_EXPLANATION_ITEM_KINDS)[number];

/** The item kinds a collecting section may hold. */
export const TRAFFIC_COLLECTING_SECTION_ITEM_KINDS: Readonly<Record<TrafficCollectingSectionKind, readonly TrafficExplanationItemKind[]>> = Object.freeze({
  WARNINGS: ["WARNING", "ERROR"],
  MISSING_INFORMATION: ["MISSING"],
  EXECUTION_SUMMARY: ["FINDING"],
});

/** Signal Contract category → the section that describes that group. */
export const TRAFFIC_CATEGORY_TO_SECTION: Readonly<Record<string, TrafficCategorySectionKind>> = Object.freeze({
  TRAFFIC_CHANNEL: "CHANNEL_COMPATIBILITY",
  POLICY: "POLICY_RISKS",
  AUDIENCE: "AUDIENCE_FIT",
  OFFER: "OFFER_READINESS",
  CREATIVE: "CREATIVE_READINESS",
});

export interface TrafficExplanationItem {
  kind: TrafficExplanationItemKind;
  text: string;
  /** The signal the statement came from, or null for a run-level statement. */
  signalId: string | null;
  /** The signal's Signal Contract category, or null when there is none. */
  category: string | null;
  /** The dimension the statement is about, or null. */
  dimension: string | null;
}

export interface TrafficExplanationSection {
  kind: TrafficExplanationSectionKind;
  title: string;
  state: TrafficExplanationSectionState;
  summary: string;
  items: TrafficExplanationItem[];
  /** The signals that contributed to the section, in analysis order. */
  signalIds: string[];
}

export type TrafficExplanationSectionInit = Omit<TrafficExplanationSection, "title" | "signalIds"> & { signalIds?: string[] };

/** The section kind that describes a Signal Contract category, or null when no section does. */
export function trafficSectionKindForCategory(category: string | null): TrafficCategorySectionKind | null {
  if (category === null) return null;
  return Object.prototype.hasOwnProperty.call(TRAFFIC_CATEGORY_TO_SECTION, category) ? TRAFFIC_CATEGORY_TO_SECTION[category] : null;
}

export function isTrafficCategorySectionKind(kind: string): kind is TrafficCategorySectionKind {
  return (TRAFFIC_CATEGORY_SECTION_KINDS as readonly string[]).includes(kind);
}

/** A frozen section whose title comes from its kind. The items are copied. */
export function createTrafficExplanationSection(init: TrafficExplanationSectionInit): TrafficExplanationSection {
  const items = init.items.map((item) => ({ ...item }));
  const signalIds = init.signalIds ?? [...new Set(items.map((item) => item.signalId).filter((id): id is string => id !== null))];
  return freezeDeepTraffic({
    kind: init.kind,
    title: TRAFFIC_EXPLANATION_SECTION_TITLES[init.kind],
    state: init.state,
    summary: init.summary,
    items,
    signalIds: [...signalIds],
  });
}

export interface TrafficSectionBuilderInput {
  registered: readonly string[];
  breakdown: readonly TrafficSignalBreakdownEntry[];
  ownItems: ReadonlyMap<string, TrafficExplanationItem[]>;
  strengths: readonly TrafficExplanationItem[];
  weaknesses: readonly TrafficExplanationItem[];
  warnings: readonly TrafficExplanationItem[];
  errors: readonly TrafficExplanationItem[];
  missing: readonly TrafficExplanationItem[];
  analysis: ResolvedTrafficAnalysis;
}

export interface TrafficSectionBuilder {
  build(input: TrafficSectionBuilderInput): TrafficExplanationSection[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

function executionFindings(analysis: ResolvedTrafficAnalysis): TrafficExplanationItem[] {
  const make = (text: string): TrafficExplanationItem => ({ kind: "FINDING", text, signalId: null, category: null, dimension: null });
  const items: TrafficExplanationItem[] = [];
  items.push(make(`The analysis ended ${analysis.status}.`));
  items.push(make(analysis.candidateId === null ? "No candidate id was recorded." : `Candidate: ${analysis.candidateId}.`));
  items.push(
    make(
      analysis.opportunityAnalysisId === null
        ? "No Opportunity analysis id was recorded."
        : `Opportunity analysis: ${analysis.opportunityAnalysisId}.`,
    ),
  );
  items.push(
    make(
      `Registered: ${analysis.registeredSignals.length}. Executed: ${analysis.executedSignals.length}. Failed: ${analysis.failedSignals.length}.`,
    ),
  );
  items.push(
    make(analysis.executionOrder.length === 0 ? "No signal was ordered for execution." : `Execution order: ${analysis.executionOrder.join(", ")}.`),
  );
  for (const [key, value] of Object.entries(analysis.pipelineMetadata)) {
    if (key.startsWith("stage.") && key.length > "stage.".length && typeof value === "string") {
      items.push(make(`Stage ${key.slice("stage.".length)}: ${value}.`));
    }
  }
  items.push(make(`The analysis run took ${analysis.executionTime} ms.`));
  const decision = asText(analysis.pipelineMetadata.decision);
  if (decision !== null) items.push(make(`Decision: ${sentence(decision)}`));
  return items;
}

/** Builds the eight sections from the items the builder already classified. */
export function createTrafficSectionBuilder(): TrafficSectionBuilder {
  return {
    build(input) {
      const sections: TrafficExplanationSection[] = [];
      const entryById = new Map(input.breakdown.map((entry) => [entry.signalId, entry]));
      for (const kind of TRAFFIC_CATEGORY_SECTION_KINDS) {
        const ids = input.registered.filter((id) => trafficSectionKindForCategory(entryById.get(id)?.category ?? null) === kind);
        const completed = ids.filter((id) => entryById.get(id)?.status === "COMPLETED");
        const items = ids.flatMap((id) => input.ownItems.get(id) ?? []);
        const count = (itemKind: TrafficExplanationItem["kind"]) => items.filter((item) => item.kind === itemKind).length;
        if (ids.length === 0) {
          sections.push(
            createTrafficExplanationSection({ kind, state: "NO_SIGNAL", summary: "No signal of this category is registered.", items: [], signalIds: [] }),
          );
        } else if (completed.length === 0) {
          const names = ids.map((id) => entryById.get(id)?.name ?? id).join(", ");
          sections.push(
            createTrafficExplanationSection({
              kind,
              state: "NOT_COMPLETED",
              summary: `${names} did not complete; nothing is reported for this category.`,
              items,
              signalIds: ids,
            }),
          );
        } else {
          const summary = `${completed.length} of ${plural(ids.length, "signal")} completed: ${plural(count("STRENGTH"), "strength")}, ${plural(count("WEAKNESS"), "weakness", "weaknesses")}, ${plural(count("MISSING"), "missing item")}, ${plural(count("WARNING"), "warning")}, ${plural(count("ERROR"), "error")}.`;
          sections.push(createTrafficExplanationSection({ kind, state: "COMPLETED", summary, items, signalIds: ids }));
        }
      }
      const allWarnings = [...input.warnings, ...input.errors];
      const execution = executionFindings(input.analysis);
      sections.push(
        createTrafficExplanationSection({
          kind: "WARNINGS",
          state: allWarnings.length > 0 ? "REPORTED" : "NONE",
          summary:
            allWarnings.length > 0
              ? `${plural(input.warnings.length, "warning")} and ${plural(input.errors.length, "error")} were reported.`
              : "No warnings or errors were reported.",
          items: allWarnings,
        }),
        createTrafficExplanationSection({
          kind: "MISSING_INFORMATION",
          state: input.missing.length > 0 ? "REPORTED" : "NONE",
          summary:
            input.missing.length > 0
              ? `${plural(input.missing.length, "item")} of information ${input.missing.length === 1 ? "is" : "are"} missing.`
              : "No missing information was reported.",
          items: [...input.missing],
        }),
        createTrafficExplanationSection({
          kind: "EXECUTION_SUMMARY",
          state: execution.length > 0 ? "REPORTED" : "NONE",
          summary:
            execution.length > 0
              ? `${plural(execution.length, "finding")} about how the analysis run ended.`
              : "No execution facts were recorded.",
          items: execution,
          signalIds: [],
        }),
      );
      return sections;
    },
  };
}

// ---------- how signal-reported states are worded ----------

export type TrafficStateClass = "STRENGTH" | "WEAKNESS" | "MISSING" | "NEUTRAL";

export interface TrafficStateWording {
  class: TrafficStateClass;
  /** How the state is stated in an explanation. It restates what was reported, nothing more. */
  phrase: string;
}

/**
 * The states signals report for a dimension, and how each is worded. A state
 * that is not listed here is neutral and is stated exactly as reported, so a
 * new signal is explained without a change here. A caller may pass its own
 * table to the builder.
 */
export const TRAFFIC_STATE_VOCABULARY: Readonly<Record<string, TrafficStateWording>> = Object.freeze({
  SATISFIED: { class: "STRENGTH", phrase: "established as present" },
  PARTIAL: { class: "STRENGTH", phrase: "only partly evidenced" },
  ABSENT: { class: "MISSING", phrase: "reported missing" },
  UNKNOWN: { class: "NEUTRAL", phrase: "not assessed" },
  AVAILABLE: { class: "STRENGTH", phrase: "established as present" },
  STRONG: { class: "STRENGTH", phrase: "reported as strong by the signal" },
  ADEQUATE: { class: "NEUTRAL", phrase: "reported as adequate by the signal" },
  WEAK: { class: "WEAKNESS", phrase: "reported as weak by the signal" },
  MISSING: { class: "MISSING", phrase: "reported missing" },
  COMPATIBLE: { class: "STRENGTH", phrase: "established as compatible" },
  INCOMPATIBLE: { class: "WEAKNESS", phrase: "reported as incompatible" },
  NOT_ASSESSED: { class: "NEUTRAL", phrase: "not assessed" },
  NOT_APPLICABLE: { class: "NEUTRAL", phrase: "not applicable" },
});

export function describeTrafficState(
  state: string,
  vocabulary: Readonly<Record<string, TrafficStateWording>> = TRAFFIC_STATE_VOCABULARY,
): TrafficStateWording {
  return Object.prototype.hasOwnProperty.call(vocabulary, state) ? vocabulary[state] : { class: "NEUTRAL", phrase: `reported as ${state}` };
}

/** Flat metadata is the only structured data an explanation carries. */
export type TrafficExplanationMetadata = TrafficMetadata;
