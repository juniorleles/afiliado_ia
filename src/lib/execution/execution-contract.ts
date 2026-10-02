/**
 * Execution Contract Framework: contract record.
 *
 * Names what may later be carried out. A contract never runs work, never
 * reaches an outside system, never writes a store, and never changes a
 * workflow stage. FUTURE is the room left for later groups.
 *
 * Distinct from ExecutionTaskModule in execution-task-contract.ts, which is
 * the task-module shape. This record is provider-agnostic and immutable.
 */
import type { ExecutionMetadata } from "./execution-types";

/** The groups a contract can belong to. FUTURE is the room left for later groups. */
export const EXECUTION_CONTRACT_CATEGORIES = [
  "LANDING_PAGE",
  "CAMPAIGN",
  "CREATIVE",
  "TRACKING",
  "MONITORING",
  "NOTIFICATION",
  "FUTURE",
] as const;
export type ExecutionContractCategory = (typeof EXECUTION_CONTRACT_CATEGORIES)[number];

/** Input members a contract may require to be present before it is eligible. */
export const EXECUTION_CONTRACT_REQUIREMENT_KEYS = [
  "plan",
  "tasks",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
export type ExecutionContractRequirementKey = (typeof EXECUTION_CONTRACT_REQUIREMENT_KEYS)[number];

export const EXECUTION_CONTRACT_KEYS = [
  "id",
  "name",
  "version",
  "category",
  "capabilities",
  "requirements",
  "inputs",
  "outputs",
  "metadata",
] as const;

/** One immutable declaration of what can be carried out. Does not run work. */
export interface ExecutionContract {
  id: string;
  name: string;
  /** Semantic version, for example "1.0.0". */
  version: string;
  category: ExecutionContractCategory;
  capabilities: readonly string[];
  requirements: readonly ExecutionContractRequirementKey[];
  inputs: readonly string[];
  outputs: readonly string[];
  metadata: ExecutionMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionContract<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionContract(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainExecutionContract<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainExecutionContract(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainExecutionContract(inner)])) as T;
  }
  return value;
}

export function copyExecutionContract(item: ExecutionContract): ExecutionContract {
  return {
    id: item.id,
    name: item.name,
    version: item.version,
    category: item.category,
    capabilities: [...item.capabilities],
    requirements: [...item.requirements],
    inputs: [...item.inputs],
    outputs: [...item.outputs],
    metadata: copyPlainExecutionContract(item.metadata ?? {}),
  };
}

/** Builds a frozen contract from copies of the fields. Does not validate. */
export function createExecutionContract(item: ExecutionContract): ExecutionContract {
  return freezeDeepExecutionContract(copyExecutionContract(item));
}
