/**
 * Execution Contract Framework: snapshot.
 *
 * A frozen record of one resolution: the snapshot id, the plan id, the
 * workflow snapshot id, the Decision Analysis id, the resolved contract ids,
 * the contracts, a creation timestamp, and flat metadata. It never runs a
 * task and never changes what it is given.
 */
import {
  copyExecutionContract,
  copyPlainExecutionContract,
  freezeDeepExecutionContract,
  type ExecutionContract,
} from "./execution-contract";
import type { ExecutionMetadata } from "./execution-types";

export const EXECUTION_CONTRACT_SNAPSHOT_KEYS = [
  "snapshotId",
  "planId",
  "workflowId",
  "decisionId",
  "resolvedIds",
  "contracts",
  "createdAt",
  "metadata",
] as const;

export interface ExecutionContractSnapshot {
  snapshotId: string;
  planId: string | null;
  workflowId: string | null;
  decisionId: string | null;
  resolvedIds: readonly string[];
  contracts: readonly ExecutionContract[];
  createdAt: string;
  metadata: ExecutionMetadata;
}

export interface ExecutionContractSnapshotInit {
  snapshotId: string;
  planId: string | null;
  workflowId: string | null;
  decisionId: string | null;
  resolvedIds: readonly string[];
  contracts: readonly ExecutionContract[];
  createdAt: string;
  metadata?: ExecutionMetadata;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createExecutionContractSnapshot(init: ExecutionContractSnapshotInit): ExecutionContractSnapshot {
  return freezeDeepExecutionContract({
    snapshotId: init.snapshotId,
    planId: init.planId,
    workflowId: init.workflowId,
    decisionId: init.decisionId,
    resolvedIds: [...init.resolvedIds],
    contracts: init.contracts.map((item) => freezeDeepExecutionContract(copyExecutionContract(item))),
    createdAt: init.createdAt,
    metadata: copyPlainExecutionContract(init.metadata ?? {}),
  });
}
