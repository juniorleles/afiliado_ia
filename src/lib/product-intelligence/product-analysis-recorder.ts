/**
 * Host record domain: product analysis recorder.
 *
 * Counts each pipeline stage as it runs. A count is an observation of one
 * execution. It is not a judgment. This module does not run a stage.
 */
import { PRODUCT_ANALYSIS_STAGES, type ProductAnalysisExecution, type ProductAnalysisStage } from "./product-analysis-snapshot";

export interface ProductAnalysisRecorder {
  record(stage: ProductAnalysisStage): void;
  executions(): ProductAnalysisExecution[];
}

export function createProductAnalysisRecorder(): ProductAnalysisRecorder {
  const counts = new Map<ProductAnalysisStage, number>();
  return {
    record(stage) {
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    },
    executions() {
      return PRODUCT_ANALYSIS_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
    },
  };
}
