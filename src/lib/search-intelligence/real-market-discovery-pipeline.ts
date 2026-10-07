/**
 * Host record domain: real market discovery pipeline.
 *
 * One entry point from a keyword to a frozen market report. It stores
 * snapshots in memory. A refused walk returns REJECTED and stores nothing.
 * This method never throws.
 */
import { createRealMarketDiscoveryRunner, type RealMarketDiscoveryRunnerOptions } from "./real-market-discovery-runner";
import {
  REAL_MARKET_DISCOVERY_STAGES,
  freezeDeepRealMarketDiscovery,
  type RealMarketDiscoveryResult,
  type RealMarketDiscoverySnapshot,
} from "./real-market-discovery-snapshot";
import type { RealMarketDiscoveryValidator } from "./real-market-discovery-validator";

export interface RealMarketDiscoveryPipeline {
  readonly validator: RealMarketDiscoveryValidator;
  run(input: unknown): Promise<RealMarketDiscoveryResult>;
  getSnapshot(analysisId: string): RealMarketDiscoverySnapshot | null;
}

export function createRealMarketDiscoveryPipeline(options: RealMarketDiscoveryRunnerOptions = {}): RealMarketDiscoveryPipeline {
  const runner = createRealMarketDiscoveryRunner(options);
  const snapshots = new Map<string, RealMarketDiscoverySnapshot>();
  return {
    validator: runner.validator,
    async run(input) {
      try {
        const result = await runner.run(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.analysisId, result.snapshot);
        return result;
      } catch {
        return freezeDeepRealMarketDiscovery({
          status: "REJECTED",
          issues: [{ field: "pipeline", message: "Invalid Pipeline Metadata: the pipeline could not restate the walk." }],
          searchSnapshot: null,
          serpRecords: null,
          sponsoredResults: null,
          landingPageSnapshots: null,
          observedProducts: null,
          report: null,
          graph: null,
          statistics: { stageCount: 0, completedCount: 0, issueCount: 1, executionTime: 0 },
          executions: REAL_MARKET_DISCOVERY_STAGES.map((stage) => ({ stage, count: 0 })),
          snapshot: null,
          metadata: {},
          executionTime: 0,
        });
      }
    },
    getSnapshot: (analysisId) => snapshots.get(analysisId) ?? null,
  };
}
