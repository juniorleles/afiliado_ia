/**
 * Opportunity Explanation Engine: sections and items.
 *
 * An explanation is made of eight sections. Four describe one group of signals
 * (named after the Signal Contract categories of the same name); four collect
 * one kind of statement across every signal.
 *
 * Every statement is an item that keeps where it came from: the signal, its
 * category, and the dimension it is about. Nothing here scores, ranks, or
 * recommends, and nothing is invented: an item restates what a signal reported.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import { freezeDeep } from "./opportunity-signal-context";

export const EXPLANATION_SECTION_KINDS = [
  "EVIDENCE",
  "LANDING_PAGE",
  "COMPETITION",
  "COMMERCIAL_INTENT",
  "WARNINGS",
  "MISSING_INFORMATION",
  "STRENGTHS",
  "WEAKNESSES",
] as const;
export type ExplanationSectionKind = (typeof EXPLANATION_SECTION_KINDS)[number];

/** The sections that describe one group of signals. Each is also a Signal Contract category. */
export const CATEGORY_SECTION_KINDS = ["EVIDENCE", "LANDING_PAGE", "COMPETITION", "COMMERCIAL_INTENT"] as const;
export type CategorySectionKind = (typeof CATEGORY_SECTION_KINDS)[number];

/** The sections that collect one kind of statement across all signals. */
export const COLLECTING_SECTION_KINDS = ["WARNINGS", "MISSING_INFORMATION", "STRENGTHS", "WEAKNESSES"] as const;
export type CollectingSectionKind = (typeof COLLECTING_SECTION_KINDS)[number];

export const EXPLANATION_SECTION_TITLES: Readonly<Record<ExplanationSectionKind, string>> = Object.freeze({
  EVIDENCE: "Evidence",
  LANDING_PAGE: "Landing Page",
  COMPETITION: "Competition",
  COMMERCIAL_INTENT: "Commercial Intent",
  WARNINGS: "Warnings",
  MISSING_INFORMATION: "Missing Information",
  STRENGTHS: "Strengths",
  WEAKNESSES: "Weaknesses",
});

/**
 * COMPLETED, NOT_COMPLETED, NO_SIGNAL: for a section about a group of signals.
 * REPORTED, NONE: for a section that collects statements.
 */
export const EXPLANATION_SECTION_STATES = ["COMPLETED", "NOT_COMPLETED", "NO_SIGNAL", "REPORTED", "NONE"] as const;
export type ExplanationSectionState = (typeof EXPLANATION_SECTION_STATES)[number];
export const CATEGORY_SECTION_STATES: readonly ExplanationSectionState[] = ["COMPLETED", "NOT_COMPLETED", "NO_SIGNAL"];
export const COLLECTING_SECTION_STATES: readonly ExplanationSectionState[] = ["REPORTED", "NONE"];

export const EXPLANATION_ITEM_KINDS = ["FINDING", "STRENGTH", "WEAKNESS", "MISSING", "WARNING", "ERROR"] as const;
export type ExplanationItemKind = (typeof EXPLANATION_ITEM_KINDS)[number];

/** The item kinds a collecting section may hold. */
export const COLLECTING_SECTION_ITEM_KINDS: Readonly<Record<CollectingSectionKind, readonly ExplanationItemKind[]>> = Object.freeze({
  WARNINGS: ["WARNING", "ERROR"],
  MISSING_INFORMATION: ["MISSING"],
  STRENGTHS: ["STRENGTH"],
  WEAKNESSES: ["WEAKNESS"],
});

export interface ExplanationItem {
  kind: ExplanationItemKind;
  text: string;
  /** The signal the statement came from, or null for a run-level statement. */
  signalId: string | null;
  /** The signal's Signal Contract category, or null when there is none. */
  category: string | null;
  /** The dimension the statement is about, or null. */
  dimension: string | null;
}

export interface ExplanationSection {
  kind: ExplanationSectionKind;
  title: string;
  state: ExplanationSectionState;
  summary: string;
  items: ExplanationItem[];
  /** The signals that contributed to the section, in analysis order. */
  signalIds: string[];
}

export type ExplanationSectionInit = Omit<ExplanationSection, "title" | "signalIds"> & { signalIds?: string[] };

/** The section kind that describes a Signal Contract category, or null when no section does. */
export function sectionKindForCategory(category: string | null): CategorySectionKind | null {
  return (CATEGORY_SECTION_KINDS as readonly string[]).includes(category ?? "") ? (category as CategorySectionKind) : null;
}

export function isCategorySectionKind(kind: string): kind is CategorySectionKind {
  return (CATEGORY_SECTION_KINDS as readonly string[]).includes(kind);
}

/** A frozen section whose title comes from its kind. The items are copied. */
export function createExplanationSection(init: ExplanationSectionInit): ExplanationSection {
  const items = init.items.map((item) => ({ ...item }));
  const signalIds = init.signalIds ?? [...new Set(items.map((item) => item.signalId).filter((id): id is string => id !== null))];
  return freezeDeep({
    kind: init.kind,
    title: EXPLANATION_SECTION_TITLES[init.kind],
    state: init.state,
    summary: init.summary,
    items,
    signalIds: [...signalIds],
  });
}

// ---------- how signal-reported states are worded ----------

export type StateClass = "STRENGTH" | "WEAKNESS" | "MISSING" | "NEUTRAL";

export interface StateWording {
  class: StateClass;
  /** How the state is stated in an explanation. It restates what was reported, nothing more. */
  phrase: string;
}

/**
 * The states signals report for a dimension, and how each is worded. A state
 * that is not listed here is neutral and is stated exactly as reported, so a
 * new signal is explained without a change here. A caller may pass its own
 * table to the builder.
 */
export const STATE_VOCABULARY: Readonly<Record<string, StateWording>> = Object.freeze({
  AVAILABLE_AUTHORITATIVE: { class: "STRENGTH", phrase: "available from a direct source (the source stated it; not independently verified)" },
  AVAILABLE_OTHER: { class: "STRENGTH", phrase: "available from other evidence" },
  AVAILABLE: { class: "STRENGTH", phrase: "evidence is available" },
  STRONG: { class: "STRENGTH", phrase: "reported as strong by the signal" },
  ADEQUATE: { class: "NEUTRAL", phrase: "reported as adequate by the signal" },
  WEAK: { class: "WEAKNESS", phrase: "reported as weak by the signal" },
  MISSING: { class: "MISSING", phrase: "no evidence was found" },
  NOT_ASSESSED: { class: "NEUTRAL", phrase: "not assessed" },
});

export function describeState(state: string, vocabulary: Readonly<Record<string, StateWording>> = STATE_VOCABULARY): StateWording {
  return Object.prototype.hasOwnProperty.call(vocabulary, state) ? vocabulary[state] : { class: "NEUTRAL", phrase: `reported as ${state}` };
}

/** Flat metadata is the only structured data an explanation carries. */
export type ExplanationMetadata = OpportunityMetadata;
