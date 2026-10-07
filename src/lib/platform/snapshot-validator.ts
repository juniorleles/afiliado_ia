/**
 * Platform Snapshot Framework: validator.
 *
 * Rejects a duplicate snapshot id (when a known set is supplied), a mutable
 * payload, invalid metadata, and an invalid version. It reports problems and
 * never throws or changes its input. Nothing here knows a product engine.
 */
import {
  isDeepFrozenSnapshot,
  isPlatformSnapshotId,
  isPlatformSnapshotMetadata,
  isPlatformSnapshotPayload,
  isPlatformSnapshotTimestamp,
  isPlatformSnapshotType,
  isPlatformSnapshotVersion,
  isPlainSnapshotObject,
  type PlatformSnapshot,
  type PlatformSnapshotDraft,
  type PlatformSnapshotIssue,
} from "./snapshot-types";

export interface PlatformSnapshotValidator {
  validateDraft(value: unknown): PlatformSnapshotIssue[];
  validateSnapshot(value: unknown): PlatformSnapshotIssue[];
  validateMetadata(value: unknown): PlatformSnapshotIssue[];
  validateIdentity(value: unknown): PlatformSnapshotIssue[];
  validateUniqueId(snapshotId: string, knownIds: ReadonlySet<string>): PlatformSnapshotIssue[];
}

function issue(field: string, message: string): PlatformSnapshotIssue {
  return { field, message };
}

export function createPlatformSnapshotValidator(): PlatformSnapshotValidator {
  function validateMetadata(value: unknown): PlatformSnapshotIssue[] {
    if (value === undefined) return [];
    if (!isPlatformSnapshotMetadata(value)) {
      return [issue("metadata", "Invalid metadata: snapshot metadata must be a flat record of text, numbers, booleans, or null.")];
    }
    return [];
  }

  function validateIdentity(value: unknown): PlatformSnapshotIssue[] {
    if (!isPlainSnapshotObject(value)) {
      return [issue("identity", "Invalid snapshot: an identity of id, type, and version is required.")];
    }
    const issues: PlatformSnapshotIssue[] = [];
    if (typeof value.snapshotId !== "string" || !isPlatformSnapshotId(value.snapshotId)) {
      issues.push(issue("snapshotId", "Invalid snapshot: a well-formed snapshot id is required."));
    }
    if (typeof value.snapshotType !== "string" || !isPlatformSnapshotType(value.snapshotType)) {
      issues.push(issue("snapshotType", "Invalid snapshot: a well-formed snapshot type is required."));
    }
    if (!isPlatformSnapshotVersion(value.version)) {
      issues.push(issue("version", "Invalid version: snapshot version must be an integer of 1 or greater."));
    }
    return issues;
  }

  function validateUniqueId(snapshotId: string, knownIds: ReadonlySet<string>): PlatformSnapshotIssue[] {
    if (knownIds.has(snapshotId)) {
      return [issue("snapshotId", `Duplicate snapshot id: "${snapshotId}" is already stored.`)];
    }
    return [];
  }

  function validateDraft(value: unknown): PlatformSnapshotIssue[] {
    if (!isPlainSnapshotObject(value)) {
      return [issue("snapshot", "Invalid snapshot: a draft of type, author, and payload is required.")];
    }
    const draft = value as unknown as PlatformSnapshotDraft;
    const issues: PlatformSnapshotIssue[] = [];
    if (draft.snapshotId !== undefined && (typeof draft.snapshotId !== "string" || !isPlatformSnapshotId(draft.snapshotId))) {
      issues.push(issue("snapshotId", "Invalid snapshot: a well-formed snapshot id is required."));
    }
    if (typeof draft.snapshotType !== "string" || !isPlatformSnapshotType(draft.snapshotType)) {
      issues.push(issue("snapshotType", "Invalid snapshot: a well-formed snapshot type is required."));
    }
    if (draft.version !== undefined && !isPlatformSnapshotVersion(draft.version)) {
      issues.push(issue("version", "Invalid version: snapshot version must be an integer of 1 or greater."));
    }
    if (draft.timestamp !== undefined && (typeof draft.timestamp !== "string" || !isPlatformSnapshotTimestamp(draft.timestamp))) {
      issues.push(issue("timestamp", "Invalid snapshot: timestamp must be an ISO-8601 instant in UTC."));
    }
    if (typeof draft.author !== "string" || draft.author.trim() === "") {
      issues.push(issue("author", "Invalid snapshot: a non-empty author is required."));
    }
    issues.push(...validateMetadata(draft.metadata));
    if (!isPlatformSnapshotPayload(draft.payload)) {
      issues.push(issue("payload", "Invalid snapshot: payload must be a plain nested record of JSON values."));
    }
    return issues;
  }

  function validateSnapshot(value: unknown): PlatformSnapshotIssue[] {
    if (!isPlainSnapshotObject(value)) {
      return [issue("snapshot", "Invalid snapshot: a frozen snapshot envelope is required.")];
    }
    const snapshot = value as Partial<PlatformSnapshot>;
    const issues: PlatformSnapshotIssue[] = [];
    issues.push(...validateIdentity(snapshot));
    if (typeof snapshot.timestamp !== "string" || !isPlatformSnapshotTimestamp(snapshot.timestamp)) {
      issues.push(issue("timestamp", "Invalid snapshot: timestamp must be an ISO-8601 instant in UTC."));
    }
    if (typeof snapshot.author !== "string" || snapshot.author.trim() === "") {
      issues.push(issue("author", "Invalid snapshot: a non-empty author is required."));
    }
    issues.push(...validateMetadata(snapshot.metadata));
    if (!isPlatformSnapshotPayload(snapshot.payload)) {
      issues.push(issue("payload", "Invalid snapshot: payload must be a plain nested record of JSON values."));
    } else if (!isDeepFrozenSnapshot(snapshot.payload)) {
      issues.push(issue("payload", "Mutable payload: a snapshot payload must be frozen."));
    }
    if (!isDeepFrozenSnapshot(snapshot)) {
      issues.push(issue("snapshot", "Mutable payload: a snapshot envelope must be frozen."));
    }
    return issues;
  }

  return { validateDraft, validateSnapshot, validateMetadata, validateIdentity, validateUniqueId };
}
