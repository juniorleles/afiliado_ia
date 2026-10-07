/**
 * Discovery Queue events.
 *
 * Definitions only. Nothing emits, publishes, or handles these events yet.
 */

export const DISCOVERY_QUEUE_EVENT_TYPES = [
  "QueueCreated",
  "ItemQueued",
  "ItemStarted",
  "ItemCompleted",
  "ItemFailed",
  "ItemCancelled",
] as const;
export type DiscoveryQueueEventType = (typeof DISCOVERY_QUEUE_EVENT_TYPES)[number];

interface DiscoveryQueueEventBase {
  type: DiscoveryQueueEventType;
  /** ISO timestamp. */
  at: string;
}

export interface QueueCreatedEvent extends DiscoveryQueueEventBase {
  type: "QueueCreated";
}

interface ItemEventBase extends DiscoveryQueueEventBase {
  itemId: string;
  candidateId: string;
  sourceId: string;
}

export interface ItemQueuedEvent extends ItemEventBase {
  type: "ItemQueued";
}

export interface ItemStartedEvent extends ItemEventBase {
  type: "ItemStarted";
  attempt: number;
}

export interface ItemCompletedEvent extends ItemEventBase {
  type: "ItemCompleted";
}

export interface ItemFailedEvent extends ItemEventBase {
  type: "ItemFailed";
  errorMessage: string;
}

export interface ItemCancelledEvent extends ItemEventBase {
  type: "ItemCancelled";
}

export type DiscoveryQueueEvent =
  | QueueCreatedEvent
  | ItemQueuedEvent
  | ItemStartedEvent
  | ItemCompletedEvent
  | ItemFailedEvent
  | ItemCancelledEvent;
