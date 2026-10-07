/**
 * Execution Plan Builder: order and conflict resolution.
 *
 * Orders task results so that every required or optional dependency that is
 * present is listed before the task that declares it. Among tasks that are
 * free to list, a lower collect position goes first, then the id. It also
 * names conflicts between READY results. It orders and nothing else: invalid
 * graphs are reported, never repaired.
 *
 * Not the Execution Dependency Resolver. This module only orders a plan and
 * names conflicts. It does not run a task.
 */
import type { ExecutionTaskResult } from "./execution-task-contract";
import type { ExecutionDependency } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import { createExecutionPlanValidator } from "./execution-plan-validator";

export interface ExecutionPlanOrder {
  /** Task ids in plan order; empty when the graph is invalid. */
  order: string[];
  dependencies: ExecutionDependency[];
  issues: ExecutionIssue[];
}

export interface ExecutionPlanResolver {
  resolveOrder(results: readonly ExecutionTaskResult[]): ExecutionPlanOrder;
  detectConflicts(results: readonly ExecutionTaskResult[]): ExecutionIssue[];
  dependenciesOf(results: readonly ExecutionTaskResult[]): ExecutionDependency[];
}

function dependenciesOf(results: readonly ExecutionTaskResult[]): ExecutionDependency[] {
  const ids = new Set(results.map((item) => item.taskId));
  const seen = new Set<string>();
  const list: ExecutionDependency[] = [];
  for (const item of results) {
    for (const dep of [...item.dependencies.requires, ...item.dependencies.optional]) {
      if (!ids.has(dep)) continue;
      const pair = `${dep}->${item.taskId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      list.push({ from: dep, to: item.taskId });
    }
  }
  list.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return list;
}

function detectConflicts(results: readonly ExecutionTaskResult[]): ExecutionIssue[] {
  const ready = new Map(results.filter((item) => item.status === "READY").map((item) => [item.taskId, item]));
  const issues: ExecutionIssue[] = [];
  const pairs = new Set<string>();
  for (const item of [...ready.values()].sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    for (const other of item.dependencies.conflicts) {
      if (!ready.has(other)) continue;
      const key = [item.taskId, other].sort().join("|");
      if (pairs.has(key)) continue;
      pairs.add(key);
      issues.push({ field: "dependencies.conflicts", message: `Task "${item.taskId}" conflicts with "${other}", and both are READY.` });
    }
  }
  return issues;
}

function missingRequired(results: readonly ExecutionTaskResult[]): ExecutionIssue[] {
  const ids = new Set(results.map((item) => item.taskId));
  const issues: ExecutionIssue[] = [];
  for (const item of [...results].sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    for (const dep of item.dependencies.requires) {
      if (!ids.has(dep)) {
        issues.push({ field: "dependencies.requires", message: `Missing Dependency: task "${item.taskId}" requires "${dep}", which is not listed.` });
      }
    }
  }
  return issues;
}

function resolveOrder(results: readonly ExecutionTaskResult[]): ExecutionPlanOrder {
  const validator = createExecutionPlanValidator();
  const deps = dependenciesOf(results);
  const ids = results.map((item) => item.taskId);
  const issues = [...missingRequired(results), ...validator.validateGraph(ids, deps)];
  if (issues.length > 0) return { order: [], dependencies: deps, issues };

  const edges = new Map<string, string[]>(ids.map((id) => [id, []]));
  const waiting = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const item of deps) {
    edges.get(item.from)!.push(item.to);
    waiting.set(item.to, (waiting.get(item.to) ?? 0) + 1);
  }
  const byId = new Map(results.map((item) => [item.taskId, item]));
  const orderOf = (id: string) => byId.get(id)?.executionOrder ?? 0;
  const order: string[] = [];
  while (waiting.size > 0) {
    const free = [...waiting.entries()].filter(([, count]) => count === 0).map(([id]) => id);
    free.sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));
    const next = free[0];
    if (next === undefined) break;
    order.push(next);
    waiting.delete(next);
    for (const target of edges.get(next) ?? []) waiting.set(target, (waiting.get(target) ?? 1) - 1);
  }
  return { order, dependencies: deps, issues: [] };
}

export function createExecutionPlanResolver(): ExecutionPlanResolver {
  return {
    resolveOrder,
    detectConflicts,
    dependenciesOf,
  };
}
