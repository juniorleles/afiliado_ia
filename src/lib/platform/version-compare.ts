/**
 * Platform Versioning Framework: compare.
 *
 * Places two versions side by side. Field, object, metadata, and snapshot
 * differences are listed. The comparison is deterministic. Nothing here
 * changes a stored version or a snapshot.
 */
import {
  freezeDeepSnapshot,
  isPlainSnapshotObject,
  type PlatformSnapshot,
  type PlatformSnapshotJson,
} from "./snapshot-types";
import type { PlatformVersion } from "./version-validator";

export const PLATFORM_COMPARE_KINDS = ["FIELD", "OBJECT", "METADATA", "SNAPSHOT"] as const;
export type PlatformCompareKind = (typeof PLATFORM_COMPARE_KINDS)[number];

export interface PlatformCompareRow {
  path: string;
  kind: PlatformCompareKind;
  from: string;
  to: string;
  changed: boolean;
}

export interface PlatformVersionCompare {
  fromVersionId: string;
  toVersionId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  snapshotChanged: boolean;
  fieldChanged: boolean;
  objectChanged: boolean;
  metadataChanged: boolean;
  changedPaths: string[];
  rows: PlatformCompareRow[];
}

export function canonicalPlatformVersionValue(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]));
    }
    return inner;
  });
}

function display(value: unknown): string {
  if (value === undefined) return "(none)";
  const text = canonicalPlatformVersionValue(value);
  return text === undefined ? "(none)" : text;
}

function row(path: string, kind: PlatformCompareKind, from: unknown, to: unknown): PlatformCompareRow {
  const left = display(from);
  const right = display(to);
  return { path, kind, from: left, to: right, changed: left !== right };
}

function walkPayload(path: string, from: unknown, to: unknown, rows: PlatformCompareRow[]): void {
  const bothObjects = isPlainSnapshotObject(from) && isPlainSnapshotObject(to);
  if (path !== "payload" && bothObjects) {
    rows.push(row(path, "OBJECT", from, to));
  }
  if (bothObjects) {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of [...keys].sort()) {
      const next = path === "" ? key : `${path}.${key}`;
      walkPayload(next, (from as Record<string, PlatformSnapshotJson>)[key], (to as Record<string, PlatformSnapshotJson>)[key], rows);
    }
    return;
  }
  if (path !== "") rows.push(row(path, "FIELD", from, to));
}

function walkMetadata(prefix: string, from: unknown, to: unknown, rows: PlatformCompareRow[]): void {
  const left = isPlainSnapshotObject(from) ? from : {};
  const right = isPlainSnapshotObject(to) ? to : {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) {
    rows.push(row(`${prefix}.${key}`, "METADATA", left[key], right[key]));
  }
}

export function createPlatformVersionCompare(): { compare(from: PlatformVersion, to: PlatformVersion, fromSnapshot: PlatformSnapshot, toSnapshot: PlatformSnapshot): PlatformVersionCompare } {
  function compare(from: PlatformVersion, to: PlatformVersion, fromSnapshot: PlatformSnapshot, toSnapshot: PlatformSnapshot): PlatformVersionCompare {
    const rows: PlatformCompareRow[] = [];
    rows.push(row("snapshot.snapshotId", "SNAPSHOT", fromSnapshot.snapshotId, toSnapshot.snapshotId));
    rows.push(row("snapshot.snapshotType", "SNAPSHOT", fromSnapshot.snapshotType, toSnapshot.snapshotType));
    rows.push(row("snapshot.version", "SNAPSHOT", fromSnapshot.version, toSnapshot.version));
    rows.push(row("snapshot.payload", "SNAPSHOT", fromSnapshot.payload, toSnapshot.payload));
    walkPayload("payload", fromSnapshot.payload, toSnapshot.payload, rows);
    walkMetadata("metadata", from.metadata, to.metadata, rows);
    walkMetadata("snapshot.metadata", fromSnapshot.metadata, toSnapshot.metadata, rows);
    const changed = rows.filter((item) => item.changed);
    return freezeDeepSnapshot({
      fromVersionId: from.versionId,
      toVersionId: to.versionId,
      fromSnapshotId: from.snapshotId,
      toSnapshotId: to.snapshotId,
      snapshotChanged: changed.some((item) => item.kind === "SNAPSHOT"),
      fieldChanged: changed.some((item) => item.kind === "FIELD"),
      objectChanged: changed.some((item) => item.kind === "OBJECT"),
      metadataChanged: changed.some((item) => item.kind === "METADATA"),
      changedPaths: changed.map((item) => item.path),
      rows,
    });
  }

  return { compare };
}

export function comparePlatformVersions(
  from: PlatformVersion,
  to: PlatformVersion,
  fromSnapshot: PlatformSnapshot,
  toSnapshot: PlatformSnapshot,
): PlatformVersionCompare {
  return createPlatformVersionCompare().compare(from, to, fromSnapshot, toSnapshot);
}
