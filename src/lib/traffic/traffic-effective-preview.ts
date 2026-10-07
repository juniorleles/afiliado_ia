/**
 * Traffic Live Preview: effective preview.
 *
 * Turns an Effective View and an optional explanation into the eight
 * visualization sections an operator can read. It restates generated,
 * manual, and effective values. It does not change the snapshot, and it
 * does not invent a channel, a strategy, or a note.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEditorValues,
  type TrafficEffectiveView,
  type TrafficFieldSource,
  type TrafficOverrideField,
} from "./traffic-effective-view";
import { createTrafficPreviewResolver, type TrafficPreviewLayerMode } from "./traffic-preview-resolver";

export const TRAFFIC_PREVIEW_SECTIONS = [
  "CHANNELS",
  "POLICY",
  "AUDIENCE",
  "OFFER",
  "CREATIVE",
  "TRAFFIC_NOTES",
  "OPERATOR_NOTES",
  "EXECUTION_SUMMARY",
] as const;
export type TrafficPreviewSectionKind = (typeof TRAFFIC_PREVIEW_SECTIONS)[number];

export const TRAFFIC_PREVIEW_SECTION_TITLES: Readonly<Record<TrafficPreviewSectionKind, string>> = Object.freeze({
  CHANNELS: "Channels",
  POLICY: "Policy",
  AUDIENCE: "Audience",
  OFFER: "Offer",
  CREATIVE: "Creative",
  TRAFFIC_NOTES: "Traffic Notes",
  OPERATOR_NOTES: "Operator Notes",
  EXECUTION_SUMMARY: "Execution Summary",
});

export const TRAFFIC_PREVIEW_SECTION_FIELDS: Readonly<Record<TrafficPreviewSectionKind, readonly TrafficOverrideField[]>> = Object.freeze({
  CHANNELS: ["preferredChannels", "blockedChannels"],
  POLICY: ["riskNotes"],
  AUDIENCE: ["audienceNotes"],
  OFFER: ["trafficStrategy"],
  CREATIVE: ["creativeNotes"],
  TRAFFIC_NOTES: ["priority", "customMetadata"],
  OPERATOR_NOTES: ["operatorNotes"],
  EXECUTION_SUMMARY: [],
});

/** Explanation kinds restated into the matching preview section. */
export const TRAFFIC_PREVIEW_EXPLANATION_KIND: Readonly<Record<TrafficPreviewSectionKind, string | null>> = Object.freeze({
  CHANNELS: "CHANNEL_COMPATIBILITY",
  POLICY: "POLICY_RISKS",
  AUDIENCE: "AUDIENCE_FIT",
  OFFER: "OFFER_READINESS",
  CREATIVE: "CREATIVE_READINESS",
  TRAFFIC_NOTES: null,
  OPERATOR_NOTES: null,
  EXECUTION_SUMMARY: "EXECUTION_SUMMARY",
});

export interface TrafficPreviewExplanationSlice {
  analysisId: string;
  candidateId: string | null;
  summary?: string;
  warnings?: ReadonlyArray<{ text: string }>;
  missingInformation?: ReadonlyArray<{ text: string }>;
  sectionBreakdown?: ReadonlyArray<{
    kind: string;
    title?: string;
    state?: string;
    summary: string;
    items?: ReadonlyArray<{ kind: string; text: string }>;
  }>;
}

export interface TrafficPreviewField {
  field: TrafficOverrideField;
  label: string;
  generated: string;
  manual: string;
  effective: string;
  changed: boolean;
  source: TrafficFieldSource;
  present: boolean;
}

export interface TrafficPreviewSection {
  kind: TrafficPreviewSectionKind;
  title: string;
  summary: string;
  fields: TrafficPreviewField[];
  items: string[];
  expanded: boolean;
}

export interface TrafficEffectivePreview {
  analysisId: string;
  candidateId: string | null;
  mode: TrafficPreviewLayerMode;
  values: TrafficEditorValues;
  sections: TrafficPreviewSection[];
  warnings: string[];
  missingInformation: string[];
}

const FIELD_LABELS: Readonly<Record<TrafficOverrideField, string>> = Object.freeze({
  preferredChannels: "Preferred Channels",
  blockedChannels: "Blocked Channels",
  trafficStrategy: "Traffic Strategy",
  audienceNotes: "Audience Notes",
  riskNotes: "Risk Notes",
  creativeNotes: "Creative Notes",
  operatorNotes: "Operator Notes",
  priority: "Priority",
  customMetadata: "Custom Metadata",
});

const resolver = createTrafficPreviewResolver();

export function displayTrafficPreviewValue(field: TrafficOverrideField, value: unknown): string {
  if (field === "preferredChannels" || field === "blockedChannels") {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "(none)";
  }
  if (field === "trafficStrategy" || field === "priority") return value === null || value === undefined ? "(none)" : String(value);
  if (field === "customMetadata") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "(none)";
    const keys = Object.keys(value);
    return keys.length === 0 ? "(none)" : keys.sort().map((key) => `${key}=${String((value as Record<string, unknown>)[key])}`).join(", ");
  }
  return typeof value === "string" && value.trim() !== "" ? value : "(none)";
}

function texts(list: ReadonlyArray<{ text: string }> | undefined): string[] {
  return list ? list.map((item) => item.text) : [];
}

function sectionSummary(explanation: TrafficPreviewExplanationSlice | null | undefined, kind: string): string {
  const section = explanation?.sectionBreakdown?.find((entry) => entry.kind === kind);
  return typeof section?.summary === "string" ? section.summary : "";
}

function sectionItems(explanation: TrafficPreviewExplanationSlice | null | undefined, kind: string): string[] {
  const section = explanation?.sectionBreakdown?.find((entry) => entry.kind === kind);
  return section?.items ? section.items.map((item) => item.text) : [];
}

export function isTrafficPreviewSectionKind(value: string): value is TrafficPreviewSectionKind {
  return (TRAFFIC_PREVIEW_SECTIONS as readonly string[]).includes(value);
}

export interface TrafficEffectivePreviewInput {
  view: TrafficEffectiveView;
  explanation?: TrafficPreviewExplanationSlice | null;
  mode?: TrafficPreviewLayerMode;
  expanded?: ReadonlySet<string> | readonly string[];
}

export function createTrafficEffectivePreview(input: TrafficEffectivePreviewInput): TrafficEffectivePreview {
  const view = input.view;
  const mode = input.mode ?? "EFFECTIVE";
  const layer = resolver.layer(view, mode);
  const expanded = input.expanded === undefined
    ? new Set<string>(TRAFFIC_PREVIEW_SECTIONS)
    : new Set(input.expanded instanceof Set ? [...input.expanded] : input.expanded);
  const explanation = input.explanation ?? null;
  const sections: TrafficPreviewSection[] = TRAFFIC_PREVIEW_SECTIONS.map((kind) => {
    const fields: TrafficPreviewField[] = TRAFFIC_PREVIEW_SECTION_FIELDS[kind].map((field) => {
      const overridden = view.overriddenFields.includes(field);
      return {
        field,
        label: FIELD_LABELS[field],
        generated: displayTrafficPreviewValue(field, view.generated[field]),
        manual: overridden ? displayTrafficPreviewValue(field, view.overrides[field]) : "(not overridden)",
        effective: displayTrafficPreviewValue(field, view.effective[field]),
        changed: overridden,
        source: view.sources[field],
        present: layer.present[field],
      };
    });
    const mapped = TRAFFIC_PREVIEW_EXPLANATION_KIND[kind];
    return {
      kind,
      title: TRAFFIC_PREVIEW_SECTION_TITLES[kind],
      summary: mapped ? sectionSummary(explanation, mapped) : "",
      fields,
      items: mapped === "EXECUTION_SUMMARY" ? sectionItems(explanation, mapped) : [],
      expanded: expanded.has(kind),
    };
  });
  return freezeDeepTraffic({
    analysisId: view.analysisId,
    candidateId: view.candidateId,
    mode,
    values: layer.values,
    sections,
    warnings: texts(explanation?.warnings),
    missingInformation: texts(explanation?.missingInformation),
  });
}

export { FIELD_LABELS as TRAFFIC_PREVIEW_FIELD_LABELS, TRAFFIC_OVERRIDE_FIELDS };
