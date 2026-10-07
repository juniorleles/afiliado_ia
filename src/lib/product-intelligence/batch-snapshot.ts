/**
 * Host record domain: product batch snapshot.
 *
 * Frozen batch records. A batch restates one walk over many products.
 * It does not approve a product and it does not publish a campaign.
 * This module does not reach an outside system and does not run another engine.
 */
export type BatchMetadata = Record<string, string | number | boolean | null>;

export const BATCH_STATUSES = ["OK", "REJECTED"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface BatchIssue {
  field: string;
  message: string;
}

export interface BatchProductResult {
  source: string;
  index: number;
  status: BatchStatus;
  issues: readonly BatchIssue[];
  productName: string | null;
  candidateId: string | null;
  ranked: boolean;
  report: Record<string, unknown> | null;
  evidenceGraph: Record<string, unknown> | null;
  discovery: Record<string, unknown> | null;
  opportunityAnalysis: Record<string, unknown> | null;
  trafficAnalysis: Record<string, unknown> | null;
  decisionAnalysis: Record<string, unknown> | null;
}

export interface BatchRankedProduct {
  candidateId: string;
  productName: string;
  rankingPosition: number;
  level: string;
  confidence: number;
}

export interface BatchAnalysis {
  products: readonly BatchProductResult[];
  recommendations: Record<string, unknown> | null;
  rankedProducts: readonly BatchRankedProduct[];
}

export const BATCH_STATISTICS_KEYS = ["productCount", "succeededCount", "failedCount", "rankedCount", "executionTime"] as const;

export interface BatchStatistics {
  productCount: number;
  succeededCount: number;
  failedCount: number;
  rankedCount: number;
  executionTime: number;
}

export const BATCH_SNAPSHOT_KEYS = ["batchId", "productCount", "rankedCount", "createdAt", "metadata"] as const;

export interface BatchSnapshot {
  batchId: string;
  productCount: number;
  rankedCount: number;
  createdAt: string;
  metadata: BatchMetadata;
}

export interface BatchSnapshotInit {
  batchId: string;
  productCount: number;
  rankedCount: number;
  createdAt: string;
  metadata?: BatchMetadata;
}

export interface BatchResult {
  status: BatchStatus;
  issues: BatchIssue[];
  analysis: BatchAnalysis | null;
  statistics: BatchStatistics | null;
  snapshot: BatchSnapshot | null;
  metadata: BatchMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepBatch<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepBatch(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainBatch<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainBatch(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainBatch(inner)])) as T;
  }
  return value;
}

export function createBatchSnapshot(init: BatchSnapshotInit): BatchSnapshot {
  return freezeDeepBatch({
    batchId: init.batchId,
    productCount: init.productCount,
    rankedCount: init.rankedCount,
    createdAt: init.createdAt,
    metadata: copyPlainBatch(init.metadata ?? {}),
  });
}

export function createBatchStatistics(init: BatchStatistics): BatchStatistics {
  return freezeDeepBatch({
    productCount: init.productCount,
    succeededCount: init.succeededCount,
    failedCount: init.failedCount,
    rankedCount: init.rankedCount,
    executionTime: init.executionTime,
  });
}
