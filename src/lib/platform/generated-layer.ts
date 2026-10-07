/**
 * Platform Editing Framework: generated layer.
 *
 * A frozen copy of the caller-supplied record. Later edits never write back
 * into this copy. The framework does not invent fields and does not read any
 * other engine.
 */
import {
  clonePlatformRecord,
  freezeDeepPlatform,
  type PlatformEditingSchema,
  type PlatformIssue,
  type PlatformRecord,
  createPlatformEditingValidator,
} from "./editing-validator";

export interface PlatformGeneratedLayer {
  readonly schema: PlatformEditingSchema;
  readonly values: PlatformRecord;
}

export function createGeneratedLayer(
  generated: unknown,
  schema: PlatformEditingSchema,
): { issues: PlatformIssue[]; layer: PlatformGeneratedLayer | null } {
  const issues = createPlatformEditingValidator().validateGenerated(generated, schema);
  if (issues.length > 0) return { issues, layer: null };
  const values = freezeDeepPlatform(clonePlatformRecord(generated as PlatformRecord));
  return { issues: [], layer: { schema, values } };
}
