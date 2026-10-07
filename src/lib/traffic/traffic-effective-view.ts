/**
 * Traffic Manual Editor: generated values and the effective view.
 *
 * The generated layer is read from the analysis snapshot, an optional
 * explanation, and an optional strategy identifier. Manual overrides replace
 * only the effective values. The analysis itself is never rewritten here.
 *
 * Preferred and blocked channels are restated from the generic
 * supportedChannels / unsupportedChannels lists a completed signal may report.
 * A strategy identifier is carried as given; nothing here chooses one.
 */
import type { TrafficMetadata } from "./traffic-types";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { freezeDeepTraffic } from "./traffic-signal-context";

export const TRAFFIC_OVERRIDE_FIELDS = [
  "preferredChannels",
  "blockedChannels",
  "trafficStrategy",
  "audienceNotes",
  "riskNotes",
  "creativeNotes",
  "operatorNotes",
  "priority",
  "customMetadata",
] as const;
export type TrafficOverrideField = (typeof TRAFFIC_OVERRIDE_FIELDS)[number];

export const TRAFFIC_OVERRIDE_SECTIONS = ["CHANNELS", "STRATEGY", "NOTES", "PRIORITY", "METADATA"] as const;
export type TrafficOverrideSection = (typeof TRAFFIC_OVERRIDE_SECTIONS)[number];

export const TRAFFIC_OVERRIDE_SECTION_FIELDS: Readonly<Record<TrafficOverrideSection, readonly TrafficOverrideField[]>> = Object.freeze({
  CHANNELS: ["preferredChannels", "blockedChannels"],
  STRATEGY: ["trafficStrategy"],
  NOTES: ["audienceNotes", "riskNotes", "creativeNotes", "operatorNotes"],
  PRIORITY: ["priority"],
  METADATA: ["customMetadata"],
});

export type TrafficFieldSource = "GENERATED" | "MANUAL";

export interface TrafficEditorValues {
  preferredChannels: string[];
  blockedChannels: string[];
  trafficStrategy: string | null;
  audienceNotes: string;
  riskNotes: string;
  creativeNotes: string;
  operatorNotes: string;
  priority: number | null;
  customMetadata: TrafficMetadata;
}

export type TrafficOverridePatch = Partial<TrafficEditorValues>;

export const TRAFFIC_EDITOR_VALUE_KEYS = TRAFFIC_OVERRIDE_FIELDS;

export interface TrafficEditorExplanationSlice {
  analysisId: string;
  candidateId: string | null;
  sectionBreakdown: ReadonlyArray<{ kind: string; summary: string }>;
}

export interface TrafficGeneratedInput {
  analysis: ResolvedTrafficAnalysis;
  explanation?: TrafficEditorExplanationSlice | null;
  generatedStrategy?: string | null;
  generated?: TrafficOverridePatch | null;
}

export interface TrafficEffectiveView {
  analysisId: string;
  candidateId: string | null;
  generated: TrafficEditorValues;
  overrides: TrafficOverridePatch;
  effective: TrafficEditorValues;
  sources: Record<TrafficOverrideField, TrafficFieldSource>;
  overriddenFields: TrafficOverrideField[];
}

export const TRAFFIC_OVERLAY_SCOPE_NOTE =
  "Manual overrides replace only the effective view. The generated analysis is not changed.";

export const emptyTrafficEditorValues = (): TrafficEditorValues => ({
  preferredChannels: [],
  blockedChannels: [],
  trafficStrategy: null,
  audienceNotes: "",
  riskNotes: "",
  creativeNotes: "",
  operatorNotes: "",
  priority: null,
  customMetadata: {},
});

const splitList = (value: unknown): string[] =>
  typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()).filter((part) => part !== "") : [];

function uniqueInOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function listsFromCompleted(analysis: ResolvedTrafficAnalysis, key: string): string[] {
  const ids: string[] = [];
  for (const result of analysis.signalResults) {
    if (result.status !== "COMPLETED") continue;
    ids.push(...splitList(result.metadata[key]));
  }
  return uniqueInOrder(ids);
}

function sectionSummary(explanation: TrafficEditorExplanationSlice | null | undefined, kind: string): string {
  if (!explanation) return "";
  const section = explanation.sectionBreakdown.find((entry) => entry.kind === kind);
  return typeof section?.summary === "string" ? section.summary : "";
}

function copyValues(values: TrafficEditorValues): TrafficEditorValues {
  return {
    preferredChannels: [...values.preferredChannels],
    blockedChannels: [...values.blockedChannels],
    trafficStrategy: values.trafficStrategy,
    audienceNotes: values.audienceNotes,
    riskNotes: values.riskNotes,
    creativeNotes: values.creativeNotes,
    operatorNotes: values.operatorNotes,
    priority: values.priority,
    customMetadata: { ...values.customMetadata },
  };
}

function copyPatch(patch: TrafficOverridePatch): TrafficOverridePatch {
  const next: TrafficOverridePatch = {};
  if (patch.preferredChannels !== undefined) next.preferredChannels = [...patch.preferredChannels];
  if (patch.blockedChannels !== undefined) next.blockedChannels = [...patch.blockedChannels];
  if (patch.trafficStrategy !== undefined) next.trafficStrategy = patch.trafficStrategy;
  if (patch.audienceNotes !== undefined) next.audienceNotes = patch.audienceNotes;
  if (patch.riskNotes !== undefined) next.riskNotes = patch.riskNotes;
  if (patch.creativeNotes !== undefined) next.creativeNotes = patch.creativeNotes;
  if (patch.operatorNotes !== undefined) next.operatorNotes = patch.operatorNotes;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.customMetadata !== undefined) next.customMetadata = { ...patch.customMetadata };
  return next;
}

/** Frozen generated values restated from the snapshot, the explanation, and any supplied strategy. */
export function buildTrafficGeneratedValues(input: TrafficGeneratedInput): TrafficEditorValues {
  const analysis = input.analysis;
  const explanation = input.explanation ?? null;
  const base = emptyTrafficEditorValues();
  base.preferredChannels = listsFromCompleted(analysis, "supportedChannels");
  base.blockedChannels = listsFromCompleted(analysis, "unsupportedChannels");
  base.trafficStrategy = input.generatedStrategy ?? null;
  base.audienceNotes = sectionSummary(explanation, "AUDIENCE_FIT");
  base.riskNotes = sectionSummary(explanation, "POLICY_RISKS");
  base.creativeNotes = sectionSummary(explanation, "CREATIVE_READINESS");
  const explicit = input.generated;
  if (explicit) {
    if (explicit.preferredChannels !== undefined) base.preferredChannels = [...explicit.preferredChannels];
    if (explicit.blockedChannels !== undefined) base.blockedChannels = [...explicit.blockedChannels];
    if (explicit.trafficStrategy !== undefined) base.trafficStrategy = explicit.trafficStrategy;
    if (explicit.audienceNotes !== undefined) base.audienceNotes = explicit.audienceNotes;
    if (explicit.riskNotes !== undefined) base.riskNotes = explicit.riskNotes;
    if (explicit.creativeNotes !== undefined) base.creativeNotes = explicit.creativeNotes;
    if (explicit.operatorNotes !== undefined) base.operatorNotes = explicit.operatorNotes;
    if (explicit.priority !== undefined) base.priority = explicit.priority;
    if (explicit.customMetadata !== undefined) base.customMetadata = { ...explicit.customMetadata };
  }
  return freezeDeepTraffic(copyValues(base));
}

export function isTrafficOverrideField(value: string): value is TrafficOverrideField {
  return (TRAFFIC_OVERRIDE_FIELDS as readonly string[]).includes(value);
}

export function isTrafficOverrideSection(value: string): value is TrafficOverrideSection {
  return (TRAFFIC_OVERRIDE_SECTIONS as readonly string[]).includes(value);
}

export interface TrafficEffectiveViewInput {
  analysisId: string;
  candidateId: string | null;
  generated: TrafficEditorValues;
  overrides: TrafficOverridePatch;
  effective: TrafficEditorValues;
}

/** Frozen view of generated values, the stored overrides, and the effective overlay. */
export function createTrafficEffectiveView(input: TrafficEffectiveViewInput): TrafficEffectiveView {
  const sources = {} as Record<TrafficOverrideField, TrafficFieldSource>;
  const overriddenFields: TrafficOverrideField[] = [];
  for (const field of TRAFFIC_OVERRIDE_FIELDS) {
    const manual = Object.prototype.hasOwnProperty.call(input.overrides, field) && input.overrides[field] !== undefined;
    sources[field] = manual ? "MANUAL" : "GENERATED";
    if (manual) overriddenFields.push(field);
  }
  return freezeDeepTraffic({
    analysisId: input.analysisId,
    candidateId: input.candidateId,
    generated: copyValues(input.generated),
    overrides: copyPatch(input.overrides),
    effective: copyValues(input.effective),
    sources,
    overriddenFields,
  });
}
