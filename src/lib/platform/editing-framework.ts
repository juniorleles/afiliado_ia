/**
 * Platform Editing Framework.
 *
 * Generic overlay infrastructure: a generated record stays immutable, a
 * manual layer stores operator changes, and an effective layer resolves the
 * two. Field, section, and object overrides are schema-driven. Nothing here
 * knows a product, a page, an analysis, or an advertising platform.
 */
import {
  createPlatformEditingValidator,
  freezeDeepPlatform,
  type PlatformEditingSchema,
  type PlatformIssue,
  type PlatformPatch,
  type PlatformRecord,
  type PlatformValue,
} from "./editing-validator";
import { createGeneratedLayer, type PlatformGeneratedLayer } from "./generated-layer";
import { createManualLayer, type PlatformManualLayer } from "./manual-layer";
import { createOverlayResolver, type PlatformOverlayResolver } from "./overlay-resolver";
import { createEffectiveLayer, type PlatformEffectiveLayer } from "./effective-layer";

export type PlatformEditingActionStatus = "OK" | "REJECTED";

export interface PlatformEditingActionResult {
  status: PlatformEditingActionStatus;
  issues: PlatformIssue[];
  view: PlatformEffectiveLayer | null;
}

export interface PlatformEditingSession {
  generated(): PlatformRecord;
  manual(): PlatformPatch;
  view(): PlatformEffectiveLayer;
  overrideField(field: string, value: unknown): PlatformEditingActionResult;
  overrideSection(section: string, patch: unknown): PlatformEditingActionResult;
  overrideObject(field: string, value: unknown): PlatformEditingActionResult;
  resetField(field: string): PlatformEditingActionResult;
  resetSection(section: string): PlatformEditingActionResult;
  resetAll(): PlatformEditingActionResult;
}

export type PlatformEditingOpenResult =
  | { status: "OPEN"; session: PlatformEditingSession; issues: PlatformIssue[] }
  | { status: "REJECTED"; session: null; issues: PlatformIssue[] };

export interface PlatformEditingFramework {
  readonly schema: PlatformEditingSchema;
  readonly validator: ReturnType<typeof createPlatformEditingValidator>;
  readonly resolver: PlatformOverlayResolver;
  open(input: unknown): PlatformEditingOpenResult;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function copyRecord(record: PlatformRecord): PlatformRecord {
  return freezeDeepPlatform(
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value !== null && typeof value === "object" ? { ...value } : value])),
  );
}

export function createPlatformEditingFramework(schema: PlatformEditingSchema): PlatformEditingFramework {
  const validator = createPlatformEditingValidator();
  const resolver = createOverlayResolver();
  const schemaIssues = validator.validateSchema(schema);
  const frozenSchema = freezeDeepPlatform({
    fields: [...schema.fields],
    sections: Object.fromEntries(Object.entries(schema.sections).map(([key, list]) => [key, [...list]])),
    objectFields: schema.objectFields ? [...schema.objectFields] : [],
  }) as PlatformEditingSchema;

  const rejectedOpen = (issues: PlatformIssue[]): PlatformEditingOpenResult => ({ status: "REJECTED", session: null, issues });
  const rejectedAction = (issues: PlatformIssue[]): PlatformEditingActionResult => ({ status: "REJECTED", issues, view: null });

  function open(raw: unknown): PlatformEditingOpenResult {
    try {
      if (schemaIssues.length > 0) return rejectedOpen(schemaIssues);
      if (raw === undefined || raw === null || !isPlainObject(raw)) {
        return rejectedOpen([{ field: "generated", message: "Missing generated layer: a generated record is required." }]);
      }
      if (!("generated" in raw) || raw.generated === undefined || raw.generated === null) {
        return rejectedOpen([{ field: "generated", message: "Missing generated layer: a generated record is required." }]);
      }
      const created = createGeneratedLayer(raw.generated, frozenSchema);
      if (!created.layer) return rejectedOpen(created.issues);
      const generatedLayer: PlatformGeneratedLayer = created.layer;
      const manual: PlatformManualLayer = createManualLayer(frozenSchema);

      const snapshot = (): PlatformEffectiveLayer =>
        createEffectiveLayer(resolver.resolve(generatedLayer.values, manual.list(), frozenSchema));

      const ok = (): PlatformEditingActionResult => ({ status: "OK", issues: [], view: snapshot() });

      const session: PlatformEditingSession = {
        generated: () => copyRecord(generatedLayer.values),
        manual: () => manual.list(),
        view: () => snapshot(),
        overrideField(field, value) {
          const issues = validator.validateField(field, value, frozenSchema, generatedLayer.values);
          if (issues.length > 0) return rejectedAction(issues);
          manual.put(field, value as PlatformValue);
          return ok();
        },
        overrideSection(section, patch) {
          const issues = validator.validateSection(section, patch, frozenSchema, generatedLayer.values);
          if (issues.length > 0) return rejectedAction(issues);
          const applied = Array.isArray(patch)
            ? (patch as Array<{ field: string; value: PlatformValue }>)
            : Object.entries(patch as PlatformPatch)
                .filter(([, value]) => value !== undefined)
                .map(([field, value]) => ({ field, value: value as PlatformValue }));
          for (const entry of applied) manual.put(entry.field, entry.value);
          return ok();
        },
        overrideObject(field, value) {
          const objectFields = frozenSchema.objectFields ?? [];
          if (!objectFields.includes(field)) {
            return rejectedAction([{ field, message: `Invalid override: "${field}" is not an object field.` }]);
          }
          const issues = validator.validateField(field, value, frozenSchema, generatedLayer.values);
          if (issues.length > 0) return rejectedAction(issues);
          manual.put(field, value as PlatformValue);
          return ok();
        },
        resetField(field) {
          if (!frozenSchema.fields.includes(field)) {
            return rejectedAction([{ field, message: `Invalid override: "${field}" is not an editable field.` }]);
          }
          manual.remove(field);
          return ok();
        },
        resetSection(section) {
          if (!Object.prototype.hasOwnProperty.call(frozenSchema.sections, section)) {
            return rejectedAction([{ field: "section", message: `Invalid override: "${section}" is not a section.` }]);
          }
          manual.removeMany(frozenSchema.sections[section]);
          return ok();
        },
        resetAll() {
          manual.removeAll();
          return ok();
        },
      };

      return { status: "OPEN", session, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejectedOpen([{ field: "framework", message: `The editing session could not be opened: ${message}` }]);
    }
  }

  return { schema: frozenSchema, validator, resolver, open };
}

export { createGeneratedLayer } from "./generated-layer";
export { createManualLayer } from "./manual-layer";
export { createEffectiveLayer } from "./effective-layer";
export { createOverlayResolver } from "./overlay-resolver";
export { createPlatformEditingValidator, freezeDeepPlatform, isDeepFrozenPlatform } from "./editing-validator";
export type { PlatformEffectiveLayer } from "./effective-layer";
export type { PlatformEditingSchema, PlatformIssue, PlatformPatch, PlatformRecord, PlatformValue } from "./editing-validator";
