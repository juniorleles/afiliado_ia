/**
 * Host record domain: product batch analyzer.
 *
 * One entry point for many ClickBank products. It asks the existing product
 * analysis pipeline and the recommendation engine to do the work, stores one
 * frozen snapshot, and keeps each walk independent. It never changes those
 * engines, never approves a product, and never publishes a campaign. A refused
 * envelope returns REJECTED and stores nothing. This method never throws.
 */
import { createBatchRunner, type BatchRunnerOptions } from "./batch-runner";
import type { BatchResult, BatchSnapshot } from "./batch-snapshot";
import type { BatchValidator } from "./batch-validator";

export interface ProductBatchAnalyzer {
  readonly validator: BatchValidator;
  analyze(input: unknown): Promise<BatchResult>;
  getSnapshot(batchId: string): BatchSnapshot | null;
}

export function createProductBatchAnalyzer(options: BatchRunnerOptions = {}): ProductBatchAnalyzer {
  const runner = createBatchRunner(options);
  const snapshots = new Map<string, BatchSnapshot>();
  return {
    validator: runner.validator,
    async analyze(input) {
      try {
        const result = await runner.run(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.batchId, result.snapshot);
        return result;
      } catch (error) {
        return {
          status: "REJECTED",
          issues: [{ field: "batch", message: error instanceof Error ? error.message : "The batch stopped." }],
          analysis: null,
          statistics: null,
          snapshot: null,
          metadata: {},
          executionTime: 0,
        };
      }
    },
    getSnapshot: (batchId) => snapshots.get(batchId) ?? null,
  };
}
