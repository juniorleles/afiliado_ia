/**
 * Platform Versioning Framework: history.
 *
 * Lists stored versions, oldest first. The list is a copy. Nothing here
 * changes a version or a snapshot.
 */
import { clonePlatformVersion, type PlatformVersion } from "./version-validator";

export interface PlatformVersionHistory {
  list(versions: readonly PlatformVersion[], snapshotId?: string): PlatformVersion[];
  latest(versions: readonly PlatformVersion[], snapshotId?: string): PlatformVersion | null;
  get(versions: readonly PlatformVersion[], versionId: string): PlatformVersion | null;
}

function byTimeThenId(left: PlatformVersion, right: PlatformVersion): number {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  if (left.versionId < right.versionId) return -1;
  if (left.versionId > right.versionId) return 1;
  return 0;
}

export function createPlatformVersionHistory(): PlatformVersionHistory {
  return {
    list(versions, snapshotId) {
      const filtered = snapshotId === undefined ? [...versions] : versions.filter((item) => item.snapshotId === snapshotId);
      return filtered.sort(byTimeThenId).map((item) => clonePlatformVersion(item));
    },
    latest(versions, snapshotId) {
      const listed = this.list(versions, snapshotId);
      return listed.length > 0 ? listed[listed.length - 1] : null;
    },
    get(versions, versionId) {
      const found = versions.find((item) => item.versionId === versionId);
      return found ? clonePlatformVersion(found) : null;
    },
  };
}
