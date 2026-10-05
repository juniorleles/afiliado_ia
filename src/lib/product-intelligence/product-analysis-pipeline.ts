/**
 * Host record domain: end-to-end product analysis pipeline.
 *
 * One entry point from a ClickBank product to a frozen Decision Analysis and
 * a frozen Google Ads draft. It stores snapshots in memory. It never
 * publishes a campaign, never signs in, and never reaches an outside system.
 * A refused walk returns REJECTED and stores nothing. This method never throws.
 */
import { createProductAnalysisRunner, type ProductAnalysisRunnerOptions } from "./product-analysis-runner";
import type { ProductAnalysisResult, ProductAnalysisSnapshot } from "./product-analysis-snapshot";
import type { ProductAnalysisValidator } from "./product-analysis-validator";

export interface ProductAnalysisPipeline {
  readonly validator: ProductAnalysisValidator;
  run(input: unknown): Promise<ProductAnalysisResult>;
  getSnapshot(analysisId: string): ProductAnalysisSnapshot | null;
}

export function createProductAnalysisPipeline(options: ProductAnalysisRunnerOptions = {}): ProductAnalysisPipeline {
  const runner = createProductAnalysisRunner(options);
  const snapshots = new Map<string, ProductAnalysisSnapshot>();
  return {
    validator: runner.validator,
    async run(input) {
      try {
        const result = await runner.run(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.analysisId, result.snapshot);
        return result;
      } catch (error) {
        return {
          status: "REJECTED",
          issues: [{ field: "pipeline", message: error instanceof Error ? error.message : "The product analysis stopped." }],
          analysis: null,
          snapshot: null,
          metadata: {},
          executionTime: 0,
          executions: [],
        };
      }
    },
    getSnapshot: (analysisId) => snapshots.get(analysisId) ?? null,
  };
}
