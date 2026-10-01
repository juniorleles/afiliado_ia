/**
 * Opportunity Signal Framework: execution order.
 *
 * Orders the enabled signals so that every required or optional dependency
 * that is present runs before the signal that declares it. Among signals that
 * are free to run, higher priority goes first, then the id. It orders and
 * nothing else: invalid dependencies are reported, never repaired.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import type { SignalEntry } from "./opportunity-signal-contract";
import { dependencyEdges, validateDependencies } from "./opportunity-signal-validator";

export interface SignalExecutionOrder {
  /** Signal ids in run order; empty when the dependencies are invalid. */
  order: string[];
  issues: OpportunityIssue[];
}

export function resolveSignalOrder(entries: readonly SignalEntry[]): SignalExecutionOrder {
  const issues = validateDependencies(entries);
  if (issues.length > 0) return { order: [], issues };

  const edges = dependencyEdges(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const waiting = new Map<string, number>([...edges.keys()].map((id) => [id, 0]));
  for (const targets of edges.values()) {
    for (const target of targets) waiting.set(target, (waiting.get(target) ?? 0) + 1);
  }

  const rank = (id: string) => byId.get(id)!.module.priority;
  const order: string[] = [];
  while (waiting.size > 0) {
    const free = [...waiting.entries()].filter(([, count]) => count === 0).map(([id]) => id);
    free.sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
    const next = free[0];
    order.push(next);
    waiting.delete(next);
    for (const target of edges.get(next) ?? []) waiting.set(target, (waiting.get(target) ?? 1) - 1);
  }
  return { order, issues: [] };
}
