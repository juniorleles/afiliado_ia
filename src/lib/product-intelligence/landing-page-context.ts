/**
 * Host record domain: read-only landing page intelligence context.
 *
 * Interface only. The host is given a landing page URL, raw HTML, an optional
 * DOM snapshot, and flat metadata. It does not fetch a page, does not change
 * the input, and does not run another engine.
 */
import type { LandingPageMetadata } from "./landing-page-evidence";

export const LANDING_PAGE_CONTEXT_MEMBERS = [
  "landingPageUrl",
  "rawHtml",
  "domSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one analysis may be given. Nothing here is written back to
 * another engine.
 */
export interface LandingPageContext {
  landingPageUrl: string;
  rawHtml?: string;
  domSnapshot?: unknown;
  executionMetadata?: LandingPageMetadata;
  runtimeMetadata?: LandingPageMetadata;
  configuration?: LandingPageMetadata;
}
