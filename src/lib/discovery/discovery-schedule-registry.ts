/**
 * Schedule Registry.
 *
 * In-memory storage of schedules. It keeps and returns copies and applies no
 * rules of its own; the validator and the scheduler own the rules. It persists
 * nothing and runs nothing.
 */
import type {
  DiscoveryFrequency,
  DiscoverySchedule,
  DiscoveryScheduleStatus,
} from "./discovery-types";

export interface DiscoveryScheduleFilter {
  sourceId?: string;
  status?: DiscoveryScheduleStatus;
  frequency?: DiscoveryFrequency;
  enabled?: boolean;
}

export interface DiscoveryScheduleRegistry {
  /** Stores a new schedule. Throws when the id is taken. */
  insert(schedule: DiscoverySchedule): DiscoverySchedule;
  /** Replaces a stored schedule. Throws when the id is unknown. */
  replace(schedule: DiscoverySchedule): DiscoverySchedule;
  remove(id: string): DiscoverySchedule | null;
  get(id: string): DiscoverySchedule | null;
  /** Schedules in insertion order. */
  list(filter?: DiscoveryScheduleFilter): DiscoverySchedule[];
  count(filter?: DiscoveryScheduleFilter): number;
}

function copy(schedule: DiscoverySchedule): DiscoverySchedule {
  return { ...schedule, metadata: { ...schedule.metadata } };
}

function matches(schedule: DiscoverySchedule, filter: DiscoveryScheduleFilter): boolean {
  return (
    (filter.sourceId === undefined || schedule.sourceId === filter.sourceId) &&
    (filter.status === undefined || schedule.status === filter.status) &&
    (filter.frequency === undefined || schedule.frequency === filter.frequency) &&
    (filter.enabled === undefined || schedule.enabled === filter.enabled)
  );
}

export function createScheduleRegistry(): DiscoveryScheduleRegistry {
  const schedules = new Map<string, DiscoverySchedule>();

  return {
    insert(schedule) {
      if (schedules.has(schedule.id)) throw new Error(`Schedule "${schedule.id}" already exists.`);
      schedules.set(schedule.id, copy(schedule));
      return copy(schedule);
    },
    replace(schedule) {
      if (!schedules.has(schedule.id)) throw new Error(`Schedule "${schedule.id}" does not exist.`);
      schedules.set(schedule.id, copy(schedule));
      return copy(schedule);
    },
    remove(id) {
      const schedule = schedules.get(id);
      if (!schedule) return null;
      schedules.delete(id);
      return copy(schedule);
    },
    get(id) {
      const schedule = schedules.get(id);
      return schedule ? copy(schedule) : null;
    },
    list(filter = {}) {
      return [...schedules.values()].filter((schedule) => matches(schedule, filter)).map(copy);
    },
    count(filter = {}) {
      let total = 0;
      for (const schedule of schedules.values()) if (matches(schedule, filter)) total += 1;
      return total;
    },
  };
}
