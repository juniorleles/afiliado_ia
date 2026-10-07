/**
 * Platform Editing Framework: validator.
 *
 * Rejects an invalid override, a duplicate override, invalid metadata, and a
 * missing generated layer. It reports problems and never throws or changes
 * its input. Field names and sections come from a schema the caller supplies.
 * Nothing here knows a product, a page, or an analysis.
 */
export interface PlatformIssue {
  field: string;
  message: string;
}

export type PlatformScalar = string | number | boolean | null;
export type PlatformMetadata = Record<string, PlatformScalar>;
export type PlatformValue = PlatformScalar | PlatformScalar[] | PlatformMetadata;
export type PlatformRecord = Record<string, PlatformValue>;
export type PlatformPatch = Partial<Record<string, PlatformValue>>;
export type PlatformPatchEntry = { field: string; value: PlatformValue };

export const PLATFORM_FIELD_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
export const PLATFORM_SECTION_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface PlatformEditingSchema {
  fields: readonly string[];
  sections: Readonly<Record<string, readonly string[]>>;
  objectFields?: readonly string[];
}

export interface PlatformEditingValidator {
  validateSchema(schema: unknown): PlatformIssue[];
  validateGenerated(value: unknown, schema: PlatformEditingSchema): PlatformIssue[];
  validateField(field: string, value: unknown, schema: PlatformEditingSchema, generated?: PlatformRecord | null): PlatformIssue[];
  validatePatch(patch: unknown, schema: PlatformEditingSchema, generated?: PlatformRecord | null): PlatformIssue[];
  validateSection(section: string, patch: unknown, schema: PlatformEditingSchema, generated?: PlatformRecord | null): PlatformIssue[];
  validateMetadata(value: unknown): PlatformIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isScalar(value: unknown): value is PlatformScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  return typeof value === "number" && Number.isFinite(value);
}

export function isPlatformMetadata(value: unknown): value is PlatformMetadata {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([key, inner]) => key.trim() !== "" && key === key && isScalar(inner));
}

export function isPlatformValue(value: unknown): value is PlatformValue {
  if (isScalar(value)) return true;
  if (Array.isArray(value)) return value.every((item) => isScalar(item));
  return isPlatformMetadata(value);
}

export function isPlatformFieldId(value: string): boolean {
  return PLATFORM_FIELD_ID.test(value);
}

export function isPlatformSectionId(value: string): boolean {
  return PLATFORM_SECTION_ID.test(value);
}

export function createPlatformEditingValidator(): PlatformEditingValidator {
  function validateSchema(schema: unknown): PlatformIssue[] {
    if (!isPlainObject(schema) || !Array.isArray(schema.fields) || !isPlainObject(schema.sections)) {
      return [{ field: "schema", message: "Invalid override: a schema of fields and sections is required." }];
    }
    const issues: PlatformIssue[] = [];
    const fields = schema.fields.filter((item): item is string => typeof item === "string");
    if (fields.length !== schema.fields.length) issues.push({ field: "fields", message: "Invalid override: every field id must be text." });
    const seen = new Set<string>();
    for (const field of fields) {
      if (!isPlatformFieldId(field)) issues.push({ field, message: `Invalid override: "${field}" is not a well-formed field id.` });
      if (seen.has(field)) issues.push({ field, message: `Duplicate override: field "${field}" is listed more than once.` });
      seen.add(field);
    }
    const inSection = new Set<string>();
    for (const [section, list] of Object.entries(schema.sections)) {
      if (!isPlatformSectionId(section)) issues.push({ field: "sections", message: `Invalid override: "${section}" is not a well-formed section id.` });
      if (!Array.isArray(list)) {
        issues.push({ field: section, message: `Invalid override: section "${section}" must list field ids.` });
        continue;
      }
      for (const field of list) {
        if (typeof field !== "string" || !seen.has(field)) {
          issues.push({ field: section, message: `Invalid override: section "${section}" names unknown field "${String(field)}".` });
          continue;
        }
        if (inSection.has(field)) issues.push({ field, message: `Duplicate override: field "${field}" belongs to more than one section.` });
        inSection.add(field);
      }
    }
    if (schema.objectFields !== undefined) {
      if (!Array.isArray(schema.objectFields)) {
        issues.push({ field: "objectFields", message: "Invalid override: objectFields must be a list of field ids." });
      } else {
        const objects = new Set<string>();
        for (const field of schema.objectFields) {
          if (typeof field !== "string" || !seen.has(field)) {
            issues.push({ field: "objectFields", message: `Invalid override: object field "${String(field)}" is not in the schema.` });
            continue;
          }
          if (objects.has(field)) issues.push({ field, message: `Duplicate override: object field "${field}" is listed more than once.` });
          objects.add(field);
        }
      }
    }
    return issues;
  }

  function validateMetadata(value: unknown): PlatformIssue[] {
    if (!isPlatformMetadata(value)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat object of strings, numbers, booleans, or null with non-empty keys is required." }];
    }
    return [];
  }

  function kindOf(value: PlatformValue): "scalar" | "list" | "object" {
    if (Array.isArray(value)) return "list";
    if (value !== null && typeof value === "object") return "object";
    return "scalar";
  }

  function validateField(field: string, value: unknown, schema: PlatformEditingSchema, generated: PlatformRecord | null = null): PlatformIssue[] {
    if (!schema.fields.includes(field)) return [{ field, message: `Invalid override: "${field}" is not an editable field.` }];
    if (!isPlatformValue(value)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) return validateMetadata(value);
      return [{ field, message: `Invalid override: "${field}" must be a scalar, a list of scalars, or flat metadata.` }];
    }
    const objectFields = schema.objectFields ?? [];
    if (objectFields.includes(field)) {
      if (!isPlatformMetadata(value)) return [{ field, message: `Invalid metadata: "${field}" must be a flat object.` }];
      return [];
    }
    if (generated && Object.prototype.hasOwnProperty.call(generated, field)) {
      const expected = kindOf(generated[field]);
      const actual = kindOf(value);
      if (expected !== actual) {
        return [{ field, message: `Invalid override: "${field}" must keep the generated value kind (${expected}).` }];
      }
    }
    return [];
  }

  function validateGenerated(value: unknown, schema: PlatformEditingSchema): PlatformIssue[] {
    if (value === undefined || value === null || !isPlainObject(value)) {
      return [{ field: "generated", message: "Missing generated layer: a generated record is required." }];
    }
    const issues: PlatformIssue[] = [];
    for (const field of schema.fields) {
      if (!(field in value)) issues.push({ field, message: `Missing generated layer: field "${field}" is missing.` });
      else issues.push(...validateField(field, value[field], schema, null));
    }
    for (const key of Object.keys(value)) {
      if (!schema.fields.includes(key)) issues.push({ field: key, message: `Invalid override: "${key}" is not an editable field.` });
    }
    return issues;
  }

  function entriesFromPatch(patch: unknown): { issues: PlatformIssue[]; entries: PlatformPatchEntry[] } {
    if (Array.isArray(patch)) {
      const issues: PlatformIssue[] = [];
      const entries: PlatformPatchEntry[] = [];
      const seen = new Set<string>();
      patch.forEach((item, index) => {
        if (!isPlainObject(item) || typeof item.field !== "string") {
          issues.push({ field: `patch[${index}]`, message: "Invalid override: each entry must name a field and a value." });
          return;
        }
        if (seen.has(item.field)) issues.push({ field: item.field, message: `Duplicate override: field "${item.field}" appears more than once.` });
        seen.add(item.field);
        if (!isPlatformValue(item.value)) {
          issues.push({ field: item.field, message: `Invalid override: "${item.field}" must be a scalar, a list of scalars, or flat metadata.` });
          return;
        }
        entries.push({ field: item.field, value: item.value });
      });
      return { issues, entries };
    }
    if (!isPlainObject(patch)) return { issues: [{ field: "patch", message: "Invalid override: a patch of editable fields is required." }], entries: [] };
    return {
      issues: [],
      entries: Object.entries(patch)
        .filter(([, value]) => value !== undefined)
        .map(([field, value]) => ({ field, value: value as PlatformValue })),
    };
  }

  function validatePatch(patch: unknown, schema: PlatformEditingSchema, generated: PlatformRecord | null = null): PlatformIssue[] {
    const { issues, entries } = entriesFromPatch(patch);
    for (const entry of entries) issues.push(...validateField(entry.field, entry.value, schema, generated));
    return issues;
  }

  function validateSection(section: string, patch: unknown, schema: PlatformEditingSchema, generated: PlatformRecord | null = null): PlatformIssue[] {
    if (!Object.prototype.hasOwnProperty.call(schema.sections, section)) {
      return [{ field: "section", message: `Invalid override: "${section}" is not a section.` }];
    }
    const allowed = new Set(schema.sections[section]);
    const { issues, entries } = entriesFromPatch(patch);
    for (const entry of entries) {
      if (!allowed.has(entry.field)) issues.push({ field: entry.field, message: `Invalid override: "${entry.field}" is not in section "${section}".` });
      else issues.push(...validateField(entry.field, entry.value, schema, generated));
    }
    return issues;
  }

  return { validateSchema, validateGenerated, validateField, validatePatch, validateSection, validateMetadata };
}

export function clonePlatformValue(value: PlatformValue): PlatformValue {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === "object") return { ...value };
  return value;
}

export function clonePlatformRecord(record: PlatformRecord): PlatformRecord {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, clonePlatformValue(value)]));
}

export function clonePlatformPatch(patch: PlatformPatch): PlatformPatch {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined).map(([key, value]) => [key, clonePlatformValue(value as PlatformValue)]));
}

export function freezeDeepPlatform<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeDeepPlatform(inner);
  }
  return value;
}

export function isDeepFrozenPlatform(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((inner) => isDeepFrozenPlatform(inner));
}

export function canonicalPlatform(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]));
    }
    return inner;
  });
}
