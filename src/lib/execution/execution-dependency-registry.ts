/**
 * Execution Dependency Resolver: registry.
 *
 * Holds typed dependencies the resolver may use. It checks each record when
 * it is registered. It never resolves eligibility, never runs a task, and
 * never reaches an outside system.
 *
 * Not to be confused with ExecutionRegistry (execution-registry.ts), the
 * architecture contract for untyped from-to waits.
 */
import {
  dependencyKeyOf,
  type ExecutionDependencyKind,
  type ExecutionTypedDependency,
} from "./execution-dependency-graph";
import { createExecutionDependencyValidator } from "./execution-dependency-validator";
import type { ExecutionIssue } from "./execution-validator";

export class ExecutionDependencyFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: ExecutionIssue[] = [],
  ) {
    super(message);
    this.name = "ExecutionDependencyFrameworkError";
  }
}

export interface ExecutionDependencyFilter {
  kind?: ExecutionDependencyKind;
  from?: string;
  to?: string;
}

export interface ExecutionDependencyRegistry {
  register(dependency: ExecutionTypedDependency): ExecutionTypedDependency;
  remove(id: string): ExecutionTypedDependency;
  get(id: string): ExecutionTypedDependency | null;
  getByKey(from: string, to: string, kind: ExecutionDependencyKind): ExecutionTypedDependency | null;
  list(filter?: ExecutionDependencyFilter): ExecutionTypedDependency[];
  count(): number;
  validate(dependency: unknown): ExecutionIssue[];
}

export function createExecutionDependencyRegistry(): ExecutionDependencyRegistry {
  const byId = new Map<string, ExecutionTypedDependency>();
  const byKey = new Map<string, string>();
  const validator = createExecutionDependencyValidator();

  const mustGet = (id: string): ExecutionTypedDependency => {
    const entry = byId.get(id);
    if (!entry) {
      throw new ExecutionDependencyFrameworkError(`Dependency "${id}" is not registered.`, [
        { field: "id", message: `Dependency "${id}" is not registered.` },
      ]);
    }
    return entry;
  };

  return {
    register(dependency) {
      const issues = validator.validateDependency(dependency);
      if (issues.length > 0) throw new ExecutionDependencyFrameworkError("Dependency is invalid.", issues);
      if (byId.has(dependency.id)) {
        throw new ExecutionDependencyFrameworkError("Dependency is invalid.", [
          { field: "id", message: `Duplicate Dependency: "${dependency.id}" is already registered.` },
        ]);
      }
      const key = dependencyKeyOf(dependency.from, dependency.to, dependency.kind);
      if (byKey.has(key)) {
        throw new ExecutionDependencyFrameworkError("Dependency is invalid.", [
          { field: "dependency", message: `Duplicate Dependency: "${dependency.from}" to "${dependency.to}" as ${dependency.kind} is already registered.` },
        ]);
      }
      const stored: ExecutionTypedDependency = {
        id: dependency.id,
        from: dependency.from,
        to: dependency.to,
        kind: dependency.kind,
        metadata: { ...dependency.metadata },
      };
      byId.set(stored.id, stored);
      byKey.set(key, stored.id);
      return stored;
    },
    remove(id) {
      const entry = mustGet(id);
      byId.delete(id);
      byKey.delete(dependencyKeyOf(entry.from, entry.to, entry.kind));
      return entry;
    },
    get: (id) => byId.get(id) ?? null,
    getByKey: (from, to, kind) => {
      const id = byKey.get(dependencyKeyOf(from, to, kind));
      return id ? (byId.get(id) ?? null) : null;
    },
    list(filter = {}) {
      return [...byId.values()]
        .filter(
          (item) =>
            (filter.kind === undefined || item.kind === filter.kind) &&
            (filter.from === undefined || item.from === filter.from) &&
            (filter.to === undefined || item.to === filter.to),
        )
        .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    },
    count: () => byId.size,
    validate: (dependency) => validator.validateDependency(dependency),
  };
}
