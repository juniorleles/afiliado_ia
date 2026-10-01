/**
 * Platform Preview: resolver.
 *
 * Picks one overlay layer: generated, manual, or effective. It returns copies
 * and never writes back into the generated record or the manual patch.
 */
import {
  clonePlatformRecord,
  type PlatformEditingSchema,
  type PlatformRecord,
  type PlatformValue,
} from "./editing-validator";
import type { PlatformFieldSource, PlatformResolvedOverlay } from "./overlay-resolver";
import type { PlatformPreviewLayerMode } from "./audit-validator";

export interface PlatformPreviewLayer {
  mode: PlatformPreviewLayerMode;
  values: PlatformRecord;
  present: Record<string, boolean>;
  sources: Record<string, PlatformFieldSource>;
}

export interface PlatformPreviewResolver {
  layer(view: PlatformResolvedOverlay, mode: PlatformPreviewLayerMode, schema: PlatformEditingSchema): PlatformPreviewLayer;
  values(view: PlatformResolvedOverlay, mode: PlatformPreviewLayerMode, schema: PlatformEditingSchema): PlatformRecord;
}

function presentMap(schema: PlatformEditingSchema, overridden: readonly string[]): Record<string, boolean> {
  const present: Record<string, boolean> = {};
  const set = new Set(overridden);
  for (const field of schema.fields) present[field] = set.has(field);
  return present;
}

function generatedSources(schema: PlatformEditingSchema): Record<string, PlatformFieldSource> {
  return Object.fromEntries(schema.fields.map((field) => [field, "GENERATED"]));
}

export function createPlatformPreviewResolver(): PlatformPreviewResolver {
  function layer(view: PlatformResolvedOverlay, mode: PlatformPreviewLayerMode, schema: PlatformEditingSchema): PlatformPreviewLayer {
    if (mode === "GENERATED") {
      return {
        mode,
        values: clonePlatformRecord(view.generated),
        present: presentMap(schema, []),
        sources: generatedSources(schema),
      };
    }
    if (mode === "MANUAL") {
      const values: PlatformRecord = {};
      const present = presentMap(schema, view.overriddenFields);
      for (const field of view.overriddenFields) {
        const value = view.overrides[field];
        if (value !== undefined) values[field] = value as PlatformValue;
      }
      return {
        mode,
        values,
        present,
        sources: { ...view.sources },
      };
    }
    return {
      mode: "EFFECTIVE",
      values: clonePlatformRecord(view.effective),
      present: presentMap(schema, view.overriddenFields),
      sources: { ...view.sources },
    };
  }

  function values(view: PlatformResolvedOverlay, mode: PlatformPreviewLayerMode, schema: PlatformEditingSchema): PlatformRecord {
    return clonePlatformRecord(layer(view, mode, schema).values);
  }

  return { layer, values };
}
