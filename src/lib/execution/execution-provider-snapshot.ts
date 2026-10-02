/**
 * Execution Provider Framework: snapshot.
 *
 * A frozen record of one resolution: the snapshot id, the plan id, the
 * compatible host ids, the contract ids, the capabilities, the host records,
 * a creation timestamp, and flat metadata. It never invokes a host and never
 * changes what it is given.
 */
import {
  copyExecutionProviderRecord,
  copyPlainExecutionProvider,
  freezeDeepExecutionProvider,
  type ExecutionProviderRecord,
} from "./execution-provider";
import type { ExecutionProviderCapability } from "./execution-provider-capabilities";
import type { ExecutionMetadata } from "./execution-types";

export const EXECUTION_PROVIDER_SNAPSHOT_KEYS = [
  "snapshotId",
  "planId",
  "providerIds",
  "contractIds",
  "capabilities",
  "providers",
  "createdAt",
  "metadata",
] as const;

export interface ExecutionProviderSnapshot {
  snapshotId: string;
  planId: string | null;
  providerIds: readonly string[];
  contractIds: readonly string[];
  capabilities: readonly ExecutionProviderCapability[];
  providers: readonly ExecutionProviderRecord[];
  createdAt: string;
  metadata: ExecutionMetadata;
}

export interface ExecutionProviderSnapshotInit {
  snapshotId: string;
  planId: string | null;
  providerIds: readonly string[];
  contractIds: readonly string[];
  capabilities: readonly ExecutionProviderCapability[];
  providers: readonly ExecutionProviderRecord[];
  createdAt: string;
  metadata?: ExecutionMetadata;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createExecutionProviderSnapshot(init: ExecutionProviderSnapshotInit): ExecutionProviderSnapshot {
  return freezeDeepExecutionProvider({
    snapshotId: init.snapshotId,
    planId: init.planId,
    providerIds: [...init.providerIds],
    contractIds: [...init.contractIds],
    capabilities: [...init.capabilities],
    providers: init.providers.map((item) => freezeDeepExecutionProvider(copyExecutionProviderRecord(item))),
    createdAt: init.createdAt,
    metadata: copyPlainExecutionProvider(init.metadata ?? {}),
  });
}
