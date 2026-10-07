/**
 * Traffic Live Preview: preview resolver.
 *
 * Picks one layer of the overlay: generated, manual, or effective. It reads
 * the Effective View and returns copies. It does not change the generated
 * analysis, does not write overrides, and does not execute a signal.
 */
import {
  TRAFFIC_OVERRIDE_FIELDS,
  emptyTrafficEditorValues,
  type TrafficEditorValues,
  type TrafficEffectiveView,
  type TrafficFieldSource,
  type TrafficOverrideField,
  type TrafficOverridePatch,
} from "./traffic-effective-view";

export const TRAFFIC_PREVIEW_MODES = ["GENERATED", "MANUAL", "EFFECTIVE", "COMPARISON"] as const;
export type TrafficPreviewMode = (typeof TRAFFIC_PREVIEW_MODES)[number];

export const TRAFFIC_PREVIEW_LAYERS = ["GENERATED", "MANUAL", "EFFECTIVE"] as const;
export type TrafficPreviewLayerMode = (typeof TRAFFIC_PREVIEW_LAYERS)[number];

export interface TrafficPreviewLayer {
  mode: TrafficPreviewLayerMode;
  values: TrafficEditorValues;
  present: Record<TrafficOverrideField, boolean>;
  sources: Record<TrafficOverrideField, TrafficFieldSource>;
}

export interface TrafficPreviewResolver {
  layer(view: TrafficEffectiveView, mode: TrafficPreviewLayerMode): TrafficPreviewLayer;
  values(view: TrafficEffectiveView, mode: TrafficPreviewLayerMode): TrafficEditorValues;
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

function emptyPresent(): Record<TrafficOverrideField, boolean> {
  const present = {} as Record<TrafficOverrideField, boolean>;
  for (const field of TRAFFIC_OVERRIDE_FIELDS) present[field] = false;
  return present;
}

function isOverridden(overrides: TrafficOverridePatch, field: TrafficOverrideField): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, field) && overrides[field] !== undefined;
}

export function isTrafficPreviewMode(value: string): value is TrafficPreviewMode {
  return (TRAFFIC_PREVIEW_MODES as readonly string[]).includes(value);
}

export function isTrafficPreviewLayer(value: string): value is TrafficPreviewLayerMode {
  return (TRAFFIC_PREVIEW_LAYERS as readonly string[]).includes(value);
}

export function createTrafficPreviewResolver(): TrafficPreviewResolver {
  function layer(view: TrafficEffectiveView, mode: TrafficPreviewLayerMode): TrafficPreviewLayer {
    const present = emptyPresent();
    const sources = { ...view.sources };
    if (mode === "GENERATED") {
      return { mode, values: copyValues(view.generated), present, sources: Object.fromEntries(TRAFFIC_OVERRIDE_FIELDS.map((field) => [field, "GENERATED"])) as Record<TrafficOverrideField, TrafficFieldSource> };
    }
    if (mode === "MANUAL") {
      const values = emptyTrafficEditorValues();
      for (const field of TRAFFIC_OVERRIDE_FIELDS) {
        if (!isOverridden(view.overrides, field)) continue;
        present[field] = true;
      }
      if (view.overrides.preferredChannels) values.preferredChannels = [...view.overrides.preferredChannels];
      if (view.overrides.blockedChannels) values.blockedChannels = [...view.overrides.blockedChannels];
      if (view.overrides.trafficStrategy !== undefined) values.trafficStrategy = view.overrides.trafficStrategy;
      if (view.overrides.audienceNotes !== undefined) values.audienceNotes = view.overrides.audienceNotes;
      if (view.overrides.riskNotes !== undefined) values.riskNotes = view.overrides.riskNotes;
      if (view.overrides.creativeNotes !== undefined) values.creativeNotes = view.overrides.creativeNotes;
      if (view.overrides.operatorNotes !== undefined) values.operatorNotes = view.overrides.operatorNotes;
      if (view.overrides.priority !== undefined) values.priority = view.overrides.priority;
      if (view.overrides.customMetadata) values.customMetadata = { ...view.overrides.customMetadata };
      return { mode, values, present, sources };
    }
    for (const field of TRAFFIC_OVERRIDE_FIELDS) present[field] = isOverridden(view.overrides, field);
    return { mode: "EFFECTIVE", values: copyValues(view.effective), present, sources };
  }

  function values(view: TrafficEffectiveView, mode: TrafficPreviewLayerMode): TrafficEditorValues {
    return copyValues(layer(view, mode).values);
  }

  return { layer, values };
}
