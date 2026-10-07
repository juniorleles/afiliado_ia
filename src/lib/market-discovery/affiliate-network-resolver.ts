/**
 * Host record domain: affiliate network resolver.
 *
 * Asks registered provider adapters to restate affiliate listing fields for
 * one observed product. Results stay in the requested provider order. A
 * refused input returns REJECTED with issues and no snapshot. This method
 * never throws.
 */
import type { AffiliateProvider } from "./affiliate-provider";
import { createAffiliateProviderRegistry, type AffiliateProviderRegistry } from "./affiliate-provider-registry";
import { createAffiliateSnapshot, type AffiliateSnapshot } from "./affiliate-provider-snapshot";
import {
  copyPlainAffiliate,
  createAffiliateStatistics,
  freezeDeepAffiliate,
  type AffiliateIssue,
  type AffiliateStatistics,
  type ObservedProduct,
  type ResolutionEvidence,
  type ResolutionMetadata,
  type ResolvedAffiliateProduct,
} from "./affiliate-provider-types";
import { createAffiliateProviderValidator, type AffiliateValidator } from "./affiliate-provider-validator";

export type AffiliateClock = () => number;
export type AffiliateTimestamp = () => string;
export type AffiliateIdFactory = () => string;

export interface AffiliateResolverResult {
  status: "OK" | "REJECTED";
  issues: AffiliateIssue[];
  snapshot: AffiliateSnapshot | null;
  products: readonly ResolvedAffiliateProduct[] | null;
  evidence: readonly ResolutionEvidence[] | null;
  metadata: ResolutionMetadata;
  statistics: AffiliateStatistics;
  executionTime: number;
}

export interface AffiliateNetworkResolver {
  readonly registry: AffiliateProviderRegistry;
  readonly validator: AffiliateValidator;
  resolve(input: unknown): AffiliateResolverResult;
  getSnapshot(resolutionId: string): AffiliateSnapshot | null;
}

export interface AffiliateNetworkResolverOptions {
  registry?: AffiliateProviderRegistry;
  validator?: AffiliateValidator;
  now?: AffiliateClock;
  timestamp?: AffiliateTimestamp;
  idFactory?: AffiliateIdFactory;
}

const defaultClock: AffiliateClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function refused(issues: AffiliateIssue[], metadata: ResolutionMetadata, executionTime = 0): AffiliateResolverResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    products: null,
    evidence: null,
    metadata,
    statistics: createAffiliateStatistics({ providerCount: 0, resolutionCount: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

function observedOf(input: Record<string, unknown>): ObservedProduct {
  const source = isRecord(input.observedProduct) ? input.observedProduct : {};
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

function reportIdOf(input: unknown): string | null {
  if (!isRecord(input)) return null;
  return textOrNull(input.reportId);
}

export function createAffiliateNetworkResolver(options: AffiliateNetworkResolverOptions = {}): AffiliateNetworkResolver {
  const validator = options.validator ?? createAffiliateProviderValidator();
  const registry = options.registry ?? createAffiliateProviderRegistry();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `affiliate-resolution-${++serial}`);
  const snapshots = new Map<string, AffiliateSnapshot>();

  return {
    registry,
    validator,
    getSnapshot: (resolutionId) => snapshots.get(resolutionId) ?? null,
    resolve(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainAffiliate(input.executionMetadata as ResolutionMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const names = input.providers as readonly string[];
        const adapters: AffiliateProvider[] = [];
        for (const name of names) {
          const adapter = registry.get(name);
          if (adapter === null) {
            return refused([{ field: "providers", message: `Missing Provider: provider "${name}" is not registered.` }], metadata, Math.max(0, now() - start));
          }
          adapters.push(adapter);
        }
        const observed = observedOf(input);
        const catalogs = isRecord(input.catalogs) ? input.catalogs : {};
        const products: ResolvedAffiliateProduct[] = [];
        const evidence: ResolutionEvidence[] = [];
        for (const adapter of adapters) {
          const records = Array.isArray(catalogs[adapter.network]) ? (catalogs[adapter.network] as readonly unknown[]) : [];
          const resolved = adapter.resolve(observed, records);
          if (resolved.issues.length > 0 || resolved.product === null || resolved.evidence === null) {
            const issues = resolved.issues.length > 0 ? [...resolved.issues] : [{ field: adapter.network, message: "Invalid Metadata: the provider did not restate a product." }];
            return refused(issues, metadata, Math.max(0, now() - start));
          }
          products.push(resolved.product);
          evidence.push(resolved.evidence);
        }
        const executionTime = Math.max(0, now() - start);
        const snapshot = createAffiliateSnapshot({
          resolutionId: id,
          products,
          evidence,
          marketReportId: reportIdOf(input.marketReport),
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepAffiliate({
          status: "OK",
          issues: [],
          snapshot,
          products: snapshot.products,
          evidence: snapshot.evidence,
          metadata,
          statistics: createAffiliateStatistics({ providerCount: adapters.length, resolutionCount: products.length, issueCount: 0, executionTime }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "resolver", message: error instanceof Error ? error.message : "Invalid Metadata: the resolver could not restate the listing." }], {});
      }
    },
  };
}
