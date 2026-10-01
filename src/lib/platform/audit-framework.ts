/**
 * Platform Audit Framework.
 *
 * Generic append-only audit records for any platform module. Record and list
 * never rewrite earlier entries. Nothing here knows a product, a page, an
 * analysis, or an advertising platform.
 */
import { createPlatformAuditRecorder, type PlatformAuditActionResult, type PlatformAuditRecorder, type PlatformAuditRecorderOptions } from "./audit-recorder";
import {
  createPlatformPreviewValidator,
  type PlatformAuditRecord,
  type PlatformPreviewIssue,
  type PlatformPreviewValidator,
} from "./audit-validator";

export type { PlatformAuditActionResult, PlatformAuditRecorder, PlatformAuditRecorderOptions } from "./audit-recorder";
export { createPlatformAuditRecorder } from "./audit-recorder";
export type {
  PlatformAuditDraft,
  PlatformAuditRecord,
  PlatformCompareKind,
  PlatformPreviewIssue,
  PlatformPreviewLayerMode,
  PlatformPreviewMode,
  PlatformPreviewValidator,
} from "./audit-validator";
export {
  createPlatformPreviewValidator,
  isPlatformCompareKind,
  isPlatformPreviewLayer,
  isPlatformPreviewMode,
  PLATFORM_COMPARE_KINDS,
  PLATFORM_PREVIEW_LAYERS,
  PLATFORM_PREVIEW_MODES,
} from "./audit-validator";

export interface PlatformAuditFramework {
  readonly validator: PlatformPreviewValidator;
  readonly recorder: PlatformAuditRecorder;
  record(input: unknown): PlatformAuditActionResult;
  list(): PlatformAuditRecord[];
  get(auditId: string): PlatformAuditRecord | null;
  validate(input: unknown): PlatformPreviewIssue[];
}

export function createPlatformAuditFramework(options: PlatformAuditRecorderOptions = {}): PlatformAuditFramework {
  const validator = createPlatformPreviewValidator();
  const recorder = createPlatformAuditRecorder(options);
  return {
    validator,
    recorder,
    record: (input) => recorder.record(input),
    list: () => recorder.list(),
    get: (auditId) => recorder.get(auditId),
    validate: (input) => validator.validateAudit(input, new Set(recorder.list().map((item) => item.auditId))),
  };
}
