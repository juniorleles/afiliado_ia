/**
 * Traffic Versioning: snapshot.
 *
 * An immutable copy of the effective overlay at one moment. It names the
 * generated analysis by id only and keeps its own copy of the manual
 * overrides. Nothing here changes the generated analysis or the live overlay.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEditorValues,
  type TrafficEffectiveView,
  type TrafficOverrideField,
  type TrafficOverridePatch,
} from "./traffic-effective-view";
import type { TrafficMetadata } from "./traffic-types";

export const TRAFFIC_VERSION_STATUSES = ["DRAFT", "SNAPSHOT"] as const;
export type TrafficVersionStatus = (typeof TRAFFIC_VERSION_STATUSES)[number];

export const TRAFFIC_VERSION_ORIGINS = ["CREATE", "DUPLICATE", "RESTORE"] as const;
export type TrafficVersionOrigin = (typeof TRAFFIC_VERSION_ORIGINS)[number];

export interface TrafficGeneratedReference {
  analysisId: string;
  candidateId: string | null;
}

export interface TrafficOverrideReference {
  id: string;
  analysisId: string;
}

export interface TrafficSnapshot {
  versionId: string;
  timestamp: string;
  operator: string;
  generatedReference: TrafficGeneratedReference;
  overrideReference: TrafficOverrideReference;
  effectiveSnapshot: TrafficEditorValues;
  metadata: TrafficMetadata;
  generated: TrafficEditorValues;
  overrides: TrafficOverridePatch;
  overriddenFields: TrafficOverrideField[];
}

export interface TrafficVersion extends TrafficSnapshot {
  analysisId: string;
  candidateId: string | null;
  status: TrafficVersionStatus;
  origin: TrafficVersionOrigin;
  parentVersionId: string | null;
  restoreSource: string | null;
}

export function copyTrafficEditorValues(values: TrafficEditorValues): TrafficEditorValues {
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

export function copyTrafficOverridePatch(patch: TrafficOverridePatch): TrafficOverridePatch {
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

export function copyTrafficMetadata(metadata: TrafficMetadata): TrafficMetadata {
  return { ...metadata };
}

export function overrideReferenceId(versionId: string): string {
  return `ovr-${versionId}`;
}

export interface TrafficSnapshotBuildInput {
  versionId: string;
  timestamp: string;
  operator: string;
  view: TrafficEffectiveView;
  metadata?: TrafficMetadata;
}

/** Frozen overlay snapshot. The generated analysis is named, not copied. */
export function createTrafficSnapshot(input: TrafficSnapshotBuildInput): TrafficSnapshot {
  const view = input.view;
  const metadata = input.metadata ? copyTrafficMetadata(input.metadata) : {};
  const overriddenFields = Array.isArray(view.overriddenFields)
    ? [...view.overriddenFields]
    : TRAFFIC_OVERRIDE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(view.overrides, field) && view.overrides[field] !== undefined);
  return freezeDeepTraffic({
    versionId: input.versionId,
    timestamp: input.timestamp,
    operator: input.operator,
    generatedReference: { analysisId: view.analysisId, candidateId: view.candidateId },
    overrideReference: { id: overrideReferenceId(input.versionId), analysisId: view.analysisId },
    effectiveSnapshot: copyTrafficEditorValues(view.effective),
    metadata,
    generated: copyTrafficEditorValues(view.generated),
    overrides: copyTrafficOverridePatch(view.overrides),
    overriddenFields,
  });
}

export interface TrafficVersionBuildInput extends TrafficSnapshotBuildInput {
  status: TrafficVersionStatus;
  origin: TrafficVersionOrigin;
  parentVersionId: string | null;
  restoreSource: string | null;
}

export function createTrafficVersion(input: TrafficVersionBuildInput): TrafficVersion {
  const snapshot = createTrafficSnapshot(input);
  return freezeDeepTraffic({
    ...snapshot,
    generatedReference: { ...snapshot.generatedReference },
    overrideReference: { ...snapshot.overrideReference },
    effectiveSnapshot: copyTrafficEditorValues(snapshot.effectiveSnapshot),
    metadata: copyTrafficMetadata(snapshot.metadata),
    generated: copyTrafficEditorValues(snapshot.generated),
    overrides: copyTrafficOverridePatch(snapshot.overrides),
    overriddenFields: [...snapshot.overriddenFields],
    analysisId: snapshot.generatedReference.analysisId,
    candidateId: snapshot.generatedReference.candidateId,
    status: input.status,
    origin: input.origin,
    parentVersionId: input.parentVersionId,
    restoreSource: input.restoreSource,
  });
}

export function cloneTrafficVersion(version: TrafficVersion): TrafficVersion {
  return freezeDeepTraffic({
    versionId: version.versionId,
    timestamp: version.timestamp,
    operator: version.operator,
    generatedReference: { ...version.generatedReference },
    overrideReference: { ...version.overrideReference },
    effectiveSnapshot: copyTrafficEditorValues(version.effectiveSnapshot),
    metadata: copyTrafficMetadata(version.metadata),
    generated: copyTrafficEditorValues(version.generated),
    overrides: copyTrafficOverridePatch(version.overrides),
    overriddenFields: [...version.overriddenFields],
    analysisId: version.analysisId,
    candidateId: version.candidateId,
    status: version.status,
    origin: version.origin,
    parentVersionId: version.parentVersionId,
    restoreSource: version.restoreSource,
  });
}

export { TRAFFIC_OVERRIDE_FIELDS };
