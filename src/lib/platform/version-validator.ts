/**
 * Platform Versioning Framework: validator.
 *
 * Rejects a duplicate version id, an invalid parent, a circular restore, invalid
 * metadata, and a missing snapshot. It reports problems and never throws or
 * changes its input. Nothing here knows a product engine.
 */
import {
  freezeDeepSnapshot,
  isPlatformSnapshotId,
  isPlatformSnapshotMetadata,
  isPlatformSnapshotTimestamp,
  isPlainSnapshotObject,
  type PlatformSnapshotMetadata,
} from "./snapshot-types";

export interface PlatformVersionIssue {
  field: string;
  message: string;
}

export const PLATFORM_VERSION_ID = /^[a-z][a-z0-9-]*$/;
export const PLATFORM_VERSION_STATUSES = ["DRAFT", "COMMITTED"] as const;
export type PlatformVersionStatus = (typeof PLATFORM_VERSION_STATUSES)[number];
export const PLATFORM_VERSION_ORIGINS = ["CREATE", "DUPLICATE", "RESTORE"] as const;
export type PlatformVersionOrigin = (typeof PLATFORM_VERSION_ORIGINS)[number];

export type PlatformVersionMetadata = PlatformSnapshotMetadata;

export interface PlatformVersion {
  versionId: string;
  snapshotId: string;
  parentVersionId: string | null;
  createdAt: string;
  author: string;
  reason: string;
  metadata: PlatformVersionMetadata;
  status: PlatformVersionStatus;
  origin: PlatformVersionOrigin;
  restoreSource: string | null;
  branch: string | null;
}

export interface PlatformVersionDraft {
  versionId?: string;
  snapshotId: string;
  parentVersionId?: string | null;
  createdAt?: string;
  author: string;
  reason: string;
  metadata?: PlatformVersionMetadata;
  status?: PlatformVersionStatus;
  origin?: PlatformVersionOrigin;
  restoreSource?: string | null;
  branch?: string | null;
}

export interface PlatformVersionValidator {
  validateVersionId(value: unknown, existingIds?: ReadonlySet<string>): PlatformVersionIssue[];
  validateMetadata(value: unknown): PlatformVersionIssue[];
  validateParent(parentVersionId: string | null, versionId: string, versions: readonly PlatformVersion[]): PlatformVersionIssue[];
  validateSnapshotId(snapshotId: unknown, knownSnapshotIds: ReadonlySet<string>): PlatformVersionIssue[];
  validateRestore(source: unknown, existingIds: ReadonlySet<string>, knownSnapshotIds: ReadonlySet<string>): PlatformVersionIssue[];
  validateDraftDelete(source: unknown, versions: readonly PlatformVersion[]): PlatformVersionIssue[];
  validateVersion(value: unknown, existingIds?: ReadonlySet<string>, knownSnapshotIds?: ReadonlySet<string>): PlatformVersionIssue[];
}

function issue(field: string, message: string): PlatformVersionIssue {
  return { field, message };
}

export function isPlatformVersionId(value: string): boolean {
  return PLATFORM_VERSION_ID.test(value);
}

export function isPlatformVersionStatus(value: unknown): value is PlatformVersionStatus {
  return typeof value === "string" && (PLATFORM_VERSION_STATUSES as readonly string[]).includes(value);
}

export function isPlatformVersionOrigin(value: unknown): value is PlatformVersionOrigin {
  return typeof value === "string" && (PLATFORM_VERSION_ORIGINS as readonly string[]).includes(value);
}

export function clonePlatformVersion(version: PlatformVersion): PlatformVersion {
  return freezeDeepSnapshot({
    versionId: version.versionId,
    snapshotId: version.snapshotId,
    parentVersionId: version.parentVersionId,
    createdAt: version.createdAt,
    author: version.author,
    reason: version.reason,
    metadata: { ...version.metadata },
    status: version.status,
    origin: version.origin,
    restoreSource: version.restoreSource,
    branch: version.branch,
  });
}

export function createPlatformVersionEnvelope(input: PlatformVersion): PlatformVersion {
  return clonePlatformVersion(input);
}

function parentById(versions: readonly PlatformVersion[]): Map<string, PlatformVersion> {
  return new Map(versions.map((item) => [item.versionId, item]));
}

function lineageCycle(versionId: string, parentVersionId: string | null, versions: readonly PlatformVersion[]): boolean {
  const known = parentById(versions);
  const seen = new Set<string>([versionId]);
  let current = parentVersionId;
  while (current !== null) {
    if (seen.has(current)) return true;
    seen.add(current);
    const node = known.get(current);
    if (!node) return false;
    current = node.parentVersionId;
  }
  return false;
}

export function createPlatformVersionValidator(): PlatformVersionValidator {
  function validateVersionId(value: unknown, existingIds: ReadonlySet<string> = new Set()): PlatformVersionIssue[] {
    if (typeof value !== "string" || !isPlatformVersionId(value)) {
      return [issue("versionId", "Invalid version: a well-formed version id is required.")];
    }
    if (existingIds.has(value)) {
      return [issue("versionId", `Duplicate version ids: "${value}" is already stored.`)];
    }
    return [];
  }

  function validateMetadata(value: unknown): PlatformVersionIssue[] {
    if (value === undefined) return [];
    if (!isPlatformSnapshotMetadata(value)) {
      return [issue("metadata", "Invalid metadata: version metadata must be a flat record of text, numbers, booleans, or null.")];
    }
    return [];
  }

  function validateSnapshotId(snapshotId: unknown, knownSnapshotIds: ReadonlySet<string>): PlatformVersionIssue[] {
    if (typeof snapshotId !== "string" || !isPlatformSnapshotId(snapshotId)) {
      return [issue("snapshotId", "Missing snapshot: a well-formed snapshot id is required.")];
    }
    if (!knownSnapshotIds.has(snapshotId)) {
      return [issue("snapshotId", `Missing snapshot: "${snapshotId}" is not stored.`)];
    }
    return [];
  }

  function validateParent(parentVersionId: string | null, versionId: string, versions: readonly PlatformVersion[]): PlatformVersionIssue[] {
    if (parentVersionId === null) return [];
    if (!isPlatformVersionId(parentVersionId)) {
      return [issue("parentVersionId", "Invalid parent: a well-formed parent version id is required.")];
    }
    if (parentVersionId === versionId) {
      return [issue("parentVersionId", "Circular restore: a version cannot parent itself.")];
    }
    const parent = versions.find((item) => item.versionId === parentVersionId);
    if (!parent) {
      return [issue("parentVersionId", `Invalid parent: "${parentVersionId}" is not stored.`)];
    }
    if (lineageCycle(versionId, parentVersionId, versions)) {
      return [issue("parentVersionId", "Circular restore: the parent chain returns to this version.")];
    }
    return [];
  }

  function validateRestore(source: unknown, existingIds: ReadonlySet<string>, knownSnapshotIds: ReadonlySet<string>): PlatformVersionIssue[] {
    if (source === undefined || source === null) {
      return [issue("versionId", "Invalid parent: a stored version is required.")];
    }
    if (!isPlainSnapshotObject(source) || typeof source.versionId !== "string") {
      return [issue("versionId", "Invalid parent: the source is not a stored version.")];
    }
    if (!existingIds.has(source.versionId)) {
      return [issue("versionId", `Invalid parent: version "${source.versionId}" was not found.`)];
    }
    const issues = validateSnapshotId(source.snapshotId, knownSnapshotIds);
    if (issues.length > 0) return issues;
    if (source.restoreSource === source.versionId) {
      return [issue("restoreSource", "Circular restore: a version cannot restore itself.")];
    }
    return [];
  }

  function validateDraftDelete(source: unknown, versions: readonly PlatformVersion[]): PlatformVersionIssue[] {
    if (source === undefined || source === null || !isPlainSnapshotObject(source) || typeof source.versionId !== "string") {
      return [issue("versionId", "Invalid parent: a stored version is required.")];
    }
    if (source.status !== "DRAFT") {
      return [issue("status", `Invalid parent: version "${source.versionId}" is not a draft and cannot be deleted.`)];
    }
    if (versions.some((item) => item.parentVersionId === source.versionId)) {
      return [issue("parentVersionId", `Invalid parent: version "${source.versionId}" still has children.`)];
    }
    return [];
  }

  function validateVersion(value: unknown, existingIds: ReadonlySet<string> = new Set(), knownSnapshotIds: ReadonlySet<string> = new Set()): PlatformVersionIssue[] {
    if (!isPlainSnapshotObject(value)) {
      return [issue("version", "Invalid version: a version envelope is required.")];
    }
    const issues: PlatformVersionIssue[] = [];
    issues.push(...validateVersionId(value.versionId, existingIds));
    issues.push(...validateSnapshotId(value.snapshotId, knownSnapshotIds));
    const parent = value.parentVersionId === undefined ? null : value.parentVersionId;
    if (parent !== null && parent !== undefined) {
      if (typeof parent !== "string" || !isPlatformVersionId(parent)) {
        issues.push(issue("parentVersionId", "Invalid parent: a well-formed parent version id is required."));
      } else if (typeof value.versionId === "string" && parent === value.versionId) {
        issues.push(issue("parentVersionId", "Circular restore: a version cannot parent itself."));
      }
    }
    if (typeof value.createdAt !== "string" || !isPlatformSnapshotTimestamp(value.createdAt)) {
      issues.push(issue("createdAt", "Invalid version: createdAt must be an ISO-8601 instant in UTC."));
    }
    if (typeof value.author !== "string" || value.author.trim() === "") {
      issues.push(issue("author", "Invalid version: a non-empty author is required."));
    }
    if (typeof value.reason !== "string" || value.reason.trim() === "") {
      issues.push(issue("reason", "Invalid version: a non-empty reason is required."));
    }
    issues.push(...validateMetadata(value.metadata));
    if (value.status !== undefined && !isPlatformVersionStatus(value.status)) {
      issues.push(issue("status", "Invalid version: status must be DRAFT or COMMITTED."));
    }
    if (value.origin !== undefined && !isPlatformVersionOrigin(value.origin)) {
      issues.push(issue("origin", "Invalid version: origin must be CREATE, DUPLICATE, or RESTORE."));
    }
    if (value.restoreSource !== undefined && value.restoreSource !== null && (typeof value.restoreSource !== "string" || !isPlatformVersionId(value.restoreSource))) {
      issues.push(issue("restoreSource", "Circular restore: restoreSource must be a well-formed version id or null."));
    }
    if (value.branch !== undefined && value.branch !== null && (typeof value.branch !== "string" || !isPlatformVersionId(value.branch))) {
      issues.push(issue("branch", "Invalid metadata: branch must be a well-formed id or null."));
    }
    return issues;
  }

  return { validateVersionId, validateMetadata, validateParent, validateSnapshotId, validateRestore, validateDraftDelete, validateVersion };
}

export { freezeDeepSnapshot, isDeepFrozenSnapshot } from "./snapshot-types";
