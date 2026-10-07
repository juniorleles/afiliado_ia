/**
 * Host record domain: read-only landing page collector context.
 *
 * Interface only. The host is given sponsored results, the supplied page
 * responses, and flat metadata. It does not request a page.
 */
import type { SponsoredResult } from "./sponsored-types";
import type { LandingPageMetadata } from "./landing-page-types";

export const LANDING_PAGE_CONTEXT_MEMBERS = ["sponsoredResults", "pages", "executionMetadata", "runtimeMetadata", "configuration"] as const;

export const LANDING_PAGE_RESPONSE_KEYS = ["destinationUrl", "finalUrl", "httpStatus", "headers", "html", "timedOut", "redirects"] as const;

/**
 * A destination response supplied with the sponsored result. The collector
 * copies it. It does not open the address.
 */
export interface LandingPageResponse {
  destinationUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: LandingPageMetadata;
  html: string;
  timedOut?: boolean;
  redirects?: readonly string[];
}

/**
 * Read-only bundle one collection may be given. Nothing here is written back.
 */
export interface LandingPageContext {
  sponsoredResults: readonly SponsoredResult[];
  pages?: readonly LandingPageResponse[];
  executionMetadata?: LandingPageMetadata;
  runtimeMetadata?: LandingPageMetadata;
  configuration?: LandingPageMetadata;
}
