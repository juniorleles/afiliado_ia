/**
 * Discovery Schedule events.
 *
 * Definitions only. Nothing emits, publishes, or handles these events yet, and
 * nothing executes a schedule.
 */

export const DISCOVERY_SCHEDULE_EVENT_TYPES = [
  "ScheduleCreated",
  "ScheduleUpdated",
  "SchedulePaused",
  "ScheduleResumed",
  "ScheduleDeleted",
] as const;
export type DiscoveryScheduleEventType = (typeof DISCOVERY_SCHEDULE_EVENT_TYPES)[number];

interface DiscoveryScheduleEventBase {
  type: DiscoveryScheduleEventType;
  /** ISO timestamp. */
  at: string;
  scheduleId: string;
  sourceId: string;
}

export interface ScheduleCreatedEvent extends DiscoveryScheduleEventBase {
  type: "ScheduleCreated";
}

export interface ScheduleUpdatedEvent extends DiscoveryScheduleEventBase {
  type: "ScheduleUpdated";
}

export interface SchedulePausedEvent extends DiscoveryScheduleEventBase {
  type: "SchedulePaused";
}

export interface ScheduleResumedEvent extends DiscoveryScheduleEventBase {
  type: "ScheduleResumed";
}

export interface ScheduleDeletedEvent extends DiscoveryScheduleEventBase {
  type: "ScheduleDeleted";
}

export type DiscoveryScheduleEvent =
  | ScheduleCreatedEvent
  | ScheduleUpdatedEvent
  | SchedulePausedEvent
  | ScheduleResumedEvent
  | ScheduleDeletedEvent;
