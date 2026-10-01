/**
 * Discovery Foundation: shared entities.
 *
 * Architecture only. This module declares types; it holds no behavior, no I/O,
 * and no dependency on the importer, ProductFacts, or any other platform module.
 * Timestamps are ISO-8601 strings, matching the rest of the repository.
 */

/** The one status vocabulary shared by candidates, jobs, and queue items. */
export type DiscoveryStatus =
  | "NEW"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "IGNORED";

/** How a source produces candidates. */
export const DISCOVERY_TYPES = ["API", "CRAWLER", "SEARCH", "MANUAL", "PLUGIN"] as const;
export type DiscoveryType = (typeof DISCOVERY_TYPES)[number];

/** Lifecycle of a source. ACTIVE and EXPERIMENTAL are enabled; the rest are not. */
export const DISCOVERY_SOURCE_STATUSES = [
  "ACTIVE",
  "DISABLED",
  "EXPERIMENTAL",
  "DEPRECATED",
] as const;
export type DiscoverySourceStatus = (typeof DISCOVERY_SOURCE_STATUSES)[number];

export const DISCOVERY_SOURCE_CATEGORIES = [
  "AFFILIATE_MARKETPLACE",
  "BRAND_WEBSITE",
  "SEARCH_ENGINE",
  "PARTNER_NETWORK",
  "COMMERCE",
  "FUTURE_PROVIDER",
] as const;
export type DiscoverySourceCategory = (typeof DISCOVERY_SOURCE_CATEGORIES)[number];

export interface DiscoverySource {
  /** Lowercase slug: letters, digits, hyphens; starts with a letter. */
  id: string;
  name: string;
  /** Free-form provider label. The registry attaches no behavior to it. */
  provider: string;
  category: DiscoverySourceCategory;
  enabled: boolean;
  /** Integer 0-1000. Higher values are served first. */
  priority: number;
  discoveryType: DiscoveryType;
  supportsApi: boolean;
  supportsCrawler: boolean;
  supportsSearch: boolean;
  supportsPagination: boolean;
  supportsScheduling: boolean;
  status: DiscoverySourceStatus;
}

export interface DiscoveryCandidate {
  id: string;
  /** DiscoverySource.id that produced this candidate. */
  source: string;
  url: string;
  title: string;
  status: DiscoveryStatus;
  createdAt: string;
}

export interface DiscoveryJob {
  id: string;
  /** DiscoverySource.id this job ran against. */
  source: string;
  startedAt: string;
  /** null while the job is still running. */
  finishedAt: string | null;
  status: DiscoveryStatus;
  itemsFound: number;
}

/** Queue lifecycle. Wider than DiscoveryStatus: adds WAITING and CANCELLED. */
export const DISCOVERY_QUEUE_STATUSES = [
  "NEW",
  "QUEUED",
  "WAITING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "IGNORED",
  "CANCELLED",
] as const;
export type DiscoveryQueueStatus = (typeof DISCOVERY_QUEUE_STATUSES)[number];

export const DISCOVERY_QUEUE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type DiscoveryQueuePriority = (typeof DISCOVERY_QUEUE_PRIORITIES)[number];

export type DiscoveryQueueMetadata = Record<string, string | number | boolean | null>;

export interface DiscoveryQueueItem {
  id: string;
  /** DiscoveryCandidate.id. Unique across the queue. */
  candidateId: string;
  /** DiscoverySource.id */
  sourceId: string;
  priority: DiscoveryQueuePriority;
  status: DiscoveryQueueStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  /** When the latest attempt started; null before the first attempt. */
  lastAttempt: string | null;
  errorMessage: string | null;
  metadata: DiscoveryQueueMetadata;
}

/** How often a schedule plans a run. CUSTOM uses the schedule's intervalMinutes. */
export const DISCOVERY_FREQUENCIES = ["MANUAL", "HOURLY", "DAILY", "WEEKLY", "CUSTOM"] as const;
export type DiscoveryFrequency = (typeof DISCOVERY_FREQUENCIES)[number];

/** A schedule is enabled exactly when its status is not DISABLED. */
export const DISCOVERY_SCHEDULE_STATUSES = ["ACTIVE", "PAUSED", "DISABLED", "ERROR"] as const;
export type DiscoveryScheduleStatus = (typeof DISCOVERY_SCHEDULE_STATUSES)[number];

export interface DiscoverySchedule {
  id: string;
  /** DiscoverySource.id */
  sourceId: string;
  enabled: boolean;
  frequency: DiscoveryFrequency;
  /** Minutes between runs; required for CUSTOM, null for every other frequency. */
  intervalMinutes: number | null;
  /** IANA timezone name, for example "UTC" or "America/Sao_Paulo". */
  timezone: string;
  /** ISO timestamp of the next planned run; always null for MANUAL. */
  nextRun: string | null;
  lastRun: string | null;
  priority: DiscoveryQueuePriority;
  status: DiscoveryScheduleStatus;
  metadata: DiscoveryQueueMetadata;
}
