/**
 * Traffic Manual Editor: override store and audit log.
 *
 * Holds manual overrides in memory, keyed by analysis id. It never writes a
 * file, a database, or the generated analysis. Each change can be recorded
 * with the operator, the time, the previous value, the new value, and the
 * fields that changed.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficOverrideField, TrafficOverridePatch } from "./traffic-effective-view";

export interface TrafficOverrideRecord {
  analysisId: string;
  field: TrafficOverrideField;
  value: unknown;
  updatedAt: string;
  operator: string;
}

export interface TrafficOverrideAuditEntry {
  analysisId: string;
  operator: string;
  timestamp: string;
  previousValue: TrafficOverridePatch;
  newValue: TrafficOverridePatch;
  changedFields: TrafficOverrideField[];
}

export interface TrafficOverrideAuditLog {
  list(analysisId?: string): TrafficOverrideAuditEntry[];
  record(entry: TrafficOverrideAuditEntry): TrafficOverrideAuditEntry;
}

export interface TrafficOverrideStore {
  list(analysisId: string): TrafficOverrideRecord[];
  get(analysisId: string, field: TrafficOverrideField): TrafficOverrideRecord | null;
  put(record: TrafficOverrideRecord): TrafficOverrideRecord;
  remove(analysisId: string, field: TrafficOverrideField): TrafficOverrideRecord | null;
  removeAll(analysisId: string): TrafficOverrideRecord[];
  patch(analysisId: string): TrafficOverridePatch;
  readonly audit: TrafficOverrideAuditLog;
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function freezeRecord(record: TrafficOverrideRecord): TrafficOverrideRecord {
  return freezeDeepTraffic({
    analysisId: record.analysisId,
    field: record.field,
    value: cloneValue(record.value),
    updatedAt: record.updatedAt,
    operator: record.operator,
  });
}

export function createTrafficOverrideStore(): TrafficOverrideStore {
  const rows = new Map<string, Map<TrafficOverrideField, TrafficOverrideRecord>>();
  const entries: TrafficOverrideAuditEntry[] = [];

  const bucket = (analysisId: string) => {
    let found = rows.get(analysisId);
    if (!found) {
      found = new Map();
      rows.set(analysisId, found);
    }
    return found;
  };

  const audit: TrafficOverrideAuditLog = {
    list(analysisId) {
      const list = analysisId === undefined ? entries : entries.filter((entry) => entry.analysisId === analysisId);
      return list.map((entry) => freezeDeepTraffic(cloneValue(entry)));
    },
    record(entry) {
      const stored = freezeDeepTraffic({
        analysisId: entry.analysisId,
        operator: entry.operator,
        timestamp: entry.timestamp,
        previousValue: cloneValue(entry.previousValue),
        newValue: cloneValue(entry.newValue),
        changedFields: [...entry.changedFields],
      });
      entries.push(stored);
      return stored;
    },
  };

  return {
    audit,
    list(analysisId) {
      return [...(rows.get(analysisId)?.values() ?? [])].map((record) => freezeRecord(record));
    },
    get(analysisId, field) {
      const found = rows.get(analysisId)?.get(field);
      return found ? freezeRecord(found) : null;
    },
    put(record) {
      const stored = freezeRecord(record);
      bucket(record.analysisId).set(record.field, stored);
      return stored;
    },
    remove(analysisId, field) {
      const found = rows.get(analysisId);
      if (!found) return null;
      const previous = found.get(field) ?? null;
      found.delete(field);
      if (found.size === 0) rows.delete(analysisId);
      return previous ? freezeRecord(previous) : null;
    },
    removeAll(analysisId) {
      const found = rows.get(analysisId);
      if (!found) return [];
      const previous = [...found.values()].map((record) => freezeRecord(record));
      rows.delete(analysisId);
      return previous;
    },
    patch(analysisId) {
      const next: TrafficOverridePatch = {};
      for (const record of rows.get(analysisId)?.values() ?? []) {
        (next as Record<string, unknown>)[record.field] = cloneValue(record.value);
      }
      return next;
    },
  };
}
