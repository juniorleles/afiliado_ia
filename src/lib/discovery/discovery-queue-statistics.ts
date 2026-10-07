/**
 * Discovery Queue Statistics.
 *
 * Pure counters and averages derived from queue items.
 *
 * Wait time runs from creation to the latest attempt start, for items that have
 * started (PROCESSING, COMPLETED, FAILED). Processing time runs from the latest
 * attempt start to the last update, for COMPLETED and FAILED items. Both are
 * null when no item qualifies.
 */
import {
  DISCOVERY_QUEUE_STATUSES,
  type DiscoveryQueueItem,
  type DiscoveryQueueStatus,
} from "./discovery-types";

export interface DiscoveryQueueStatistics {
  total: number;
  byStatus: Record<DiscoveryQueueStatus, number>;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  ignored: number;
  averageWaitMs: number | null;
  averageProcessingMs: number | null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeQueueStatistics(
  items: readonly Pick<DiscoveryQueueItem, "status" | "createdAt" | "updatedAt" | "lastAttempt">[],
): DiscoveryQueueStatistics {
  const byStatus = Object.fromEntries(DISCOVERY_QUEUE_STATUSES.map((status) => [status, 0])) as Record<
    DiscoveryQueueStatus,
    number
  >;
  const waits: number[] = [];
  const durations: number[] = [];

  for (const item of items) {
    byStatus[item.status] += 1;
    if (item.lastAttempt === null) continue;
    const started = Date.parse(item.lastAttempt);
    if (item.status === "PROCESSING" || item.status === "COMPLETED" || item.status === "FAILED") {
      waits.push(Math.max(0, started - Date.parse(item.createdAt)));
    }
    if (item.status === "COMPLETED" || item.status === "FAILED") {
      durations.push(Math.max(0, Date.parse(item.updatedAt) - started));
    }
  }

  return {
    total: items.length,
    byStatus,
    queued: byStatus.QUEUED,
    processing: byStatus.PROCESSING,
    completed: byStatus.COMPLETED,
    failed: byStatus.FAILED,
    ignored: byStatus.IGNORED,
    averageWaitMs: average(waits),
    averageProcessingMs: average(durations),
  };
}
