/**
 * Host record domain: SearchApi provider.
 *
 * Retrieves one Google search JSON document and stores it unchanged.
 * It does not read listings, choose a page, or identify a product.
 */
import { createSearchApiClient, readSearchApiKey, type SearchApiClient, type SearchApiKeyReader, type SearchApiTransport } from "../searchapi-client";
import { createSearchApiSnapshot, createSearchApiStatistics } from "../searchapi-snapshot";
import { copyPlainSearchApi, freezeDeepSearchApi, SEARCHAPI_PROVIDER_NAME, type ProviderResponse, type SearchApiDevice, type SearchApiIssue, type SearchApiMetadata, type SearchApiSnapshot } from "../searchapi-types";
import { createSearchApiValidator, type SearchApiValidator } from "../searchapi-validator";

export type SearchApiClock = () => number;
export type SearchApiTimestamp = () => string;
export type SearchApiIdFactory = () => string;

export interface SearchApiProvider {
  readonly provider: typeof SEARCHAPI_PROVIDER_NAME;
  readonly validator: SearchApiValidator;
  search(input: unknown): Promise<ProviderResponse>;
  getSnapshot(snapshotId: string): SearchApiSnapshot | null;
}

export interface SearchApiProviderOptions {
  validator?: SearchApiValidator;
  client?: SearchApiClient;
  transport?: SearchApiTransport;
  keyReader?: SearchApiKeyReader;
  now?: SearchApiClock;
  timestamp?: SearchApiTimestamp;
  idFactory?: SearchApiIdFactory;
}

const defaultClock: SearchApiClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSearchApiProvider(options: SearchApiProviderOptions = {}): SearchApiProvider {
  const validator = options.validator ?? createSearchApiValidator();
  const keyReader = options.keyReader ?? (() => readSearchApiKey());
  const client = options.client ?? createSearchApiClient({ transport: options.transport, keyReader });
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `searchapi-${++serial}`);
  const snapshots = new Map<string, SearchApiSnapshot>();

  function refused(issues: readonly SearchApiIssue[], metadata: SearchApiMetadata, requestCount: number, payloadBytes: number, executionTime: number): ProviderResponse {
    return freezeDeepSearchApi({
      status: "REJECTED",
      issues: [...issues],
      snapshot: null,
      metadata,
      statistics: createSearchApiStatistics({
        requestCount,
        payloadBytes,
        issueCount: issues.length,
        executionTime,
      }),
    });
  }

  return {
    provider: SEARCHAPI_PROVIDER_NAME,
    validator,
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
    async search(input) {
      const start = now();
      const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSearchApi(input.executionMetadata as SearchApiMetadata) : {};
      try {
        const issues = [...validator.validateInput(input)];
        if (!keyReader().trim()) issues.push({ field: "apiKey", message: "Missing API Key: SEARCHAPI_API_KEY is required." });
        if (issues.length > 0 || !isRecord(input)) return refused(issues, metadata, 0, 0, Math.max(0, now() - start));
        const keyword = (input.keyword as string).trim();
        const country = input.country as string;
        const language = input.language as string;
        const device = input.device as SearchApiDevice;
        const searchOptions = validator.searchOptionsOf(input);
        const result = await client.request({ keyword, country, language, device, searchOptions });
        const payloadBytes = result.bodyText.length;
        const executionTime = Math.max(0, now() - start);
        if (result.httpStatus < 200 || result.httpStatus >= 300) {
          return refused([{ field: "httpStatus", message: `HTTP Errors: the provider returned status ${result.httpStatus}.` }], metadata, 1, payloadBytes, executionTime);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(result.bodyText);
        } catch {
          return refused([{ field: "raw", message: "Malformed Response: a JSON object is required." }], metadata, 1, payloadBytes, executionTime);
        }
        if (!isRecord(parsed)) return refused([{ field: "raw", message: "Malformed Response: a JSON object is required." }], metadata, 1, payloadBytes, executionTime);
        const snapshotId = idFactory();
        const idIssues = validator.validateSnapshotId(snapshotId);
        if (idIssues.length > 0) return refused(idIssues, metadata, 1, payloadBytes, executionTime);
        const snapshot = createSearchApiSnapshot({
          snapshotId,
          keyword,
          country,
          language,
          device,
          searchOptions,
          raw: parsed,
          collectedAt: timestamp(),
          metadata,
        });
        snapshots.set(snapshotId, snapshot);
        return freezeDeepSearchApi({
          status: "OK",
          issues: [],
          snapshot,
          metadata,
          statistics: createSearchApiStatistics({ requestCount: 1, payloadBytes, issueCount: 0, executionTime }),
        });
      } catch {
        return refused([{ field: "httpStatus", message: "HTTP Errors: the search request did not complete." }], metadata, 0, 0, Math.max(0, now() - start));
      }
    },
  };
}
