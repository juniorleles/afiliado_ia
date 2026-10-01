/**
 * Discovery Foundation: source model rules.
 *
 * Validation, priority ordering, and filtering for source descriptors, plus the
 * adapter contract for future plugins. Nothing here fetches, crawls, or scrapes.
 */
import {
  DISCOVERY_SOURCE_CATEGORIES,
  DISCOVERY_SOURCE_STATUSES,
  DISCOVERY_TYPES,
  type DiscoverySource,
  type DiscoverySourceCategory,
  type DiscoverySourceStatus,
  type DiscoveryType,
} from "./discovery-types";
import type { NewDiscoveryCandidate } from "./discovery-store";

export const DISCOVERY_PRIORITY_MIN = 0;
export const DISCOVERY_PRIORITY_MAX = 1000;

const SOURCE_ID = /^[a-z][a-z0-9-]*$/;

export interface DiscoverySourceResult {
  candidates: NewDiscoveryCandidate[];
}

/** Contract a future plugin implements. Its source must use discoveryType PLUGIN. */
export interface DiscoverySourceAdapter {
  readonly source: DiscoverySource;
  discover(): Promise<DiscoverySourceResult>;
}

export interface DiscoverySourceIssue {
  field: keyof DiscoverySource | "source";
  message: string;
}

export interface DiscoverySourceFilter {
  category?: DiscoverySourceCategory;
  discoveryType?: DiscoveryType;
  status?: DiscoverySourceStatus;
  enabled?: boolean;
}

/** A source is enabled exactly when its status is ACTIVE or EXPERIMENTAL. */
export function statusImpliesEnabled(status: DiscoverySourceStatus): boolean {
  return status === "ACTIVE" || status === "EXPERIMENTAL";
}

/** DISABLED and DEPRECATED sources must not receive queue items or planned runs. */
export function isSourceBlocked(status: DiscoverySourceStatus | null): boolean {
  return status === "DISABLED" || status === "DEPRECATED";
}

export function validateDiscoverySource(input: unknown): DiscoverySourceIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "source", message: "Source must be an object." }];
  }
  const source = input as Partial<Record<keyof DiscoverySource, unknown>>;
  const issues: DiscoverySourceIssue[] = [];
  const add = (field: keyof DiscoverySource, message: string) => issues.push({ field, message });

  if (typeof source.id !== "string" || !SOURCE_ID.test(source.id)) {
    add("id", "Id must be a lowercase slug of letters, digits, and hyphens starting with a letter.");
  }
  if (typeof source.name !== "string" || source.name.trim() === "") add("name", "Name is required.");
  if (typeof source.provider !== "string" || source.provider.trim() === "") {
    add("provider", "Provider is required.");
  }
  if (!(DISCOVERY_SOURCE_CATEGORIES as readonly unknown[]).includes(source.category)) {
    add("category", "Category is not supported.");
  }
  if (!(DISCOVERY_TYPES as readonly unknown[]).includes(source.discoveryType)) {
    add("discoveryType", "Discovery type is not supported.");
  }
  if (!(DISCOVERY_SOURCE_STATUSES as readonly unknown[]).includes(source.status)) {
    add("status", "Status is not supported.");
  }
  if (
    typeof source.priority !== "number" ||
    !Number.isInteger(source.priority) ||
    source.priority < DISCOVERY_PRIORITY_MIN ||
    source.priority > DISCOVERY_PRIORITY_MAX
  ) {
    add("priority", `Priority must be an integer from ${DISCOVERY_PRIORITY_MIN} to ${DISCOVERY_PRIORITY_MAX}.`);
  }

  const flags = [
    "enabled",
    "supportsApi",
    "supportsCrawler",
    "supportsSearch",
    "supportsPagination",
    "supportsScheduling",
  ] as const;
  let flagsValid = true;
  for (const flag of flags) {
    if (typeof source[flag] !== "boolean") {
      add(flag, `${flag} must be true or false.`);
      flagsValid = false;
    }
  }
  if (!flagsValid) return issues;

  const s = source as unknown as DiscoverySource;
  if (s.discoveryType === "API" && !s.supportsApi) add("supportsApi", "An API source must support API access.");
  if (s.discoveryType === "CRAWLER" && !s.supportsCrawler) {
    add("supportsCrawler", "A crawler source must support crawling.");
  }
  if (s.discoveryType === "SEARCH" && !s.supportsSearch) {
    add("supportsSearch", "A search source must support search.");
  }
  if (s.discoveryType === "MANUAL" && (s.supportsApi || s.supportsCrawler || s.supportsSearch || s.supportsScheduling)) {
    add("discoveryType", "A manual source cannot support API, crawler, search, or scheduling.");
  }
  if (s.supportsPagination && !(s.supportsApi || s.supportsCrawler || s.supportsSearch)) {
    add("supportsPagination", "Pagination requires API, crawler, or search support.");
  }
  if (DISCOVERY_SOURCE_STATUSES.includes(s.status) && s.enabled !== statusImpliesEnabled(s.status)) {
    add("enabled", `Status ${s.status} requires enabled=${statusImpliesEnabled(s.status)}.`);
  }
  return issues;
}

/** Highest priority first; ties break by id so the order is deterministic. */
export function sortSourcesByPriority<T extends Pick<DiscoverySource, "id" | "priority">>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function filterSources(
  sources: readonly DiscoverySource[],
  filter: DiscoverySourceFilter = {},
): DiscoverySource[] {
  return sources.filter(
    (source) =>
      (filter.category === undefined || source.category === filter.category) &&
      (filter.discoveryType === undefined || source.discoveryType === filter.discoveryType) &&
      (filter.status === undefined || source.status === filter.status) &&
      (filter.enabled === undefined || source.enabled === filter.enabled),
  );
}
