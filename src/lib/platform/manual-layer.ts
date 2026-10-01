/**
 * Platform Editing Framework: manual layer.
 *
 * Holds operator overrides, one value per field. A field that is not listed
 * here keeps what was generated. Putting the same field twice in one patch is
 * a duplicate override. Replacing a stored field is an edit, not a duplicate.
 */
import {
  clonePlatformPatch,
  clonePlatformValue,
  freezeDeepPlatform,
  type PlatformEditingSchema,
  type PlatformPatch,
  type PlatformValue,
} from "./editing-validator";

export interface PlatformManualLayer {
  list(): PlatformPatch;
  get(field: string): PlatformValue | undefined;
  put(field: string, value: PlatformValue): void;
  remove(field: string): boolean;
  removeMany(fields: readonly string[]): string[];
  removeAll(): string[];
  has(field: string): boolean;
}

export function createManualLayer(_schema: PlatformEditingSchema): PlatformManualLayer {
  const rows = new Map<string, PlatformValue>();
  return {
    list() {
      const patch: PlatformPatch = {};
      for (const [field, value] of rows) patch[field] = clonePlatformValue(value);
      return freezeDeepPlatform(patch);
    },
    get(field) {
      const found = rows.get(field);
      return found === undefined ? undefined : clonePlatformValue(found);
    },
    put(field, value) {
      rows.set(field, clonePlatformValue(value));
    },
    remove(field) {
      return rows.delete(field);
    },
    removeMany(fields) {
      const removed: string[] = [];
      for (const field of fields) {
        if (rows.delete(field)) removed.push(field);
      }
      return removed;
    },
    removeAll() {
      const removed = [...rows.keys()];
      rows.clear();
      return removed;
    },
    has(field) {
      return rows.has(field);
    },
  };
}

export function copyManualPatch(patch: PlatformPatch): PlatformPatch {
  return clonePlatformPatch(patch);
}
