/**
 * Scheduler Statistics.
 *
 * Pure counters derived from schedules.
 *
 * - lastExecution: the most recent lastRun across all schedules.
 * - nextExecution: the earliest nextRun among ACTIVE schedules.
 * - averageIntervalMs: the mean nominal gap between runs across non-MANUAL
 *   schedules (DAILY counts as 24 hours). Null when none qualifies.
 */
import { nominalIntervalMs } from "./discovery-schedule-resolver";
import {
  DISCOVERY_SCHEDULE_STATUSES,
  type DiscoverySchedule,
  type DiscoveryScheduleStatus,
} from "./discovery-types";

export interface DiscoveryScheduleStatistics {
  total: number;
  byStatus: Record<DiscoveryScheduleStatus, number>;
  active: number;
  paused: number;
  disabled: number;
  error: number;
  lastExecution: string | null;
  nextExecution: string | null;
  averageIntervalMs: number | null;
}

export function computeScheduleStatistics(
  schedules: readonly Pick<
    DiscoverySchedule,
    "status" | "frequency" | "intervalMinutes" | "nextRun" | "lastRun"
  >[],
): DiscoveryScheduleStatistics {
  const byStatus = Object.fromEntries(DISCOVERY_SCHEDULE_STATUSES.map((status) => [status, 0])) as Record<
    DiscoveryScheduleStatus,
    number
  >;
  let last: number | null = null;
  let next: number | null = null;
  const intervals: number[] = [];

  for (const schedule of schedules) {
    byStatus[schedule.status] += 1;
    if (schedule.lastRun !== null) {
      const time = Date.parse(schedule.lastRun);
      if (last === null || time > last) last = time;
    }
    if (schedule.status === "ACTIVE" && schedule.nextRun !== null) {
      const time = Date.parse(schedule.nextRun);
      if (next === null || time < next) next = time;
    }
    const interval = nominalIntervalMs(schedule);
    if (interval !== null) intervals.push(interval);
  }

  return {
    total: schedules.length,
    byStatus,
    active: byStatus.ACTIVE,
    paused: byStatus.PAUSED,
    disabled: byStatus.DISABLED,
    error: byStatus.ERROR,
    lastExecution: last === null ? null : new Date(last).toISOString(),
    nextExecution: next === null ? null : new Date(next).toISOString(),
    averageIntervalMs:
      intervals.length === 0 ? null : intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
  };
}
