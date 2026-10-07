/**
 * Host record domain: end-to-end market discovery pipeline.
 *
 * One entry point from a keyword to a frozen market discovery analysis.
 * It stores snapshots in memory. A refused walk returns REJECTED and stores
 * nothing. This method never throws and does not reach an outside system.
 */
import { createMarketDiscoveryRunner, type MarketDiscoveryRunnerOptions } from "./market-discovery-runner";
import type { MarketDiscoveryResult, MarketDiscoverySnapshot } from "./market-discovery-snapshot";
import type { MarketDiscoveryValidator } from "./market-discovery-validator";

export interface MarketDiscoveryPipeline {
  readonly validator: MarketDiscoveryValidator;
  run(input: unknown): MarketDiscoveryResult;
  getSnapshot(analysisId: string): MarketDiscoverySnapshot | null;
}

export function createMarketDiscoveryPipeline(options: MarketDiscoveryRunnerOptions = {}): MarketDiscoveryPipeline {
  const runner = createMarketDiscoveryRunner(options);
  const snapshots = new Map<string, MarketDiscoverySnapshot>();
  return {
    validator: runner.validator,
    run(input) {
      try {
        const result = runner.run(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.analysisId, result.snapshot);
        return result;
      } catch (error) {
        return {
          status: "REJECTED",
          issues: [{ field: "pipeline", message: error instanceof Error ? error.message : "Invalid Pipeline Metadata: the pipeline could not restate the walk." }],
          analysis: null,
          report: null,
          graph: null,
          statistics: { stageCount: 0, completedCount: 0, issueCount: 1, executionTime: 0 },
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
