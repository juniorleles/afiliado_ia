/**
 * Platform Snapshot Framework.
 *
 * Generic immutable snapshots for any platform module. Create, clone, freeze,
 * validate, and compare identity. Nothing here knows a product, a page, an
 * analysis, or an advertising platform. This is not a version history.
 */
import { createPlatformSnapshotBuilder, type PlatformSnapshotBuilder, type PlatformSnapshotBuilderOptions, type PlatformSnapshotBuildResult } from "./snapshot-builder";
import { createPlatformSnapshotRegistry, type PlatformSnapshotRegistry, type PlatformSnapshotRegistryResult } from "./snapshot-registry";
import { sameSnapshotIdentity, snapshotIdentityOf, type PlatformSnapshot, type PlatformSnapshotDraft, type PlatformSnapshotIdentity, type PlatformSnapshotIssue } from "./snapshot-types";
import { createPlatformSnapshotValidator, type PlatformSnapshotValidator } from "./snapshot-validator";

export type { PlatformSnapshotBuildResult, PlatformSnapshotBuilder, PlatformSnapshotBuilderOptions } from "./snapshot-builder";
export { createPlatformSnapshotBuilder } from "./snapshot-builder";
export type { PlatformSnapshotRegistry, PlatformSnapshotRegistryResult } from "./snapshot-registry";
export { createPlatformSnapshotRegistry } from "./snapshot-registry";
export type {
  PlatformSnapshot,
  PlatformSnapshotDraft,
  PlatformSnapshotIdentity,
  PlatformSnapshotIssue,
  PlatformSnapshotMetadata,
  PlatformSnapshotPayload,
} from "./snapshot-types";
export {
  freezeDeepSnapshot,
  isDeepFrozenSnapshot,
  isPlatformSnapshotMetadata,
  sameSnapshotIdentity,
  snapshotIdentityOf,
} from "./snapshot-types";
export type { PlatformSnapshotValidator } from "./snapshot-validator";
export { createPlatformSnapshotValidator } from "./snapshot-validator";

export type PlatformSnapshotActionStatus = "OK" | "REJECTED";

export interface PlatformSnapshotActionResult {
  status: PlatformSnapshotActionStatus;
  issues: PlatformSnapshotIssue[];
  snapshot: PlatformSnapshot | null;
}

export interface PlatformSnapshotFramework {
  readonly validator: PlatformSnapshotValidator;
  readonly builder: PlatformSnapshotBuilder;
  readonly registry: PlatformSnapshotRegistry;
  create(draft: PlatformSnapshotDraft): PlatformSnapshotActionResult;
  clone(snapshotId: string, next: { snapshotId: string; timestamp?: string; author?: string }): PlatformSnapshotActionResult;
  freeze(snapshot: PlatformSnapshot): PlatformSnapshot;
  validate(snapshot: unknown): PlatformSnapshotIssue[];
  get(snapshotId: string): PlatformSnapshot | null;
  list(): readonly PlatformSnapshot[];
  listByType(snapshotType: string): readonly PlatformSnapshot[];
  sameIdentity(left: PlatformSnapshotIdentity, right: PlatformSnapshotIdentity): boolean;
  identityOf(snapshot: PlatformSnapshotIdentity): PlatformSnapshotIdentity;
}

export function createPlatformSnapshotFramework(options: PlatformSnapshotBuilderOptions = {}): PlatformSnapshotFramework {
  const validator = createPlatformSnapshotValidator();
  const builder = createPlatformSnapshotBuilder(options);
  const registry = createPlatformSnapshotRegistry();

  function toAction(result: PlatformSnapshotBuildResult | PlatformSnapshotRegistryResult): PlatformSnapshotActionResult {
    return { status: result.status, issues: result.issues, snapshot: result.snapshot };
  }

  function create(draft: PlatformSnapshotDraft): PlatformSnapshotActionResult {
    const built = builder.create(draft);
    if (built.status === "REJECTED" || built.snapshot === null) return toAction(built);
    return toAction(registry.register(built.snapshot));
  }

  function clone(snapshotId: string, next: { snapshotId: string; timestamp?: string; author?: string }): PlatformSnapshotActionResult {
    const source = registry.get(snapshotId);
    if (source === null) {
      return {
        status: "REJECTED",
        issues: [{ field: "snapshotId", message: `Invalid snapshot: "${snapshotId}" is not stored.` }],
        snapshot: null,
      };
    }
    const built = builder.clone(source, next);
    if (built.status === "REJECTED" || built.snapshot === null) return toAction(built);
    return toAction(registry.register(built.snapshot));
  }

  return {
    validator,
    builder,
    registry,
    create,
    clone,
    freeze: (snapshot) => builder.freeze(snapshot),
    validate: (snapshot) => validator.validateSnapshot(snapshot),
    get: (snapshotId) => registry.get(snapshotId),
    list: () => registry.list(),
    listByType: (snapshotType) => registry.listByType(snapshotType),
    sameIdentity: (left, right) => sameSnapshotIdentity(left, right),
    identityOf: (snapshot) => snapshotIdentityOf(snapshot),
  };
}
