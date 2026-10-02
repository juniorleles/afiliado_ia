/**
 * Execution Dependency Resolver: graph model.
 *
 * Names the typed waits between planned tasks. It never runs a task, never
 * reaches an outside system, and never changes a workflow stage. FUTURE is
 * the room left for later kinds.
 */
import type { ExecutionMetadata } from "./execution-types";

/** Kinds of wait one task may name toward another. */
export const EXECUTION_DEPENDENCY_KINDS = ["REQUIRED", "OPTIONAL", "BLOCKING", "CONFLICTING", "FUTURE"] as const;
export type ExecutionDependencyKind = (typeof EXECUTION_DEPENDENCY_KINDS)[number];

/** How a task stands after resolution. WAITING means a required or optional predecessor is not READY. */
export const EXECUTION_TASK_ELIGIBILITIES = ["READY", "BLOCKED", "WAITING"] as const;
export type ExecutionTaskEligibility = (typeof EXECUTION_TASK_ELIGIBILITIES)[number];

export const EXECUTION_TYPED_DEPENDENCY_KEYS = ["id", "from", "to", "kind", "metadata"] as const;

/** One typed wait: `to` is considered only after `from`, according to `kind`. */
export interface ExecutionTypedDependency {
  id: string;
  from: string;
  to: string;
  kind: ExecutionDependencyKind;
  metadata: ExecutionMetadata;
}

export const EXECUTION_DEPENDENCY_GRAPH_KEYS = ["nodes", "edges"] as const;

/** Frozen nodes and typed edges. Does not run work. */
export interface ExecutionDependencyGraph {
  nodes: readonly string[];
  edges: readonly ExecutionTypedDependency[];
}

export function dependencyKeyOf(from: string, to: string, kind: ExecutionDependencyKind): string {
  return `${from}->${to}:${kind}`;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionDependency<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionDependency(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainExecutionDependency<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainExecutionDependency(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainExecutionDependency(inner)])) as T;
  }
  return value;
}

export function copyTypedDependency(item: ExecutionTypedDependency): ExecutionTypedDependency {
  return {
    id: item.id,
    from: item.from,
    to: item.to,
    kind: item.kind,
    metadata: copyPlainExecutionDependency(item.metadata ?? {}),
  };
}

export function createExecutionDependencyGraph(
  nodes: readonly string[],
  edges: readonly ExecutionTypedDependency[],
): ExecutionDependencyGraph {
  const sortedEdges = [...edges].map(copyTypedDependency).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return freezeDeepExecutionDependency({
    nodes: [...nodes],
    edges: sortedEdges,
  });
}
