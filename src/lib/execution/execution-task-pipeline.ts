/**
 * Execution Task Framework: task pipeline.
 *
 * Plugs independent tasks into the planner: register, remove, enable, and
 * disable them, validate their dependencies, resolve an order, then collect
 * each plan fragment one after another. There is no parallel collect and no
 * scoring. A task never runs work, never reaches an outside system, and
 * never changes a workflow stage.
 *
 * Dependencies are only validated. A collect with invalid dependencies is
 * refused and nothing is built; no task is registered or enabled to make it
 * valid. A task whose required task was not READY is BLOCKED.
 *
 * This pipeline is not the Execution Planner and does not assemble a plan
 * record.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionTaskEntry, ExecutionTaskModule, ExecutionTaskResult, ExecutionTaskUpstream } from "./execution-task-contract";
import type { ExecutionTaskContext } from "./execution-task-context";
import { blockedExecutionTaskResult, buildExecutionTask } from "./execution-task-builder";
import { createExecutionTaskRegistry, ExecutionTaskFrameworkError, type ExecutionTaskRegistry } from "./execution-task-registry";
import { resolveExecutionTaskOrder, type ExecutionTaskOrder } from "./execution-task-resolver";
import { validateExecutionTaskContext, validateExecutionTaskDependencies, validateExecutionTaskPlan } from "./execution-task-validator";

export interface ExecutionTaskPipelineReport {
  /** Task ids in the order they were collected. */
  order: string[];
  /** One result per enabled task, in collect order. */
  results: ExecutionTaskResult[];
}

export interface ExecutionTaskPipeline {
  readonly registry: ExecutionTaskRegistry;
  register(module: ExecutionTaskModule): ExecutionTaskEntry;
  remove(id: string): ExecutionTaskEntry;
  enable(id: string): ExecutionTaskEntry;
  disable(id: string): ExecutionTaskEntry;
  /** Problems with the declared dependencies of the enabled tasks. */
  validateDependencies(): ExecutionIssue[];
  resolveOrder(): ExecutionTaskOrder;
  /** Contract, graph, and optional context problems. Does not collect. */
  validatePlan(context?: ExecutionTaskContext): ExecutionIssue[];
  /** Collects plan fragments sequentially. Throws ExecutionTaskFrameworkError if the context or dependencies are invalid or a collect is in progress. */
  collect(context: ExecutionTaskContext): Promise<ExecutionTaskPipelineReport>;
}

export interface ExecutionTaskPipelineOptions {
  registry?: ExecutionTaskRegistry;
}

export function createExecutionTaskPipeline(options: ExecutionTaskPipelineOptions = {}): ExecutionTaskPipeline {
  const registry = options.registry ?? createExecutionTaskRegistry();
  let collecting = false;

  return {
    registry,
    register: (module) => registry.register(module),
    remove: (id) => registry.remove(id),
    enable: (id) => registry.enable(id),
    disable: (id) => registry.disable(id),
    validateDependencies: () => validateExecutionTaskDependencies(registry.list()),
    resolveOrder: () => resolveExecutionTaskOrder(registry.list()),
    validatePlan: (context) => validateExecutionTaskPlan(registry.list(), context),

    async collect(context) {
      if (collecting) {
        throw new ExecutionTaskFrameworkError("A pipeline collect is already in progress.", [
          { field: "collect", message: "Tasks are collected sequentially; wait for the current collect to finish." },
        ]);
      }
      const contextIssues = validateExecutionTaskContext(context, true);
      if (contextIssues.length > 0) throw new ExecutionTaskFrameworkError("Context is invalid.", contextIssues);
      const { order, issues } = resolveExecutionTaskOrder(registry.list());
      if (issues.length > 0) throw new ExecutionTaskFrameworkError("Task dependencies are invalid.", issues);

      collecting = true;
      try {
        const results: ExecutionTaskResult[] = [];
        const byId = new Map<string, ExecutionTaskResult>();
        for (let index = 0; index < order.length; index += 1) {
          const id = order[index];
          const entry = registry.get(id) as ExecutionTaskEntry;
          const { requires, optional } = entry.module.dependencies;
          const blocked = requires.find((dep) => byId.get(dep)?.status !== "READY");
          let outcome: ExecutionTaskResult;
          if (blocked !== undefined) {
            outcome = blockedExecutionTaskResult(id, `Required task "${blocked}" was not READY.`, entry.module.dependencies, index);
          } else {
            const upstream: Record<string, ExecutionTaskResult> = {};
            for (const dep of [...requires, ...optional]) {
              const done = byId.get(dep);
              if (done) upstream[dep] = done;
            }
            outcome = await buildExecutionTask(entry.module, context, Object.freeze(upstream) as ExecutionTaskUpstream, index);
          }
          byId.set(id, outcome);
          results.push(outcome);
        }
        return { order, results };
      } finally {
        collecting = false;
      }
    },
  };
}
