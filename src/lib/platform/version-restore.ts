/**
 * Platform Versioning Framework: restore.
 *
 * Restore copies a stored version into a new immutable version. Previous
 * versions stay as they were. Duplicate does the same and marks a draft.
 * Nothing here names a product engine.
 */
import { cloneSnapshotMetadata } from "./snapshot-types";
import {
  createPlatformVersionEnvelope,
  type PlatformVersion,
  type PlatformVersionOrigin,
  type PlatformVersionStatus,
} from "./version-validator";

export interface PlatformRestoreInput {
  source: PlatformVersion;
  versionId: string;
  createdAt: string;
  author: string;
  reason: string;
  parentVersionId: string | null;
}

export interface PlatformVersionRestore {
  restore(input: PlatformRestoreInput): PlatformVersion;
  duplicate(input: PlatformRestoreInput): PlatformVersion;
}

function fromSource(input: PlatformRestoreInput, origin: PlatformVersionOrigin, status: PlatformVersionStatus): PlatformVersion {
  return createPlatformVersionEnvelope({
    versionId: input.versionId,
    snapshotId: input.source.snapshotId,
    parentVersionId: input.parentVersionId,
    createdAt: input.createdAt,
    author: input.author.trim(),
    reason: input.reason.trim(),
    metadata: cloneSnapshotMetadata(input.source.metadata),
    status,
    origin,
    restoreSource: origin === "RESTORE" ? input.source.versionId : null,
    branch: input.source.branch,
  });
}

export function createPlatformVersionRestore(): PlatformVersionRestore {
  return {
    restore(input) {
      return fromSource(input, "RESTORE", "COMMITTED");
    },
    duplicate(input) {
      return fromSource(input, "DUPLICATE", "DRAFT");
    },
  };
}
