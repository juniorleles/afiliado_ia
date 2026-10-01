/**
 * Traffic Versioning: restore.
 *
 * Restore copies an existing snapshot into a new version. Previous versions
 * stay as they were. The generated analysis is named by the same reference
 * and is never rewritten.
 */
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEffectiveView,
  type TrafficFieldSource,
  type TrafficOverrideField,
} from "./traffic-effective-view";
import {
  copyTrafficEditorValues,
  copyTrafficMetadata,
  copyTrafficOverridePatch,
  createTrafficVersion,
  type TrafficVersion,
} from "./traffic-snapshot";

export interface TrafficRestoreInput {
  source: TrafficVersion;
  versionId: string;
  timestamp: string;
  operator: string;
  parentVersionId: string | null;
}

export interface TrafficRestore {
  restore(input: TrafficRestoreInput): TrafficVersion;
  duplicate(input: TrafficRestoreInput): TrafficVersion;
}

function viewFromVersion(source: TrafficVersion): TrafficEffectiveView {
  const sources = {} as Record<TrafficOverrideField, TrafficFieldSource>;
  for (const field of TRAFFIC_OVERRIDE_FIELDS) {
    sources[field] = source.overriddenFields.includes(field) ? "MANUAL" : "GENERATED";
  }
  return {
    analysisId: source.analysisId,
    candidateId: source.candidateId,
    generated: copyTrafficEditorValues(source.generated),
    overrides: copyTrafficOverridePatch(source.overrides),
    effective: copyTrafficEditorValues(source.effectiveSnapshot),
    sources,
    overriddenFields: [...source.overriddenFields],
  };
}

function fromSource(input: TrafficRestoreInput, origin: "RESTORE" | "DUPLICATE", status: "SNAPSHOT" | "DRAFT"): TrafficVersion {
  return createTrafficVersion({
    versionId: input.versionId,
    timestamp: input.timestamp,
    operator: input.operator,
    view: viewFromVersion(input.source),
    metadata: copyTrafficMetadata(input.source.metadata),
    status,
    origin,
    parentVersionId: input.parentVersionId,
    restoreSource: origin === "RESTORE" ? input.source.versionId : null,
  });
}

export function createTrafficRestore(): TrafficRestore {
  return {
    restore(input) {
      return fromSource(input, "RESTORE", "SNAPSHOT");
    },
    duplicate(input) {
      return fromSource(input, "DUPLICATE", "DRAFT");
    },
  };
}
