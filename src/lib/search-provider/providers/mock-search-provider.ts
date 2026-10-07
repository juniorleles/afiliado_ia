/**
 * Host record domain: mock search provider.
 *
 * Copies a supplied search page into a frozen snapshot. It does not request
 * a page and it does not read the markup.
 */
import type { SearchProvider } from "../search-provider";
import { createSearchProviderValidator, type SearchProviderValidator } from "../search-provider-validator";
import { copyPlainSearchProvider, freezeDeepSearchProvider, type SearchMetadata, type SearchResponse, type SearchSnapshot } from "../search-provider-types";

export const MOCK_PROVIDER = "MOCK";

export type MockSearchClock = () => number;
export type MockSearchTimestamp = () => string;
export type MockSearchIdFactory = () => string;

export interface MockSearchProvider extends SearchProvider {
  readonly validator: SearchProviderValidator;
  getSnapshot(snapshotId: string): SearchSnapshot | null;
}

export interface MockSearchProviderOptions {
  validator?: SearchProviderValidator;
  now?: MockSearchClock;
  timestamp?: MockSearchTimestamp;
  idFactory?: MockSearchIdFactory;
}

const defaultClock: MockSearchClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMockSearchProvider(options: MockSearchProviderOptions = {}): MockSearchProvider {
  const validator = options.validator ?? createSearchProviderValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `snapshot-${++serial}`);
  const snapshots = new Map<string, SearchSnapshot>();

  function refused(issues: SearchResponse["issues"], metadata: SearchMetadata = {}, executionTime = 0): SearchResponse {
    return freezeDeepSearchProvider({
      status: "REJECTED",
      issues: [...issues],
      snapshot: null,
      metadata,
      executionTime,
    });
  }

  return {
    provider: MOCK_PROVIDER,
    validator,
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
    search(input) {
      try {
        const start = now();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSearchProvider(input.executionMetadata as SearchMetadata) : {};
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues, metadata, Math.max(0, now() - start));
        if (input.provider !== MOCK_PROVIDER) {
          return refused([{ field: "provider", message: "Invalid Provider Contract: this provider does not serve that name." }], metadata, Math.max(0, now() - start));
        }
        const snapshotId = idFactory();
        const idIssues = validator.validateSnapshotId(snapshotId);
        if (idIssues.length > 0) return refused(idIssues, metadata, Math.max(0, now() - start));
        const snapshot = freezeDeepSearchProvider({
          snapshotId,
          provider: MOCK_PROVIDER,
          query: (input.keyword as string).trim(),
          language: input.language as string,
          country: input.country as string,
          device: input.device as SearchSnapshot["device"],
          market: input.market as string,
          html: input.searchHtml as string,
          collectedAt: timestamp(),
          origin: "COLLECTED" as const,
          provenance: "DIRECT_SOURCE" as const,
          metadata,
        });
        snapshots.set(snapshotId, snapshot);
        const executionTime = Math.max(0, now() - start);
        return freezeDeepSearchProvider({
          status: "OK",
          issues: [],
          snapshot,
          metadata,
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "provider", message: error instanceof Error ? error.message : "Invalid Metadata: the provider could not restate the page." }]);
      }
    },
  };
}
