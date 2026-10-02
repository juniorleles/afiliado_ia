/**
 * Execution Task Framework: collect order.
 *
 * Orders the enabled tasks so that every required or optional dependency
 * that is present is collected before the task that declares it. Among tasks
 * that are free to collect, higher priority goes first, then the id. It
 * orders and nothing else: invalid dependencies are reported, never repaired.
 *
 * Not the Execution Planner (execution-planner.ts). This module only orders
 * tasks for the pipeline. It does not assemble a plan record.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionTaskEntry } from "./execution-task-contract";
import { executionTaskDependencyEdges, validateExecutionTaskDependencies } from "./execution-task-validator";

export interface ExecutionTaskOrder {
  /** Task ids in collect order; empty when the dependencies are invalid. */
  order: string[];
  issues: ExecutionIssue[];
}

export function resolveExecutionTaskOrder(entries: readonly ExecutionTaskEntry[]): ExecutionTaskOrder {
  const issues = validateExecutionTaskDependencies(entries);
  if (issues.length > 0) return { order: [], issues };

  const edges = executionTaskDependencyEdges(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const waiting = new Map<string, number>([...edges.keys()].map((id) => [id, 0]));
  for (const targets of edges.values()) {
    for (const target of targets) waiting.set(target, (waiting.get(target) ?? 0) + 1);
  }

  const priorityOf = (id: string) => byId.get(id)!.module.priority;
  const order: string[] = [];
  while (waiting.size > 0) {
    const free = [...waiting.entries()].filter(([, count]) => count === 0).map(([id]) => id);
    free.sort((a, b) => priorityOf(b) - priorityOf(a) || a.localeCompare(b));
    const next = free[0];
    order.push(next);
    waiting.delete(next);
    for (const target of edges.get(next) ?? []) waiting.set(target, (waiting.get(target) ?? 1) - 1);
  }
  return { order, issues: [] };
}
