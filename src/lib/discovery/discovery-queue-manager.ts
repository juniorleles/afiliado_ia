/**
 * Discovery Queue Manager.
 *
 * The single entry point for discovered candidates. It checks that the
 * candidate and source exist before enqueueing, then delegates to the queue,
 * resolver, and statistics. It starts no work: next() only reports which item
 * is ready.
 */
import {
  createDiscoveryQueue,
  DiscoveryQueueError,
  type DiscoveryQueue,
  type DiscoveryQueueFilter,
  type DiscoveryQueueInput,
  type DiscoveryQueueOptions,
} from "./discovery-queue";
import { resolveNextItem, resolveReadyItems, type DiscoveryQueueResolveFilter } from "./discovery-queue-resolver";
import { computeQueueStatistics, type DiscoveryQueueStatistics } from "./discovery-queue-statistics";
import {
  validateEnqueueInput,
  validateReferences,
  type DiscoveryReferenceLookup,
} from "./discovery-queue-validator";
import type { DiscoveryQueueItem, DiscoveryQueueStatus } from "./discovery-types";

export interface DiscoveryQueueManager {
  /** Rejects unknown candidates and sources, DISABLED or DEPRECATED sources, duplicates, and invalid input. */
  enqueue(input: DiscoveryQueueInput): DiscoveryQueueItem;
  remove(id: string): DiscoveryQueueItem;
  cancel(id: string): DiscoveryQueueItem;
  retry(id: string): DiscoveryQueueItem;
  updateStatus(id: string, status: DiscoveryQueueStatus, details?: { errorMessage?: string }): DiscoveryQueueItem;
  get(id: string): DiscoveryQueueItem | null;
  list(filter?: DiscoveryQueueFilter): DiscoveryQueueItem[];
  clear(): number;
  count(filter?: DiscoveryQueueFilter): number;
  /** The QUEUED item that should run next, or null. Does not change the item. */
  next(filter?: DiscoveryQueueResolveFilter): DiscoveryQueueItem | null;
  /** All QUEUED items in run order. */
  ready(filter?: DiscoveryQueueResolveFilter): DiscoveryQueueItem[];
  statistics(): DiscoveryQueueStatistics;
}

export interface DiscoveryQueueManagerOptions extends DiscoveryQueueOptions {
  lookup: DiscoveryReferenceLookup;
  /** Supply a queue to share it; a fresh one is created otherwise. */
  queue?: DiscoveryQueue;
}

export function createDiscoveryQueueManager(options: DiscoveryQueueManagerOptions): DiscoveryQueueManager {
  const queue = options.queue ?? createDiscoveryQueue({ now: options.now });

  return {
    enqueue(input) {
      const issues = validateEnqueueInput(input);
      if (issues.length === 0) issues.push(...validateReferences(input, options.lookup));
      if (issues.length > 0) throw new DiscoveryQueueError("Queue item is invalid.", issues);
      return queue.enqueue(input);
    },
    remove: (id) => queue.remove(id),
    cancel: (id) => queue.cancel(id),
    retry: (id) => queue.retry(id),
    updateStatus: (id, status, details) => queue.updateStatus(id, status, details),
    get: (id) => queue.get(id),
    list: (filter) => queue.list(filter),
    clear: () => queue.clear(),
    count: (filter) => queue.count(filter),
    next: (filter) => resolveNextItem(queue.list(), filter),
    ready: (filter) => resolveReadyItems(queue.list(), filter),
    statistics: () => computeQueueStatistics(queue.list()),
  };
}
