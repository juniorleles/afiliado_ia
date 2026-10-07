/**
 * Host record domain: real landing page session.
 *
 * One entry point from sponsored destinations to frozen landing page
 * snapshots. It stores a session in memory. A refused collection returns
 * REJECTED and stores nothing. This method never throws.
 */
import { createRealLandingPageFetcher, type RealLandingPageFetcherOptions } from "./landing-page-fetcher";
import { freezeDeepRealLandingPage, type RealLandingPageResult, type RealLandingPageSessionSnapshot } from "./landing-page-response";
import type { RealLandingPageValidator } from "./landing-page-validator";

export interface RealLandingPageSession {
  readonly validator: RealLandingPageValidator;
  collect(input: unknown): Promise<RealLandingPageResult>;
  getSnapshot(sessionId: string): RealLandingPageSessionSnapshot | null;
}

export function createRealLandingPageSession(options: RealLandingPageFetcherOptions = {}): RealLandingPageSession {
  const fetcher = createRealLandingPageFetcher(options);
  const snapshots = new Map<string, RealLandingPageSessionSnapshot>();
  return {
    validator: fetcher.validator,
    async collect(input) {
      try {
        const result = await fetcher.collect(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.sessionId, result.snapshot);
        return result;
      } catch {
        return freezeDeepRealLandingPage({
          status: "REJECTED",
          issues: [{ field: "collector", message: "Invalid Metadata: the collector could not restate the pages." }],
          pages: null,
          statistics: { requestCount: 0, pageCount: 0, responseBytes: 0, issueCount: 1, executionTime: 0 },
          snapshot: null,
          metadata: {},
          executionTime: 0,
        });
      }
    },
    getSnapshot: (sessionId) => snapshots.get(sessionId) ?? null,
  };
}
