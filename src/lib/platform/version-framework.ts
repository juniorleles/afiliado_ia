/**
 * Platform Versioning Framework.
 *
 * Generic version history for any platform module. Create, list, compare,
 * restore, duplicate, delete a draft, and preview. Restore writes a new
 * immutable version; previous versions stay as they were. Nothing here knows
 * a product, a page, an analysis, or an advertising platform.
 */
import type { PlatformSnapshotBuilderOptions } from "./snapshot-builder";
import { createPlatformSnapshotFramework, type PlatformSnapshotFramework } from "./snapshot-framework";
import { createPlatformVersionRestore, type PlatformVersionRestore } from "./version-restore";
import { createPlatformVersionStore, type PlatformVersionActionResult, type PlatformVersionCreateInput, type PlatformVersionStore } from "./version-store";
import type { PlatformVersionHistory } from "./version-history";
import type { PlatformVersion, PlatformVersionValidator } from "./version-validator";

export type { PlatformVersionActionResult, PlatformVersionCreateInput, PlatformVersionStore } from "./version-store";
export { createPlatformVersionStore } from "./version-store";
export type { PlatformVersionHistory } from "./version-history";
export { createPlatformVersionHistory } from "./version-history";
export type { PlatformCompareKind, PlatformCompareRow, PlatformVersionCompare } from "./version-compare";
export { comparePlatformVersions, createPlatformVersionCompare } from "./version-compare";
export type { PlatformRestoreInput, PlatformVersionRestore } from "./version-restore";
export { createPlatformVersionRestore } from "./version-restore";
export type {
  PlatformVersion,
  PlatformVersionDraft,
  PlatformVersionIssue,
  PlatformVersionMetadata,
  PlatformVersionOrigin,
  PlatformVersionStatus,
  PlatformVersionValidator,
} from "./version-validator";
export {
  clonePlatformVersion,
  createPlatformVersionValidator,
  freezeDeepSnapshot,
  isDeepFrozenSnapshot,
  PLATFORM_VERSION_ORIGINS,
  PLATFORM_VERSION_STATUSES,
} from "./version-validator";

export interface PlatformVersionFrameworkOptions extends PlatformSnapshotBuilderOptions {
  snapshots?: PlatformSnapshotFramework;
}

export interface PlatformVersionFramework {
  readonly snapshots: PlatformSnapshotFramework;
  readonly store: PlatformVersionStore;
  readonly validator: PlatformVersionValidator;
  readonly history: PlatformVersionHistory;
  readonly restore: PlatformVersionRestore;
  createVersion(input: PlatformVersionCreateInput): PlatformVersionActionResult;
  listVersions(snapshotId?: string): PlatformVersion[];
  compareVersions(fromVersionId: string, toVersionId: string): PlatformVersionActionResult;
  restoreVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult;
  duplicateVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult;
  deleteDraftVersion(versionId: string): PlatformVersionActionResult;
  previewVersion(versionId: string): PlatformVersionActionResult;
  get(versionId: string): PlatformVersion | null;
}

export function createPlatformVersionFramework(options: PlatformVersionFrameworkOptions = {}): PlatformVersionFramework {
  const snapshots = options.snapshots ?? createPlatformSnapshotFramework({ timestamp: options.timestamp, idFactory: options.idFactory });
  const store = createPlatformVersionStore({
    snapshots,
    timestamp: options.timestamp,
    idFactory: options.idFactory,
  });

  return {
    snapshots,
    store,
    validator: store.validator,
    history: store.history,
    restore: createPlatformVersionRestore(),
    createVersion: (input) => store.createVersion(input),
    listVersions: (snapshotId) => store.listVersions(snapshotId),
    compareVersions: (from, to) => store.compareVersions(from, to),
    restoreVersion: (versionId, author, reason) => store.restoreVersion(versionId, author, reason),
    duplicateVersion: (versionId, author, reason) => store.duplicateVersion(versionId, author, reason),
    deleteDraftVersion: (versionId) => store.deleteDraftVersion(versionId),
    previewVersion: (versionId) => store.previewVersion(versionId),
    get: (versionId) => store.get(versionId),
  };
}
