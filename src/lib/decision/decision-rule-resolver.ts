/**
 * Decision Rule Framework: execution order.
 *
 * Orders the enabled rules so that every required or optional dependency
 * that is present runs before the rule that declares it. Among rules that
 * are free to run, higher priority goes first, then the id. It orders and
 * nothing else: invalid dependencies are reported, never repaired.
 *
 * Not the Decision Resolver (decision-resolver.ts). This module only orders
 * rules for the pipeline. It does not record a Decision Analysis.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionRuleEntry } from "./decision-rule-contract";
import { decisionRuleDependencyEdges, validateDecisionRuleDependencies } from "./decision-rule-validator";

export interface DecisionRuleExecutionOrder {
  /** Rule ids in run order; empty when the dependencies are invalid. */
  order: string[];
  issues: DecisionIssue[];
}

export function resolveDecisionRuleOrder(entries: readonly DecisionRuleEntry[]): DecisionRuleExecutionOrder {
  const issues = validateDecisionRuleDependencies(entries);
  if (issues.length > 0) return { order: [], issues };

  const edges = decisionRuleDependencyEdges(entries);
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
