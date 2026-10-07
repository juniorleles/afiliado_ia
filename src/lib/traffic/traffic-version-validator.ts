/**
 * Traffic Versioning: validator.
 *
 * Rejects duplicate version ids, a missing snapshot, an invalid restore, and
 * invalid metadata. It reports problems and never throws or changes its input.
 */
import type { TrafficIssue } from "./traffic-validator";
import { isFlatTrafficMetadata } from "./traffic-signal-validator";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  isTrafficOverrideField,
} from "./traffic-effective-view";
import { createTrafficOverrideValidator } from "./traffic-override-validator";
import { TRAFFIC_VERSION_STATUSES, type TrafficVersion, type TrafficVersionStatus } from "./traffic-snapshot";

export interface TrafficVersionValidator {
  validateVersionId(value: unknown, existingIds?: ReadonlySet<string>): TrafficIssue[];
  validateMetadata(value: unknown): TrafficIssue[];
  validateEffectiveSnapshot(value: unknown): TrafficIssue[];
  validateView(value: unknown): TrafficIssue[];
  validateRestore(source: unknown, existingIds: ReadonlySet<string>): TrafficIssue[];
  validateDraftDelete(source: unknown): TrafficIssue[];
}

const VERSION_ID = /^[a-z][a-z0-9-]*$/;
const valuesValidator = createTrafficOverrideValidator();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isText = (value: unknown): value is string => typeof value === "string";

export function isTrafficVersionStatus(value: string): value is TrafficVersionStatus {
  return (TRAFFIC_VERSION_STATUSES as readonly string[]).includes(value);
}

export function createTrafficVersionValidator(): TrafficVersionValidator {
  function validateVersionId(value: unknown, existingIds: ReadonlySet<string> = new Set()): TrafficIssue[] {
    if (!isText(value) || value.trim() === "") {
      return [{ field: "versionId", message: "Missing snapshot: a version id is required." }];
    }
    if (value !== value.trim() || !VERSION_ID.test(value)) {
      return [{ field: "versionId", message: `Invalid restore: "${value}" is not a well-formed version id.` }];
    }
    if (existingIds.has(value)) {
      return [{ field: "versionId", message: `Duplicate version ids: "${value}" is already stored.` }];
    }
    return [];
  }

  function validateMetadata(value: unknown): TrafficIssue[] {
    if (value === undefined) return [];
    if (!isFlatTrafficMetadata(value)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat object of strings, numbers, booleans, or null with non-empty keys is required." }];
    }
    return [];
  }

  function validateEffectiveSnapshot(value: unknown): TrafficIssue[] {
    if (value === undefined || value === null) {
      return [{ field: "effectiveSnapshot", message: "Missing snapshot: an effective snapshot is required." }];
    }
    const issues = valuesValidator.validateValues(value);
    return issues.map((issue) =>
      issue.message.startsWith("Invalid metadata")
        ? issue
        : { field: issue.field, message: issue.message.startsWith("Invalid") ? issue.message : `Missing snapshot: ${issue.message}` },
    );
  }

  function validateView(value: unknown): TrafficIssue[] {
    if (value === undefined || value === null || !isPlainObject(value)) {
      return [{ field: "effectiveView", message: "Missing snapshot: an effective snapshot is required." }];
    }
    if (typeof value.analysisId !== "string" || value.analysisId.trim() === "") {
      return [{ field: "analysisId", message: "Missing snapshot: the generated reference must name an analysis." }];
    }
    if (value.candidateId !== null && (typeof value.candidateId !== "string" || value.candidateId.trim() === "")) {
      return [{ field: "candidateId", message: "Missing snapshot: candidateId must be non-empty text or null." }];
    }
    const issues: TrafficIssue[] = [];
    issues.push(...validateEffectiveSnapshot(value.effective));
    if (value.generated === undefined || value.generated === null) {
      issues.push({ field: "generated", message: "Missing snapshot: generated overlay values are required." });
    } else {
      issues.push(...valuesValidator.validateValues(value.generated));
    }
    if (value.overrides !== undefined) issues.push(...valuesValidator.validatePatch(value.overrides));
    if (value.overriddenFields !== undefined) {
      if (!Array.isArray(value.overriddenFields) || !value.overriddenFields.every((field) => typeof field === "string" && isTrafficOverrideField(field))) {
        issues.push({ field: "overriddenFields", message: "Invalid restore: overriddenFields must be a list of editable field names." });
      } else {
        const expected = TRAFFIC_OVERRIDE_FIELDS.filter(
          (field) => isPlainObject(value.overrides) && Object.prototype.hasOwnProperty.call(value.overrides, field) && (value.overrides as Record<string, unknown>)[field] !== undefined,
        );
        if (expected.join() !== (value.overriddenFields as string[]).join()) {
          issues.push({ field: "overriddenFields", message: "Invalid restore: overriddenFields must match the override keys." });
        }
      }
    }
    return issues;
  }

  function validateRestore(source: unknown, existingIds: ReadonlySet<string>): TrafficIssue[] {
    if (source === undefined || source === null) {
      return [{ field: "versionId", message: "Invalid restore: a stored version is required." }];
    }
    if (!isPlainObject(source) || typeof source.versionId !== "string") {
      return [{ field: "versionId", message: "Invalid restore: the source is not a stored version." }];
    }
    if (!existingIds.has(source.versionId)) {
      return [{ field: "versionId", message: `Invalid restore: version "${source.versionId}" was not found.` }];
    }
    if (typeof source.analysisId !== "string" || source.analysisId.trim() === "") {
      return [{ field: "analysisId", message: "Invalid restore: the source does not name an analysis." }];
    }
    if (source.effectiveSnapshot === undefined || source.effectiveSnapshot === null) {
      return [{ field: "effectiveSnapshot", message: "Missing snapshot: the version carries no effective snapshot." }];
    }
    return validateEffectiveSnapshot(source.effectiveSnapshot);
  }

  function validateDraftDelete(source: unknown): TrafficIssue[] {
    if (source === undefined || source === null || !isPlainObject(source) || typeof source.versionId !== "string") {
      return [{ field: "versionId", message: "Invalid restore: a stored version is required." }];
    }
    if (source.status !== "DRAFT") {
      return [{ field: "status", message: `Invalid restore: version "${source.versionId}" is not a draft snapshot and cannot be deleted.` }];
    }
    return [];
  }

  return { validateVersionId, validateMetadata, validateEffectiveSnapshot, validateView, validateRestore, validateDraftDelete };
}

export type { TrafficIssue, TrafficVersion };
