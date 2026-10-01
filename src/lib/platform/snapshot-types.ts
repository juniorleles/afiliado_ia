/**
 * Platform Snapshot Framework: types.
 *
 * A snapshot is an immutable envelope: an id, a type, a version, a timestamp,
 * an author, flat metadata, and a frozen payload. This file names none of the
 * product engines. A caller supplies a type id; the framework does not know a
 * page, an analysis, or an advertising platform.
 */

export interface PlatformSnapshotIssue {
  field: string;
  message: string;
}

export type PlatformSnapshotScalar = string | number | boolean | null;
export type PlatformSnapshotMetadata = Record<string, PlatformSnapshotScalar>;
export type PlatformSnapshotJson =
  | PlatformSnapshotScalar
  | readonly PlatformSnapshotJson[]
  | { readonly [key: string]: PlatformSnapshotJson };
export type PlatformSnapshotPayload = { readonly [key: string]: PlatformSnapshotJson };

export const PLATFORM_SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
export const PLATFORM_SNAPSHOT_TYPE = /^[a-z][a-z0-9-]*$/;
export const PLATFORM_SNAPSHOT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface PlatformSnapshot {
  snapshotId: string;
  snapshotType: string;
  version: number;
  timestamp: string;
  author: string;
  metadata: PlatformSnapshotMetadata;
  payload: PlatformSnapshotPayload;
}

export interface PlatformSnapshotDraft {
  snapshotId?: string;
  snapshotType: string;
  version?: number;
  timestamp?: string;
  author: string;
  metadata?: PlatformSnapshotMetadata;
  payload: unknown;
}

export interface PlatformSnapshotIdentity {
  snapshotId: string;
  snapshotType: string;
  version: number;
}

export function isPlatformSnapshotId(value: string): boolean {
  return PLATFORM_SNAPSHOT_ID.test(value);
}

export function isPlatformSnapshotType(value: string): boolean {
  return PLATFORM_SNAPSHOT_TYPE.test(value);
}

export function isPlatformSnapshotTimestamp(value: string): boolean {
  return PLATFORM_SNAPSHOT_TIMESTAMP.test(value);
}

export function isPlatformSnapshotVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function isPlainSnapshotObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isPlatformSnapshotScalar(value: unknown): value is PlatformSnapshotScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  return typeof value === "number" && Number.isFinite(value);
}

export function isPlatformSnapshotMetadata(value: unknown): value is PlatformSnapshotMetadata {
  if (!isPlainSnapshotObject(value)) return false;
  return Object.entries(value).every(([key, inner]) => key.trim() !== "" && isPlatformSnapshotScalar(inner));
}

export function isPlatformSnapshotJson(value: unknown): value is PlatformSnapshotJson {
  if (isPlatformSnapshotScalar(value)) return true;
  if (Array.isArray(value)) return value.every((item) => isPlatformSnapshotJson(item));
  if (!isPlainSnapshotObject(value)) return false;
  return Object.values(value).every((inner) => isPlatformSnapshotJson(inner));
}

export function isPlatformSnapshotPayload(value: unknown): value is PlatformSnapshotPayload {
  if (!isPlainSnapshotObject(value)) return false;
  return Object.values(value).every((inner) => isPlatformSnapshotJson(inner));
}

export function cloneSnapshotJson(value: PlatformSnapshotJson): PlatformSnapshotJson {
  if (Array.isArray(value)) return value.map((item) => cloneSnapshotJson(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, cloneSnapshotJson(inner)]));
  }
  return value;
}

export function cloneSnapshotPayload(payload: PlatformSnapshotPayload): PlatformSnapshotPayload {
  return Object.fromEntries(Object.entries(payload).map(([key, inner]) => [key, cloneSnapshotJson(inner)]));
}

export function cloneSnapshotMetadata(metadata: PlatformSnapshotMetadata): PlatformSnapshotMetadata {
  return { ...metadata };
}

export function freezeDeepSnapshot<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeDeepSnapshot(inner);
  }
  return value;
}

export function isDeepFrozenSnapshot(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((inner) => isDeepFrozenSnapshot(inner));
}

export function snapshotIdentityOf(snapshot: PlatformSnapshotIdentity): PlatformSnapshotIdentity {
  return {
    snapshotId: snapshot.snapshotId,
    snapshotType: snapshot.snapshotType,
    version: snapshot.version,
  };
}

export function sameSnapshotIdentity(left: PlatformSnapshotIdentity, right: PlatformSnapshotIdentity): boolean {
  return left.snapshotId === right.snapshotId && left.snapshotType === right.snapshotType && left.version === right.version;
}
