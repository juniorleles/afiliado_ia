/**
 * Discovery Queue Validator.
 *
 * Pure rules for queue items, enqueue input, status transitions, duplicates,
 * and references. No I/O.
 */
import {
  DISCOVERY_QUEUE_PRIORITIES,
  DISCOVERY_QUEUE_STATUSES,
  type DiscoveryQueueItem,
  type DiscoveryQueuePriority,
  type DiscoveryQueueStatus,
  type DiscoverySourceStatus,
} from "./discovery-types";
import { isSourceBlocked } from "./discovery-sources";

export interface DiscoveryQueueIssue {
  field: string;
  message: string;
}

/** Answers whether a candidate or a source exists. Supplied by the caller. */
export interface DiscoveryReferenceLookup {
  candidateExists(candidateId: string): boolean;
  sourceExists(sourceId: string): boolean;
  /** The source's current status, or null when it does not exist. */
  sourceStatus(sourceId: string): DiscoverySourceStatus | null;
}

/** Statuses an item may be created in. */
export const DISCOVERY_QUEUE_INITIAL_STATUSES = ["NEW", "QUEUED", "WAITING"] as const;
export type DiscoveryQueueInitialStatus = (typeof DISCOVERY_QUEUE_INITIAL_STATUSES)[number];

const TRANSITIONS: Record<DiscoveryQueueStatus, readonly DiscoveryQueueStatus[]> = {
  NEW: ["QUEUED", "WAITING", "IGNORED", "CANCELLED"],
  QUEUED: ["WAITING", "PROCESSING", "IGNORED", "CANCELLED"],
  WAITING: ["QUEUED", "PROCESSING", "IGNORED", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["QUEUED", "IGNORED", "CANCELLED"],
  IGNORED: [],
  CANCELLED: ["QUEUED"],
};

export function isQueueStatus(value: unknown): value is DiscoveryQueueStatus {
  return (DISCOVERY_QUEUE_STATUSES as readonly unknown[]).includes(value);
}

export function isQueuePriority(value: unknown): value is DiscoveryQueuePriority {
  return (DISCOVERY_QUEUE_PRIORITIES as readonly unknown[]).includes(value);
}

export function allowedTransitions(from: DiscoveryQueueStatus): readonly DiscoveryQueueStatus[] {
  return TRANSITIONS[from];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Metadata must be a flat object of strings, numbers, booleans, or null. */
export function metadataIssue(value: unknown): DiscoveryQueueIssue | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { field: "metadata", message: "Metadata must be an object." };
  }
  for (const entry of Object.values(value)) {
    const ok =
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry));
    if (!ok) return { field: "metadata", message: "Metadata values must be strings, numbers, booleans, or null." };
  }
  return null;
}

/** Checks the shape and values of a complete queue item. */
export function validateQueueItem(input: unknown): DiscoveryQueueIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "item", message: "Queue item must be an object." }];
  }
  const item = input as Partial<Record<keyof DiscoveryQueueItem, unknown>>;
  const issues: DiscoveryQueueIssue[] = [];
  const add = (field: keyof DiscoveryQueueItem, message: string) => issues.push({ field, message });

  if (!nonEmpty(item.id)) add("id", "Id is required.");
  if (!nonEmpty(item.candidateId)) add("candidateId", "Candidate is required.");
  if (!nonEmpty(item.sourceId)) add("sourceId", "Source is required.");
  if (!isQueueStatus(item.status)) add("status", "Status is not supported.");
  if (!isQueuePriority(item.priority)) add("priority", "Priority is not supported.");
  if (typeof item.attempts !== "number" || !Number.isInteger(item.attempts) || item.attempts < 0) {
    add("attempts", "Attempts must be a non-negative integer.");
  }
  if (!validTimestamp(item.createdAt)) add("createdAt", "createdAt must be an ISO timestamp.");
  if (!validTimestamp(item.updatedAt)) add("updatedAt", "updatedAt must be an ISO timestamp.");
  if (item.lastAttempt !== null && !validTimestamp(item.lastAttempt)) {
    add("lastAttempt", "lastAttempt must be an ISO timestamp or null.");
  }
  if (item.errorMessage !== null && typeof item.errorMessage !== "string") {
    add("errorMessage", "errorMessage must be text or null.");
  }
  const metadata = metadataIssue(item.metadata);
  if (metadata) issues.push(metadata);
  return issues;
}

/** Checks the input a caller supplies when enqueueing. */
export function validateEnqueueInput(input: unknown): DiscoveryQueueIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "input", message: "Enqueue input must be an object." }];
  }
  const value = input as Record<string, unknown>;
  const issues: DiscoveryQueueIssue[] = [];
  if (!nonEmpty(value.candidateId)) issues.push({ field: "candidateId", message: "Candidate is required." });
  if (!nonEmpty(value.sourceId)) issues.push({ field: "sourceId", message: "Source is required." });
  if (value.priority !== undefined && !isQueuePriority(value.priority)) {
    issues.push({ field: "priority", message: "Priority is not supported." });
  }
  if (
    value.status !== undefined &&
    !(DISCOVERY_QUEUE_INITIAL_STATUSES as readonly unknown[]).includes(value.status)
  ) {
    issues.push({ field: "status", message: "Status is not supported for a new item." });
  }
  if (value.metadata !== undefined) {
    const metadata = metadataIssue(value.metadata);
    if (metadata) issues.push(metadata);
  }
  return issues;
}

export function validateStatusTransition(
  from: DiscoveryQueueStatus,
  to: unknown,
  errorMessage?: unknown,
): DiscoveryQueueIssue[] {
  if (!isQueueStatus(to)) return [{ field: "status", message: "Status is not supported." }];
  const issues: DiscoveryQueueIssue[] = [];
  if (!TRANSITIONS[from].includes(to)) {
    issues.push({ field: "status", message: `A ${from} item cannot move to ${to}.` });
  }
  if (to === "FAILED" && !nonEmpty(errorMessage)) {
    issues.push({ field: "errorMessage", message: "A failed item requires an error message." });
  }
  return issues;
}

/** One queue item per candidate. */
export function validateNoDuplicate(
  items: Iterable<Pick<DiscoveryQueueItem, "candidateId">>,
  candidateId: string,
): DiscoveryQueueIssue[] {
  for (const item of items) {
    if (item.candidateId === candidateId) {
      return [{ field: "candidateId", message: `Candidate "${candidateId}" is already in the queue.` }];
    }
  }
  return [];
}

export function validateReferences(
  item: Pick<DiscoveryQueueItem, "candidateId" | "sourceId">,
  lookup: DiscoveryReferenceLookup,
): DiscoveryQueueIssue[] {
  const issues: DiscoveryQueueIssue[] = [];
  if (!lookup.candidateExists(item.candidateId)) {
    issues.push({ field: "candidateId", message: `Candidate "${item.candidateId}" does not exist.` });
  }
  if (!lookup.sourceExists(item.sourceId)) {
    issues.push({ field: "sourceId", message: `Source "${item.sourceId}" does not exist.` });
  } else {
    const status = lookup.sourceStatus(item.sourceId);
    if (isSourceBlocked(status)) {
      issues.push({ field: "sourceId", message: `Source "${item.sourceId}" is ${status} and cannot receive queue items.` });
    }
  }
  return issues;
}
