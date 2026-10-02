/**
 * Execution Resolver: resolved plan, graph, snapshot, and counters.
 *
 * Names the frozen graph produced from a validated plan. It never invokes a
 * host, never runs a task, and never reaches an outside system.
 */
import { copyExecutionContract, type ExecutionContract } from "./execution-contract";
import { copyTypedDependency, type ExecutionTypedDependency } from "./execution-dependency-graph";
import { copyExecutionProviderRecord, type ExecutionProviderRecord } from "./execution-provider";
import type { ExecutionMetadata, ExecutionTask } from "./execution-types";

export const EXECUTION_GRAPH_KEYS = ["nodes", "edges", "contractIds", "providerIds"] as const;

/** Frozen nodes, waits, contracts, and hosts. Does not run work. */
export interface ExecutionGraph {
  nodes: readonly string[];
  edges: readonly ExecutionTypedDependency[];
  contractIds: readonly string[];
  providerIds: readonly string[];
}

export const EXECUTION_RESOLVER_STATISTICS_KEYS = [
  "taskCount",
  "readyCount",
  "blockedCount",
  "waitingCount",
  "contractCount",
  "providerCount",
  "dependencyCount",
] as const;

export interface ExecutionResolverStatistics {
  taskCount: number;
  readyCount: number;
  blockedCount: number;
  waitingCount: number;
  contractCount: number;
  providerCount: number;
  dependencyCount: number;
}

export const EXECUTION_RESOLVER_SNAPSHOT_KEYS = [
  "snapshotId",
  "planId",
  "workflowId",
  "decisionId",
  "orderedTasks",
  "contractIds",
  "providerIds",
  "createdAt",
  "metadata",
] as const;

export interface ExecutionResolverSnapshot {
  snapshotId: string;
  planId: string | null;
  workflowId: string | null;
  decisionId: string | null;
  orderedTasks: readonly string[];
  contractIds: readonly string[];
  providerIds: readonly string[];
  createdAt: string;
  metadata: ExecutionMetadata;
}

export const RESOLVED_EXECUTION_PLAN_KEYS = [
  "id",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "tasks",
  "dependencies",
  "contracts",
  "providers",
  "metadata",
  "statistics",
  "graph",
  "executionTime",
  "createdAt",
] as const;

/** One immutable plan after resolution. Does not run work. */
export interface ResolvedExecutionPlan {
  id: string;
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  tasks: readonly ExecutionTask[];
  dependencies: readonly ExecutionTypedDependency[];
  contracts: readonly ExecutionContract[];
  providers: readonly ExecutionProviderRecord[];
  metadata: ExecutionMetadata;
  statistics: ExecutionResolverStatistics;
  graph: ExecutionGraph;
  executionTime: number;
  createdAt: string;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionResolver<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionResolver(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainExecutionResolver<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainExecutionResolver(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainExecutionResolver(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

export function copyExecutionTask(item: ExecutionTask): ExecutionTask {
  return {
    id: item.id,
    name: item.name,
    steps: (item.steps ?? []).map((step) => ({
      id: step.id,
      name: step.name,
      metadata: copyPlainExecutionResolver(step.metadata ?? {}),
    })),
    metadata: copyPlainExecutionResolver(item.metadata ?? {}),
  };
}

export function createExecutionGraph(init: ExecutionGraph): ExecutionGraph {
  return freezeDeepExecutionResolver({
    nodes: [...init.nodes],
    edges: init.edges.map(copyTypedDependency),
    contractIds: [...init.contractIds],
    providerIds: [...init.providerIds],
  });
}

export function createExecutionResolverSnapshot(init: ExecutionResolverSnapshot): ExecutionResolverSnapshot {
  return freezeDeepExecutionResolver({
    snapshotId: init.snapshotId,
    planId: init.planId,
    workflowId: init.workflowId,
    decisionId: init.decisionId,
    orderedTasks: [...init.orderedTasks],
    contractIds: [...init.contractIds],
    providerIds: [...init.providerIds],
    createdAt: init.createdAt,
    metadata: copyPlainExecutionResolver(init.metadata ?? {}),
  });
}

export function createResolvedExecutionPlan(init: ResolvedExecutionPlan): ResolvedExecutionPlan {
  return freezeDeepExecutionResolver({
    id: init.id,
    decisionAnalysisId: init.decisionAnalysisId,
    workflowSnapshotId: init.workflowSnapshotId,
    tasks: init.tasks.map(copyExecutionTask),
    dependencies: init.dependencies.map(copyTypedDependency),
    contracts: init.contracts.map((item) => freezeDeepExecutionResolver(copyExecutionContract(item))),
    providers: init.providers.map((item) => freezeDeepExecutionResolver(copyExecutionProviderRecord(item))),
    metadata: copyPlainExecutionResolver(init.metadata ?? {}),
    statistics: { ...init.statistics },
    graph: createExecutionGraph(init.graph),
    executionTime: init.executionTime,
    createdAt: init.createdAt,
  });
}
