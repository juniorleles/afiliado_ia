/**
 * Host record domain: product opportunity adapter.
 *
 * Turns a read-only Product Intelligence bundle into a Discovery-ready
 * context, an Opportunity-ready context, an evidence mapping, metadata, and
 * a snapshot. It restates observed fields into the shapes those engines
 * already accept. It never calls them, never judges a product, never fetches
 * a page, and never runs another engine. A refused input returns REJECTED
 * with issues and no mapping. This layer stays offline.
 */
import type { ProductOpportunityContext } from "./product-opportunity-context";
import { createProductOpportunityMapper, type ProductOpportunityMapper } from "./product-opportunity-mapper";
import { createProductOpportunityValidator, type ProductOpportunityValidator } from "./product-opportunity-validator";
import {
  copyPlainProductOpportunity,
  createProductOpportunitySnapshot,
  freezeDeepProductOpportunity,
  type DiscoveryReadyContext,
  type EvidenceProviderReadyContext,
  type OpportunityReadyContext,
  type ProductOpportunityEvidenceMapping,
  type ProductOpportunityIssue,
  type ProductOpportunityMetadata,
  type ProductOpportunitySnapshot,
} from "./product-opportunity-snapshot";

export type ProductOpportunityClock = () => number;
export type ProductOpportunityTimestamp = () => string;
export type ProductOpportunityIdFactory = () => string;

export interface ProductOpportunityAdapterResult {
  status: "OK" | "REJECTED";
  issues: ProductOpportunityIssue[];
  discoveryContext: DiscoveryReadyContext | null;
  opportunityContext: OpportunityReadyContext | null;
  evidenceProvider: EvidenceProviderReadyContext | null;
  evidenceMapping: ProductOpportunityEvidenceMapping | null;
  snapshot: ProductOpportunitySnapshot | null;
  metadata: ProductOpportunityMetadata;
  executionTime: number;
}

export interface ProductOpportunityAdapter {
  readonly mapper: ProductOpportunityMapper;
  readonly validator: ProductOpportunityValidator;
  adapt(input: unknown): ProductOpportunityAdapterResult;
  getSnapshot(mappingId: string): ProductOpportunitySnapshot | null;
}

export interface ProductOpportunityAdapterOptions {
  mapper?: ProductOpportunityMapper;
  validator?: ProductOpportunityValidator;
  now?: ProductOpportunityClock;
  timestamp?: ProductOpportunityTimestamp;
  idFactory?: ProductOpportunityIdFactory;
}

const defaultClock: ProductOpportunityClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: ProductOpportunityIssue[], metadata: ProductOpportunityMetadata, executionTime = 0): ProductOpportunityAdapterResult {
  return {
    status: "REJECTED",
    issues,
    discoveryContext: null,
    opportunityContext: null,
    evidenceProvider: null,
    evidenceMapping: null,
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createProductOpportunityAdapter(options: ProductOpportunityAdapterOptions = {}): ProductOpportunityAdapter {
  const mapper = options.mapper ?? createProductOpportunityMapper();
  const validator = options.validator ?? createProductOpportunityValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `mapping-${++serial}`);
  const snapshots = new Map<string, ProductOpportunitySnapshot>();

  return {
    mapper,
    validator,
    getSnapshot: (mappingId) => snapshots.get(mappingId) ?? null,
    adapt(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainProductOpportunity(input.executionMetadata as ProductOpportunityMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as ProductOpportunityContext;
        const mapped = mapper.map(draft, createdAt, metadata);
        if (mapped.issues.length > 0 || !mapped.mapped) {
          return refused(
            mapped.issues.length > 0 ? mapped.issues : [{ field: "mapping", message: "Invalid Mapping: an evidence mapping record is required." }],
            metadata,
            Math.max(0, now() - start),
          );
        }
        const mappingIssues = validator.validateMapping(mapped.mapped.evidenceMapping);
        if (mappingIssues.length > 0) return refused(mappingIssues, metadata, Math.max(0, now() - start));
        const executionTime = Math.max(0, now() - start);
        const snapshot = createProductOpportunitySnapshot({
          mappingId: id,
          productName: mapped.mapped.productName,
          landingPage: mapped.mapped.landingPage,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        const discoveryContext = freezeDeepProductOpportunity(mapped.mapped.discoveryContext);
        const opportunityContext = freezeDeepProductOpportunity(mapped.mapped.opportunityContext);
        const evidenceProvider = freezeDeepProductOpportunity(mapped.mapped.evidenceProvider);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          discoveryContext,
          opportunityContext,
          evidenceProvider,
          evidenceMapping: mapped.mapped.evidenceMapping,
          snapshot,
          metadata,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "adapter", message: error instanceof Error ? error.message : "Invalid Metadata: the adapter could not restate the records." }],
          {},
        );
      }
    },
  };
}
