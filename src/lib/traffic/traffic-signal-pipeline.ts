/**
 * Traffic Signal Framework: signal pipeline.
 *
 * Plugs independent signals into the engine: register, remove, enable, and
 * disable them, validate their dependencies, resolve an order, then run them
 * one after another and collect each result. There is no parallel execution
 * and no scoring.
 *
 * Dependencies are only validated. A run with invalid dependencies is refused
 * and nothing executes; no signal is registered or enabled to make it valid.
 * A signal whose required signal did not complete is skipped. A run is also
 * refused for a context that is not complete, plain data.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalResult, TrafficSignalUpstream } from "./traffic-signal-contract";
import type { TrafficSignalContext } from "./traffic-signal-context";
import { executeTrafficSignal, skippedTrafficResult, type TrafficSignalClock } from "./traffic-signal-executor";
import { createTrafficModuleRegistry, TrafficFrameworkError, type TrafficModuleRegistry } from "./traffic-signal-registry";
import { resolveTrafficSignalOrder, type TrafficExecutionOrder } from "./traffic-signal-resolver";
import { validateTrafficDependencies, validateTrafficSignalContext } from "./traffic-signal-validator";

export interface TrafficSignalPipelineReport {
  /** Signal ids in the order they ran. */
  order: string[];
  /** One result per enabled signal, in run order. */
  results: TrafficSignalResult[];
}

export interface TrafficSignalPipeline {
  readonly registry: TrafficModuleRegistry;
  register(module: TrafficSignalModule): TrafficSignalEntry;
  remove(id: string): TrafficSignalEntry;
  enable(id: string): TrafficSignalEntry;
  disable(id: string): TrafficSignalEntry;
  /** Problems with the declared dependencies of the enabled signals. */
  validateDependencies(): TrafficIssue[];
  resolveExecutionOrder(): TrafficExecutionOrder;
  /** Runs the enabled signals sequentially. Throws TrafficFrameworkError if the context or dependencies are invalid or a run is in progress. */
  run(context: TrafficSignalContext): Promise<TrafficSignalPipelineReport>;
}

export interface TrafficSignalPipelineOptions {
  registry?: TrafficModuleRegistry;
  /** Milliseconds clock used for executionTime. */
  now?: TrafficSignalClock;
}

export function createTrafficSignalPipeline(options: TrafficSignalPipelineOptions = {}): TrafficSignalPipeline {
  const registry = options.registry ?? createTrafficModuleRegistry();
  let running = false;

  return {
    registry,
    register: (module) => registry.register(module),
    remove: (id) => registry.remove(id),
    enable: (id) => registry.enable(id),
    disable: (id) => registry.disable(id),
    validateDependencies: () => validateTrafficDependencies(registry.list()),
    resolveExecutionOrder: () => resolveTrafficSignalOrder(registry.list()),

    async run(context) {
      if (running) {
        throw new TrafficFrameworkError("A pipeline run is already in progress.", [
          { field: "run", message: "Signals run sequentially; wait for the current run to finish." },
        ]);
      }
      const contextIssues = validateTrafficSignalContext(context, true);
      if (contextIssues.length > 0) throw new TrafficFrameworkError("Context is invalid.", contextIssues);
      const { order, issues } = resolveTrafficSignalOrder(registry.list());
      if (issues.length > 0) throw new TrafficFrameworkError("Signal dependencies are invalid.", issues);

      running = true;
      try {
        const results: TrafficSignalResult[] = [];
        const byId = new Map<string, TrafficSignalResult>();
        for (const id of order) {
          const entry = registry.get(id) as TrafficSignalEntry;
          const { requires, optional } = entry.module.dependencies;
          const blocked = requires.find((dep) => byId.get(dep)?.status !== "COMPLETED");
          let outcome: TrafficSignalResult;
          if (blocked !== undefined) {
            outcome = skippedTrafficResult(id, `Required signal "${blocked}" did not complete.`);
          } else {
            const upstream: Record<string, TrafficSignalResult> = {};
            for (const dep of [...requires, ...optional]) {
              const done = byId.get(dep);
              if (done) upstream[dep] = done;
            }
            outcome = await executeTrafficSignal(entry.module, context, Object.freeze(upstream) as TrafficSignalUpstream, options.now);
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
