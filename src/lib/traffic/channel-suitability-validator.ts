/**
 * Channel Suitability Signal: validator.
 *
 * Judges what goes into the signal and what comes out. It rejects a missing
 * Opportunity analysis, an invalid context, duplicate channels, and invalid
 * metadata, and it rejects any result that carries a score, a ranking, or a
 * recommendation.
 *
 * It reports problems and never throws or changes its input. It knows the
 * shape of a channel definition and of the Opportunity analysis and
 * explanation, and nothing about any particular channel, product, or platform.
 */
import {
  CHANNEL_FAMILIES,
  CHANNEL_NEEDS,
  CHANNEL_STATUSES,
  REQUIREMENT_DIMENSIONS,
  type ChannelDefinition,
  type NeedSources,
} from "./channel-definitions";
import { CHANNEL_INPUT_KEYS, CHANNEL_RESULT_KEYS } from "./channel-suitability-result";
import { TRAFFIC_SIGNAL_RESULT_STATUSES } from "./traffic-signal-contract";
import { isFlatTrafficMetadata, isPlainTrafficData, validateTrafficSignalContext } from "./traffic-signal-validator";
import type { TrafficIssue } from "./traffic-validator";

const CHANNEL_ID = /^[a-z][a-z0-9-]*$/;
/** The Opportunity run outcomes that leave something to read. */
const USABLE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

/** Splits a comma-separated list. Empty parts are kept as empty strings so a stray comma is reported. */
export function splitChannelList(value: unknown): string[] {
  return typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()) : [];
}

/** Checks the channel definitions: duplicates, ids, names, families, statuses, and requirements. */
export function validateChannelDefinitions(input: unknown): TrafficIssue[] {
  if (!Array.isArray(input)) return [{ field: "definitions", message: "Invalid channels: the definitions must be a list." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const seen = new Set<string>();
  input.forEach((definition, index) => {
    const field = `definitions[${index}]`;
    if (!isRecord(definition)) {
      add(field, "Invalid channels: a definition must be an object.");
      return;
    }
    if (!isText(definition.id) || !CHANNEL_ID.test(definition.id)) add(`${field}.id`, "Invalid channels: id must be lowercase letters, digits, and hyphens, starting with a letter.");
    else if (seen.has(definition.id)) add(`${field}.id`, `Duplicate channel "${definition.id}".`);
    else seen.add(definition.id);
    if (!isNonEmptyText(definition.name)) add(`${field}.name`, "Invalid channels: name must be non-empty text.");
    if (!oneOf(CHANNEL_FAMILIES, definition.family)) add(`${field}.family`, "Invalid channels: family is not supported.");
    if (!oneOf(CHANNEL_STATUSES, definition.status)) add(`${field}.status`, "Invalid channels: status is not supported.");
    if (typeof definition.reviewsContent !== "boolean") add(`${field}.reviewsContent`, "Invalid channels: reviewsContent must be true or false.");
    const required = definition.requirements;
    if (!isRecord(required)) {
      add(`${field}.requirements`, "Invalid channels: requirements must be an object.");
      return;
    }
    for (const key of Object.keys(required)) {
      if (!oneOf(REQUIREMENT_DIMENSIONS, key)) add(`${field}.requirements.${key}`, `Invalid channels: "${key}" is not a requirement dimension.`);
    }
    for (const dimension of REQUIREMENT_DIMENSIONS) {
      const needs = required[dimension];
      if (!Array.isArray(needs) || needs.some((need) => !oneOf(CHANNEL_NEEDS, need))) add(`${field}.requirements.${dimension}`, `Invalid channels: "${dimension}" must be a list of supported needs.`);
      else if (new Set(needs).size !== needs.length) add(`${field}.requirements.${dimension}`, `Invalid channels: "${dimension}" must not repeat a need.`);
    }
  });
  return issues;
}

/** Checks the table that says which Opportunity dimensions can satisfy each need. */
export function validateNeedSources(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "needSources", message: "Invalid channels: the need sources must be an object." }];
  const issues: TrafficIssue[] = [];
  for (const need of CHANNEL_NEEDS) {
    const sources = input[need];
    if (!Array.isArray(sources) || sources.length === 0 || sources.some((source) => !isNonEmptyText(source))) issues.push({ field: `needSources.${need}`, message: `Invalid channels: "${need}" needs a non-empty list of dimension names.` });
    else if (new Set(sources).size !== sources.length) issues.push({ field: `needSources.${need}`, message: `Duplicate dimension in the sources of "${need}".` });
  }
  for (const key of Object.keys(input)) {
    if (!oneOf(CHANNEL_NEEDS, key)) issues.push({ field: `needSources.${key}`, message: `Invalid channels: "${key}" is not a supported need.` });
  }
  return issues;
}

/**
 * Checks the settings the signal reads. A channel listed twice is a duplicate,
 * a channel in both lists contradicts itself, and the policy declaration must
 * be true or false.
 */
export function validateChannelConfiguration(configuration: unknown): TrafficIssue[] {
  if (!isFlatTrafficMetadata(configuration)) return [{ field: "configuration", message: 'Invalid metadata: "configuration" must be a flat object of strings, numbers, booleans, or null with non-empty keys.' }];
  const settings = configuration as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
  const lists: Record<string, string[]> = {};
  for (const key of [CHANNEL_INPUT_KEYS.enabled, CHANNEL_INPUT_KEYS.disabled]) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    if (!isText(value)) {
      issues.push({ field: `configuration.${key}`, message: `Invalid context: "${key}" must be a comma-separated list of channel ids.` });
      continue;
    }
    const ids = splitChannelList(value);
    if (ids.some((id) => !CHANNEL_ID.test(id))) issues.push({ field: `configuration.${key}`, message: `Invalid context: "${key}" must contain only channel ids, with no empty entry.` });
    const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repeated !== undefined) issues.push({ field: `configuration.${key}`, message: `Duplicate channel "${repeated}" in "${key}".` });
    lists[key] = ids;
  }
  const both = (lists[CHANNEL_INPUT_KEYS.enabled] ?? []).find((id) => (lists[CHANNEL_INPUT_KEYS.disabled] ?? []).includes(id));
  if (both !== undefined) issues.push({ field: "configuration", message: `Invalid context: channel "${both}" is both enabled and disabled.` });
  const declared = settings[CHANNEL_INPUT_KEYS.policySensitive];
  if (declared !== undefined && declared !== null && typeof declared !== "boolean") issues.push({ field: `configuration.${CHANNEL_INPUT_KEYS.policySensitive}`, message: `Invalid context: "${CHANNEL_INPUT_KEYS.policySensitive}" must be true or false.` });
  return issues;
}

/**
 * Checks a Traffic Context before the signal reads it: the context itself,
 * then an Opportunity analysis that is present, usable, and shaped as the
 * Resolver produces it.
 */
export function validateChannelSuitabilityContext(context: unknown): TrafficIssue[] {
  if (!isRecord(context)) return [{ field: "context", message: "Invalid context: an object is required." }];
  const issues: TrafficIssue[] = [];
  const analysis = context.opportunityAnalysis;
  if (analysis === undefined || analysis === null) {
    issues.push({ field: "opportunityAnalysis", message: "Missing opportunity analysis: an Opportunity analysis is required." });
  }
  issues.push(...validateTrafficSignalContext(context, true).filter((issue) => !(analysis === undefined || analysis === null) || issue.field !== "opportunityAnalysis"));
  if (isRecord(analysis)) {
    if (!oneOf(USABLE_ANALYSIS_STATUSES, analysis.status)) issues.push({ field: "opportunityAnalysis.status", message: `Invalid context: the Opportunity analysis is ${String(analysis.status)}, and only a ${USABLE_ANALYSIS_STATUSES.join(" or ")} analysis can be read.` });
    for (const key of ["signalResults", "executedSignals"] as const) {
      if (!Array.isArray(analysis[key])) issues.push({ field: `opportunityAnalysis.${key}`, message: `Invalid context: the Opportunity analysis carries no "${key}" list.` });
    }
  }
  const explanation = context.opportunityExplanation;
  if (isRecord(explanation)) {
    for (const key of ["strengths", "weaknesses", "missingEvidence", "sections"] as const) {
      if (!Array.isArray(explanation[key])) issues.push({ field: `opportunityExplanation.${key}`, message: `Invalid context: the Opportunity explanation carries no "${key}" list.` });
    }
  }
  issues.push(...validateChannelConfiguration(context.configuration));
  return issues;
}

/** Checks everything the analyzer is given. */
export function validateChannelSuitabilityInputs(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "inputs", message: "Invalid context: the inputs must be an object." }];
  const issues: TrafficIssue[] = [];
  const analysis = input.opportunityAnalysis;
  if (analysis === undefined || analysis === null) issues.push({ field: "opportunityAnalysis", message: "Missing opportunity analysis: an Opportunity analysis is required." });
  else if (!isRecord(analysis) || !isPlainTrafficData(analysis)) issues.push({ field: "opportunityAnalysis", message: "Invalid context: the Opportunity analysis must be plain data." });
  else {
    if (!oneOf(USABLE_ANALYSIS_STATUSES, analysis.status)) issues.push({ field: "opportunityAnalysis.status", message: `Invalid context: the Opportunity analysis is ${String(analysis.status)}, and only a ${USABLE_ANALYSIS_STATUSES.join(" or ")} analysis can be read.` });
    if (!Array.isArray(analysis.signalResults)) issues.push({ field: "opportunityAnalysis.signalResults", message: 'Invalid context: the Opportunity analysis carries no "signalResults" list.' });
  }
  const explanation = input.opportunityExplanation;
  if (explanation !== undefined && explanation !== null) {
    if (!isRecord(explanation) || !isPlainTrafficData(explanation)) issues.push({ field: "opportunityExplanation", message: "Invalid context: the Opportunity explanation must be plain data." });
    else if (isRecord(analysis) && explanation.analysisId !== analysis.analysisId) issues.push({ field: "opportunityExplanation", message: "Invalid context: the Opportunity explanation belongs to a different analysis." });
  }
  for (const key of ["executionMetadata", "configuration"] as const) {
    if (!isFlatTrafficMetadata(input[key])) issues.push({ field: key, message: `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
  }
  if (isFlatTrafficMetadata(input.configuration)) issues.push(...validateChannelConfiguration(input.configuration));
  issues.push(...validateChannelDefinitions(input.definitions));
  issues.push(...validateNeedSources(input.needSources));
  return issues;
}

/** Checks a result: its fields, its lists, and that nothing in it is a score, a ranking, or a recommendation. */
export function validateChannelSuitabilityResult(input: unknown, channelIds?: readonly string[]): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "result", message: "Invalid result: an object is required." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid result: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(CHANNEL_RESULT_KEYS, key)) add(key, `unexpected field "${key}": a result carries no score, ranking, or recommendation.`);
  }
  for (const key of CHANNEL_RESULT_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);
  if (!oneOf(TRAFFIC_SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1)) add("confidence", "confidence must be a number from 0 to 1, or null.");
  const lists: Record<string, string[] | null> = {};
  for (const key of ["supportedChannels", "unsupportedChannels"] as const) {
    const value = input[key];
    if (!Array.isArray(value) || value.some((id) => !isText(id) || !CHANNEL_ID.test(id))) {
      add(key, `"${key}" must be a list of channel ids.`);
      lists[key] = null;
      continue;
    }
    const repeated = value.find((id, i) => value.indexOf(id) !== i);
    if (repeated !== undefined) add(key, `Duplicate channel "${repeated}" in "${key}".`);
    if (value.some((id, i) => i > 0 && value[i - 1] > id)) add(key, `"${key}" must be sorted by id, so that order implies no ranking.`);
    lists[key] = value as string[];
  }
  const { supportedChannels, unsupportedChannels } = lists;
  if (supportedChannels && unsupportedChannels) {
    const both = supportedChannels.find((id) => unsupportedChannels.includes(id));
    if (both !== undefined) add("unsupportedChannels", `channel "${both}" is both supported and unsupported.`);
    if (channelIds) {
      const all = [...supportedChannels, ...unsupportedChannels];
      if (all.length !== channelIds.length || channelIds.some((id) => !all.includes(id))) add("supportedChannels", "every channel must be either supported or unsupported.");
    }
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}
