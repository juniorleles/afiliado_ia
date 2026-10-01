/**
 * Platform Editing Framework: effective layer.
 *
 * The resolved view: generated values, the stored manual overrides, and the
 * effective record. It is frozen. Nothing here changes the generated layer.
 */
import { freezeDeepPlatform, type PlatformPatch, type PlatformRecord } from "./editing-validator";
import type { PlatformFieldSource, PlatformResolvedOverlay } from "./overlay-resolver";

export interface PlatformEffectiveLayer extends PlatformResolvedOverlay {
  generated: PlatformRecord;
  overrides: PlatformPatch;
  effective: PlatformRecord;
  sources: Record<string, PlatformFieldSource>;
  overriddenFields: string[];
}

export function createEffectiveLayer(resolved: PlatformResolvedOverlay): PlatformEffectiveLayer {
  return freezeDeepPlatform({
    generated: resolved.generated,
    overrides: resolved.overrides,
    effective: resolved.effective,
    sources: resolved.sources,
    overriddenFields: [...resolved.overriddenFields],
  });
}
