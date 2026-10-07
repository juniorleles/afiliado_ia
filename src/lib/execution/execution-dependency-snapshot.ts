/**
 * Execution Dependency Resolver: snapshot.
 *
 * A frozen record of one resolution: the graph id, the plan id, the workflow
 * snapshot id, the Decision Analysis id, ready, blocked, and waiting task
 * ids, the graph, a creation timestamp, and flat metadata. It never runs a
 * task and never changes what it is given.
 */
import {
  copyPlainExecutionDependency,
  freezeDeepExecutionDependency,
  type ExecutionDependencyGraph,
} from "./execution-dependency-graph";
import type { ExecutionMetadata } from "./execution-types";

export const EXECUTION_DEPENDENCY_SNAPSHOT_KEYS = [
  "graphId",
  "planId",
  "workflowId",
  "decisionId",
  "ready",
  "blocked",
  "waiting",
  "graph",
  "createdAt",
  "metadata",
] as const;

export interface ExecutionDependencySnapshot {
  graphId: string;
  planId: string | null;
  workflowId: string | null;
  decisionId: string | null;
  ready: readonly string[];
  blocked: readonly string[];
  waiting: readonly string[];
  graph: ExecutionDependencyGraph;
  createdAt: string;
  metadata: ExecutionMetadata;
}

export interface ExecutionDependencySnapshotInit {
  graphId: string;
  planId: string | null;
  workflowId: string | null;
  decisionId: string | null;
  ready: readonly string[];
  blocked: readonly string[];
  waiting: readonly string[];
  graph: ExecutionDependencyGraph;
  createdAt: string;
  metadata?: ExecutionMetadata;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createExecutionDependencySnapshot(init: ExecutionDependencySnapshotInit): ExecutionDependencySnapshot {
  return freezeDeepExecutionDependency({
    graphId: init.graphId,
    planId: init.planId,
    workflowId: init.workflowId,
    decisionId: init.decisionId,
    ready: [...init.ready],
    blocked: [...init.blocked],
    waiting: [...init.waiting],
    graph: init.graph,
    createdAt: init.createdAt,
    metadata: copyPlainExecutionDependency(init.metadata ?? {}),
  });
}
