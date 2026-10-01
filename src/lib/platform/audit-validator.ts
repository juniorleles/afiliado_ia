/**
 * Platform Preview and Audit: validator.
 *
 * Rejects an invalid preview, an invalid compare, an invalid audit record, and
 * invalid metadata. It reports problems and never throws or changes its input.
 * Nothing here knows a product engine.
 */
import {
  isPlatformFieldId,
  isPlatformMetadata,
  isPlatformSectionId,
  isPlatformValue,
  type PlatformEditingSchema,
  type PlatformMetadata,
  type PlatformPatch,
  type PlatformRecord,
  type PlatformValue,
} from "./editing-validator";

export interface PlatformPreviewIssue {
  field: string;
  message: string;
}

export const PLATFORM_PREVIEW_MODES = ["GENERATED", "MANUAL", "EFFECTIVE", "SIDE_BY_SIDE", "DIFF"] as const;
export type PlatformPreviewMode = (typeof PLATFORM_PREVIEW_MODES)[number];

export const PLATFORM_PREVIEW_LAYERS = ["GENERATED", "MANUAL", "EFFECTIVE"] as const;
export type PlatformPreviewLayerMode = (typeof PLATFORM_PREVIEW_LAYERS)[number];

export const PLATFORM_COMPARE_KINDS = ["FIELD", "OBJECT", "SECTION", "METADATA", "VERSION"] as const;
export type PlatformCompareKind = (typeof PLATFORM_COMPARE_KINDS)[number];

export const PLATFORM_AUDIT_ID = /^[a-z][a-z0-9-]*$/;
export const PLATFORM_AUDIT_OPERATION = /^[a-z][a-z0-9-]*$/;
export const PLATFORM_AUDIT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type PlatformAuditLayer = PlatformPreviewLayerMode | null;
export type PlatformAuditJson = PlatformValue | PlatformRecord | PlatformPatch | null;

export interface PlatformAuditRecord {
  auditId: string;
  operation: string;
  operator: string;
  timestamp: string;
  sourceLayer: PlatformAuditLayer;
  targetLayer: PlatformAuditLayer;
  changedFields: readonly string[];
  previousValue: PlatformAuditJson;
  newValue: PlatformAuditJson;
  reason: string;
  metadata: PlatformMetadata;
}

export interface PlatformAuditDraft {
  auditId?: string;
  operation: string;
  operator: string;
  timestamp?: string;
  sourceLayer?: PlatformAuditLayer;
  targetLayer?: PlatformAuditLayer;
  changedFields?: readonly string[];
  previousValue?: unknown;
  newValue?: unknown;
  reason: string;
  metadata?: PlatformMetadata;
}

export interface PlatformPreviewValidator {
  validatePreview(value: unknown, schema: PlatformEditingSchema): PlatformPreviewIssue[];
  validateCompare(value: unknown): PlatformPreviewIssue[];
  validateAudit(value: unknown, existingIds?: ReadonlySet<string>): PlatformPreviewIssue[];
  validateMetadata(value: unknown): PlatformPreviewIssue[];
  validateMode(value: unknown): PlatformPreviewIssue[];
}

function issue(field: string, message: string): PlatformPreviewIssue {
  return { field, message };
}

export function isPlainPreviewObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isPlatformPreviewMode(value: string): value is PlatformPreviewMode {
  return (PLATFORM_PREVIEW_MODES as readonly string[]).includes(value);
}

export function isPlatformPreviewLayer(value: string): value is PlatformPreviewLayerMode {
  return (PLATFORM_PREVIEW_LAYERS as readonly string[]).includes(value);
}

export function isPlatformCompareKind(value: string): value is PlatformCompareKind {
  return (PLATFORM_COMPARE_KINDS as readonly string[]).includes(value);
}

export function isPlatformAuditId(value: string): boolean {
  return PLATFORM_AUDIT_ID.test(value);
}

export function isPlatformAuditJson(value: unknown): value is PlatformAuditJson {
  if (value === null) return true;
  if (isPlatformValue(value)) return true;
  if (!isPlainPreviewObject(value)) return false;
  return Object.values(value).every((inner) => inner === undefined || isPlatformValue(inner));
}

export function createPlatformPreviewValidator(): PlatformPreviewValidator {
  function validateMetadata(value: unknown): PlatformPreviewIssue[] {
    if (value === undefined) return [];
    if (!isPlatformMetadata(value)) {
      return [issue("metadata", "Invalid metadata: preview metadata must be a flat record of text, numbers, booleans, or null.")];
    }
    return [];
  }

  function validateMode(value: unknown): PlatformPreviewIssue[] {
    if (typeof value !== "string" || !isPlatformPreviewMode(value)) {
      return [issue("mode", "Invalid preview: mode must be GENERATED, MANUAL, EFFECTIVE, SIDE_BY_SIDE, or DIFF.")];
    }
    return [];
  }

  function validatePreview(value: unknown, schema: PlatformEditingSchema): PlatformPreviewIssue[] {
    if (!isPlainPreviewObject(value)) {
      return [issue("preview", "Invalid preview: a generated record is required.")];
    }
    if (!isPlainPreviewObject(value.generated)) {
      return [issue("generated", "Invalid preview: a generated record is required.")];
    }
    const issues: PlatformPreviewIssue[] = [];
    const fields = new Set(schema.fields);
    for (const field of schema.fields) {
      if (!Object.prototype.hasOwnProperty.call(value.generated, field)) {
        issues.push(issue(field, `Invalid preview: generated field "${field}" is missing.`));
      } else if (!isPlatformValue(value.generated[field])) {
        issues.push(issue(field, `Invalid preview: generated field "${field}" is not a supported value.`));
      }
    }
    if (value.overrides !== undefined) {
      if (!isPlainPreviewObject(value.overrides)) {
        issues.push(issue("overrides", "Invalid preview: overrides must be a flat field patch."));
      } else {
        for (const [field, inner] of Object.entries(value.overrides)) {
          if (inner === undefined) continue;
          if (!fields.has(field) || !isPlatformFieldId(field)) {
            issues.push(issue(field, `Invalid preview: "${field}" is not a known field.`));
          } else if (!isPlatformValue(inner)) {
            issues.push(issue(field, `Invalid preview: override "${field}" is not a supported value.`));
          }
        }
      }
    }
    if (value.mode !== undefined) issues.push(...validateMode(value.mode));
    return issues;
  }

  function validateCompare(value: unknown): PlatformPreviewIssue[] {
    if (!isPlainPreviewObject(value)) {
      return [issue("compare", "Invalid compare: a pair of records is required.")];
    }
    const issues: PlatformPreviewIssue[] = [];
    if (value.from === undefined || value.from === null) {
      issues.push(issue("from", "Invalid compare: a from record is required."));
    } else if (typeof value.from !== "object") {
      issues.push(issue("from", "Invalid compare: the from record must be an object."));
    }
    if (value.to === undefined || value.to === null) {
      issues.push(issue("to", "Invalid compare: a to record is required."));
    } else if (typeof value.to !== "object") {
      issues.push(issue("to", "Invalid compare: the to record must be an object."));
    }
    if (value.kind !== undefined && (typeof value.kind !== "string" || !isPlatformCompareKind(value.kind))) {
      issues.push(issue("kind", "Invalid compare: kind must be FIELD, OBJECT, SECTION, METADATA, or VERSION."));
    }
    if (value.section !== undefined && (typeof value.section !== "string" || !isPlatformSectionId(value.section))) {
      issues.push(issue("section", "Invalid compare: a well-formed section id is required."));
    }
    return issues;
  }

  function validateLayer(value: unknown, field: string): PlatformPreviewIssue[] {
    if (value === undefined || value === null) return [];
    if (typeof value !== "string" || !isPlatformPreviewLayer(value)) {
      return [issue(field, `Invalid audit record: ${field} must be GENERATED, MANUAL, EFFECTIVE, or null.`)];
    }
    return [];
  }

  function validateAudit(value: unknown, existingIds: ReadonlySet<string> = new Set()): PlatformPreviewIssue[] {
    if (!isPlainPreviewObject(value)) {
      return [issue("audit", "Invalid audit record: an audit envelope is required.")];
    }
    const issues: PlatformPreviewIssue[] = [];
    if (value.auditId !== undefined) {
      if (typeof value.auditId !== "string" || !isPlatformAuditId(value.auditId)) {
        issues.push(issue("auditId", "Invalid audit record: a well-formed audit id is required."));
      } else if (existingIds.has(value.auditId)) {
        issues.push(issue("auditId", `Invalid audit record: "${value.auditId}" is already stored.`));
      }
    }
    if (typeof value.operation !== "string" || !PLATFORM_AUDIT_OPERATION.test(value.operation)) {
      issues.push(issue("operation", "Invalid audit record: a well-formed operation id is required."));
    }
    if (typeof value.operator !== "string" || value.operator.trim() === "") {
      issues.push(issue("operator", "Invalid audit record: a non-empty operator is required."));
    }
    if (value.timestamp !== undefined && (typeof value.timestamp !== "string" || !PLATFORM_AUDIT_TIMESTAMP.test(value.timestamp))) {
      issues.push(issue("timestamp", "Invalid audit record: timestamp must be an ISO-8601 instant in UTC."));
    }
    issues.push(...validateLayer(value.sourceLayer, "sourceLayer"));
    issues.push(...validateLayer(value.targetLayer, "targetLayer"));
    if (value.changedFields !== undefined) {
      if (!Array.isArray(value.changedFields) || !value.changedFields.every((field) => typeof field === "string" && isPlatformFieldId(field))) {
        issues.push(issue("changedFields", "Invalid audit record: changed fields must be a list of well-formed field ids."));
      } else {
        const seen = new Set<string>();
        for (const field of value.changedFields as string[]) {
          if (seen.has(field)) issues.push(issue("changedFields", `Invalid audit record: field "${field}" is listed more than once.`));
          seen.add(field);
        }
      }
    }
    if (value.previousValue !== undefined && !isPlatformAuditJson(value.previousValue)) {
      issues.push(issue("previousValue", "Invalid audit record: previous value must be plain JSON."));
    }
    if (value.newValue !== undefined && !isPlatformAuditJson(value.newValue)) {
      issues.push(issue("newValue", "Invalid audit record: new value must be plain JSON."));
    }
    if (typeof value.reason !== "string" || value.reason.trim() === "") {
      issues.push(issue("reason", "Invalid audit record: a non-empty reason is required."));
    }
    issues.push(...validateMetadata(value.metadata));
    return issues;
  }

  return { validatePreview, validateCompare, validateAudit, validateMetadata, validateMode };
}
