/**
 * Execution Contract Framework: registry.
 *
 * Holds contract records the resolver may use. It checks each record when it
 * is registered. It never resolves eligibility, never runs a task, and never
 * reaches an outside system.
 *
 * Not to be confused with ExecutionRegistry (execution-registry.ts), the
 * architecture contract for plan records. This registry holds execution
 * contracts.
 */
import {
  copyExecutionContract,
  freezeDeepExecutionContract,
  type ExecutionContract,
  type ExecutionContractCategory,
} from "./execution-contract";
import { createExecutionContractValidator } from "./execution-contract-validator";
import type { ExecutionIssue } from "./execution-validator";

export class ExecutionContractFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: ExecutionIssue[] = [],
  ) {
    super(message);
    this.name = "ExecutionContractFrameworkError";
  }
}

export interface ExecutionContractFilter {
  category?: ExecutionContractCategory;
}

export interface ExecutionContractRegistry {
  register(contract: ExecutionContract): ExecutionContract;
  remove(id: string): ExecutionContract;
  get(id: string): ExecutionContract | null;
  inspect(id: string): ExecutionContract | null;
  list(filter?: ExecutionContractFilter): ExecutionContract[];
  count(): number;
  validate(contract: unknown): ExecutionIssue[];
}

export function createExecutionContractRegistry(): ExecutionContractRegistry {
  const byId = new Map<string, ExecutionContract>();
  const validator = createExecutionContractValidator();

  const mustGet = (id: string): ExecutionContract => {
    const entry = byId.get(id);
    if (!entry) {
      throw new ExecutionContractFrameworkError(`Contract "${id}" is not registered.`, [
        { field: "id", message: `Contract "${id}" is not registered.` },
      ]);
    }
    return entry;
  };

  return {
    register(contract) {
      const issues = validator.validateContract(contract);
      if (issues.length > 0) throw new ExecutionContractFrameworkError("Contract is invalid.", issues);
      if (byId.has(contract.id)) {
        throw new ExecutionContractFrameworkError("Contract is invalid.", [
          { field: "id", message: `Duplicate Contract: "${contract.id}" is already registered.` },
        ]);
      }
      const stored = freezeDeepExecutionContract(copyExecutionContract(contract));
      byId.set(stored.id, stored);
      return stored;
    },
    remove(id) {
      const entry = mustGet(id);
      byId.delete(id);
      return entry;
    },
    get: (id) => byId.get(id) ?? null,
    inspect: (id) => byId.get(id) ?? null,
    list(filter = {}) {
      return [...byId.values()]
        .filter((item) => filter.category === undefined || item.category === filter.category)
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    count: () => byId.size,
    validate: (contract) => validator.validateContract(contract),
  };
}
