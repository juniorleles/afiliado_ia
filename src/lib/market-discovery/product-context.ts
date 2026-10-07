/**
 * Host record domain: read-only product identifier context.
 *
 * Interface only. The host is given landing page snapshots and flat metadata.
 * It does not request a page.
 */
import type { LandingPageSnapshot } from "./landing-page-snapshot";
import type { ProductMetadata } from "./product-types";

export const PRODUCT_CONTEXT_MEMBERS = ["landingPageSnapshots", "landingPageSnapshot", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one identification may be given. Nothing here is written back.
 */
export interface ProductContext {
  landingPageSnapshots?: readonly LandingPageSnapshot[];
  landingPageSnapshot?: LandingPageSnapshot;
  executionMetadata?: ProductMetadata;
  runtimeMetadata?: ProductMetadata;
  configuration?: ProductMetadata;
}
