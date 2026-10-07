/**
 * Traffic Signal Framework: signal executor.
 *
 * Runs one signal against a context and always returns a result: a signal that
 * throws, fails validation, or returns a malformed output becomes a FAILED
 * result instead of stopping the run. The executor measures time and adds the
 * signal id; it computes nothing else and never produces a score.
 */
import type { TrafficSignalModule, TrafficSignalOutput, TrafficSignalResult, TrafficSignalUpstream } from "./traffic-signal-contract";
import { freezeDeepTraffic, type TrafficSignalContext } from "./traffic-signal-context";
import { validateTrafficSignalOutput } from "./traffic-signal-validator";

export type TrafficSignalClock = () => number;

const defaultClock: TrafficSignalClock = () => performance.now();

function result(signalId: string, output: TrafficSignalOutput, start: number, now: TrafficSignalClock): TrafficSignalResult {
  return freezeDeepTraffic({
    signalId,
    status: output.status,
    confidence: output.confidence,
    metadata: { ...output.metadata },
    warnings: [...output.warnings],
    errors: [...output.errors],
    executionTime: Math.max(0, now() - start),
  });
}

/** A SKIPPED result for a signal that was not run. */
export function skippedTrafficResult(signalId: string, warning: string): TrafficSignalResult {
  return freezeDeepTraffic({
    signalId,
    status: "SKIPPED" as const,
    confidence: null,
    metadata: {},
    warnings: [warning],
    errors: [],
    executionTime: 0,
  });
}

export async function executeTrafficSignal(
  module: TrafficSignalModule,
  context: TrafficSignalContext,
  upstream: TrafficSignalUpstream,
  now: TrafficSignalClock = defaultClock,
): Promise<TrafficSignalResult> {
  const start = now();
  const failed = (errors: string[]): TrafficSignalResult =>
    result(module.id, { status: "FAILED", confidence: null, metadata: {}, warnings: [], errors }, start, now);

  try {
    if (!module.supportsAnalysis(context)) {
      return result(
        module.id,
        { status: "SKIPPED", confidence: null, metadata: {}, warnings: ["Signal does not support this analysis."], errors: [] },
        start,
        now,
      );
    }
    const problems = module.validate(context);
    if (problems.length > 0) return failed(problems.map((p) => `${p.field}: ${p.message}`));

    const output = await module.analyze(context, upstream);
    const issues = validateTrafficSignalOutput(output);
    if (issues.length > 0) return failed(issues.map((i) => `Invalid signal output, ${i.field}: ${i.message}`));
    return result(module.id, output, start, now);
  } catch (error) {
    return failed([error instanceof Error ? error.message : "Signal threw an error."]);
  }
}
