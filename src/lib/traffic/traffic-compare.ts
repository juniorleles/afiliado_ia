/**
 * Traffic Versioning: compare.
 *
 * Places two effective snapshots side by side and marks the groups that
 * differ: channels, strategy, audience, risks, creative, notes, and metadata.
 * The comparison is deterministic. Nothing here changes a stored version.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEditorValues,
  type TrafficOverrideField,
} from "./traffic-effective-view";
import type { TrafficSnapshot } from "./traffic-snapshot";

export const TRAFFIC_COMPARE_GROUPS = [
  "CHANNELS",
  "STRATEGY",
  "AUDIENCE",
  "RISKS",
  "CREATIVE",
  "NOTES",
  "METADATA",
] as const;
export type TrafficCompareGroup = (typeof TRAFFIC_COMPARE_GROUPS)[number];

export const TRAFFIC_COMPARE_GROUP_FIELDS: Readonly<Record<TrafficCompareGroup, readonly TrafficOverrideField[]>> = Object.freeze({
  CHANNELS: ["preferredChannels", "blockedChannels"],
  STRATEGY: ["trafficStrategy"],
  AUDIENCE: ["audienceNotes"],
  RISKS: ["riskNotes"],
  CREATIVE: ["creativeNotes"],
  NOTES: ["operatorNotes", "priority"],
  METADATA: ["customMetadata"],
});

export interface TrafficCompareRow {
  field: TrafficOverrideField;
  group: TrafficCompareGroup;
  from: string;
  to: string;
  changed: boolean;
}

export interface TrafficVersionCompare {
  fromVersionId: string;
  toVersionId: string;
  changedChannels: boolean;
  changedStrategy: boolean;
  changedAudience: boolean;
  changedRisks: boolean;
  changedCreative: boolean;
  changedNotes: boolean;
  changedMetadata: boolean;
  changedFields: TrafficOverrideField[];
  rows: TrafficCompareRow[];
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]));
    }
    return inner;
  });
}

export function displayTrafficVersionValue(field: TrafficOverrideField, value: unknown): string {
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

function groupOf(field: TrafficOverrideField): TrafficCompareGroup {
  for (const group of TRAFFIC_COMPARE_GROUPS) {
    if ((TRAFFIC_COMPARE_GROUP_FIELDS[group] as readonly string[]).includes(field)) return group;
  }
  return "NOTES";
}

export function changedTrafficFields(from: TrafficEditorValues, to: TrafficEditorValues): TrafficOverrideField[] {
  return TRAFFIC_OVERRIDE_FIELDS.filter((field) => canonical(from[field]) !== canonical(to[field]));
}

export function createTrafficCompare(): { compare(from: TrafficSnapshot, to: TrafficSnapshot): TrafficVersionCompare } {
  function compare(from: TrafficSnapshot, to: TrafficSnapshot): TrafficVersionCompare {
    const changedFields = changedTrafficFields(from.effectiveSnapshot, to.effectiveSnapshot);
    const changed = new Set(changedFields);
    const rows: TrafficCompareRow[] = TRAFFIC_OVERRIDE_FIELDS.map((field) => ({
      field,
      group: groupOf(field),
      from: displayTrafficVersionValue(field, from.effectiveSnapshot[field]),
      to: displayTrafficVersionValue(field, to.effectiveSnapshot[field]),
      changed: changed.has(field),
    }));
    const groupChanged = (group: TrafficCompareGroup) => TRAFFIC_COMPARE_GROUP_FIELDS[group].some((field) => changed.has(field));
    return freezeDeepTraffic({
      fromVersionId: from.versionId,
      toVersionId: to.versionId,
      changedChannels: groupChanged("CHANNELS"),
      changedStrategy: groupChanged("STRATEGY"),
      changedAudience: groupChanged("AUDIENCE"),
      changedRisks: groupChanged("RISKS"),
      changedCreative: groupChanged("CREATIVE"),
      changedNotes: groupChanged("NOTES"),
      changedMetadata: groupChanged("METADATA"),
      changedFields,
      rows,
    });
  }

  return { compare };
}

export function compareTrafficVersions(from: TrafficSnapshot, to: TrafficSnapshot): TrafficVersionCompare {
  return createTrafficCompare().compare(from, to);
}
