/**
 * Host record domain: ClickBank product importer.
 *
 * Turns a read-only marketplace URL, marketplace product id, and raw HTML
 * into frozen ProductFacts, statistics, metadata, and a snapshot. It
 * restates marketplace fields. It never evaluates a product, never fetches a
 * page, and never runs another engine. A refused input returns REJECTED with
 * issues and no facts. This layer stays offline.
 */
import type { ClickBankContext } from "./clickbank-context";
import { createClickBankParser, type ClickBankParser } from "./clickbank-parser";
import { createClickBankValidator, type ClickBankValidator } from "./clickbank-validator";
import { createClickBankNormalizer, type ClickBankNormalizer } from "./clickbank-normalizer";
import {
  computeClickBankImportStatistics,
  copyPlainClickBank,
  createClickBankImportSnapshot,
  fieldCountOf,
  freezeDeepClickBank,
  type ClickBankImportSnapshot,
  type ClickBankImportStatistics,
  type ClickBankIssue,
  type ClickBankMetadata,
  type ClickBankProductFacts,
} from "./clickbank-types";

export type ClickBankClock = () => number;
export type ClickBankTimestamp = () => string;
export type ClickBankIdFactory = () => string;

export interface ClickBankImportResult {
  status: "OK" | "REJECTED";
  issues: ClickBankIssue[];
  facts: ClickBankProductFacts | null;
  statistics: ClickBankImportStatistics | null;
  snapshot: ClickBankImportSnapshot | null;
  metadata: ClickBankMetadata;
  executionTime: number;
}

export interface ClickBankImporter {
  readonly parser: ClickBankParser;
  readonly validator: ClickBankValidator;
  readonly normalizer: ClickBankNormalizer;
  import(input: unknown): ClickBankImportResult;
  getSnapshot(importId: string): ClickBankImportSnapshot | null;
}

export interface ClickBankImporterOptions {
  parser?: ClickBankParser;
  validator?: ClickBankValidator;
  normalizer?: ClickBankNormalizer;
  now?: ClickBankClock;
  timestamp?: ClickBankTimestamp;
  idFactory?: ClickBankIdFactory;
}

const defaultClock: ClickBankClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function refused(issues: ClickBankIssue[], metadata: ClickBankMetadata, executionTime = 0): ClickBankImportResult {
  return {
    status: "REJECTED",
    issues,
    facts: null,
    statistics: computeClickBankImportStatistics({ importCount: 0, fieldCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createClickBankImporter(options: ClickBankImporterOptions = {}): ClickBankImporter {
  const parser = options.parser ?? createClickBankParser();
  const validator = options.validator ?? createClickBankValidator();
  const normalizer = options.normalizer ?? createClickBankNormalizer();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `import-${++serial}`);
  const snapshots = new Map<string, ClickBankImportSnapshot>();
  const seen = new Set<string>();

  return {
    parser,
    validator,
    normalizer,
    getSnapshot: (importId) => snapshots.get(importId) ?? null,
    import(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainClickBank(input.executionMetadata as ClickBankMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as ClickBankContext;
        const productId = textOf(draft.marketplaceProductId) ?? "";
        const duplicate = validator.detectDuplicate(productId, seen);
        if (duplicate.length > 0) return refused(duplicate, metadata, Math.max(0, now() - start));
        const parsed = parser.parse(draft);
        const extracted = parsed.record;
        const issues = [
          ...parsed.issues,
          ...validator.validateProduct({ ...extracted, marketplaceProductId: productId }),
          ...validator.validateVendor(extracted),
        ];
        if (extracted.affiliatePage) issues.push(...validator.validateUrl(extracted.affiliatePage, "affiliatePage"));
        if (extracted.supportUrl) issues.push(...validator.validateUrl(extracted.supportUrl, "supportUrl"));
        if (issues.length > 0) return refused(issues, metadata, Math.max(0, now() - start));
        const facts = normalizer.normalize(extracted, draft.marketplaceUrl, metadata);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createClickBankImportSnapshot({
          importId: id,
          productId,
          productName: facts.productName,
          vendorId: facts.vendorId,
          marketplaceUrl: facts.marketplaceUrl,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        seen.add(productId);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          facts: freezeDeepClickBank(facts),
          statistics: computeClickBankImportStatistics({
            importCount: 1,
            fieldCount: fieldCountOf(facts),
            issueCount: 0,
            executionTime,
          }),
          snapshot,
          metadata: facts.metadata,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "importer", message: error instanceof Error ? error.message : "Invalid Metadata: the importer could not restate the records." }],
          {},
        );
      }
    },
  };
}
