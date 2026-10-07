/**
 * Platform Versioning Framework: store.
 *
 * Holds immutable versions keyed by version id. Create, list, compare, restore,
 * duplicate, delete draft, and preview never rewrite a stored snapshot and
 * never share another store's records.
 */
import type { PlatformSnapshotFramework } from "./snapshot-framework";
import { cloneSnapshotMetadata } from "./snapshot-types";
import { createPlatformVersionCompare, type PlatformVersionCompare } from "./version-compare";
import { createPlatformVersionHistory, type PlatformVersionHistory } from "./version-history";
import { createPlatformVersionRestore, type PlatformVersionRestore } from "./version-restore";
import {
  clonePlatformVersion,
  createPlatformVersionEnvelope,
  createPlatformVersionValidator,
  type PlatformVersion,
  type PlatformVersionIssue,
  type PlatformVersionMetadata,
  type PlatformVersionValidator,
} from "./version-validator";

export type PlatformVersionActionStatus = "OK" | "REJECTED";

export interface PlatformVersionActionResult {
  status: PlatformVersionActionStatus;
  issues: PlatformVersionIssue[];
  version: PlatformVersion | null;
  comparison: PlatformVersionCompare | null;
}

export interface PlatformVersionCreateInput {
  snapshotId: string;
  author: string;
  reason: string;
  metadata?: PlatformVersionMetadata;
  parentVersionId?: string | null;
  versionId?: string;
  draft?: boolean;
  branch?: string | null;
}

export interface PlatformVersionStoreOptions {
  snapshots: PlatformSnapshotFramework;
  validator?: PlatformVersionValidator;
  history?: PlatformVersionHistory;
  restore?: PlatformVersionRestore;
  timestamp?: () => string;
  idFactory?: () => string;
}

export interface PlatformVersionStore {
  readonly validator: PlatformVersionValidator;
  readonly history: PlatformVersionHistory;
  createVersion(input: unknown): PlatformVersionActionResult;
  listVersions(snapshotId?: string): PlatformVersion[];
  compareVersions(fromVersionId: string, toVersionId: string): PlatformVersionActionResult;
  restoreVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult;
  duplicateVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult;
  deleteDraftVersion(versionId: string): PlatformVersionActionResult;
  previewVersion(versionId: string): PlatformVersionActionResult;
  get(versionId: string): PlatformVersion | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function createPlatformVersionStore(options: PlatformVersionStoreOptions): PlatformVersionStore {
  const snapshots = options.snapshots;
  const validator = options.validator ?? createPlatformVersionValidator();
  const history = options.history ?? createPlatformVersionHistory();
  const restorer = options.restore ?? createPlatformVersionRestore();
  const comparer = createPlatformVersionCompare();
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `ver-${(serial += 1)}`);
  const versions = new Map<string, PlatformVersion>();

  const rejected = (issues: PlatformVersionIssue[]): PlatformVersionActionResult => ({
    status: "REJECTED",
    issues,
    version: null,
    comparison: null,
  });

  const ok = (version: PlatformVersion | null, comparison: PlatformVersionCompare | null = null): PlatformVersionActionResult => ({
    status: "OK",
    issues: [],
    version,
    comparison,
  });

  const existingIds = () => new Set(versions.keys());
  const allVersions = () => [...versions.values()];
  const knownSnapshotIds = () => new Set(snapshots.list().map((item) => item.snapshotId));

  function insert(version: PlatformVersion): PlatformVersion {
    const stored = clonePlatformVersion(version);
    versions.set(stored.versionId, stored);
    return clonePlatformVersion(stored);
  }

  function authorOf(value: unknown, field: string): { author: string; issues: PlatformVersionIssue[] } {
    if (typeof value !== "string" || value.trim() === "") {
      return { author: "", issues: [{ field, message: `Invalid version: a non-empty ${field} is required.` }] };
    }
    return { author: value.trim(), issues: [] };
  }

  function parentFor(snapshotId: string, explicit?: string | null): string | null {
    if (explicit !== undefined) return explicit;
    return history.latest(allVersions(), snapshotId)?.versionId ?? null;
  }

  function createVersion(raw: unknown): PlatformVersionActionResult {
    if (raw === undefined || raw === null || !isPlainObject(raw)) {
      return rejected([{ field: "version", message: "Invalid version: a version envelope is required." }]);
    }
    const snapshotIssues = validator.validateSnapshotId(raw.snapshotId, knownSnapshotIds());
    if (snapshotIssues.length > 0) return rejected(snapshotIssues);
    const { author, issues: authorIssues } = authorOf(raw.author, "author");
    if (authorIssues.length > 0) return rejected(authorIssues);
    if (typeof raw.reason !== "string" || raw.reason.trim() === "") {
      return rejected([{ field: "reason", message: "Invalid version: a non-empty reason is required." }]);
    }
    const metadataIssues = validator.validateMetadata(raw.metadata);
    if (metadataIssues.length > 0) return rejected(metadataIssues);
    const versionId = typeof raw.versionId === "string" ? raw.versionId : idFactory();
    const idIssues = validator.validateVersionId(versionId, existingIds());
    if (idIssues.length > 0) return rejected(idIssues);
    const parentVersionId = parentFor(raw.snapshotId as string, raw.parentVersionId as string | null | undefined);
    const parentIssues = validator.validateParent(parentVersionId, versionId, allVersions());
    if (parentIssues.length > 0) return rejected(parentIssues);
    if (raw.branch !== undefined && raw.branch !== null && (typeof raw.branch !== "string" || raw.branch.trim() === "")) {
      return rejected([{ field: "branch", message: "Invalid metadata: branch must be a well-formed id or null." }]);
    }
    const branch = typeof raw.branch === "string" ? raw.branch : null;
    if (branch !== null) {
      const branchIssues = validator.validateVersionId(branch);
      if (branchIssues.length > 0) {
        return rejected([{ field: "branch", message: "Invalid metadata: branch must be a well-formed id or null." }]);
      }
    }
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : timestamp();
    const stampIssues = validator.validateVersion({
      versionId,
      snapshotId: raw.snapshotId,
      parentVersionId,
      createdAt,
      author,
      reason: raw.reason.trim(),
      metadata: (raw.metadata as PlatformVersionMetadata | undefined) ?? {},
      status: raw.draft === true ? "DRAFT" : "COMMITTED",
      origin: "CREATE",
      restoreSource: null,
      branch,
    }, new Set(), knownSnapshotIds());
    if (stampIssues.length > 0) return rejected(stampIssues);
    const version = createPlatformVersionEnvelope({
      versionId,
      snapshotId: raw.snapshotId as string,
      parentVersionId,
      createdAt,
      author,
      reason: raw.reason.trim(),
      metadata: cloneSnapshotMetadata((raw.metadata as PlatformVersionMetadata | undefined) ?? {}),
      status: raw.draft === true ? "DRAFT" : "COMMITTED",
      origin: "CREATE",
      restoreSource: null,
      branch,
    });
    return ok(insert(version));
  }

  function compareVersions(fromVersionId: string, toVersionId: string): PlatformVersionActionResult {
    const from = versions.get(fromVersionId);
    const to = versions.get(toVersionId);
    if (!from) return rejected([{ field: "fromVersionId", message: `Invalid parent: version "${fromVersionId}" was not found.` }]);
    if (!to) return rejected([{ field: "toVersionId", message: `Invalid parent: version "${toVersionId}" was not found.` }]);
    const fromSnapshot = snapshots.get(from.snapshotId);
    const toSnapshot = snapshots.get(to.snapshotId);
    if (fromSnapshot === null) return rejected([{ field: "snapshotId", message: `Missing snapshot: "${from.snapshotId}" is not stored.` }]);
    if (toSnapshot === null) return rejected([{ field: "snapshotId", message: `Missing snapshot: "${to.snapshotId}" is not stored.` }]);
    return ok(clonePlatformVersion(to), comparer.compare(from, to, fromSnapshot, toSnapshot));
  }

  function nextFrom(sourceId: string, authorValue: string, reasonValue: string | undefined, mode: "RESTORE" | "DUPLICATE"): PlatformVersionActionResult {
    const source = versions.get(sourceId);
    const restoreIssues = validator.validateRestore(source ?? null, existingIds(), knownSnapshotIds());
    if (restoreIssues.length > 0) return rejected(restoreIssues);
    const { author, issues: authorIssues } = authorOf(authorValue, "author");
    if (authorIssues.length > 0) return rejected(authorIssues);
    const reason = reasonValue === undefined || reasonValue.trim() === "" ? (mode === "RESTORE" ? "restore" : "duplicate") : reasonValue.trim();
    const found = source as PlatformVersion;
    const nextId = idFactory();
    const idIssues = validator.validateVersionId(nextId, existingIds());
    if (idIssues.length > 0) return rejected(idIssues);
    const parentVersionId = mode === "DUPLICATE" ? found.versionId : history.latest(allVersions())?.versionId ?? found.versionId;
    const parentIssues = validator.validateParent(parentVersionId, nextId, allVersions());
    if (parentIssues.length > 0) return rejected(parentIssues);
    const built =
      mode === "RESTORE"
        ? restorer.restore({ source: found, versionId: nextId, createdAt: timestamp(), author, reason, parentVersionId })
        : restorer.duplicate({ source: found, versionId: nextId, createdAt: timestamp(), author, reason, parentVersionId });
    return ok(insert(built));
  }

  function restoreVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult {
    return nextFrom(versionId, author, reason, "RESTORE");
  }

  function duplicateVersion(versionId: string, author: string, reason?: string): PlatformVersionActionResult {
    return nextFrom(versionId, author, reason, "DUPLICATE");
  }

  function deleteDraftVersion(versionId: string): PlatformVersionActionResult {
    const source = versions.get(versionId);
    if (!source) return rejected([{ field: "versionId", message: `Invalid parent: version "${versionId}" was not found.` }]);
    const draftIssues = validator.validateDraftDelete(source, allVersions());
    if (draftIssues.length > 0) return rejected(draftIssues);
    versions.delete(versionId);
    return ok(clonePlatformVersion(source));
  }

  function previewVersion(versionId: string): PlatformVersionActionResult {
    const source = versions.get(versionId);
    if (!source) return rejected([{ field: "versionId", message: `Invalid parent: version "${versionId}" was not found.` }]);
    const snapshot = snapshots.get(source.snapshotId);
    if (snapshot === null) return rejected([{ field: "snapshotId", message: `Missing snapshot: "${source.snapshotId}" is not stored.` }]);
    return ok(clonePlatformVersion(source));
  }

  return {
    validator,
    history,
    createVersion,
    listVersions(snapshotId) {
      return history.list(allVersions(), snapshotId);
    },
    compareVersions,
    restoreVersion,
    duplicateVersion,
    deleteDraftVersion,
    previewVersion,
    get(versionId) {
      const found = versions.get(versionId);
      return found ? clonePlatformVersion(found) : null;
    },
  };
}
