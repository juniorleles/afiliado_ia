/**
 * Platform Editing Framework: overlay resolver.
 *
 * Builds the effective record from the generated record and the manual
 * overrides. An override replaces that field only. Fields without an override
 * keep the generated value. The generated record is never rewritten.
 */
import {
  canonicalPlatform,
  clonePlatformRecord,
  clonePlatformValue,
  type PlatformEditingSchema,
  type PlatformPatch,
  type PlatformRecord,
  type PlatformValue,
} from "./editing-validator";

export type PlatformFieldSource = "GENERATED" | "MANUAL";

export interface PlatformResolvedOverlay {
  generated: PlatformRecord;
  overrides: PlatformPatch;
  effective: PlatformRecord;
  sources: Record<string, PlatformFieldSource>;
  overriddenFields: string[];
}

export interface PlatformOverlayResolver {
  resolve(generated: PlatformRecord, overrides: PlatformPatch, schema: PlatformEditingSchema): PlatformResolvedOverlay;
  differs(generated: PlatformValue, value: PlatformValue): boolean;
}

export function createOverlayResolver(): PlatformOverlayResolver {
  function differs(generated: PlatformValue, value: PlatformValue): boolean {
    return canonicalPlatform(generated) !== canonicalPlatform(value);
  }

  function resolve(generated: PlatformRecord, overrides: PlatformPatch, schema: PlatformEditingSchema): PlatformResolvedOverlay {
    const effective = clonePlatformRecord(generated);
    const sources: Record<string, PlatformFieldSource> = {};
    const overriddenFields: string[] = [];
    for (const field of schema.fields) {
      const manual = Object.prototype.hasOwnProperty.call(overrides, field) && overrides[field] !== undefined;
      sources[field] = manual ? "MANUAL" : "GENERATED";
      if (manual) {
        effective[field] = clonePlatformValue(overrides[field] as PlatformValue);
        overriddenFields.push(field);
      }
    }
    return {
      generated: clonePlatformRecord(generated),
      overrides: Object.fromEntries(
        overriddenFields.map((field) => [field, clonePlatformValue(overrides[field] as PlatformValue)]),
      ),
      effective,
      sources,
      overriddenFields,
    };
  }

  return { resolve, differs };
}
