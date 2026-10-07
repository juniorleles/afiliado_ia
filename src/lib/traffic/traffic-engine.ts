/**
 * Traffic Intelligence Engine: engine contract.
 *
 * Interface only. The engine composes the signal registry and the validator to
 * decide how a discovered candidate should be promoted. It does not create
 * campaigns, generate keywords, or reach any ad platform. No decision,
 * calculation, analysis, or AI ships in this step.
 */
import type { TrafficAnalysisRequest, TrafficResult } from "./traffic-analysis";
import type { TrafficSignalRegistry } from "./traffic-registry";
import type { TrafficAnalysis } from "./traffic-types";
import type { TrafficValidator } from "./traffic-validator";

export interface TrafficEngineDependencies {
  registry: TrafficSignalRegistry;
  validator: TrafficValidator;
}

export interface TrafficEngine {
  /** Analyzes one candidate against one Opportunity analysis and returns the recorded analysis. */
  analyze(request: TrafficAnalysisRequest): Promise<TrafficAnalysis>;
  getAnalysis(id: string): TrafficAnalysis | null;
  /** The result of a COMPLETED analysis; null otherwise. */
  getResult(analysisId: string): TrafficResult | null;
}
