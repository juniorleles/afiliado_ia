/**
 * Discovery Scheduler.
 *
 * Plans discovery executions and nothing more. It stores schedules, validates
 * them, calculates when they next run, and reports which are due. It starts no
 * timer, cron, worker, or background job, calls no API, runs no crawler, and
 * never touches the queue: plan() only describes what would be due.
 */
import { createScheduleRegistry, type DiscoveryScheduleFilter, type DiscoveryScheduleRegistry } from "./discovery-schedule-registry";
import {
  computeNextRun,
  planSchedules,
  type DiscoveryExecutionPlan,
  type DiscoveryPlanResult,
  type ScheduleSourceLookup,
} from "./discovery-schedule-resolver";
import { computeScheduleStatistics, type DiscoveryScheduleStatistics } from "./discovery-schedule-statistics";
import {
  validateNoDuplicateSchedule,
  validateSchedule,
  validateScheduleInput,
  validateScheduleSource,
  type DiscoveryScheduleIssue,
} from "./discovery-schedule-validator";
import type {
  DiscoveryFrequency,
  DiscoveryQueueMetadata,
  DiscoveryQueuePriority,
  DiscoverySchedule,
} from "./discovery-types";

export class DiscoveryScheduleError extends Error {
  constructor(
    message: string,
    readonly issues: DiscoveryScheduleIssue[] = [],
  ) {
    super(message);
    this.name = "DiscoveryScheduleError";
  }
}

export interface DiscoveryScheduleInput {
  sourceId: string;
  frequency: DiscoveryFrequency;
  /** Required for CUSTOM; omit or null otherwise. */
  intervalMinutes?: number | null;
  /** Defaults to "UTC". */
  timezone?: string;
  /** Defaults to the calculated next run; must not be in the past. */
  nextRun?: string | null;
  lastRun?: string | null;
  /** Defaults to NORMAL. */
  priority?: DiscoveryQueuePriority;
  metadata?: DiscoveryQueueMetadata;
}

/** Status and enabled change only through pause, resume, enable, and disable. */
export type DiscoverySchedulePatch = Partial<DiscoveryScheduleInput>;

export interface DiscoveryScheduler {
  createSchedule(input: DiscoveryScheduleInput): DiscoverySchedule;
  /**
   * Applies a patch. When timing changes and no nextRun is given, nextRun is
   * recalculated; a MANUAL schedule always ends with nextRun null.
   */
  updateSchedule(id: string, patch: DiscoverySchedulePatch): DiscoverySchedule;
  deleteSchedule(id: string): DiscoverySchedule;
  /** ACTIVE -> PAUSED. */
  pause(id: string): DiscoverySchedule;
  /** PAUSED or ERROR -> ACTIVE, with a recalculated nextRun. */
  resume(id: string): DiscoverySchedule;
  /** DISABLED -> ACTIVE with a recalculated nextRun; unchanged otherwise. */
  enable(id: string): DiscoverySchedule;
  /** Any status -> DISABLED; unchanged when already disabled. */
  disable(id: string): DiscoverySchedule;
  /** ACTIVE or PAUSED -> ERROR. */
  markError(id: string): DiscoverySchedule;
  /** Recalculates, stores, and returns nextRun (null for MANUAL). */
  calculateNextRun(id: string): string | null;
  get(id: string): DiscoverySchedule | null;
  list(filter?: DiscoveryScheduleFilter): DiscoverySchedule[];
  /**
   * Due schedules, highest priority first. Describes work; starts none.
   * A due schedule whose source is DISABLED or DEPRECATED is not planned.
   */
  plan(): DiscoveryExecutionPlan[];
  /** Same as plan(), and also reports the due schedules skipped because of their source. */
  planWithSkipped(): DiscoveryPlanResult;
  statistics(): DiscoveryScheduleStatistics;
}

export interface DiscoverySchedulerOptions {
  lookup: ScheduleSourceLookup;
  registry?: DiscoveryScheduleRegistry;
  now?: () => Date;
}

export function createDiscoveryScheduler(options: DiscoverySchedulerOptions): DiscoveryScheduler {
  const registry = options.registry ?? createScheduleRegistry();
  const now = options.now ?? (() => new Date());
  let sequence = 0;
  const sourceStatus = (sourceId: string) => options.lookup.sourceStatus(sourceId);

  const fail = (message: string, issues: DiscoveryScheduleIssue[] = []): never => {
    throw new DiscoveryScheduleError(message, issues);
  };

  const mustGet = (id: string): DiscoverySchedule =>
    registry.get(id) ?? fail(`Schedule "${id}" does not exist.`);

  const nextRunFor = (schedule: DiscoverySchedule): string | null =>
    schedule.frequency === "MANUAL" ? null : computeNextRun(schedule, now());

  const store = (schedule: DiscoverySchedule): DiscoverySchedule => registry.replace(schedule);

  return {
    createSchedule(input) {
      const at = now();
      let issues = validateScheduleInput(input, at);
      if (issues.length > 0) fail("Schedule is invalid.", issues);

      const schedule: DiscoverySchedule = {
        id: "",
        sourceId: input.sourceId,
        enabled: true,
        frequency: input.frequency,
        intervalMinutes: input.frequency === "CUSTOM" ? (input.intervalMinutes ?? null) : null,
        timezone: input.timezone ?? "UTC",
        nextRun: null,
        lastRun: input.lastRun ?? null,
        priority: input.priority ?? "NORMAL",
        status: "ACTIVE",
        metadata: { ...(input.metadata ?? {}) },
      };
      issues = [
        ...validateScheduleSource(schedule.sourceId, options.lookup),
        ...validateNoDuplicateSchedule(registry.list(), schedule),
      ];
      if (issues.length > 0) fail("Schedule is invalid.", issues);

      schedule.nextRun = schedule.frequency === "MANUAL" ? null : (input.nextRun ?? nextRunFor(schedule));
      sequence += 1;
      schedule.id = `schedule-${sequence}`;
      const finalIssues = validateSchedule(schedule);
      if (finalIssues.length > 0) fail("Schedule is invalid.", finalIssues);
      return registry.insert(schedule);
    },

    updateSchedule(id, patch) {
      const existing = mustGet(id);
      const merged: DiscoverySchedule = { ...existing, metadata: { ...existing.metadata } };
      const values = patch as Record<string, unknown>;
      for (const key of ["sourceId", "frequency", "intervalMinutes", "timezone", "lastRun", "priority", "metadata"] as const) {
        if (values[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = values[key];
      }
      if (patch.frequency !== undefined && patch.frequency !== "CUSTOM" && patch.intervalMinutes === undefined) {
        merged.intervalMinutes = null;
      }
      const touchesTiming = ["frequency", "intervalMinutes", "timezone", "lastRun"].some(
        (key) => values[key] !== undefined,
      );
      const explicitNextRun = patch.nextRun !== undefined;
      if (explicitNextRun) merged.nextRun = patch.nextRun as string | null;
      else if (merged.frequency === "MANUAL") merged.nextRun = null;
      else if (touchesTiming) merged.nextRun = nextRunFor(merged);

      const issues = [
        ...validateSchedule(merged, explicitNextRun ? now() : null),
        ...(patch.sourceId !== undefined ? validateScheduleSource(merged.sourceId, options.lookup) : []),
        ...validateNoDuplicateSchedule(registry.list(), merged, id),
      ];
      if (issues.length > 0) fail("Schedule is invalid.", issues);
      return store(merged);
    },

    deleteSchedule(id) {
      return registry.remove(id) ?? fail(`Schedule "${id}" does not exist.`);
    },

    pause(id) {
      const schedule = mustGet(id);
      if (schedule.status !== "ACTIVE") {
        fail("Only an ACTIVE schedule can be paused.", [
          { field: "status", message: `A ${schedule.status} schedule cannot be paused.` },
        ]);
      }
      return store({ ...schedule, status: "PAUSED" });
    },

    resume(id) {
      const schedule = mustGet(id);
      if (schedule.status !== "PAUSED" && schedule.status !== "ERROR") {
        fail("Only a PAUSED or ERROR schedule can be resumed.", [
          { field: "status", message: `A ${schedule.status} schedule cannot be resumed.` },
        ]);
      }
      const resumed: DiscoverySchedule = { ...schedule, status: "ACTIVE" };
      return store({ ...resumed, nextRun: nextRunFor(resumed) });
    },

    enable(id) {
      const schedule = mustGet(id);
      if (schedule.status !== "DISABLED") return schedule;
      const enabled: DiscoverySchedule = { ...schedule, enabled: true, status: "ACTIVE" };
      return store({ ...enabled, nextRun: nextRunFor(enabled) });
    },

    disable(id) {
      const schedule = mustGet(id);
      if (schedule.status === "DISABLED") return schedule;
      return store({ ...schedule, enabled: false, status: "DISABLED" });
    },

    markError(id) {
      const schedule = mustGet(id);
      if (schedule.status === "ERROR") return schedule;
      if (schedule.status !== "ACTIVE" && schedule.status !== "PAUSED") {
        fail("Only an ACTIVE or PAUSED schedule can enter ERROR.", [
          { field: "status", message: `A ${schedule.status} schedule cannot enter ERROR.` },
        ]);
      }
      return store({ ...schedule, status: "ERROR" });
    },

    calculateNextRun(id) {
      const schedule = mustGet(id);
      const nextRun = nextRunFor(schedule);
      store({ ...schedule, nextRun });
      return nextRun;
    },

    get: (id) => registry.get(id),
    list: (filter) => registry.list(filter),
    plan: () => planSchedules(registry.list(), now(), sourceStatus).due,
    planWithSkipped: () => planSchedules(registry.list(), now(), sourceStatus),
    statistics: () => computeScheduleStatistics(registry.list()),
  };
}
