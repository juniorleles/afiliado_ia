/**
 * Traffic Intelligence: reading Opportunity dimensions.
 *
 * Shared by the signals that need to know how the Opportunity Engine reported
 * each dimension. It reads the Opportunity explanation, which already says,
 * for each dimension a signal reported on, whether the signal found it a
 * strength, a weakness, missing, or neither. Only dimensions of signals that
 * the analysis shows COMPLETED are read: what a failed or skipped signal left
 * behind is never read, so nothing closed is brought back.
 *
 * It is a pure function that changes nothing it is given and holds no
 * knowledge of any channel, policy, product, or platform. The only outside
 * references are type-only imports.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";

/** How an Opportunity dimension was reported. */
export type DimensionState = "STRONG" | "NEUTRAL" | "WEAK" | "MISSING";
/** Strongest first. Used only to pick which of two reports of one dimension to keep. */
export const DIMENSION_STATE_ORDER: readonly DimensionState[] = ["STRONG", "NEUTRAL", "WEAK", "MISSING"];

export interface DimensionReading {
  states: Map<string, DimensionState>;
  /** Dimensions one signal reported missing and another reported present. */
  disagreements: string[];
}

export function readOpportunityDimensions(analysis: Readonly<ResolvedOpportunityAnalysis>, explanation: Readonly<OpportunityExplanation> | null): DimensionReading {
  const states = new Map<string, DimensionState>();
  const disagreements: string[] = [];
  if (explanation === null) return { states, disagreements };

  const completed = new Set(analysis.signalResults.filter((result) => result.status === "COMPLETED").map((result) => result.signalId));
  const flags = new Map<string, { strong: boolean; weak: boolean; neutral: boolean; missing: boolean }>();
  const note = (kind: string, signalId: string | null, dimension: string | null) => {
    if (dimension === null || signalId === null || !completed.has(signalId)) return;
    const key = `${signalId}\u0000${dimension}`;
    const entry = flags.get(key) ?? { strong: false, weak: false, neutral: false, missing: false };
    if (kind === "STRENGTH") entry.strong = true;
    else if (kind === "WEAKNESS") entry.weak = true;
    else if (kind === "MISSING") entry.missing = true;
    else if (kind === "FINDING") entry.neutral = true;
    flags.set(key, entry);
  };
  for (const list of [explanation.strengths, explanation.weaknesses, explanation.missingEvidence]) {
    for (const item of list) note(item.kind, item.signalId, item.dimension);
  }
  for (const section of explanation.sections) {
    for (const item of section.items) note(item.kind, item.signalId, item.dimension);
  }

  // One state per signal and dimension: missing wins, because a signal that calls a missing dimension a weakness is still saying it is missing.
  const perDimension = new Map<string, DimensionState[]>();
  for (const [key, entry] of [...flags].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dimension = key.split("\u0000")[1];
    const state: DimensionState = entry.missing ? "MISSING" : entry.strong ? "STRONG" : entry.weak ? "WEAK" : "NEUTRAL";
    perDimension.set(dimension, [...(perDimension.get(dimension) ?? []), state]);
  }
  for (const [dimension, reported] of [...perDimension].sort((a, b) => a[0].localeCompare(b[0]))) {
    states.set(dimension, DIMENSION_STATE_ORDER.find((state) => reported.includes(state)) as DimensionState);
    if (reported.includes("MISSING") && reported.some((state) => state !== "MISSING")) disagreements.push(dimension);
  }
  return { states, disagreements };
}
