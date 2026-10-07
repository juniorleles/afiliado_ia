/**
 * Opportunity Signal Framework: signal executor.
 *
 * Runs one signal against a context and always returns a result: a signal that
 * throws, fails validation, or returns a malformed output becomes a FAILED
 * result instead of stopping the run. The executor measures time and adds the
 * signal id; it computes nothing else and never produces a score.
 */
import type { OpportunitySignalModule, SignalOutput, SignalResult, SignalUpstream } from "./opportunity-signal-contract";
import { freezeDeep, type SignalContext } from "./opportunity-signal-context";
import { validateSignalOutput } from "./opportunity-signal-validator";

export type SignalClock = () => number;

const defaultClock: SignalClock = () => performance.now();

function result(signalId: string, output: SignalOutput, start: number, now: SignalClock): SignalResult {
  return freezeDeep({
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
export function skippedResult(signalId: string, warning: string): SignalResult {
  return freezeDeep({
    signalId,
    status: "SKIPPED" as const,
    confidence: null,
    metadata: {},
    warnings: [warning],
    errors: [],
    executionTime: 0,
  });
}

export async function executeSignal(
  module: OpportunitySignalModule,
  context: SignalContext,
  upstream: SignalUpstream,
  now: SignalClock = defaultClock,
): Promise<SignalResult> {
  const start = now();
  const failed = (errors: string[]): SignalResult =>
    result(module.id, { status: "FAILED", confidence: null, metadata: {}, warnings: [], errors }, start, now);

  try {
    if (!module.supportsCandidate(context)) {
      return result(
        module.id,
        { status: "SKIPPED", confidence: null, metadata: {}, warnings: ["Signal does not support this candidate."], errors: [] },
        start,
        now,
      );
    }
    const problems = module.validate(context);
    if (problems.length > 0) return failed(problems.map((p) => `${p.field}: ${p.message}`));

    const output = await module.analyze(context, upstream);
    const issues = validateSignalOutput(output);
    if (issues.length > 0) return failed(issues.map((i) => `Invalid signal output, ${i.field}: ${i.message}`));
    return result(module.id, output, start, now);
  } catch (error) {
    return failed([error instanceof Error ? error.message : "Signal threw an error."]);
  }
}
