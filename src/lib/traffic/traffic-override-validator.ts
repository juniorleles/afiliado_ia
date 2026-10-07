/**
 * Traffic Manual Editor: override validator.
 *
 * Rejects an invalid channel, a duplicate channel, an invalid strategy, invalid
 * metadata, and an invalid override. It reports problems and never throws or
 * changes its input. Allowed channel and strategy identifiers come from an
 * optional catalog the caller supplies; when none is supplied, a well-formed
 * identifier is accepted so the editor stays independent of any one catalog.
 */
import type { TrafficIssue } from "./traffic-validator";
import { isFlatTrafficMetadata } from "./traffic-signal-validator";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  isTrafficOverrideField,
  type TrafficEditorValues,
  type TrafficOverrideField,
  type TrafficOverridePatch,
} from "./traffic-effective-view";

export interface TrafficOverrideCatalog {
  /** When set, a channel id must be in this list. When omitted, any well-formed id is accepted. */
  channels?: readonly string[] | null;
  /** When set, a strategy id must be in this list. When omitted, any well-formed id is accepted. */
  strategies?: readonly string[] | null;
}

export interface TrafficOverrideValidator {
  validateChannel(value: unknown, field?: string): TrafficIssue[];
  validateStrategy(value: unknown): TrafficIssue[];
  validateMetadata(value: unknown): TrafficIssue[];
  validateField(field: TrafficOverrideField, value: unknown): TrafficIssue[];
  validatePatch(patch: unknown): TrafficIssue[];
  validateValues(values: unknown): TrafficIssue[];
}

const CHANNEL_ID = /^[a-z][a-z0-9-]*$/;
const STRATEGY_ID = /^[a-z][a-z0-9-]*$/;
const NOTE_MAX = 4000;
const PRIORITY_MIN = 0;
const PRIORITY_MAX = 1000;
const LIST_MAX = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isText = (value: unknown): value is string => typeof value === "string";

function duplicatesOf(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    else seen.add(id);
  }
  return [...new Set(duplicates)];
}

export function createTrafficOverrideValidator(catalog: TrafficOverrideCatalog = {}): TrafficOverrideValidator {
  const allowedChannels = catalog.channels ? new Set(catalog.channels) : null;
  const allowedStrategies = catalog.strategies ? new Set(catalog.strategies) : null;

  function validateChannel(value: unknown, field = "channel"): TrafficIssue[] {
    if (!isText(value) || value.trim() === "") return [{ field, message: "Invalid channel: a non-empty channel id is required." }];
    if (value !== value.trim() || !CHANNEL_ID.test(value)) return [{ field, message: `Invalid channel: "${value}" is not a well-formed channel id.` }];
    if (allowedChannels && !allowedChannels.has(value)) return [{ field, message: `Invalid channel: "${value}" is not in the allowed catalog.` }];
    return [];
  }

  function validateStrategy(value: unknown): TrafficIssue[] {
    if (value === null) return [];
    if (!isText(value) || value.trim() === "") return [{ field: "trafficStrategy", message: "Invalid strategy: a strategy id or null is required." }];
    if (value !== value.trim() || !STRATEGY_ID.test(value)) return [{ field: "trafficStrategy", message: `Invalid strategy: "${value}" is not a well-formed strategy id.` }];
    if (allowedStrategies && !allowedStrategies.has(value)) return [{ field: "trafficStrategy", message: `Invalid strategy: "${value}" is not in the allowed catalog.` }];
    return [];
  }

  function validateMetadata(value: unknown): TrafficIssue[] {
    if (!isFlatTrafficMetadata(value)) {
      return [{ field: "customMetadata", message: "Invalid metadata: a flat object of strings, numbers, booleans, or null with non-empty keys is required." }];
    }
    return [];
  }

  function validateChannelList(value: unknown, field: "preferredChannels" | "blockedChannels"): TrafficIssue[] {
    if (!Array.isArray(value)) return [{ field, message: `Invalid override: "${field}" must be a list of channel ids.` }];
    if (value.length > LIST_MAX) return [{ field, message: `Invalid override: "${field}" may hold at most ${LIST_MAX} ids.` }];
    const issues: TrafficIssue[] = [];
    const ids: string[] = [];
    value.forEach((item, index) => {
      const found = validateChannel(item, `${field}[${index}]`);
      issues.push(...found);
      if (typeof item === "string") ids.push(item);
    });
    const duplicates = duplicatesOf(ids);
    if (duplicates.length > 0) {
      issues.push({ field, message: `Duplicate channel: "${duplicates.join(", ")}" appears more than once in "${field}".` });
    }
    return issues;
  }

  function validateNotes(value: unknown, field: TrafficOverrideField): TrafficIssue[] {
    if (!isText(value)) return [{ field, message: `Invalid override: "${field}" must be text.` }];
    if (value.length > NOTE_MAX) return [{ field, message: `Invalid override: "${field}" may be at most ${NOTE_MAX} characters.` }];
    return [];
  }

  function validatePriority(value: unknown): TrafficIssue[] {
    if (value === null) return [];
    if (typeof value !== "number" || !Number.isInteger(value) || value < PRIORITY_MIN || value > PRIORITY_MAX) {
      return [{ field: "priority", message: `Invalid override: priority must be an integer from ${PRIORITY_MIN} to ${PRIORITY_MAX}, or null.` }];
    }
    return [];
  }

  function validateField(field: TrafficOverrideField, value: unknown): TrafficIssue[] {
    if (field === "preferredChannels" || field === "blockedChannels") return validateChannelList(value, field);
    if (field === "trafficStrategy") return validateStrategy(value);
    if (field === "customMetadata") return validateMetadata(value);
    if (field === "priority") return validatePriority(value);
    return validateNotes(value, field);
  }

  function validatePatch(patch: unknown): TrafficIssue[] {
    if (!isPlainObject(patch)) return [{ field: "override", message: "Invalid override: an object of editable fields is required." }];
    const issues: TrafficIssue[] = [];
    for (const key of Object.keys(patch)) {
      if (!isTrafficOverrideField(key)) issues.push({ field: key, message: `Invalid override: "${key}" is not an editable field.` });
    }
    for (const field of TRAFFIC_OVERRIDE_FIELDS) {
      if (field in patch) issues.push(...validateField(field, patch[field]));
    }
    const preferred = Array.isArray(patch.preferredChannels) ? patch.preferredChannels.filter((item): item is string => typeof item === "string") : null;
    const blocked = Array.isArray(patch.blockedChannels) ? patch.blockedChannels.filter((item): item is string => typeof item === "string") : null;
    if (preferred && blocked) {
      const blockedSet = new Set(blocked);
      const both = [...new Set(preferred.filter((id) => blockedSet.has(id)))];
      if (both.length > 0) issues.push({ field: "preferredChannels", message: `Duplicate channel: "${both.join(", ")}" cannot be preferred and blocked at the same time.` });
    }
    return issues;
  }

  function validateValues(values: unknown): TrafficIssue[] {
    if (!isPlainObject(values)) return [{ field: "override", message: "Invalid override: a complete values object is required." }];
    const issues: TrafficIssue[] = [];
    for (const key of Object.keys(values)) {
      if (!isTrafficOverrideField(key)) issues.push({ field: key, message: `Invalid override: "${key}" is not an editable field.` });
    }
    for (const field of TRAFFIC_OVERRIDE_FIELDS) {
      if (!(field in values)) issues.push({ field, message: `Invalid override: field "${field}" is missing.` });
      else issues.push(...validateField(field, values[field]));
    }
    const preferred = Array.isArray(values.preferredChannels) ? values.preferredChannels.filter((item): item is string => typeof item === "string") : [];
    const blocked = Array.isArray(values.blockedChannels) ? values.blockedChannels.filter((item): item is string => typeof item === "string") : [];
    const blockedSet = new Set(blocked);
    const both = [...new Set(preferred.filter((id) => blockedSet.has(id)))];
    if (both.length > 0) issues.push({ field: "preferredChannels", message: `Duplicate channel: "${both.join(", ")}" cannot be preferred and blocked at the same time.` });
    return issues;
  }

  return { validateChannel, validateStrategy, validateMetadata, validateField, validatePatch, validateValues };
}

export type { TrafficEditorValues, TrafficOverrideField, TrafficOverridePatch };
