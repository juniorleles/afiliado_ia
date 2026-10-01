/**
 * Discovery Queue.
 *
 * In-memory queue of discovered candidates. It stores items and applies the
 * validator's rules; it never runs, fetches, or processes anything, and it
 * persists nothing.
 */
import {
  validateEnqueueInput,
  validateNoDuplicate,
  validateQueueItem,
  validateStatusTransition,
  type DiscoveryQueueInitialStatus,
  type DiscoveryQueueIssue,
} from "./discovery-queue-validator";
import type {
  DiscoveryQueueItem,
  DiscoveryQueueMetadata,
  DiscoveryQueuePriority,
  DiscoveryQueueStatus,
} from "./discovery-types";

export class DiscoveryQueueError extends Error {
  constructor(
    message: string,
    readonly issues: DiscoveryQueueIssue[] = [],
  ) {
    super(message);
    this.name = "DiscoveryQueueError";
  }
}

export interface DiscoveryQueueInput {
  candidateId: string;
  sourceId: string;
  /** Defaults to NORMAL. */
  priority?: DiscoveryQueuePriority;
  /** Defaults to QUEUED. */
  status?: DiscoveryQueueInitialStatus;
  metadata?: DiscoveryQueueMetadata;
}

export interface DiscoveryQueueFilter {
  status?: DiscoveryQueueStatus;
  sourceId?: string;
  priority?: DiscoveryQueuePriority;
}

export interface DiscoveryQueue {
  enqueue(input: DiscoveryQueueInput): DiscoveryQueueItem;
  /** Deletes an item. A PROCESSING item must be cancelled first. */
  remove(id: string): DiscoveryQueueItem;
  cancel(id: string): DiscoveryQueueItem;
  /** Returns a FAILED or CANCELLED item to QUEUED and clears its error. */
  retry(id: string): DiscoveryQueueItem;
  updateStatus(id: string, status: DiscoveryQueueStatus, details?: { errorMessage?: string }): DiscoveryQueueItem;
  get(id: string): DiscoveryQueueItem | null;
  getByCandidate(candidateId: string): DiscoveryQueueItem | null;
  /** Items in insertion order. */
  list(filter?: DiscoveryQueueFilter): DiscoveryQueueItem[];
  /** Removes every item and returns how many were removed. */
  clear(): number;
  count(filter?: DiscoveryQueueFilter): number;
}

export interface DiscoveryQueueOptions {
  now?: () => Date;
}

function copy(item: DiscoveryQueueItem): DiscoveryQueueItem {
  return { ...item, metadata: { ...item.metadata } };
}

function matches(item: DiscoveryQueueItem, filter: DiscoveryQueueFilter): boolean {
  return (
    (filter.status === undefined || item.status === filter.status) &&
    (filter.sourceId === undefined || item.sourceId === filter.sourceId) &&
    (filter.priority === undefined || item.priority === filter.priority)
  );
}

export function createDiscoveryQueue(options: DiscoveryQueueOptions = {}): DiscoveryQueue {
  const now = options.now ?? (() => new Date());
  const items = new Map<string, DiscoveryQueueItem>();
  let sequence = 0;

  const mustGet = (id: string): DiscoveryQueueItem => {
    const item = items.get(id);
    if (!item) throw new DiscoveryQueueError(`Queue item "${id}" does not exist.`);
    return item;
  };

  const fail = (message: string, issues: DiscoveryQueueIssue[]): never => {
    throw new DiscoveryQueueError(message, issues);
  };

  const move = (id: string, status: DiscoveryQueueStatus, errorMessage?: string): DiscoveryQueueItem => {
    const item = mustGet(id);
    const issues = validateStatusTransition(item.status, status, errorMessage);
    if (issues.length > 0) fail("Status change is invalid.", issues);

    const at = now().toISOString();
    const updated: DiscoveryQueueItem = { ...item, status, updatedAt: at };
    if (status === "PROCESSING") {
      updated.attempts = item.attempts + 1;
      updated.lastAttempt = at;
    }
    updated.errorMessage = status === "FAILED" ? (errorMessage as string) : null;
    items.set(id, updated);
    return copy(updated);
  };

  return {
    enqueue(input) {
      const issues = validateEnqueueInput(input);
      if (issues.length === 0) issues.push(...validateNoDuplicate(items.values(), input.candidateId));
      if (issues.length > 0) fail("Queue item is invalid.", issues);

      const at = now().toISOString();
      sequence += 1;
      const item: DiscoveryQueueItem = {
        id: `queue-item-${sequence}`,
        candidateId: input.candidateId,
        sourceId: input.sourceId,
        priority: input.priority ?? "NORMAL",
        status: input.status ?? "QUEUED",
        createdAt: at,
        updatedAt: at,
        attempts: 0,
        lastAttempt: null,
        errorMessage: null,
        metadata: { ...(input.metadata ?? {}) },
      };
      const itemIssues = validateQueueItem(item);
      if (itemIssues.length > 0) fail("Queue item is invalid.", itemIssues);
      items.set(item.id, item);
      return copy(item);
    },
    remove(id) {
      const item = mustGet(id);
      if (item.status === "PROCESSING") {
        fail("A processing item cannot be removed.", [
          { field: "status", message: "Cancel a PROCESSING item before removing it." },
        ]);
      }
      items.delete(id);
      return copy(item);
    },
    cancel: (id) => move(id, "CANCELLED"),
    retry(id) {
      const item = mustGet(id);
      if (item.status !== "FAILED" && item.status !== "CANCELLED") {
        fail("Only a FAILED or CANCELLED item can be retried.", [
          { field: "status", message: `A ${item.status} item cannot be retried.` },
        ]);
      }
      return move(id, "QUEUED");
    },
    updateStatus: (id, status, details) => move(id, status, details?.errorMessage),
    get(id) {
      const item = items.get(id);
      return item ? copy(item) : null;
    },
    getByCandidate(candidateId) {
      for (const item of items.values()) {
        if (item.candidateId === candidateId) return copy(item);
      }
      return null;
    },
    list(filter = {}) {
      return [...items.values()].filter((item) => matches(item, filter)).map(copy);
    },
    clear() {
      const removed = items.size;
      items.clear();
      return removed;
    },
    count(filter = {}) {
      let total = 0;
      for (const item of items.values()) if (matches(item, filter)) total += 1;
      return total;
    },
  };
}
