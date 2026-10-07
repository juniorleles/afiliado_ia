/**
 * Schedule Validator.
 *
 * Pure rules for schedule input, complete schedules, duplicates, and sources.
 */
import { metadataIssue, isQueuePriority } from "./discovery-queue-validator";
import type { ScheduleSourceLookup } from "./discovery-schedule-resolver";
import {
  DISCOVERY_FREQUENCIES,
  DISCOVERY_SCHEDULE_STATUSES,
  type DiscoveryFrequency,
  type DiscoverySchedule,
  type DiscoveryScheduleStatus,
} from "./discovery-types";

export interface DiscoveryScheduleIssue {
  field: string;
  message: string;
}

export const SCHEDULE_INTERVAL_MIN_MINUTES = 1;
/** One year. */
export const SCHEDULE_INTERVAL_MAX_MINUTES = 525_600;

export function isFrequency(value: unknown): value is DiscoveryFrequency {
  return (DISCOVERY_FREQUENCIES as readonly unknown[]).includes(value);
}

export function isScheduleStatus(value: unknown): value is DiscoveryScheduleStatus {
  return (DISCOVERY_SCHEDULE_STATUSES as readonly unknown[]).includes(value);
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

interface ScheduleFields {
  sourceId?: unknown;
  frequency?: unknown;
  intervalMinutes?: unknown;
  timezone?: unknown;
  nextRun?: unknown;
  lastRun?: unknown;
  priority?: unknown;
  metadata?: unknown;
}

/** Rules shared by input and complete schedules. Absent optional fields are skipped. */
function validateFields(value: ScheduleFields, now: Date | null): DiscoveryScheduleIssue[] {
  const issues: DiscoveryScheduleIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (typeof value.sourceId !== "string" || value.sourceId.trim() === "") add("sourceId", "Source is required.");
  if (!isFrequency(value.frequency)) add("frequency", "Frequency is not supported.");
  if (value.timezone !== undefined && !isValidTimezone(value.timezone)) add("timezone", "Timezone is not valid.");
  if (value.priority !== undefined && !isQueuePriority(value.priority)) add("priority", "Priority is not supported.");

  if (isFrequency(value.frequency)) {
    const interval = value.intervalMinutes;
    if (value.frequency === "CUSTOM") {
      if (
        typeof interval !== "number" ||
        !Number.isInteger(interval) ||
        interval < SCHEDULE_INTERVAL_MIN_MINUTES ||
        interval > SCHEDULE_INTERVAL_MAX_MINUTES
      ) {
        add(
          "intervalMinutes",
          `A custom schedule needs intervalMinutes from ${SCHEDULE_INTERVAL_MIN_MINUTES} to ${SCHEDULE_INTERVAL_MAX_MINUTES}.`,
        );
      }
    } else if (interval !== undefined && interval !== null) {
      add("intervalMinutes", "intervalMinutes applies only to CUSTOM schedules.");
    }
    if (value.frequency === "MANUAL" && value.nextRun !== undefined && value.nextRun !== null) {
      add("nextRun", "A manual schedule has no next run.");
    }
  }

  if (value.nextRun !== undefined && value.nextRun !== null) {
    if (!validTimestamp(value.nextRun)) add("nextRun", "nextRun must be an ISO timestamp or null.");
    else if (now !== null && Date.parse(value.nextRun) < now.getTime()) add("nextRun", "nextRun is in the past.");
  }
  if (value.lastRun !== undefined && value.lastRun !== null && !validTimestamp(value.lastRun)) {
    add("lastRun", "lastRun must be an ISO timestamp or null.");
  }
  if (value.metadata !== undefined) {
    const issue = metadataIssue(value.metadata);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** Checks what a caller supplies when creating a schedule. */
export function validateScheduleInput(input: unknown, now: Date): DiscoveryScheduleIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "input", message: "Schedule input must be an object." }];
  }
  return validateFields(input as ScheduleFields, now);
}

/**
 * Checks a complete schedule. Pass `now` to also reject a nextRun in the past;
 * omit it for schedules whose nextRun has simply come due.
 */
export function validateSchedule(input: unknown, now: Date | null = null): DiscoveryScheduleIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "schedule", message: "Schedule must be an object." }];
  }
  const schedule = input as Partial<Record<keyof DiscoverySchedule, unknown>>;
  const issues: DiscoveryScheduleIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (typeof schedule.id !== "string" || schedule.id.trim() === "") add("id", "Id is required.");
  if (schedule.timezone === undefined) add("timezone", "Timezone is required.");
  if (schedule.priority === undefined) add("priority", "Priority is required.");
  if (!isScheduleStatus(schedule.status)) add("status", "Status is not supported.");
  if (typeof schedule.enabled !== "boolean") add("enabled", "enabled must be true or false.");
  if (schedule.intervalMinutes === undefined) add("intervalMinutes", "intervalMinutes must be a number or null.");
  if (schedule.nextRun === undefined) add("nextRun", "nextRun must be a timestamp or null.");
  if (schedule.lastRun === undefined) add("lastRun", "lastRun must be a timestamp or null.");
  if (schedule.metadata === undefined) add("metadata", "Metadata is required.");

  issues.push(...validateFields(schedule as ScheduleFields, now));

  if (
    isScheduleStatus(schedule.status) &&
    typeof schedule.enabled === "boolean" &&
    schedule.enabled !== (schedule.status !== "DISABLED")
  ) {
    add("enabled", `Status ${schedule.status} requires enabled=${schedule.status !== "DISABLED"}.`);
  }
  return issues;
}

/**
 * One schedule per source, frequency, interval, and timezone. Pass the id of
 * the schedule being updated so it does not collide with itself.
 */
export function validateNoDuplicateSchedule(
  existing: Iterable<DiscoverySchedule>,
  candidate: Pick<DiscoverySchedule, "sourceId" | "frequency" | "intervalMinutes" | "timezone">,
  ignoreId?: string,
): DiscoveryScheduleIssue[] {
  for (const schedule of existing) {
    if (
      schedule.id !== ignoreId &&
      schedule.sourceId === candidate.sourceId &&
      schedule.frequency === candidate.frequency &&
      schedule.intervalMinutes === candidate.intervalMinutes &&
      schedule.timezone === candidate.timezone
    ) {
      return [{ field: "frequency", message: `Source "${candidate.sourceId}" already has this schedule.` }];
    }
  }
  return [];
}

export function validateScheduleSource(sourceId: string, lookup: ScheduleSourceLookup): DiscoveryScheduleIssue[] {
  if (!lookup.sourceExists(sourceId)) return [{ field: "sourceId", message: `Source "${sourceId}" does not exist.` }];
  if (lookup.sourceStatus(sourceId) === "DEPRECATED") {
    return [{ field: "sourceId", message: `Source "${sourceId}" is DEPRECATED and cannot be scheduled.` }];
  }
  return [];
}
