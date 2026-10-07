/**
 * Host record domain: marketplace resolver.
 *
 * Turns a read-only observed product and supplied listing records into a
 * frozen resolved product and the match evidence it was copied from. It
 * copies listing fields when one record agrees. It does not choose among
 * several agreements and does not reach an outside system. A refused input
 * returns REJECTED with issues and no snapshot. This method never throws.
 */
import { createClickBankClient, type ClickBankClient } from "./clickbank-client";
import { createClickBankMatcher, type ClickBankMatcher } from "./clickbank-matcher";
import { createClickBankSnapshot, type ClickBankSnapshot } from "./clickbank-snapshot";
import {
  copyPlainClickBank,
  createClickBankStatistics,
  freezeDeepClickBank,
  type ClickBankIssue,
  type ClickBankStatistics,
  type MarketplaceRecord,
  type ObservedProduct,
  type ResolutionEvidence,
  type ResolutionMetadata,
  type ResolvedProduct,
} from "./clickbank-types";
import { createClickBankValidator, type ClickBankValidator } from "./clickbank-validator";

export type ClickBankClock = () => number;
export type ClickBankTimestamp = () => string;
export type ClickBankIdFactory = () => string;

export interface ClickBankResolverResult {
  status: "OK" | "REJECTED";
  issues: ClickBankIssue[];
  snapshot: ClickBankSnapshot | null;
  product: ResolvedProduct | null;
  evidence: ResolutionEvidence | null;
  metadata: ResolutionMetadata;
  statistics: ClickBankStatistics;
  executionTime: number;
}

export interface ClickBankResolver {
  readonly client: ClickBankClient;
  readonly matcher: ClickBankMatcher;
  readonly validator: ClickBankValidator;
  resolve(input: unknown): ClickBankResolverResult;
  getSnapshot(resolutionId: string): ClickBankSnapshot | null;
}

export interface ClickBankResolverOptions {
  client?: ClickBankClient;
  matcher?: ClickBankMatcher;
  validator?: ClickBankValidator;
  now?: ClickBankClock;
  timestamp?: ClickBankTimestamp;
  idFactory?: ClickBankIdFactory;
}

const defaultClock: ClickBankClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function refused(issues: ClickBankIssue[], metadata: ResolutionMetadata, executionTime = 0): ClickBankResolverResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    product: null,
    evidence: null,
    metadata,
    statistics: createClickBankStatistics({ catalogCount: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

function observedOf(input: Record<string, unknown>): ObservedProduct {
  const source = isRecord(input.observedProduct) ? input.observedProduct : input;
  return {
    productName: textOrNull(source.productName) ?? "",
    vendor: textOrNull(source.vendor),
    brand: textOrNull(source.brand),
    offerUrl: textOrNull(source.offerUrl),
    primaryDomain: textOrNull(source.primaryDomain),
    primaryOffer: textOrNull(source.primaryOffer),
    category: textOrNull(source.category),
    language: textOrNull(source.language),
    visiblePrice: textOrNull(source.visiblePrice),
    currency: textOrNull(source.currency),
    landingPageId: textOrNull(source.landingPageId),
  };
}

function unmatchedProduct(observed: ObservedProduct): ResolvedProduct {
  return {
    observedProductName: observed.productName,
    observedVendor: observed.vendor,
    vendor: null,
    product: null,
    marketplaceUrl: null,
    gravity: null,
    initialSale: null,
    averageSale: null,
    averageRebill: null,
    commissionType: null,
    category: null,
    language: null,
    affiliateResources: [],
    marketplaceMetadata: {},
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

function resolvedProduct(observed: ObservedProduct, record: MarketplaceRecord): ResolvedProduct {
  return {
    observedProductName: observed.productName,
    observedVendor: observed.vendor,
    vendor: record.vendor,
    product: record.productName,
    marketplaceUrl: record.marketplaceUrl,
    gravity: record.gravity,
    initialSale: record.initialSale,
    averageSale: record.averageSale,
    averageRebill: record.averageRebill,
    commissionType: record.commissionType,
    category: record.category,
    language: record.language,
    affiliateResources: [...record.affiliateResources],
    marketplaceMetadata: { ...record.marketplaceMetadata },
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

export function createClickBankResolver(options: ClickBankResolverOptions = {}): ClickBankResolver {
  const validator = options.validator ?? createClickBankValidator();
  const client = options.client ?? createClickBankClient(validator);
  const matcher = options.matcher ?? createClickBankMatcher();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `resolution-${++serial}`);
  const snapshots = new Map<string, ClickBankSnapshot>();

  return {
    client,
    matcher,
    validator,
    getSnapshot: (resolutionId) => snapshots.get(resolutionId) ?? null,
    resolve(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainClickBank(input.executionMetadata as ResolutionMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const observed = observedOf(input);
        const supplied = Array.isArray(input.marketplaceRecords) ? input.marketplaceRecords : [];
        const records: MarketplaceRecord[] = [];
        for (const item of supplied) {
          const read = client.read(item);
          if (read.issues.length > 0 || read.record === null) return refused(read.issues, metadata, Math.max(0, now() - start));
          records.push(read.record);
        }
        const matched = matcher.match(observed, records);
        if (matched.issues.length > 0 || (matched.record === null && matched.matchMethod !== "UNMATCHED")) {
          return refused(matched.issues, metadata, Math.max(0, now() - start));
        }
        const source = typeof input.marketplaceSource === "string" && input.marketplaceSource.trim() !== "" ? input.marketplaceSource.trim() : "CLICKBANK";
        const product = matched.record === null ? unmatchedProduct(observed) : resolvedProduct(observed, matched.record);
        const evidence: ResolutionEvidence = {
          matchedProductName: matched.record?.productName ?? null,
          matchedVendor: matched.record?.vendor ?? null,
          matchMethod: matched.matchMethod,
          matchConfidence: matched.matchConfidence,
          marketplaceSource: source,
          evidenceMetadata: matched.record === null ? {} : { ...matched.record.marketplaceMetadata },
          origin: "RESOLVED",
          provenance: "DIRECT_SOURCE",
        };
        const executionTime = Math.max(0, now() - start);
        const snapshot = createClickBankSnapshot({ resolutionId: id, product, evidence, createdAt, metadata });
        const snapshotIssues = validator.validateResolution(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepClickBank({
          status: "OK",
          issues: [],
          snapshot,
          product: snapshot.product,
          evidence: snapshot.evidence,
          metadata,
          statistics: createClickBankStatistics({ catalogCount: records.length, issueCount: 0, executionTime }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "resolver", message: error instanceof Error ? error.message : "Corrupted Resolution: the resolver could not restate the listing." }], {});
      }
    },
  };
}
