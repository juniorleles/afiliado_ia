/**
 * Platform Preview Framework.
 *
 * Generic read-only preview of generated, manual, and effective layers, plus
 * side-by-side and diff views. Export yields a frozen view model. Nothing
 * here writes an overlay, names a product engine, or executes a module.
 */
import {
  clonePlatformPatch,
  clonePlatformRecord,
  createPlatformEditingValidator,
  freezeDeepPlatform,
  type PlatformEditingSchema,
  type PlatformPatch,
  type PlatformRecord,
} from "./editing-validator";
import { createOverlayResolver, type PlatformFieldSource, type PlatformResolvedOverlay } from "./overlay-resolver";
import {
  createPlatformPreviewValidator,
  isPlatformPreviewLayer,
  isPlatformPreviewMode,
  type PlatformPreviewIssue,
  type PlatformPreviewMode,
} from "./audit-validator";
import { createPlatformPreviewResolver, type PlatformPreviewLayer, type PlatformPreviewResolver } from "./preview-resolver";
import {
  createPlatformComparisonEngine,
  type PlatformCompareActionResult,
  type PlatformDiffView,
  type PlatformSideBySideView,
} from "./comparison-engine";

export type { PlatformPreviewLayer, PlatformPreviewResolver } from "./preview-resolver";
export { createPlatformPreviewResolver } from "./preview-resolver";
export type {
  PlatformCompareActionResult,
  PlatformCompareResult,
  PlatformCompareRow,
  PlatformDiffRow,
  PlatformDiffView,
  PlatformSideBySideRow,
  PlatformSideBySideView,
} from "./comparison-engine";
export { createPlatformComparisonEngine } from "./comparison-engine";
export type { PlatformPreviewIssue, PlatformPreviewMode } from "./audit-validator";
export { freezeDeepPlatform, isDeepFrozenPlatform } from "./editing-validator";

export type PlatformPreviewActionStatus = "OK" | "REJECTED";

export interface PlatformPreviewActionResult {
  status: PlatformPreviewActionStatus;
  issues: PlatformPreviewIssue[];
}

export interface PlatformPreviewViewModel {
  mode: PlatformPreviewMode;
  generated: PlatformRecord;
  manual: PlatformPatch;
  effective: PlatformRecord;
  sources: Record<string, PlatformFieldSource>;
  overriddenFields: string[];
  layer: PlatformPreviewLayer;
  sideBySide: PlatformSideBySideView;
  diff: PlatformDiffView;
  sections: ReadonlyArray<{ id: string; fields: readonly string[]; changed: boolean }>;
}

export interface PlatformPreviewSession {
  mode(): PlatformPreviewMode;
  setMode(mode: string): PlatformPreviewActionResult;
  layer(): PlatformPreviewLayer;
  generated(): PlatformRecord;
  manual(): PlatformPatch;
  effective(): PlatformRecord;
  sideBySide(): PlatformSideBySideView;
  diff(): PlatformDiffView;
  compare(from: unknown, to: unknown): PlatformCompareActionResult;
  viewModel(): PlatformPreviewViewModel;
  overlay(): PlatformResolvedOverlay;
}

export type PlatformPreviewOpenResult =
  | { status: "OPEN"; session: PlatformPreviewSession; issues: PlatformPreviewIssue[] }
  | { status: "REJECTED"; session: null; issues: PlatformPreviewIssue[] };

export interface PlatformPreviewFramework {
  readonly schema: PlatformEditingSchema;
  readonly resolver: PlatformPreviewResolver;
  open(input: unknown): PlatformPreviewOpenResult;
}

export function createPlatformPreviewFramework(schema: PlatformEditingSchema): PlatformPreviewFramework {
  const editing = createPlatformEditingValidator();
  const validator = createPlatformPreviewValidator();
  const overlay = createOverlayResolver();
  const resolver = createPlatformPreviewResolver();
  const comparer = createPlatformComparisonEngine();
  const frozenSchema = freezeDeepPlatform({
    fields: [...schema.fields],
    sections: Object.fromEntries(Object.entries(schema.sections).map(([key, list]) => [key, [...list]])),
    objectFields: schema.objectFields ? [...schema.objectFields] : [],
  }) as PlatformEditingSchema;

  const rejectedOpen = (issues: PlatformPreviewIssue[]): PlatformPreviewOpenResult => ({ status: "REJECTED", session: null, issues });
  const rejected = (issues: PlatformPreviewIssue[]): PlatformPreviewActionResult => ({ status: "REJECTED", issues });

  function open(raw: unknown): PlatformPreviewOpenResult {
    const schemaIssues = editing.validateSchema(frozenSchema);
    if (schemaIssues.length > 0) {
      return rejectedOpen(schemaIssues.map((item) => ({ field: item.field, message: item.message.startsWith("Invalid") ? item.message.replace(/^Invalid override/, "Invalid preview") : `Invalid preview: ${item.message}` })));
    }
    const previewIssues = validator.validatePreview(raw, frozenSchema);
    if (previewIssues.length > 0) return rejectedOpen(previewIssues);
    const input = raw as { generated: PlatformRecord; overrides?: PlatformPatch; mode?: string };
    const generatedIssues = editing.validateGenerated(input.generated, frozenSchema);
    if (generatedIssues.length > 0) {
      return rejectedOpen(generatedIssues.map((item) => ({ field: item.field, message: `Invalid preview: ${item.message}` })));
    }
    if (input.overrides !== undefined) {
      const patchIssues = editing.validatePatch(input.overrides, frozenSchema, input.generated);
      if (patchIssues.length > 0) {
        return rejectedOpen(patchIssues.map((item) => ({ field: item.field, message: item.message.replace(/^Invalid override/, "Invalid preview").replace(/^Invalid metadata/, "Invalid metadata") })));
      }
    }
    const resolved = overlay.resolve(input.generated, input.overrides ?? {}, frozenSchema);
    const generated = freezeDeepPlatform(clonePlatformRecord(resolved.generated));
    const overrides = freezeDeepPlatform(clonePlatformPatch(resolved.overrides));
    const view: PlatformResolvedOverlay = freezeDeepPlatform({
      generated,
      overrides,
      effective: freezeDeepPlatform(clonePlatformRecord(resolved.effective)),
      sources: { ...resolved.sources },
      overriddenFields: [...resolved.overriddenFields],
    });
    let current: PlatformPreviewMode = input.mode !== undefined && isPlatformPreviewMode(input.mode) ? input.mode : "EFFECTIVE";

    function layerMode(): "GENERATED" | "MANUAL" | "EFFECTIVE" {
      return isPlatformPreviewLayer(current) ? current : "EFFECTIVE";
    }

    const session: PlatformPreviewSession = {
      mode: () => current,
      setMode(mode: string) {
        const issues = validator.validateMode(mode);
        if (issues.length > 0) return rejected(issues);
        current = mode as PlatformPreviewMode;
        return { status: "OK", issues: [] };
      },
      layer: () => freezeDeepPlatform(resolver.layer(view, layerMode(), frozenSchema)),
      generated: () => freezeDeepPlatform(clonePlatformRecord(view.generated)),
      manual: () => freezeDeepPlatform(clonePlatformPatch(view.overrides)),
      effective: () => freezeDeepPlatform(clonePlatformRecord(view.effective)),
      sideBySide: () => comparer.sideBySide(view, frozenSchema),
      diff: () => comparer.diff(view, frozenSchema),
      compare: (from, to) => comparer.compare(from, to, frozenSchema),
      overlay: () => view,
      viewModel() {
        const side = comparer.sideBySide(view, frozenSchema);
        const changed = new Set(side.changedFields);
        return freezeDeepPlatform({
          mode: current,
          generated: clonePlatformRecord(view.generated),
          manual: clonePlatformPatch(view.overrides),
          effective: clonePlatformRecord(view.effective),
          sources: { ...view.sources },
          overriddenFields: [...view.overriddenFields],
          layer: resolver.layer(view, layerMode(), frozenSchema),
          sideBySide: side,
          diff: comparer.diff(view, frozenSchema),
          sections: Object.entries(frozenSchema.sections).map(([id, fields]) => ({
            id,
            fields: [...fields],
            changed: fields.some((field) => changed.has(field)),
          })),
        });
      },
    };

    return { status: "OPEN", session, issues: [] };
  }

  return { schema: frozenSchema, resolver, open };
}
