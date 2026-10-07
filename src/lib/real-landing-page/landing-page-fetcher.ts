/**
 * Host record domain: real landing page fetcher.
 *
 * Downloads one HTML document for each sponsored destination, follows the
 * redirect chain, and returns frozen page snapshots. It does not read the
 * markup and it does not name a product. A refused destination stops the
 * walk. This method never throws.
 */
import type { RealLandingPageMetadata } from "./landing-page-context";
import { createLandingPageHttpClient, REAL_LANDING_PAGE_MAX_BYTES, REAL_LANDING_PAGE_TIMEOUT_MS, type LandingPageHttpClient } from "./landing-page-http-client";
import { createRealLandingPageValidator, type RealLandingPageValidator } from "./landing-page-validator";
import {
  copyPlainRealLandingPage,
  createRealLandingPageSessionSnapshot,
  createRealLandingPageSnapshot,
  createRealLandingPageStatistics,
  freezeDeepRealLandingPage,
  type RealLandingPageIssue,
  type RealLandingPageResult,
  type RealLandingPageSnapshot,
} from "./landing-page-response";

export type RealLandingPageClock = () => number;
export type RealLandingPageTimestamp = () => string;
export type RealLandingPageIdFactory = () => string;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

export interface RealLandingPageFetcherOptions {
  now?: RealLandingPageClock;
  timestamp?: RealLandingPageTimestamp;
  idFactory?: RealLandingPageIdFactory;
  client?: LandingPageHttpClient;
  maxBytes?: number;
  maxRedirects?: number;
  validator?: RealLandingPageValidator;
}

export interface RealLandingPageFetcher {
  readonly validator: RealLandingPageValidator;
  collect(input: unknown): Promise<RealLandingPageResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nextUrl(current: string, location: unknown): string | null {
  if (typeof location !== "string" || location.trim() === "") return null;
  try {
    const resolved = new URL(location.trim(), current);
    if (resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function headerMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key.toLowerCase()] = value;
  }
  return out;
}

export function createRealLandingPageFetcher(options: RealLandingPageFetcherOptions = {}): RealLandingPageFetcher {
  const validator = options.validator ?? createRealLandingPageValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const maxBytes = options.maxBytes ?? REAL_LANDING_PAGE_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const client = options.client ?? createLandingPageHttpClient({ maxBytes, timeoutMs: REAL_LANDING_PAGE_TIMEOUT_MS });
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `landing-session-${++serial}`);

  return {
    validator,
    async collect(input) {
      const started = now();
      let requestCount = 0;
      const refused = (issues: RealLandingPageIssue[], metadata: RealLandingPageMetadata = {}): RealLandingPageResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRealLandingPage({
          status: "REJECTED",
          issues,
          pages: null,
          statistics: createRealLandingPageStatistics({ requestCount, pageCount: 0, responseBytes: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const sessionId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? copyPlainRealLandingPage(input.executionMetadata as RealLandingPageMetadata) : {};
        const sponsored = input.sponsoredResults as readonly unknown[];
        const maxPages = typeof input.maxPages === "number" ? input.maxPages : sponsored.length;
        const budget = typeof input.maxRequests === "number" ? input.maxRequests : Number.POSITIVE_INFINITY;
        const selected = sponsored.slice(0, maxPages);
        const urls = selected.map((item) => (isRecord(item) ? textOf(item.url) : ""));
        const pages: RealLandingPageSnapshot[] = [];
        let responseBytes = 0;
        let halt = false;

        for (let index = 0; index < selected.length; index += 1) {
          if (requestCount >= budget || halt) break;
          const originalUrl = urls[index] ?? "";
          const urlIssues = validator.validateUrl(originalUrl);
          if (urlIssues.length > 0) return refused(urlIssues, metadata);
          const pageStarted = now();
          const chain = [originalUrl];
          let current = originalUrl;
          let redirects = 0;
          let finished = false;

          while (!finished) {
            if (requestCount >= budget) {
              if (pages.length === 0) {
                return refused([{ field: "maxRequests", message: "Invalid Metadata: the request limit stopped the retrieval before a page was stored." }], metadata);
              }
              halt = true;
              break;
            }
            requestCount += 1;
            const response = await client.request(current);
            if (response.timedOut) return refused([{ field: "timeout", message: "Timeout: the destination page was not retrieved before the time limit." }], metadata);
            if (response.httpStatus === 0) return refused([{ field: "url", message: "Invalid URL: the destination did not return a response." }], metadata);
            if (REDIRECT_STATUSES.has(response.httpStatus)) {
              redirects += 1;
              const location = nextUrl(current, headerMap(response.headers).location);
              if (location === null) return refused([{ field: "url", message: "Invalid URL: a redirect address must be an https address." }], metadata);
              if (chain.includes(location) || redirects > maxRedirects) {
                return refused([{ field: "redirects", message: "Redirect Loop: the destination address repeats in the redirect chain." }], metadata);
              }
              chain.push(location);
              current = location;
              continue;
            }
            const headers = headerMap(response.headers);
            const bytes = Buffer.byteLength(response.bodyText);
            if (response.tooLarge || validator.validateSize(bytes, maxBytes).length > 0) {
              return refused([{ field: "responseBytes", message: "Response Too Large: the destination page exceeds the size limit." }], metadata);
            }
            const typeIssues = validator.validateContentType(headers["content-type"]);
            if (typeIssues.length > 0) return refused(typeIssues, metadata);
            const responseTime = Math.max(0, now() - pageStarted);
            const page = createRealLandingPageSnapshot({
              landingPageId: `${sessionId}-page-${pages.length + 1}`,
              originalUrl,
              finalUrl: current,
              redirectChain: chain,
              httpStatus: response.httpStatus,
              headers,
              html: response.bodyText,
              responseBytes: bytes,
              responseTime,
              retrievedAt: createdAt,
              metadata,
            });
            pages.push(page);
            responseBytes += bytes;
            finished = true;
          }
          if (halt) break;
        }

        const executionTime = Math.max(0, now() - started);
        const statistics = createRealLandingPageStatistics({
          requestCount,
          pageCount: pages.length,
          responseBytes,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createRealLandingPageSessionSnapshot({
          sessionId,
          pages,
          statistics,
          context: { urls },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        return freezeDeepRealLandingPage({
          status: "OK",
          issues: [],
          pages: snapshot.pages,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "collector", message: "Invalid Metadata: the collector could not restate the pages." }]);
      }
    },
  };
}
