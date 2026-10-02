/**
 * Workflow Engine: engine contract.
 *
 * Interface only. The engine composes the registry, the validator, and the
 * state machine to inspect a candidate's stage. It does not analyze a
 * product, record a business choice, reach an outside system, write a store,
 * or call a model. No inspect, move, or snapshot ships in this step.
 */
import type { WorkflowContext } from "./workflow-context";
import type { WorkflowRegistry } from "./workflow-registry";
import type { WorkflowStateMachine } from "./workflow-state-machine";
import type { Workflow, WorkflowSnapshot } from "./workflow-types";
import type { WorkflowValidator } from "./workflow-validator";

export interface WorkflowEngineDependencies {
  registry: WorkflowRegistry;
  validator: WorkflowValidator;
  stateMachine: WorkflowStateMachine;
}

export interface WorkflowEngine {
  /** Reads the context and returns the current snapshot. Does not move the workflow. */
  inspect(context: WorkflowContext): Promise<WorkflowSnapshot>;
  getWorkflow(id: string): Workflow | null;
}
