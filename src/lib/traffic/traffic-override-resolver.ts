/**
 * Traffic Manual Editor: override resolver.
 *
 * Combines the generated values with stored overrides into the effective
 * values. An override replaces the generated value for that field only. Fields
 * without an override keep what was generated. Nothing here changes the
 * generated analysis, and nothing is scored or chosen.
 */
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEditorValues,
  type TrafficOverrideField,
  type TrafficOverridePatch,
} from "./traffic-effective-view";

export interface TrafficOverrideResolver {
  resolve(generated: TrafficEditorValues, overrides: TrafficOverridePatch): TrafficEditorValues;
  /** True when the value differs from the generated value for that field. */
  differs(field: TrafficOverrideField, generated: TrafficEditorValues, value: unknown): boolean;
}

function copyList(value: string[]): string[] {
  return [...value];
}

function copyMetadata(value: TrafficEditorValues["customMetadata"]): TrafficEditorValues["customMetadata"] {
  return { ...value };
}

function copyValues(values: TrafficEditorValues): TrafficEditorValues {
  return {
    preferredChannels: copyList(values.preferredChannels),
    blockedChannels: copyList(values.blockedChannels),
    trafficStrategy: values.trafficStrategy,
    audienceNotes: values.audienceNotes,
    riskNotes: values.riskNotes,
    creativeNotes: values.creativeNotes,
    operatorNotes: values.operatorNotes,
    priority: values.priority,
    customMetadata: copyMetadata(values.customMetadata),
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]));
    }
    return inner;
  });
}

export function createTrafficOverrideResolver(): TrafficOverrideResolver {
  function differs(field: TrafficOverrideField, generated: TrafficEditorValues, value: unknown): boolean {
    return canonical(generated[field]) !== canonical(value);
  }

  function resolve(generated: TrafficEditorValues, overrides: TrafficOverridePatch): TrafficEditorValues {
    const next = copyValues(generated);
    for (const field of TRAFFIC_OVERRIDE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(overrides, field) || overrides[field] === undefined) continue;
      if (field === "preferredChannels" && overrides.preferredChannels) next.preferredChannels = copyList(overrides.preferredChannels);
      else if (field === "blockedChannels" && overrides.blockedChannels) next.blockedChannels = copyList(overrides.blockedChannels);
      else if (field === "customMetadata" && overrides.customMetadata) next.customMetadata = copyMetadata(overrides.customMetadata);
      else (next as TrafficEditorValues)[field] = overrides[field] as never;
    }
    return next;
  }

  return { resolve, differs };
}
