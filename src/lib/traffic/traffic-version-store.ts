/**
 * Traffic Versioning: version store.
 *
 * Holds immutable snapshots of the effective overlay, keyed by version id.
 * Create, list, compare, restore, duplicate, delete draft, and preview never
 * rewrite the generated analysis and never share the live overlay store.
 */
import type { TrafficIssue } from "./traffic-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficEffectiveView } from "./traffic-effective-view";
import type { TrafficMetadata } from "./traffic-types";
import { cloneTrafficVersion, createTrafficVersion, type TrafficVersion } from "./traffic-snapshot";
import { createTrafficVersionValidator, type TrafficVersionValidator } from "./traffic-version-validator";
import { createTrafficHistory, type TrafficHistory } from "./traffic-history";
import { changedTrafficFields, createTrafficCompare, type TrafficVersionCompare } from "./traffic-compare";
import { createTrafficRestore, type TrafficRestore } from "./traffic-restore";

export interface TrafficVersionAuditEntry {
  analysisId: string;
  operator: string;
  timestamp: string;
  previousVersion: string | null;
  newVersion: string | null;
  changedFields: string[];
  restoreSource: string | null;
  action: "CREATE" | "DUPLICATE" | "RESTORE" | "DELETE_DRAFT";
}

export interface TrafficVersionStoreOptions {
  validator?: TrafficVersionValidator;
  history?: TrafficHistory;
  restore?: TrafficRestore;
  timestamp?: () => string;
  idFactory?: () => string;
}

export type TrafficVersionActionStatus = "OK" | "REJECTED";

export interface TrafficVersionActionResult {
  status: TrafficVersionActionStatus;
  issues: TrafficIssue[];
  version: TrafficVersion | null;
  comparison?: TrafficVersionCompare | null;
}

export interface TrafficVersionCreateInput {
  view: unknown;
  operator?: string;
  metadata?: unknown;
  draft?: boolean;
  versionId?: string;
}

export interface TrafficVersionStore {
  readonly validator: TrafficVersionValidator;
  readonly history: TrafficHistory;
  createSnapshot(input: unknown): TrafficVersionActionResult;
  listVersions(analysisId?: string): TrafficVersion[];
  compareVersions(fromVersionId: string, toVersionId: string): TrafficVersionActionResult;
  restoreVersion(versionId: string, operator?: string): TrafficVersionActionResult;
  duplicateVersion(versionId: string, operator?: string): TrafficVersionActionResult;
  deleteDraftSnapshot(versionId: string, operator?: string): TrafficVersionActionResult;
  previewVersion(versionId: string): TrafficVersionActionResult;
  get(versionId: string): TrafficVersion | null;
  audit(analysisId?: string): TrafficVersionAuditEntry[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneAudit(entry: TrafficVersionAuditEntry): TrafficVersionAuditEntry {
  return freezeDeepTraffic({
    analysisId: entry.analysisId,
    operator: entry.operator,
    timestamp: entry.timestamp,
    previousVersion: entry.previousVersion,
    newVersion: entry.newVersion,
    changedFields: [...entry.changedFields],
    restoreSource: entry.restoreSource,
    action: entry.action,
  });
}

export function createTrafficVersionStore(options: TrafficVersionStoreOptions = {}): TrafficVersionStore {
  const validator = options.validator ?? createTrafficVersionValidator();
  const history = options.history ?? createTrafficHistory();
  const restorer = options.restore ?? createTrafficRestore();
  const comparer = createTrafficCompare();
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let nextId = 0;
  const idFactory = options.idFactory ?? (() => `ver-${(nextId += 1)}`);

  const versions = new Map<string, TrafficVersion>();
  const entries: TrafficVersionAuditEntry[] = [];

  const rejected = (issues: TrafficIssue[]): TrafficVersionActionResult => ({
    status: "REJECTED",
    issues,
    version: null,
    comparison: null,
  });

  const ok = (version: TrafficVersion | null, extra: Partial<TrafficVersionActionResult> = {}): TrafficVersionActionResult => ({
    status: "OK",
    issues: [],
    version,
    comparison: extra.comparison ?? null,
  });

  const existingIds = () => new Set(versions.keys());
  const allVersions = () => [...versions.values()];

  function record(entry: TrafficVersionAuditEntry): void {
    entries.push(cloneAudit(entry));
  }

  function operatorOf(value: unknown, fieldMessage: string): { operator: string; issues: TrafficIssue[] } {
    if (typeof value !== "string" || value.trim() === "") {
      return { operator: "", issues: [{ field: "operator", message: fieldMessage }] };
    }
    return { operator: value.trim(), issues: [] };
  }

  function insert(version: TrafficVersion, action: TrafficVersionAuditEntry["action"], previous: TrafficVersion | null, restoreSource: string | null): TrafficVersion {
    const stored = cloneTrafficVersion(version);
    versions.set(stored.versionId, stored);
    const changedFields = previous
      ? changedTrafficFields(previous.effectiveSnapshot, stored.effectiveSnapshot)
      : [...stored.overriddenFields];
    record({
      analysisId: stored.analysisId,
      operator: stored.operator,
      timestamp: stored.timestamp,
      previousVersion: previous?.versionId ?? null,
      newVersion: stored.versionId,
      changedFields,
      restoreSource,
      action,
    });
    return cloneTrafficVersion(stored);
  }

  function createSnapshot(raw: unknown): TrafficVersionActionResult {
    try {
      if (raw === undefined || raw === null || !isPlainObject(raw)) {
        return rejected([{ field: "effectiveView", message: "Missing snapshot: an effective snapshot is required." }]);
      }
      if (!("view" in raw) || raw.view === undefined || raw.view === null) {
        return rejected([{ field: "effectiveView", message: "Missing snapshot: an effective snapshot is required." }]);
      }
      const viewIssues = validator.validateView(raw.view);
      if (viewIssues.length > 0) return rejected(viewIssues);
      const view = raw.view as TrafficEffectiveView;
      const { operator, issues: operatorIssues } = operatorOf(raw.operator, "Missing snapshot: an operator is required.");
      if (operatorIssues.length > 0) return rejected(operatorIssues);
      const metadataIssues = validator.validateMetadata(raw.metadata);
      if (metadataIssues.length > 0) return rejected(metadataIssues);
      const versionId = typeof raw.versionId === "string" ? raw.versionId : idFactory();
      const idIssues = validator.validateVersionId(versionId, existingIds());
      if (idIssues.length > 0) return rejected(idIssues);
      const previous = history.latest(allVersions(), view.analysisId);
      const version = createTrafficVersion({
        versionId,
        timestamp: timestamp(),
        operator,
        view,
        metadata: (raw.metadata as TrafficMetadata | undefined) ?? {},
        status: raw.draft === true ? "DRAFT" : "SNAPSHOT",
        origin: "CREATE",
        parentVersionId: previous?.versionId ?? null,
        restoreSource: null,
      });
      return ok(insert(version, "CREATE", previous, null));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "version", message: `The snapshot could not be stored: ${message}` }]);
    }
  }

  function compareVersions(fromVersionId: string, toVersionId: string): TrafficVersionActionResult {
    try {
      const from = versions.get(fromVersionId);
      const to = versions.get(toVersionId);
      if (!from) return rejected([{ field: "fromVersionId", message: `Invalid restore: version "${fromVersionId}" was not found.` }]);
      if (!to) return rejected([{ field: "toVersionId", message: `Invalid restore: version "${toVersionId}" was not found.` }]);
      if (from.analysisId !== to.analysisId) {
        return rejected([{ field: "compare", message: "Invalid restore: the versions do not name the same generated analysis." }]);
      }
      const comparison = comparer.compare(from, to);
      return { status: "OK", issues: [], version: cloneTrafficVersion(to), comparison };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "compare", message: `The versions could not be compared: ${message}` }]);
    }
  }

  function restoreVersion(versionId: string, operatorValue?: string): TrafficVersionActionResult {
    try {
      const source = versions.get(versionId);
      const restoreIssues = validator.validateRestore(source ?? null, existingIds());
      if (restoreIssues.length > 0) return rejected(restoreIssues);
      const { operator, issues: operatorIssues } = operatorOf(operatorValue, "Invalid restore: an operator is required.");
      if (operatorIssues.length > 0) return rejected(operatorIssues);
      const found = source as TrafficVersion;
      const previous = history.latest(allVersions(), found.analysisId);
      const nextIdValue = idFactory();
      const idIssues = validator.validateVersionId(nextIdValue, existingIds());
      if (idIssues.length > 0) return rejected(idIssues);
      const version = restorer.restore({
        source: found,
        versionId: nextIdValue,
        timestamp: timestamp(),
        operator,
        parentVersionId: previous?.versionId ?? found.versionId,
      });
      return ok(insert(version, "RESTORE", previous, found.versionId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "restore", message: `Invalid restore: ${message}` }]);
    }
  }

  function duplicateVersion(versionId: string, operatorValue?: string): TrafficVersionActionResult {
    try {
      const source = versions.get(versionId);
      const restoreIssues = validator.validateRestore(source ?? null, existingIds());
      if (restoreIssues.length > 0) return rejected(restoreIssues);
      const { operator, issues: operatorIssues } = operatorOf(operatorValue, "Invalid restore: an operator is required.");
      if (operatorIssues.length > 0) return rejected(operatorIssues);
      const found = source as TrafficVersion;
      const previous = history.latest(allVersions(), found.analysisId);
      const nextIdValue = idFactory();
      const idIssues = validator.validateVersionId(nextIdValue, existingIds());
      if (idIssues.length > 0) return rejected(idIssues);
      const version = restorer.duplicate({
        source: found,
        versionId: nextIdValue,
        timestamp: timestamp(),
        operator,
        parentVersionId: found.versionId,
      });
      return ok(insert(version, "DUPLICATE", previous, null));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "duplicate", message: `Invalid restore: ${message}` }]);
    }
  }

  function deleteDraftSnapshot(versionId: string, operatorValue?: string): TrafficVersionActionResult {
    try {
      const source = versions.get(versionId);
      if (!source) return rejected([{ field: "versionId", message: `Invalid restore: version "${versionId}" was not found.` }]);
      const draftIssues = validator.validateDraftDelete(source);
      if (draftIssues.length > 0) return rejected(draftIssues);
      const { operator, issues: operatorIssues } = operatorOf(operatorValue, "Invalid restore: an operator is required.");
      if (operatorIssues.length > 0) return rejected(operatorIssues);
      versions.delete(versionId);
      const removed = cloneTrafficVersion(source);
      record({
        analysisId: removed.analysisId,
        operator,
        timestamp: timestamp(),
        previousVersion: removed.versionId,
        newVersion: history.latest(allVersions(), removed.analysisId)?.versionId ?? null,
        changedFields: [],
        restoreSource: null,
        action: "DELETE_DRAFT",
      });
      return ok(removed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "delete", message: `Invalid restore: ${message}` }]);
    }
  }

  function previewVersion(versionId: string): TrafficVersionActionResult {
    try {
      const source = versions.get(versionId);
      if (!source) return rejected([{ field: "versionId", message: `Invalid restore: version "${versionId}" was not found.` }]);
      return ok(cloneTrafficVersion(source));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "preview", message: `Missing snapshot: ${message}` }]);
    }
  }

  return {
    validator,
    history,
    createSnapshot,
    listVersions(analysisId) {
      return history.list(allVersions(), analysisId);
    },
    compareVersions,
    restoreVersion,
    duplicateVersion,
    deleteDraftSnapshot,
    previewVersion,
    get(versionId) {
      const found = versions.get(versionId);
      return found ? cloneTrafficVersion(found) : null;
    },
    audit(analysisId) {
      const list = analysisId === undefined ? entries : entries.filter((entry) => entry.analysisId === analysisId);
      return list.map((entry) => cloneAudit(entry));
    },
  };
}
