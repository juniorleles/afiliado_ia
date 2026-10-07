/**
 * Execution Provider Framework: registry.
 *
 * Holds host modules the resolver may use. It checks each module when it is
 * registered and tracks whether it is enabled. It never invokes a host, never
 * runs a contract, and never reaches an outside system.
 *
 * Not to be confused with ExecutionRegistry (execution-registry.ts), the
 * architecture contract for plan records. This registry holds host modules.
 */
import {
  freezeDeepExecutionProvider,
  recordFromExecutionProvider,
  type ExecutionProvider,
  type ExecutionProviderEntry,
} from "./execution-provider";
import type { ExecutionProviderCapability } from "./execution-provider-capabilities";
import { createExecutionProviderValidator } from "./execution-provider-validator";
import type { ExecutionIssue } from "./execution-validator";

export class ExecutionProviderFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: ExecutionIssue[] = [],
  ) {
    super(message);
    this.name = "ExecutionProviderFrameworkError";
  }
}

export interface ExecutionProviderFilter {
  enabled?: boolean;
  contractId?: string;
  capability?: ExecutionProviderCapability;
}

export interface ExecutionProviderRegistry {
  register(module: ExecutionProvider): ExecutionProviderEntry;
  remove(id: string): ExecutionProviderEntry;
  enable(id: string): ExecutionProviderEntry;
  disable(id: string): ExecutionProviderEntry;
  get(id: string): ExecutionProviderEntry | null;
  inspect(id: string): ExecutionProviderEntry | null;
  resolve(id: string): ExecutionProviderEntry | null;
  list(filter?: ExecutionProviderFilter): ExecutionProviderEntry[];
  count(): number;
  validate(module: unknown): ExecutionIssue[];
}

export function createExecutionProviderRegistry(): ExecutionProviderRegistry {
  const entries = new Map<string, ExecutionProviderEntry>();
  const validator = createExecutionProviderValidator();

  const mustGet = (id: string): ExecutionProviderEntry => {
    const entry = entries.get(id);
    if (!entry) {
      throw new ExecutionProviderFrameworkError(`Provider "${id}" is not registered.`, [
        { field: "id", message: `Missing Provider: "${id}" is not registered.` },
      ]);
    }
    return entry;
  };

  const setEnabled = (id: string, enabled: boolean): ExecutionProviderEntry => {
    const current = mustGet(id);
    const next: ExecutionProviderEntry = { ...current, enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(module) {
      const issues = validator.validateProvider(module);
      if (issues.length > 0) throw new ExecutionProviderFrameworkError("Provider is invalid.", issues);
      if (entries.has(module.id)) {
        throw new ExecutionProviderFrameworkError("Provider is invalid.", [
          { field: "id", message: `Duplicate Provider: "${module.id}" is already registered.` },
        ]);
      }
      const record = freezeDeepExecutionProvider(recordFromExecutionProvider(module, true));
      const entry: ExecutionProviderEntry = { ...record, module };
      entries.set(entry.id, entry);
      return entry;
    },
    remove(id) {
      const entry = mustGet(id);
      entries.delete(id);
      return entry;
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => entries.get(id) ?? null,
    inspect: (id) => entries.get(id) ?? null,
    resolve: (id) => {
      const entry = entries.get(id);
      return entry && entry.enabled ? entry : null;
    },
    list(filter = {}) {
      return [...entries.values()]
        .filter(
          (item) =>
            (filter.enabled === undefined || item.enabled === filter.enabled) &&
            (filter.contractId === undefined || item.supportedContracts.includes(filter.contractId)) &&
            (filter.capability === undefined || item.capabilities.includes(filter.capability)),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    count: () => entries.size,
    validate: (module) => validator.validateProvider(module),
  };
}
