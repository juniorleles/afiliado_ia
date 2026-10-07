/**
 * Discovery Queue Resolver.
 *
 * Decides ordering and resolves references. It only reads: it never changes
 * an item, so resolving the next item does not start it.
 */
import type { DiscoveryRegistry } from "./discovery-registry";
import type { DiscoveryReferenceLookup } from "./discovery-queue-validator";
import type { DiscoveryQueueItem, DiscoveryQueuePriority } from "./discovery-types";

const PRIORITY_RANK: Record<DiscoveryQueuePriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/** Higher ranks run first. */
export function priorityRank(priority: DiscoveryQueuePriority): number {
  return PRIORITY_RANK[priority];
}

export interface DiscoveryQueueResolveFilter {
  sourceId?: string;
}

/** Highest priority first, then oldest first. Equal items keep their input order. */
export function orderQueueItems<T extends Pick<DiscoveryQueueItem, "priority" | "createdAt">>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

/** The QUEUED items that are ready, in the order they should run. */
export function resolveReadyItems(
  items: readonly DiscoveryQueueItem[],
  filter: DiscoveryQueueResolveFilter = {},
): DiscoveryQueueItem[] {
  return orderQueueItems(
    items.filter(
      (item) => item.status === "QUEUED" && (filter.sourceId === undefined || item.sourceId === filter.sourceId),
    ),
  );
}

export function resolveNextItem(
  items: readonly DiscoveryQueueItem[],
  filter: DiscoveryQueueResolveFilter = {},
): DiscoveryQueueItem | null {
  return resolveReadyItems(items, filter)[0] ?? null;
}

/** Resolves sources through the registry; candidates through the supplied check. */
export function createReferenceLookup(
  registry: Pick<DiscoveryRegistry, "get">,
  candidateExists: (candidateId: string) => boolean,
): DiscoveryReferenceLookup {
  return {
    candidateExists,
    sourceExists: (sourceId) => registry.get(sourceId) !== null,
    sourceStatus: (sourceId) => registry.get(sourceId)?.status ?? null,
  };
}
