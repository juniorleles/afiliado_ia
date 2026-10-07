/**
 * Traffic Live Preview: comparison view.
 *
 * Places generated, manual, and effective values side by side and marks the
 * fields that differ. Warnings and missing information are restated from the
 * explanation. Nothing here changes the generated analysis.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEffectiveView,
  type TrafficFieldSource,
  type TrafficOverrideField,
} from "./traffic-effective-view";
import {
  TRAFFIC_PREVIEW_FIELD_LABELS,
  TRAFFIC_PREVIEW_SECTION_FIELDS,
  TRAFFIC_PREVIEW_SECTIONS,
  TRAFFIC_PREVIEW_SECTION_TITLES,
  displayTrafficPreviewValue,
  type TrafficPreviewExplanationSlice,
  type TrafficPreviewSectionKind,
} from "./traffic-effective-preview";

export interface TrafficComparisonRow {
  field: string;
  label: string;
  section: TrafficPreviewSectionKind;
  generated: string;
  manual: string;
  effective: string;
  changed: boolean;
  source: TrafficFieldSource | "GENERATED";
}

export interface TrafficComparisonView {
  analysisId: string;
  candidateId: string | null;
  rows: TrafficComparisonRow[];
  changedFields: TrafficOverrideField[];
  generatedValues: Record<string, string>;
  manualValues: Record<string, string>;
  effectiveValues: Record<string, string>;
  warnings: string[];
  missingInformation: string[];
}

function texts(list: ReadonlyArray<{ text: string }> | undefined): string[] {
  return list ? list.map((item) => item.text) : [];
}

function joinList(items: string[]): string {
  return items.length > 0 ? items.join(" | ") : "(none)";
}

function sectionOf(field: TrafficOverrideField): TrafficPreviewSectionKind {
  for (const kind of TRAFFIC_PREVIEW_SECTIONS) {
    if ((TRAFFIC_PREVIEW_SECTION_FIELDS[kind] as readonly string[]).includes(field)) return kind;
  }
  return "TRAFFIC_NOTES";
}

export function createTrafficComparisonView(
  view: TrafficEffectiveView,
  explanation: TrafficPreviewExplanationSlice | null = null,
): TrafficComparisonView {
  const rows: TrafficComparisonRow[] = [];
  const generatedValues: Record<string, string> = {};
  const manualValues: Record<string, string> = {};
  const effectiveValues: Record<string, string> = {};

  for (const field of TRAFFIC_OVERRIDE_FIELDS) {
    const overridden = view.overriddenFields.includes(field);
    const generated = displayTrafficPreviewValue(field, view.generated[field]);
    const manual = overridden ? displayTrafficPreviewValue(field, view.overrides[field]) : "(not overridden)";
    const effective = displayTrafficPreviewValue(field, view.effective[field]);
    generatedValues[field] = generated;
    manualValues[field] = manual;
    effectiveValues[field] = effective;
    rows.push({
      field,
      label: TRAFFIC_PREVIEW_FIELD_LABELS[field],
      section: sectionOf(field),
      generated,
      manual,
      effective,
      changed: overridden,
      source: view.sources[field],
    });
  }

  const warnings = texts(explanation?.warnings);
  const missing = texts(explanation?.missingInformation);
  rows.push(
    {
      field: "warnings",
      label: "Warnings",
      section: "TRAFFIC_NOTES",
      generated: joinList(warnings),
      manual: "(not overridden)",
      effective: joinList(warnings),
      changed: false,
      source: "GENERATED",
    },
    {
      field: "missingInformation",
      label: "Missing Information",
      section: "TRAFFIC_NOTES",
      generated: joinList(missing),
      manual: "(not overridden)",
      effective: joinList(missing),
      changed: false,
      source: "GENERATED",
    },
  );

  return freezeDeepTraffic({
    analysisId: view.analysisId,
    candidateId: view.candidateId,
    rows,
    changedFields: [...view.overriddenFields],
    generatedValues,
    manualValues,
    effectiveValues,
    warnings,
    missingInformation: missing,
  });
}

export { TRAFFIC_PREVIEW_SECTION_TITLES };
