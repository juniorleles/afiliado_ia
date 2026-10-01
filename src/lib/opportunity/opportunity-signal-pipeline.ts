/**
 * Opportunity Signal Framework: signal pipeline.
 *
 * Plugs independent signals into the engine: register, remove, enable, and
 * disable them, validate their dependencies, resolve an order, then run them
 * one after another and collect each result. There is no parallel execution
 * and no scoring.
 *
 * Dependencies are only validated. A run with invalid dependencies is refused
 * and nothing executes; no signal is registered or enabled to make it valid.
 * A signal whose required signal did not complete is skipped.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import type { OpportunitySignalModule, SignalEntry, SignalResult, SignalUpstream } from "./opportunity-signal-contract";
import type { SignalContext } from "./opportunity-signal-context";
import { executeSignal, skippedResult, type SignalClock } from "./opportunity-signal-executor";
import { createSignalRegistry, SignalFrameworkError, type SignalRegistry } from "./opportunity-signal-registry";
import { resolveSignalOrder, type SignalExecutionOrder } from "./opportunity-signal-resolver";
import { validateDependencies } from "./opportunity-signal-validator";

export interface SignalPipelineReport {
  /** Signal ids in the order they ran. */
  order: string[];
  /** One result per enabled signal, in run order. */
  results: SignalResult[];
}

export interface SignalPipeline {
  readonly registry: SignalRegistry;
  register(module: OpportunitySignalModule): SignalEntry;
  remove(id: string): SignalEntry;
  enable(id: string): SignalEntry;
  disable(id: string): SignalEntry;
  /** Problems with the declared dependencies of the enabled signals. */
  validateDependencies(): OpportunityIssue[];
  resolveExecutionOrder(): SignalExecutionOrder;
  /** Runs the enabled signals sequentially. Throws SignalFrameworkError if dependencies are invalid or a run is in progress. */
  run(context: SignalContext): Promise<SignalPipelineReport>;
}

export interface SignalPipelineOptions {
  registry?: SignalRegistry;
  /** Milliseconds clock used for executionTime. */
  now?: SignalClock;
}

export function createSignalPipeline(options: SignalPipelineOptions = {}): SignalPipeline {
  const registry = options.registry ?? createSignalRegistry();
  let running = false;

  return {
    registry,
    register: (module) => registry.register(module),
    remove: (id) => registry.remove(id),
    enable: (id) => registry.enable(id),
    disable: (id) => registry.disable(id),
    validateDependencies: () => validateDependencies(registry.list()),
    resolveExecutionOrder: () => resolveSignalOrder(registry.list()),

    async run(context) {
      if (running) {
        throw new SignalFrameworkError("A pipeline run is already in progress.", [
          { field: "run", message: "Signals run sequentially; wait for the current run to finish." },
        ]);
      }
      const { order, issues } = resolveSignalOrder(registry.list());
      if (issues.length > 0) throw new SignalFrameworkError("Signal dependencies are invalid.", issues);

      running = true;
      try {
        const results: SignalResult[] = [];
        const byId = new Map<string, SignalResult>();
        for (const id of order) {
          const entry = registry.get(id) as SignalEntry;
          const { requires, optional } = entry.module.dependencies;
          const blocked = requires.find((dep) => byId.get(dep)?.status !== "COMPLETED");
          let outcome: SignalResult;
          if (blocked !== undefined) {
            outcome = skippedResult(id, `Required signal "${blocked}" did not complete.`);
          } else {
            const upstream: Record<string, SignalResult> = {};
            for (const dep of [...requires, ...optional]) {
              const done = byId.get(dep);
              if (done) upstream[dep] = done;
            }
            outcome = await executeSignal(entry.module, context, Object.freeze(upstream) as SignalUpstream, options.now);
          }
          byId.set(id, outcome);
          results.push(outcome);
        }
        return { order, results };
      } finally {
        running = false;
      }
    },
  };
}
