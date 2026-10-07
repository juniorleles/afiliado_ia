/**
 * Host record domain: read-only real product identifier context.
 *
 * Interface only. One identification is given landing page snapshots.
 * It does not request a page.
 */
import type { RealLandingPageSnapshot } from "../real-landing-page/landing-page-response";

export type RealProductMetadata = Record<string, string | number | boolean | null>;

export const REAL_PRODUCT_CONTEXT_MEMBERS = [
  "landingPageSnapshots",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one identification may be given. Nothing here is written back.
 */
export interface RealProductContext {
  landingPageSnapshots?: readonly RealLandingPageSnapshot[];
  executionMetadata?: RealProductMetadata;
  runtimeMetadata?: RealProductMetadata;
  configuration?: RealProductMetadata;
}
