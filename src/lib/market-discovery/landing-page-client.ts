/**
 * Host record domain: landing page client.
 *
 * Copies a supplied destination response onto the sponsored result address.
 * A supplied redirect chain resolves to its last address. It does not open
 * the address and it does not read the page text.
 */
import type { LandingPageResponse } from "./landing-page-context";
import { copyPlainLandingPage, type LandingPageMetadata } from "./landing-page-types";
import type { SponsoredResult } from "./sponsored-types";

export interface LandingPageDraft {
  destinationUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: LandingPageMetadata;
  html: string;
  retrievedAt: string;
}

export interface LandingPageClient {
  collect(result: SponsoredResult, page: LandingPageResponse, retrievedAt: string): LandingPageDraft;
}

function resolvedFinalUrl(page: LandingPageResponse): string {
  const hops = page.redirects;
  if (!Array.isArray(hops) || hops.length === 0) return page.finalUrl;
  const last = hops[hops.length - 1];
  return typeof last === "string" ? last.trim() : page.finalUrl;
}

export function createLandingPageClient(): LandingPageClient {
  return {
    collect(result, page, retrievedAt) {
      return {
        destinationUrl: result.url ?? page.destinationUrl,
        finalUrl: resolvedFinalUrl(page),
        httpStatus: page.httpStatus,
        headers: copyPlainLandingPage(page.headers),
        html: page.html,
        retrievedAt,
      };
    },
  };
}
