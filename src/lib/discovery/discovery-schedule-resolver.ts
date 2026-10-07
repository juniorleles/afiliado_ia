/**
 * Schedule Resolver.
 *
 * Calculates next runs and plans which schedules are due. It only reads and
 * computes: it starts no timer and executes nothing.
 *
 * HOURLY and CUSTOM advance by a fixed number of minutes. DAILY and WEEKLY keep
 * the anchor's local wall-clock time in the schedule's timezone, so a daily run
 * stays at the same local hour across daylight-saving changes.
 */
import { priorityRank } from "./discovery-queue-resolver";
import type { DiscoveryRegistry } from "./discovery-registry";
import type {
  DiscoveryFrequency,
  DiscoveryQueuePriority,
  DiscoverySchedule,
  DiscoverySourceStatus,
} from "./discovery-types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface ScheduleSourceLookup {
  sourceExists(sourceId: string): boolean;
  /** The source's current status, or null when it does not exist. */
  sourceStatus(sourceId: string): DiscoverySourceStatus | null;
}

/** A planned run. Producing it executes nothing. */
export interface DiscoveryExecutionPlan {
  scheduleId: string;
  sourceId: string;
  priority: DiscoveryQueuePriority;
  dueAt: string;
}

/** Resolves sources through the registry. */
export function createScheduleSourceLookup(registry: Pick<DiscoveryRegistry, "get">): ScheduleSourceLookup {
  return {
    sourceExists: (sourceId) => registry.get(sourceId) !== null,
    sourceStatus: (sourceId) => registry.get(sourceId)?.status ?? null,
  };
}

/** The nominal gap between runs in milliseconds; null for MANUAL. DAILY is 24 hours. */
export function nominalIntervalMs(
  schedule: Pick<DiscoverySchedule, "frequency" | "intervalMinutes">,
): number | null {
  switch (schedule.frequency) {
    case "HOURLY":
      return 60 * MINUTE_MS;
    case "DAILY":
      return DAY_MS;
    case "WEEKLY":
      return 7 * DAY_MS;
    case "CUSTOM":
      return schedule.intervalMinutes === null ? null : schedule.intervalMinutes * MINUTE_MS;
    default:
      return null;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(ms: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function offsetAt(ms: number, timezone: string): number {
  const p = localParts(ms, timezone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

function localToUtc(p: LocalParts, timezone: string): number {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const first = offsetAt(guess, timezone);
  const result = guess - first;
  const second = offsetAt(result, timezone);
  return second === first ? result : guess - second;
}

function dayNumber(p: LocalParts): number {
  return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
}

/**
 * The first occurrence after nowMs in the sequence anchor + n * period (n >= 1).
 * Returns null for MANUAL and for an unusable CUSTOM interval.
 */
export function nextOccurrence(
  spec: { frequency: DiscoveryFrequency; intervalMinutes: number | null; timezone: string },
  anchorMs: number,
  nowMs: number,
): number | null {
  if (spec.frequency === "DAILY" || spec.frequency === "WEEKLY") {
    const stepDays = spec.frequency === "DAILY" ? 1 : 7;
    const anchor = localParts(anchorMs, spec.timezone);
    const now = localParts(nowMs, spec.timezone);
    let n = Math.max(1, Math.floor((dayNumber(now) - dayNumber(anchor)) / stepDays));
    for (;;) {
      const candidate = localToUtc({ ...anchor, day: anchor.day + n * stepDays }, spec.timezone);
      if (candidate > nowMs) return candidate;
      n += 1;
    }
  }

  const period = nominalIntervalMs(spec);
  if (period === null || period <= 0) return null;
  let n = Math.max(1, Math.floor((nowMs - anchorMs) / period));
  while (anchorMs + n * period <= nowMs) n += 1;
  return anchorMs + n * period;
}

/**
 * The next planned run strictly after now, counted from the schedule's last
 * run (or from now when it has never run). Null for MANUAL schedules.
 */
export function computeNextRun(
  schedule: Pick<DiscoverySchedule, "frequency" | "intervalMinutes" | "timezone" | "lastRun">,
  now: Date,
): string | null {
  const anchor = schedule.lastRun === null ? now.getTime() : Date.parse(schedule.lastRun);
  const next = nextOccurrence(schedule, anchor, now.getTime());
  return next === null ? null : new Date(next).toISOString();
}

/** A schedule that was due but not planned because its source is DISABLED or DEPRECATED. */
export interface DiscoverySkippedPlan {
  scheduleId: string;
  sourceId: string;
  dueAt: string;
  reason: "SOURCE_DISABLED" | "SOURCE_DEPRECATED";
}

export interface DiscoveryPlanResult {
  due: DiscoveryExecutionPlan[];
  skipped: DiscoverySkippedPlan[];
}

/**
 * Splits the due schedules into planned runs and skipped ones. A due schedule
 * whose source is DISABLED or DEPRECATED is skipped and produces no run.
 * Without `sourceStatus`, no source is checked.
 */
export function planSchedules(
  schedules: readonly DiscoverySchedule[],
  now: Date,
  sourceStatus?: (sourceId: string) => DiscoverySourceStatus | null,
): DiscoveryPlanResult {
  const dueSchedules = schedules.filter(
    (schedule) =>
      schedule.enabled &&
      schedule.status === "ACTIVE" &&
      schedule.frequency !== "MANUAL" &&
      schedule.nextRun !== null &&
      Date.parse(schedule.nextRun) <= now.getTime(),
  );
  const due: DiscoveryExecutionPlan[] = [];
  const skipped: DiscoverySkippedPlan[] = [];
  for (const schedule of dueSchedules) {
    const status = sourceStatus ? sourceStatus(schedule.sourceId) : null;
    if (status === "DISABLED" || status === "DEPRECATED") {
      skipped.push({
        scheduleId: schedule.id,
        sourceId: schedule.sourceId,
        dueAt: schedule.nextRun as string,
        reason: status === "DISABLED" ? "SOURCE_DISABLED" : "SOURCE_DEPRECATED",
      });
    } else {
      due.push({
        scheduleId: schedule.id,
        sourceId: schedule.sourceId,
        priority: schedule.priority,
        dueAt: schedule.nextRun as string,
      });
    }
  }
  due.sort(
    (a, b) =>
      priorityRank(b.priority) - priorityRank(a.priority) ||
      Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
      a.scheduleId.localeCompare(b.scheduleId),
  );
  return { due, skipped };
}

/** Schedules whose run is due, highest priority first, then earliest due. */
export function planDueExecutions(
  schedules: readonly DiscoverySchedule[],
  now: Date,
  sourceStatus?: (sourceId: string) => DiscoverySourceStatus | null,
): DiscoveryExecutionPlan[] {
  return planSchedules(schedules, now, sourceStatus).due;
}
