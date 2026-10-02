/**
 * Execution Planner: planner contract.
 *
 * Interface only. The planner composes the registry and the validator to
 * turn a read-only context into an immutable plan. It does not run a task,
 * reach an outside system, write a store, call a model, or change a
 * workflow stage. No plan, order, or snapshot ships in this step.
 */
import type { ExecutionContext } from "./execution-context";
import type { ExecutionPlan } from "./execution-plan";
import type { ExecutionRegistry } from "./execution-registry";
import type { ExecutionValidator } from "./execution-validator";

export interface ExecutionPlannerDependencies {
  registry: ExecutionRegistry;
  validator: ExecutionValidator;
}

export interface ExecutionPlanner {
  /** Reads the context by id and returns an immutable plan. Does not run work. */
  plan(context: ExecutionContext): Promise<ExecutionPlan>;
  getPlan(id: string): ExecutionPlan | null;
}
