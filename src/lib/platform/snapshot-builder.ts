/**
 * Platform Snapshot Framework: builder.
 *
 * Turns a draft into a frozen snapshot. The payload is copied, then frozen.
 * The builder never mutates the draft, never throws, and never names a
 * product engine.
 */
import {
  cloneSnapshotMetadata,
  cloneSnapshotPayload,
  freezeDeepSnapshot,
  isDeepFrozenSnapshot,
  isPlatformSnapshotPayload,
  type PlatformSnapshot,
  type PlatformSnapshotDraft,
  type PlatformSnapshotIssue,
  type PlatformSnapshotMetadata,
} from "./snapshot-types";
import { createPlatformSnapshotValidator } from "./snapshot-validator";

export type PlatformSnapshotBuildStatus = "OK" | "REJECTED";

export interface PlatformSnapshotBuildResult {
  status: PlatformSnapshotBuildStatus;
  issues: PlatformSnapshotIssue[];
  snapshot: PlatformSnapshot | null;
}

export interface PlatformSnapshotBuilderOptions {
  timestamp?: () => string;
  idFactory?: () => string;
}

export interface PlatformSnapshotBuilder {
  create(draft: PlatformSnapshotDraft): PlatformSnapshotBuildResult;
  freeze(snapshot: PlatformSnapshot): PlatformSnapshot;
  clone(snapshot: PlatformSnapshot, next: { snapshotId: string; timestamp?: string; author?: string }): PlatformSnapshotBuildResult;
}

let snapshotSerial = 0;

export function createPlatformSnapshotBuilder(options: PlatformSnapshotBuilderOptions = {}): PlatformSnapshotBuilder {
  const validator = createPlatformSnapshotValidator();
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? (() => `snap-${++snapshotSerial}`);

  function envelope(input: {
    snapshotId: string;
    snapshotType: string;
    version: number;
    timestamp: string;
    author: string;
    metadata: PlatformSnapshotMetadata;
    payload: PlatformSnapshot["payload"];
  }): PlatformSnapshot {
    return freezeDeepSnapshot({
      snapshotId: input.snapshotId,
      snapshotType: input.snapshotType,
      version: input.version,
      timestamp: input.timestamp,
      author: input.author.trim(),
      metadata: freezeDeepSnapshot(cloneSnapshotMetadata(input.metadata)),
      payload: freezeDeepSnapshot(cloneSnapshotPayload(input.payload)),
    });
  }

  function create(draft: PlatformSnapshotDraft): PlatformSnapshotBuildResult {
    const issues = validator.validateDraft(draft);
    if (issues.length > 0) return { status: "REJECTED", issues, snapshot: null };
    if (!isPlatformSnapshotPayload(draft.payload)) {
      return { status: "REJECTED", issues: [{ field: "payload", message: "Invalid snapshot: payload must be a plain nested record of JSON values." }], snapshot: null };
    }
    const snapshot = envelope({
      snapshotId: draft.snapshotId ?? idFactory(),
      snapshotType: draft.snapshotType,
      version: draft.version ?? 1,
      timestamp: draft.timestamp ?? timestamp(),
      author: draft.author,
      metadata: draft.metadata ?? {},
      payload: draft.payload,
    });
    return { status: "OK", issues: [], snapshot };
  }

  function freeze(snapshot: PlatformSnapshot): PlatformSnapshot {
    return envelope({
      snapshotId: snapshot.snapshotId,
      snapshotType: snapshot.snapshotType,
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      author: snapshot.author,
      metadata: snapshot.metadata,
      payload: snapshot.payload,
    });
  }

  function clone(
    snapshot: PlatformSnapshot,
    next: { snapshotId: string; timestamp?: string; author?: string },
  ): PlatformSnapshotBuildResult {
    const frozen = isDeepFrozenSnapshot(snapshot) ? snapshot : freeze(snapshot);
    const issues = validator.validateSnapshot(frozen);
    if (issues.length > 0) return { status: "REJECTED", issues, snapshot: null };
    const drafted: PlatformSnapshotDraft = {
      snapshotId: next.snapshotId,
      snapshotType: frozen.snapshotType,
      version: frozen.version,
      timestamp: next.timestamp ?? timestamp(),
      author: next.author ?? frozen.author,
      metadata: frozen.metadata,
      payload: cloneSnapshotPayload(frozen.payload),
    };
    return create(drafted);
  }

  return { create, freeze, clone };
}
