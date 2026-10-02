/**
 * Workflow Engine: queue registry.
 *
 * Holds the eight waiting rooms a workflow item may occupy. It registers
 * queue definitions and never stores items, never applies a move, and never
 * runs work. Registering the same queue id twice is rejected.
 */
import type { WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { WorkflowFrameworkError } from "./workflow-transition-registry";

export const WORKFLOW_QUEUE_IDS = [
  "RESEARCH",
  "OPPORTUNITY",
  "TRAFFIC",
  "LANDING_PAGE",
  "REVIEW",
  "PUBLICATION",
  "MONITORING",
  "ARCHIVE",
] as const;
export type WorkflowQueueId = (typeof WORKFLOW_QUEUE_IDS)[number];

export interface WorkflowQueueDefinition {
  id: WorkflowQueueId;
  /** Stages whose items wait in this room. */
  currentStates: readonly WorkflowState[];
}

export const WORKFLOW_QUEUE_DEFINITIONS: readonly WorkflowQueueDefinition[] = [
  { id: "RESEARCH", currentStates: ["CREATED"] },
  { id: "OPPORTUNITY", currentStates: ["DISCOVERED"] },
  { id: "TRAFFIC", currentStates: ["OPPORTUNITY_ANALYZED"] },
  { id: "LANDING_PAGE", currentStates: ["TRAFFIC_ANALYZED"] },
  { id: "REVIEW", currentStates: ["LP_GENERATED"] },
  { id: "PUBLICATION", currentStates: ["UNDER_REVIEW", "READY_FOR_PUBLICATION"] },
  { id: "MONITORING", currentStates: ["PUBLISHED"] },
  { id: "ARCHIVE", currentStates: ["MONITORING"] },
];

export interface WorkflowQueueRegistry {
  register(definition: WorkflowQueueDefinition): WorkflowQueueDefinition;
  get(id: WorkflowQueueId): WorkflowQueueDefinition | null;
  list(): WorkflowQueueDefinition[];
  accepts(id: WorkflowQueueId, state: WorkflowState): boolean;
  validate(id: unknown): WorkflowIssue[];
}

export function isWorkflowQueueId(value: unknown): value is WorkflowQueueId {
  return typeof value === "string" && (WORKFLOW_QUEUE_IDS as readonly string[]).includes(value);
}

export function createWorkflowQueueRegistry(options: { seed?: boolean } = {}): WorkflowQueueRegistry {
  const queues = new Map<WorkflowQueueId, WorkflowQueueDefinition>();

  const validate = (id: unknown): WorkflowIssue[] => {
    if (!isWorkflowQueueId(id)) return [{ field: "queueId", message: `Invalid Queue: "${String(id)}" is not a workflow queue.` }];
    return [];
  };

  const register = (definition: WorkflowQueueDefinition): WorkflowQueueDefinition => {
    const issues = validate(definition.id);
    if (issues.length > 0) throw new WorkflowFrameworkError("Queue is invalid.", issues);
    if (queues.has(definition.id)) {
      throw new WorkflowFrameworkError("Queue is invalid.", [{ field: "queueId", message: `Invalid Queue: "${definition.id}" is already registered.` }]);
    }
    if (!Array.isArray(definition.currentStates) || definition.currentStates.length === 0) {
      throw new WorkflowFrameworkError("Queue is invalid.", [{ field: "currentStates", message: "Invalid Queue: a queue must name at least one stage." }]);
    }
    const copy: WorkflowQueueDefinition = { id: definition.id, currentStates: [...definition.currentStates] };
    queues.set(copy.id, copy);
    return copy;
  };

  const registry: WorkflowQueueRegistry = {
    register,
    get: (id) => queues.get(id) ?? null,
    list: () => WORKFLOW_QUEUE_IDS.filter((id) => queues.has(id)).map((id) => queues.get(id)!),
    accepts: (id, state) => queues.get(id)?.currentStates.includes(state) === true,
    validate,
  };

  if (options.seed !== false) {
    for (const definition of WORKFLOW_QUEUE_DEFINITIONS) register(definition);
  }

  return registry;
}
