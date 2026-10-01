/**
 * Platform Preview and Audit: comparison engine.
 *
 * Field, object, section, metadata, and version comparison. Side-by-side and
 * diff views are deterministic copies. Nothing here changes an overlay or an
 * audit log.
 */
import {
  canonicalPlatform,
  freezeDeepPlatform,
  isPlatformMetadata,
  type PlatformEditingSchema,
  type PlatformMetadata,
  type PlatformRecord,
} from "./editing-validator";
import type { PlatformFieldSource, PlatformResolvedOverlay } from "./overlay-resolver";
import {
  createPlatformPreviewValidator,
  isPlainPreviewObject,
  type PlatformCompareKind,
  type PlatformPreviewIssue,
} from "./audit-validator";

export interface PlatformCompareRow {
  path: string;
  kind: PlatformCompareKind;
  section: string | null;
  from: string;
  to: string;
  changed: boolean;
}

export interface PlatformCompareResult {
  fieldChanged: boolean;
  objectChanged: boolean;
  sectionChanged: boolean;
  metadataChanged: boolean;
  versionChanged: boolean;
  changedPaths: string[];
  changedFields: string[];
  rows: PlatformCompareRow[];
}

export interface PlatformSideBySideRow {
  field: string;
  section: string;
  generated: string;
  manual: string;
  effective: string;
  changed: boolean;
  source: PlatformFieldSource;
}

export interface PlatformSideBySideView {
  rows: PlatformSideBySideRow[];
  changedFields: string[];
}

export interface PlatformDiffRow {
  field: string;
  section: string;
  previous: string;
  next: string;
  source: PlatformFieldSource;
}

export interface PlatformDiffView {
  rows: PlatformDiffRow[];
  changedFields: string[];
}

export type PlatformCompareStatus = "OK" | "REJECTED";

export interface PlatformCompareActionResult {
  status: PlatformCompareStatus;
  issues: PlatformPreviewIssue[];
  result: PlatformCompareResult | null;
}

export interface PlatformVersionCompareInput {
  versionId: string;
  snapshotId?: string;
  parentVersionId?: string | null;
  createdAt?: string;
  metadata?: PlatformMetadata;
  payload?: PlatformRecord;
}

const VERSION_PATHS = ["versionId", "snapshotId", "parentVersionId", "createdAt"] as const;

function display(value: unknown): string {
  if (value === undefined) return "(none)";
  return canonicalPlatform(value);
}

function row(path: string, kind: PlatformCompareKind, from: unknown, to: unknown, section: string | null = null): PlatformCompareRow {
  const left = display(from);
  const right = display(to);
  return { path, kind, section, from: left, to: right, changed: left !== right };
}

function sectionOf(field: string, schema: PlatformEditingSchema): string {
  for (const [section, fields] of Object.entries(schema.sections)) {
    if (fields.includes(field)) return section;
  }
  return "fields";
}

function summarize(rows: PlatformCompareRow[]): PlatformCompareResult {
  const changed = rows.filter((item) => item.changed);
  const changedFields = [...new Set(changed.map((item) => item.path.split(".")[0]).filter((item) => item !== "metadata" && item !== "versionId" && item !== "snapshotId" && item !== "parentVersionId" && item !== "createdAt"))];
  return freezeDeepPlatform({
    fieldChanged: changed.some((item) => item.kind === "FIELD"),
    objectChanged: changed.some((item) => item.kind === "OBJECT"),
    sectionChanged: changed.some((item) => item.kind === "SECTION"),
    metadataChanged: changed.some((item) => item.kind === "METADATA"),
    versionChanged: changed.some((item) => item.kind === "VERSION"),
    changedPaths: changed.map((item) => item.path),
    changedFields,
    rows,
  });
}

export function createPlatformComparisonEngine() {
  const validator = createPlatformPreviewValidator();

  function compareRecords(from: PlatformRecord, to: PlatformRecord, schema: PlatformEditingSchema): PlatformCompareResult {
    const rows: PlatformCompareRow[] = [];
    const objectFields = new Set(schema.objectFields ?? []);
    for (const field of schema.fields) {
      const kind: PlatformCompareKind = objectFields.has(field) ? "OBJECT" : "FIELD";
      rows.push(row(field, kind, from[field], to[field], sectionOf(field, schema)));
    }
    for (const [section, fields] of Object.entries(schema.sections)) {
      const left = Object.fromEntries(fields.map((field) => [field, from[field]]));
      const right = Object.fromEntries(fields.map((field) => [field, to[field]]));
      rows.push(row(`section.${section}`, "SECTION", left, right, section));
    }
    return summarize(rows);
  }

  function compareMetadata(from: unknown, to: unknown): PlatformCompareActionResult {
    const issues = validator.validateCompare({ from, to, kind: "METADATA" });
    if (issues.length > 0) return { status: "REJECTED", issues, result: null };
    const left = isPlatformMetadata(from) ? from : isPlainPreviewObject(from) ? from : {};
    const right = isPlatformMetadata(to) ? to : isPlainPreviewObject(to) ? to : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    const rows: PlatformCompareRow[] = [];
    for (const key of [...keys].sort()) {
      rows.push(row(`metadata.${key}`, "METADATA", left[key], right[key], null));
    }
    return { status: "OK", issues: [], result: summarize(rows) };
  }

  function compareVersions(from: unknown, to: unknown, schema?: PlatformEditingSchema): PlatformCompareActionResult {
    const issues = validator.validateCompare({ from, to, kind: "VERSION" });
    if (issues.length > 0) return { status: "REJECTED", issues, result: null };
    if (!isPlainPreviewObject(from) || !isPlainPreviewObject(to)) {
      return { status: "REJECTED", issues: [{ field: "compare", message: "Invalid compare: a pair of records is required." }], result: null };
    }
    if (typeof from.versionId !== "string" || typeof to.versionId !== "string") {
      return { status: "REJECTED", issues: [{ field: "versionId", message: "Invalid compare: both records must name a version id." }], result: null };
    }
    const rows: PlatformCompareRow[] = [];
    for (const key of VERSION_PATHS) {
      rows.push(row(key, "VERSION", from[key], to[key], null));
    }
    const meta = compareMetadata(from.metadata ?? {}, to.metadata ?? {});
    if (meta.result) rows.push(...meta.result.rows);
    if (schema && isPlainPreviewObject(from.payload) && isPlainPreviewObject(to.payload)) {
      rows.push(...compareRecords(from.payload as PlatformRecord, to.payload as PlatformRecord, schema).rows);
    }
    return { status: "OK", issues: [], result: summarize(rows) };
  }

  function compare(from: unknown, to: unknown, schema: PlatformEditingSchema): PlatformCompareActionResult {
    const issues = validator.validateCompare({ from, to });
    if (issues.length > 0) return { status: "REJECTED", issues, result: null };
    if (!isPlainPreviewObject(from) || !isPlainPreviewObject(to)) {
      return { status: "REJECTED", issues: [{ field: "compare", message: "Invalid compare: a pair of records is required." }], result: null };
    }
    return { status: "OK", issues: [], result: compareRecords(from as PlatformRecord, to as PlatformRecord, schema) };
  }

  function sideBySide(view: PlatformResolvedOverlay, schema: PlatformEditingSchema): PlatformSideBySideView {
    const rows: PlatformSideBySideRow[] = [];
    const changedFields: string[] = [];
    for (const field of schema.fields) {
      const overridden = view.overriddenFields.includes(field);
      const generated = display(view.generated[field]);
      const manual = overridden ? display(view.overrides[field]) : "(not overridden)";
      const effective = display(view.effective[field]);
      const changed = generated !== effective;
      if (changed) changedFields.push(field);
      rows.push({
        field,
        section: sectionOf(field, schema),
        generated,
        manual,
        effective,
        changed,
        source: view.sources[field] ?? "GENERATED",
      });
    }
    return freezeDeepPlatform({ rows, changedFields });
  }

  function diff(view: PlatformResolvedOverlay, schema: PlatformEditingSchema): PlatformDiffView {
    const side = sideBySide(view, schema);
    const rows: PlatformDiffRow[] = side.rows
      .filter((item) => item.changed)
      .map((item) => ({
        field: item.field,
        section: item.section,
        previous: item.generated,
        next: item.effective,
        source: item.source,
      }));
    return freezeDeepPlatform({ rows, changedFields: [...side.changedFields] });
  }

  return { compare, compareRecords, compareMetadata, compareVersions, sideBySide, diff };
}

export type { PlatformVersionCompareInput as PlatformPreviewVersionInput };
