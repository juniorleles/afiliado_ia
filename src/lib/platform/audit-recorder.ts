/**
 * Platform Audit: recorder.
 *
 * Appends frozen audit records. Previous records stay as they were. The
 * recorder never throws and never names a product engine.
 */
import { clonePlatformValue, freezeDeepPlatform, type PlatformMetadata } from "./editing-validator";
import {
  createPlatformPreviewValidator,
  isPlatformAuditJson,
  type PlatformAuditDraft,
  type PlatformAuditJson,
  type PlatformAuditRecord,
  type PlatformPreviewIssue,
} from "./audit-validator";

export type PlatformAuditActionStatus = "OK" | "REJECTED";

export interface PlatformAuditActionResult {
  status: PlatformAuditActionStatus;
  issues: PlatformPreviewIssue[];
  record: PlatformAuditRecord | null;
}

export interface PlatformAuditRecorderOptions {
  timestamp?: () => string;
  idFactory?: () => string;
}

export interface PlatformAuditRecorder {
  record(input: unknown): PlatformAuditActionResult;
  list(): PlatformAuditRecord[];
  get(auditId: string): PlatformAuditRecord | null;
}

function cloneJson(value: PlatformAuditJson): PlatformAuditJson {
  if (value === null) return null;
  if (Array.isArray(value) || (value !== null && typeof value === "object")) {
    return clonePlatformValue(value as never) as PlatformAuditJson;
  }
  return value;
}

function cloneRecord(record: PlatformAuditRecord): PlatformAuditRecord {
  return freezeDeepPlatform({
    auditId: record.auditId,
    operation: record.operation,
    operator: record.operator,
    timestamp: record.timestamp,
    sourceLayer: record.sourceLayer,
    targetLayer: record.targetLayer,
    changedFields: [...record.changedFields],
    previousValue: cloneJson(record.previousValue),
    newValue: cloneJson(record.newValue),
    reason: record.reason,
    metadata: { ...record.metadata },
  });
}

export function createPlatformAuditRecorder(options: PlatformAuditRecorderOptions = {}): PlatformAuditRecorder {
  const validator = createPlatformPreviewValidator();
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `audit-${(serial += 1)}`);
  const records: PlatformAuditRecord[] = [];
  const byId = new Map<string, PlatformAuditRecord>();

  function existingIds(): Set<string> {
    return new Set(byId.keys());
  }

  function record(raw: unknown): PlatformAuditActionResult {
    const issues = validator.validateAudit(raw, existingIds());
    if (issues.length > 0) return { status: "REJECTED", issues, record: null };
    const draft = raw as PlatformAuditDraft;
    const auditId = draft.auditId ?? idFactory();
    const idIssues = validator.validateAudit({ ...draft, auditId }, existingIds());
    if (idIssues.length > 0) return { status: "REJECTED", issues: idIssues, record: null };
    const stored = freezeDeepPlatform({
      auditId,
      operation: draft.operation,
      operator: draft.operator.trim(),
      timestamp: draft.timestamp ?? timestamp(),
      sourceLayer: draft.sourceLayer ?? null,
      targetLayer: draft.targetLayer ?? null,
      changedFields: [...(draft.changedFields ?? [])],
      previousValue: isPlatformAuditJson(draft.previousValue) ? cloneJson(draft.previousValue) : null,
      newValue: isPlatformAuditJson(draft.newValue) ? cloneJson(draft.newValue) : null,
      reason: draft.reason.trim(),
      metadata: { ...((draft.metadata as PlatformMetadata | undefined) ?? {}) },
    }) as PlatformAuditRecord;
    const frozenIssues = validator.validateAudit(stored, new Set());
    if (frozenIssues.length > 0) return { status: "REJECTED", issues: frozenIssues, record: null };
    byId.set(stored.auditId, stored);
    records.push(stored);
    return { status: "OK", issues: [], record: cloneRecord(stored) };
  }

  return {
    record,
    list() {
      return records.map((item) => cloneRecord(item));
    },
    get(auditId) {
      const found = byId.get(auditId);
      return found ? cloneRecord(found) : null;
    },
  };
}
