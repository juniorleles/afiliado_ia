/**
 * Host record domain: SearchApi normalizer.
 *
 * Turns one provider response into a Market Discovery search snapshot, SERP
 * records, and sponsored results. It does not retrieve a page, identify a
 * product, or build a market report.
 */
import { mapSearchApi } from "./searchapi-mapper";
import { createNormalizerSnapshot, createNormalizerStatistics, type NormalizerSnapshot } from "./searchapi-snapshot";
import { copyPlainNormalizer, freezeDeepNormalizer, type FlatRecord, type NormalizerIssue } from "./searchapi-types";
import { createSearchApiNormalizerValidator, type SearchApiNormalizerValidator } from "./searchapi-validator";

export type NormalizerClock = () => number;
export type NormalizerTimestamp = () => string;
export type NormalizerIdFactory = () => string;

export interface NormalizerResponse {
  status: "OK" | "REJECTED";
  issues: readonly NormalizerIssue[];
  snapshot: NormalizerSnapshot | null;
  metadata: FlatRecord;
  statistics: ReturnType<typeof createNormalizerStatistics>;
}

export interface SearchApiNormalizer {
  readonly validator: SearchApiNormalizerValidator;
  normalize(input: unknown): NormalizerResponse;
  getSnapshot(normalizationId: string): NormalizerSnapshot | null;
}

export interface SearchApiNormalizerOptions {
  validator?: SearchApiNormalizerValidator;
  now?: NormalizerClock;
  timestamp?: NormalizerTimestamp;
  idFactory?: NormalizerIdFactory;
}

const defaultClock: NormalizerClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSearchApiNormalizer(options: SearchApiNormalizerOptions = {}): SearchApiNormalizer {
  const validator = options.validator ?? createSearchApiNormalizerValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `normalization-${++serial}`);
  const snapshots = new Map<string, NormalizerSnapshot>();

  function refused(issues: readonly NormalizerIssue[], metadata: FlatRecord, executionTime: number): NormalizerResponse {
    return freezeDeepNormalizer({
      status: "REJECTED",
      issues: [...issues],
      snapshot: null,
      metadata,
      statistics: createNormalizerStatistics({ serpCount: 0, sponsoredCount: 0, issueCount: issues.length, executionTime }),
    });
  }

  return {
    validator,
    getSnapshot: (normalizationId) => snapshots.get(normalizationId) ?? null,
    normalize(input) {
      const start = now();
      const metadata = isRecord(input) && isRecord(input.metadata) ? copyPlainNormalizer(input.metadata as FlatRecord) : {};
      try {
        const validated = validator.validate(input);
        if (validated.issues.length > 0 || validated.view === null) return refused(validated.issues, metadata, Math.max(0, now() - start));
        const normalizationId = idFactory();
        if (!/^[a-z][a-z0-9-]*$/.test(normalizationId)) {
          return refused([{ field: "normalizationId", message: "Invalid Provider Snapshot: a well-formed snapshot id is required." }], metadata, Math.max(0, now() - start));
        }
        const mapped = mapSearchApi(validated.view);
        const executionTime = Math.max(0, now() - start);
        const statistics = { serpCount: mapped.serpRecords.length, sponsoredCount: mapped.sponsoredResults.length, issueCount: 0, executionTime };
        const snapshot = createNormalizerSnapshot({
          normalizationId,
          searchSnapshot: mapped.searchSnapshot,
          serpRecords: mapped.serpRecords,
          sponsoredResults: mapped.sponsoredResults,
          searchMetadata: mapped.searchMetadata,
          statistics,
          createdAt: timestamp(),
          metadata: validated.view.executionMetadata,
        });
        snapshots.set(normalizationId, snapshot);
        return freezeDeepNormalizer({
          status: "OK",
          issues: [],
          snapshot,
          metadata: snapshot.metadata,
          statistics: snapshot.statistics,
        });
      } catch {
        return refused([{ field: "providerResponse", message: "Malformed Provider Response: the provider response could not be normalized." }], metadata, Math.max(0, now() - start));
      }
    },
  };
}
