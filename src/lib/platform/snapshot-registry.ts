/**
 * Platform Snapshot Framework: registry.
 *
 * Holds frozen snapshots by id. A second snapshot with the same id is
 * rejected. The registry never mutates a stored payload, never throws, and
 * never names a product engine. It is not a version history.
 */
import type { PlatformSnapshot, PlatformSnapshotIssue } from "./snapshot-types";
import { createPlatformSnapshotValidator } from "./snapshot-validator";

export type PlatformSnapshotRegistryStatus = "OK" | "REJECTED";

export interface PlatformSnapshotRegistryResult {
  status: PlatformSnapshotRegistryStatus;
  issues: PlatformSnapshotIssue[];
  snapshot: PlatformSnapshot | null;
}

export interface PlatformSnapshotRegistry {
  register(snapshot: PlatformSnapshot): PlatformSnapshotRegistryResult;
  get(snapshotId: string): PlatformSnapshot | null;
  has(snapshotId: string): boolean;
  list(): readonly PlatformSnapshot[];
  listByType(snapshotType: string): readonly PlatformSnapshot[];
  ids(): ReadonlySet<string>;
}

export function createPlatformSnapshotRegistry(): PlatformSnapshotRegistry {
  const validator = createPlatformSnapshotValidator();
  const byId = new Map<string, PlatformSnapshot>();

  function register(snapshot: PlatformSnapshot): PlatformSnapshotRegistryResult {
    const issues = [
      ...validator.validateSnapshot(snapshot),
      ...validator.validateUniqueId(snapshot.snapshotId, new Set(byId.keys())),
    ];
    if (issues.length > 0) return { status: "REJECTED", issues, snapshot: null };
    byId.set(snapshot.snapshotId, snapshot);
    return { status: "OK", issues: [], snapshot };
  }

  function get(snapshotId: string): PlatformSnapshot | null {
    return byId.get(snapshotId) ?? null;
  }

  function has(snapshotId: string): boolean {
    return byId.has(snapshotId);
  }

  function list(): readonly PlatformSnapshot[] {
    return [...byId.values()];
  }

  function listByType(snapshotType: string): readonly PlatformSnapshot[] {
    return [...byId.values()].filter((item) => item.snapshotType === snapshotType);
  }

  function ids(): ReadonlySet<string> {
    return new Set(byId.keys());
  }

  return { register, get, has, list, listByType, ids };
}
