/**
 * Discovery Admin: view models.
 *
 * Pure functions that turn discovery state into what the admin screens show:
 * dashboard, sources, queue, scheduler, health, and statistics. They read state
 * and compute; they change nothing and execute nothing.
 */
import { computeQueueStatistics, type DiscoveryQueueStatistics } from "./discovery-queue-statistics";
import { validateQueueItem } from "./discovery-queue-validator";
import { computeScheduleStatistics, type DiscoveryScheduleStatistics } from "./discovery-schedule-statistics";
import { planDueExecutions } from "./discovery-schedule-resolver";
import { validateSchedule } from "./discovery-schedule-validator";
import { filterSources, sortSourcesByPriority, validateDiscoverySource } from "./discovery-sources";
import {
  DISCOVERY_SOURCE_STATUSES,
  DISCOVERY_TYPES,
  type DiscoveryQueueItem,
  type DiscoverySchedule,
  type DiscoveryScheduleStatus,
  type DiscoverySource,
  type DiscoverySourceStatus,
  type DiscoveryType,
} from "./discovery-types";

export const DISCOVERY_SYSTEM_VERSION = "Opportunity Engine V1 · Discovery Foundation";

export interface DiscoveryAdminState {
  sources: DiscoverySource[];
  queueItems: DiscoveryQueueItem[];
  schedules: DiscoverySchedule[];
}

// ---------------------------------------------------------------- formatting

/** "1m 30s" style text; an em dash when there is no value. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const total = Math.round(ms / 1000);
  if (total < 1) return ms < 1 ? "0s" : "<1s";
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days && !hours) parts.push(`${seconds}s`);
  return parts.join(" ");
}

// ------------------------------------------------------------------- sources

export interface DiscoverySourceRow {
  id: string;
  name: string;
  provider: string;
  type: DiscoveryType;
  category: DiscoverySource["category"];
  priority: number;
  status: DiscoverySourceStatus;
  enabled: boolean;
  capabilities: string[];
}

export function sourceCapabilities(source: DiscoverySource): string[] {
  const capabilities: string[] = [];
  if (source.supportsApi) capabilities.push("API");
  if (source.supportsCrawler) capabilities.push("Crawler");
  if (source.supportsSearch) capabilities.push("Search");
  if (source.supportsPagination) capabilities.push("Pagination");
  if (source.supportsScheduling) capabilities.push("Scheduling");
  return capabilities;
}

export function toSourceRow(source: DiscoverySource): DiscoverySourceRow {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
    type: source.discoveryType,
    category: source.category,
    priority: source.priority,
    status: source.status,
    enabled: source.enabled,
    capabilities: sourceCapabilities(source),
  };
}

export type DiscoverySourceAction = "enable" | "disable";

/** Which toggle a source offers. A deprecated source offers none. */
export function sourceActions(source: Pick<DiscoverySource, "enabled" | "status">): DiscoverySourceAction[] {
  if (source.status === "DEPRECATED") return [];
  return [source.enabled ? "disable" : "enable"];
}

export type DiscoverySourceSort = "priority" | "name";

export interface DiscoverySourceQuery {
  q: string;
  type: DiscoveryType | null;
  status: DiscoverySourceStatus | null;
  sort: DiscoverySourceSort;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads a source query from URL parameters; unknown values are ignored. */
export function parseSourceQuery(params: SearchParams): DiscoverySourceQuery {
  const type = first(params.type);
  const status = first(params.status);
  const sort = first(params.sort);
  return {
    q: first(params.q).trim().slice(0, 100),
    type: (DISCOVERY_TYPES as readonly string[]).includes(type) ? (type as DiscoveryType) : null,
    status: (DISCOVERY_SOURCE_STATUSES as readonly string[]).includes(status) ? (status as DiscoverySourceStatus) : null,
    sort: sort === "name" ? "name" : "priority",
  };
}

/** Search by name, provider, id, or category; filter by type and status; then sort. */
export function searchSources(sources: readonly DiscoverySource[], query: DiscoverySourceQuery): DiscoverySource[] {
  const needle = query.q.toLowerCase();
  const matched = filterSources(sources, {
    discoveryType: query.type ?? undefined,
    status: query.status ?? undefined,
  }).filter(
    (source) =>
      needle === "" ||
      [source.name, source.provider, source.id, source.category].some((text) => text.toLowerCase().includes(needle)),
  );
  return query.sort === "name"
    ? [...matched].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    : sortSourcesByPriority(matched);
}

// ----------------------------------------------------------------- scheduler

export type DiscoveryScheduleAction = "pause" | "resume" | "enable" | "disable";

/** Which controls a schedule offers in each status. */
export function scheduleActions(status: DiscoveryScheduleStatus): DiscoveryScheduleAction[] {
  switch (status) {
    case "ACTIVE":
      return ["pause", "disable"];
    case "PAUSED":
    case "ERROR":
      return ["resume", "disable"];
    default:
      return ["enable"];
  }
}

export interface DiscoveryScheduleRow {
  id: string;
  sourceId: string;
  sourceName: string | null;
  frequency: string;
  status: DiscoveryScheduleStatus;
  nextRun: string | null;
  lastRun: string | null;
  priority: DiscoverySchedule["priority"];
  timezone: string;
  actions: DiscoveryScheduleAction[];
}

export interface DiscoverySchedulerPanel {
  rows: DiscoveryScheduleRow[];
  statistics: DiscoveryScheduleStatistics;
  dueCount: number;
}

export function buildSchedulerPanel(state: DiscoveryAdminState, now: Date): DiscoverySchedulerPanel {
  const names = new Map(state.sources.map((source) => [source.id, source.name]));
  return {
    rows: state.schedules.map((schedule) => ({
      id: schedule.id,
      sourceId: schedule.sourceId,
      sourceName: names.get(schedule.sourceId) ?? null,
      frequency: schedule.frequency === "CUSTOM" ? `Every ${schedule.intervalMinutes} min` : schedule.frequency,
      status: schedule.status,
      nextRun: schedule.nextRun,
      lastRun: schedule.lastRun,
      priority: schedule.priority,
      timezone: schedule.timezone,
      actions: scheduleActions(schedule.status),
    })),
    statistics: computeScheduleStatistics(state.schedules),
    dueCount: planDueExecutions(state.schedules, now).length,
  };
}

// --------------------------------------------------------------------- queue

export interface DiscoveryQueuePanel {
  statistics: DiscoveryQueueStatistics;
  cancelled: number;
  items: DiscoveryQueueItem[];
  /** Items beyond the display limit. */
  hidden: number;
}

export const QUEUE_PANEL_ITEM_LIMIT = 100;

export function buildQueuePanel(state: DiscoveryAdminState): DiscoveryQueuePanel {
  const statistics = computeQueueStatistics(state.queueItems);
  return {
    statistics,
    cancelled: statistics.byStatus.CANCELLED,
    items: state.queueItems.slice(0, QUEUE_PANEL_ITEM_LIMIT),
    hidden: Math.max(0, state.queueItems.length - QUEUE_PANEL_ITEM_LIMIT),
  };
}

// -------------------------------------------------------------------- health

export type DiscoveryHealthLevel = "OK" | "WARNING" | "ERROR";
export type DiscoveryHealthScope = "registry" | "queue" | "scheduler";

export interface DiscoveryHealthIssue {
  scope: DiscoveryHealthScope;
  severity: "ERROR" | "WARNING";
  subject: string | null;
  message: string;
}

export interface DiscoveryHealth {
  overall: DiscoveryHealthLevel;
  registry: DiscoveryHealthLevel;
  queue: DiscoveryHealthLevel;
  scheduler: DiscoveryHealthLevel;
  /** Configuration warnings. */
  warnings: DiscoveryHealthIssue[];
  /** Validation errors and broken references. */
  errors: DiscoveryHealthIssue[];
}

const ACTIVE_QUEUE_STATUSES = new Set(["NEW", "QUEUED", "WAITING", "PROCESSING"]);

function levelOf(issues: readonly DiscoveryHealthIssue[], scope: DiscoveryHealthScope): DiscoveryHealthLevel {
  const own = issues.filter((issue) => issue.scope === scope);
  if (own.some((issue) => issue.severity === "ERROR")) return "ERROR";
  return own.length > 0 ? "WARNING" : "OK";
}

export function buildHealth(state: DiscoveryAdminState, now: Date): DiscoveryHealth {
  const issues: DiscoveryHealthIssue[] = [];
  const add = (
    scope: DiscoveryHealthScope,
    severity: "ERROR" | "WARNING",
    subject: string | null,
    message: string,
  ) => issues.push({ scope, severity, subject, message });
  const sourcesById = new Map(state.sources.map((source) => [source.id, source]));

  // Registry
  if (state.sources.length === 0) add("registry", "WARNING", null, "No discovery sources are registered.");
  else if (!state.sources.some((source) => source.enabled)) {
    add("registry", "WARNING", null, "No discovery source is enabled.");
  }
  for (const source of state.sources) {
    for (const issue of validateDiscoverySource(source)) {
      add("registry", "ERROR", source.id, `${issue.field}: ${issue.message}`);
    }
  }

  // Queue
  for (const item of state.queueItems) {
    for (const issue of validateQueueItem(item)) add("queue", "ERROR", item.id, `${issue.field}: ${issue.message}`);
    const source = sourcesById.get(item.sourceId);
    if (!source) add("queue", "ERROR", item.id, `Source "${item.sourceId}" is not registered.`);
    else if (!source.enabled && ACTIVE_QUEUE_STATUSES.has(item.status)) {
      add("queue", "WARNING", item.id, `Source "${source.name}" is not enabled.`);
    }
  }
  const failed = state.queueItems.filter((item) => item.status === "FAILED").length;
  if (failed > 0) add("queue", "WARNING", null, `${failed} queue item${failed === 1 ? "" : "s"} failed.`);

  // Scheduler
  for (const schedule of state.schedules) {
    for (const issue of validateSchedule(schedule)) {
      add("scheduler", "ERROR", schedule.id, `${issue.field}: ${issue.message}`);
    }
    const source = sourcesById.get(schedule.sourceId);
    if (!source) add("scheduler", "ERROR", schedule.id, `Source "${schedule.sourceId}" is not registered.`);
    else {
      if (schedule.status === "ACTIVE" && !source.enabled) {
        add("scheduler", "WARNING", schedule.id, `Source "${source.name}" is not enabled.`);
      }
      if (schedule.frequency !== "MANUAL" && !source.supportsScheduling) {
        add("scheduler", "WARNING", schedule.id, `Source "${source.name}" does not support scheduling.`);
      }
    }
    if (schedule.status === "ERROR") add("scheduler", "ERROR", schedule.id, "Schedule is in ERROR status.");
  }
  const due = planDueExecutions(state.schedules, now).length;
  if (due > 0) {
    add("scheduler", "WARNING", null, `${due} schedule${due === 1 ? " is" : "s are"} due. Planning only: nothing runs them yet.`);
  }

  const registry = levelOf(issues, "registry");
  const queue = levelOf(issues, "queue");
  const scheduler = levelOf(issues, "scheduler");
  const levels = [registry, queue, scheduler];
  return {
    overall: levels.includes("ERROR") ? "ERROR" : levels.includes("WARNING") ? "WARNING" : "OK",
    registry,
    queue,
    scheduler,
    warnings: issues.filter((issue) => issue.severity === "WARNING"),
    errors: issues.filter((issue) => issue.severity === "ERROR"),
  };
}

// ---------------------------------------------------------------- statistics

export interface DiscoveryCapacity {
  /** Enabled sources that can find items through an API, crawler, or search. */
  automatedSources: number;
  /** Enabled sources that support scheduling. */
  schedulableSources: number;
}

export interface DiscoveryAdminStatistics {
  registeredSources: number;
  configuredSchedules: number;
  queueSize: number;
  averageQueueTimeMs: number | null;
  capacity: DiscoveryCapacity;
  systemVersion: string;
}

export function buildStatistics(state: DiscoveryAdminState): DiscoveryAdminStatistics {
  const enabled = state.sources.filter((source) => source.enabled);
  return {
    registeredSources: state.sources.length,
    configuredSchedules: state.schedules.length,
    queueSize: state.queueItems.length,
    averageQueueTimeMs: computeQueueStatistics(state.queueItems).averageWaitMs,
    capacity: {
      automatedSources: enabled.filter((s) => s.supportsApi || s.supportsCrawler || s.supportsSearch).length,
      schedulableSources: enabled.filter((s) => s.supportsScheduling).length,
    },
    systemVersion: DISCOVERY_SYSTEM_VERSION,
  };
}

// ----------------------------------------------------------------- dashboard

export interface DiscoveryDashboard {
  registered: number;
  enabled: number;
  disabled: number;
  experimental: number;
  deprecated: number;
  queue: DiscoveryQueueStatistics;
  scheduler: DiscoveryScheduleStatistics;
  health: DiscoveryHealth;
}

export function buildDashboard(state: DiscoveryAdminState, now: Date): DiscoveryDashboard {
  const count = (status: DiscoverySourceStatus) => state.sources.filter((source) => source.status === status).length;
  return {
    registered: state.sources.length,
    enabled: state.sources.filter((source) => source.enabled).length,
    disabled: count("DISABLED"),
    experimental: count("EXPERIMENTAL"),
    deprecated: count("DEPRECATED"),
    queue: computeQueueStatistics(state.queueItems),
    scheduler: computeScheduleStatistics(state.schedules),
    health: buildHealth(state, now),
  };
}
