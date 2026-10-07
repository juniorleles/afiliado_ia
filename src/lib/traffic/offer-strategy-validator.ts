/**
 * Offer Strategy Signal: validator.
 *
 * Judges what goes into the signal and what comes out. It rejects a missing
 * context, a duplicate strategy, invalid metadata, and an invalid offer
 * definition, and it rejects any result that carries a score, a ranking, a
 * classification, or a recommendation.
 *
 * It reports problems and never throws or changes its input. It knows the
 * shape of a strategy and of the Opportunity analysis and explanation, and
 * nothing about any particular offer, product, or advertising platform.
 */
import {
  OFFER_DIMENSIONS,
  OFFER_INPUT_KEYS,
  OFFER_REQUIREMENT_KINDS,
  OFFER_RESULT_KEYS,
  OFFER_STRATEGY_FAMILIES,
  OFFER_STRATEGY_KEYS,
  OFFER_STRATEGY_STATUSES,
} from "./offer-strategy-result";
import { TRAFFIC_SIGNAL_RESULT_STATUSES } from "./traffic-signal-contract";
import { isFlatTrafficMetadata, isPlainTrafficData, validateTrafficSignalContext } from "./traffic-signal-validator";
import type { TrafficIssue } from "./traffic-validator";

const STRATEGY_ID = /^[a-z][a-z0-9-]*$/;
const SECTION_KIND = /^[a-z][a-z0-9_-]*$/i;
const USABLE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const textOrNull = (value: unknown): boolean => value === null || isText(value);

/** Splits a comma-separated list. Empty parts are kept as empty strings so a stray comma is reported. */
export function splitStrategyList(value: unknown): string[] {
  return typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()) : [];
}

/** Checks one offer strategy: id, family, status, requirements, and that it is metadata only. */
export function validateOfferStrategy(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "strategy", message: "Invalid offer definition: a strategy must be an object." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `strategy.${field}`, message: `Invalid offer definition: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(OFFER_STRATEGY_KEYS, key)) add(key, `unexpected field "${key}": a strategy is metadata only and carries no score, budget, or classification.`);
  }
  if (!isText(input.id) || !STRATEGY_ID.test(input.id)) add("id", "id must be lowercase letters, digits, and hyphens, starting with a letter.");
  if (!isNonEmptyText(input.name)) add("name", "name must be non-empty text.");
  if (!isNonEmptyText(input.description)) add("description", "description must be non-empty text.");
  if (!oneOf(OFFER_STRATEGY_FAMILIES, input.family)) add("family", "family is not supported.");
  if (!oneOf(OFFER_STRATEGY_STATUSES, input.status)) add("status", "status is not supported.");
  if (typeof input.enabled !== "boolean") add("enabled", "enabled must be true or false.");
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  const required = input.requirements;
  if (!isRecord(required)) {
    add("requirements", "requirements must be an object covering every offer dimension.");
    return issues;
  }
  for (const key of Object.keys(required)) {
    if (!oneOf(OFFER_DIMENSIONS, key)) add(`requirements.${key}`, `"${key}" is not an offer dimension.`);
  }
  for (const dimension of OFFER_DIMENSIONS) {
    if (!oneOf(OFFER_REQUIREMENT_KINDS, required[dimension])) add(`requirements.${dimension}`, `"${dimension}" must be STRUCTURAL, CONTEXTUAL, or NOT_APPLICABLE.`);
  }
  return issues;
}

/** Checks a list of strategies: each strategy, and no id used twice. */
export function validateOfferStrategies(input: unknown): TrafficIssue[] {
  if (!Array.isArray(input)) return [{ field: "strategies", message: "Invalid offer definition: the strategies must be a list." }];
  const issues: TrafficIssue[] = [];
  const seen = new Set<string>();
  input.forEach((strategy, index) => {
    issues.push(...validateOfferStrategy(strategy).map((issue) => ({ field: `strategies[${index}].${issue.field}`, message: issue.message })));
    const id = isRecord(strategy) ? strategy.id : undefined;
    if (isText(id)) {
      if (seen.has(id)) issues.push({ field: `strategies[${index}].id`, message: `Duplicate strategy "${id}".` });
      seen.add(id);
    }
  });
  return issues;
}

/** Checks the table that says which Opportunity dimensions, page-section kinds, and fields can establish each offer dimension. */
export function validateOfferDimensionSources(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "dimensionSources", message: "Invalid offer definition: the dimension sources must be an object." }];
  const issues: TrafficIssue[] = [];
  for (const dimension of OFFER_DIMENSIONS) {
    const source = input[dimension];
    const field = `dimensionSources.${dimension}`;
    if (!isRecord(source)) {
      issues.push({ field, message: `Invalid offer definition: "${dimension}" needs its sources.` });
      continue;
    }
    for (const key of ["opportunityDimensions", "sectionKinds", "evidenceFields"] as const) {
      const list = source[key];
      if (!Array.isArray(list) || list.some((item) => !isNonEmptyText(item))) issues.push({ field: `${field}.${key}`, message: `Invalid offer definition: "${key}" must be a list of text.` });
      else if (new Set(list).size !== list.length) issues.push({ field: `${field}.${key}`, message: `Invalid offer definition: "${key}" must not repeat an entry.` });
    }
  }
  for (const key of Object.keys(input)) {
    if (!oneOf(OFFER_DIMENSIONS, key)) issues.push({ field: `dimensionSources.${key}`, message: `Invalid offer definition: "${key}" is not an offer dimension.` });
  }
  return issues;
}

/**
 * Checks the settings the signal reads. A strategy listed twice is a duplicate,
 * and a strategy in both lists contradicts itself.
 */
export function validateOfferConfiguration(configuration: unknown): TrafficIssue[] {
  if (!isFlatTrafficMetadata(configuration)) return [{ field: "configuration", message: 'Invalid metadata: "configuration" must be a flat object of strings, numbers, booleans, or null with non-empty keys.' }];
  const settings = configuration as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
  const lists: Record<string, string[]> = {};
  for (const key of [OFFER_INPUT_KEYS.enabled, OFFER_INPUT_KEYS.disabled]) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    if (!isText(value)) {
      issues.push({ field: `configuration.${key}`, message: `Invalid context: "${key}" must be a comma-separated list of strategy ids.` });
      continue;
    }
    const ids = splitStrategyList(value);
    if (ids.some((id) => !STRATEGY_ID.test(id))) issues.push({ field: `configuration.${key}`, message: `Invalid context: "${key}" must contain only strategy ids, with no empty entry.` });
    const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repeated !== undefined) issues.push({ field: `configuration.${key}`, message: `Duplicate strategy "${repeated}" in "${key}".` });
    lists[key] = ids;
  }
  const both = (lists[OFFER_INPUT_KEYS.enabled] ?? []).find((id) => (lists[OFFER_INPUT_KEYS.disabled] ?? []).includes(id));
  if (both !== undefined) issues.push({ field: "configuration", message: `Invalid context: strategy "${both}" is both enabled and disabled.` });
  return issues;
}

/**
 * Checks a Traffic Context before the signal reads it: that there is one, that
 * it is valid, and that its Opportunity analysis is present, usable, and
 * shaped as the Resolver produces it.
 */
export function validateOfferStrategyContext(context: unknown): TrafficIssue[] {
  if (!isRecord(context)) return [{ field: "context", message: "Missing context: a Traffic Context object is required." }];
  const issues: TrafficIssue[] = [];
  const analysis = context.opportunityAnalysis;
  if (analysis === undefined || analysis === null) issues.push({ field: "opportunityAnalysis", message: "Missing context: an Opportunity analysis is required." });
  issues.push(...validateTrafficSignalContext(context, true));
  if (isRecord(analysis)) {
    if (!oneOf(USABLE_ANALYSIS_STATUSES, analysis.status)) issues.push({ field: "opportunityAnalysis.status", message: `Invalid context: the Opportunity analysis is ${String(analysis.status)}, and only a ${USABLE_ANALYSIS_STATUSES.join(" or ")} analysis can be read.` });
    if (!Array.isArray(analysis.signalResults)) issues.push({ field: "opportunityAnalysis.signalResults", message: 'Invalid context: the Opportunity analysis carries no "signalResults" list.' });
  }
  const explanation = context.opportunityExplanation;
  if (isRecord(explanation)) {
    for (const key of ["strengths", "weaknesses", "missingEvidence", "sections"] as const) {
      if (!Array.isArray(explanation[key])) issues.push({ field: `opportunityExplanation.${key}`, message: `Invalid context: the Opportunity explanation carries no "${key}" list.` });
    }
  }
  issues.push(...validateOfferConfiguration(context.configuration));
  return issues;
}

/** Checks the supplied content: the Evidence Context, the Landing Page Structure, and the effective manual overrides. */
export function validateOfferStrategyContent(input: unknown): TrafficIssue[] {
  if (input === null) return [];
  if (!isRecord(input) || !isPlainTrafficData(input)) return [{ field: "content", message: "Invalid content: the supplied content must be plain data." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `content.${field}`, message: `Invalid content: ${message}` });
  for (const key of ["evidenceContext", "landingPage", "manualOverrides"] as const) if (!(key in input)) add(key, `"${key}" is missing; use null when there is none.`);

  const evidence = input.evidenceContext;
  if (evidence !== null && evidence !== undefined) {
    if (!isRecord(evidence) || !Array.isArray(evidence.items)) add("evidenceContext", "the Evidence Context must carry a list of items.");
    else {
      const seen = new Set<string>();
      evidence.items.forEach((item: unknown, i: number) => {
        const field = `evidenceContext.items[${i}]`;
        if (!isRecord(item)) return add(field, "an item must be an object.");
        if (!isNonEmptyText(item.id)) add(`${field}.id`, "id must be non-empty text.");
        else if (seen.has(item.id)) add(`${field}.id`, `duplicate item id "${item.id}".`);
        else seen.add(item.id);
        if (!isText(item.text)) add(`${field}.text`, "text must be text.");
        if (!textOrNull(item.sourceUrl)) add(`${field}.sourceUrl`, "sourceUrl must be text or null, so that provenance is kept.");
        if (!textOrNull(item.pageCategory)) add(`${field}.pageCategory`, "pageCategory must be text or null, so that provenance is kept.");
        if (item.field !== undefined && !textOrNull(item.field)) add(`${field}.field`, "field must be text or null.");
      });
    }
  }
  const page = input.landingPage;
  if (page !== null && page !== undefined) {
    if (!isRecord(page) || !Array.isArray(page.sections)) add("landingPage", "the Landing Page Structure must carry a list of sections.");
    else {
      const seen = new Set<string>();
      page.sections.forEach((section: unknown, i: number) => {
        const field = `landingPage.sections[${i}]`;
        if (!isRecord(section)) return add(field, "a section must be an object.");
        if (!isNonEmptyText(section.id)) add(`${field}.id`, "id must be non-empty text.");
        else if (seen.has(section.id)) add(`${field}.id`, `duplicate section id "${section.id}".`);
        else seen.add(section.id);
        if (!isText(section.kind) || !SECTION_KIND.test(section.kind)) add(`${field}.kind`, "kind must be letters, digits, underscores, or hyphens, starting with a letter.");
        if (typeof section.visible !== "boolean") add(`${field}.visible`, "visible must be true or false.");
        if (!Array.isArray(section.texts) || section.texts.some((text: unknown) => !isText(text))) add(`${field}.texts`, "texts must be a list of text.");
        if (section.field !== undefined && !textOrNull(section.field)) add(`${field}.field`, "field must be text or null.");
      });
    }
  }
  const overrides = input.manualOverrides;
  if (overrides !== null && overrides !== undefined) {
    if (!Array.isArray(overrides)) add("manualOverrides", "the manual overrides must be a list of effective values.");
    else {
      const seen = new Set<string>();
      overrides.forEach((override: unknown, i: number) => {
        const field = `manualOverrides[${i}]`;
        if (!isRecord(override)) return add(field, "an override must be an object.");
        for (const key of Object.keys(override)) if (key !== "field" && key !== "value") add(`${field}.${key}`, `unexpected field "${key}": only effective values are read, never ids, timestamps, or previous values.`);
        if (!isNonEmptyText(override.field)) add(`${field}.field`, "field must be non-empty text.");
        else if (seen.has(override.field)) add(`${field}.field`, `duplicate override for "${override.field}".`);
        else seen.add(override.field);
        if (!("value" in override)) add(`${field}.value`, "value is missing.");
      });
    }
  }
  return issues;
}

/** Checks everything the analyzer is given. */
export function validateOfferStrategyInputs(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "inputs", message: "Invalid context: the inputs must be an object." }];
  const issues: TrafficIssue[] = [];
  const analysis = input.opportunityAnalysis;
  if (analysis === undefined || analysis === null) issues.push({ field: "opportunityAnalysis", message: "Missing context: an Opportunity analysis is required." });
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
  if (isFlatTrafficMetadata(input.configuration)) issues.push(...validateOfferConfiguration(input.configuration));
  issues.push(...validateOfferStrategies(input.strategies));
  issues.push(...validateOfferDimensionSources(input.dimensionSources));
  if ("content" in input) issues.push(...validateOfferStrategyContent(input.content));
  return issues;
}

/** Checks a result: its fields, its lists, and that nothing in it is a score, a ranking, a classification, or a recommendation. */
export function validateOfferStrategyResult(input: unknown, strategyIds?: readonly string[]): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "result", message: "Invalid result: an object is required." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid result: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(OFFER_RESULT_KEYS, key)) add(key, `unexpected field "${key}": a result carries no score, ranking, classification, or recommendation.`);
  }
  for (const key of OFFER_RESULT_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);
  if (!oneOf(TRAFFIC_SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1)) add("confidence", "confidence must be a number from 0 to 1, or null.");
  const lists: Record<string, string[] | null> = {};
  for (const key of ["supportedStrategies", "unsupportedStrategies"] as const) {
    const value = input[key];
    if (!Array.isArray(value) || value.some((id) => !isText(id) || !STRATEGY_ID.test(id))) {
      add(key, `"${key}" must be a list of strategy ids.`);
      lists[key] = null;
      continue;
    }
    const repeated = value.find((id, i) => value.indexOf(id) !== i);
    if (repeated !== undefined) add(key, `Duplicate strategy "${repeated}" in "${key}".`);
    if (value.some((id, i) => i > 0 && value[i - 1] > id)) add(key, `"${key}" must be sorted by id, so that order implies no ranking.`);
    lists[key] = value as string[];
  }
  const { supportedStrategies, unsupportedStrategies } = lists;
  if (supportedStrategies && unsupportedStrategies) {
    const both = supportedStrategies.find((id) => unsupportedStrategies.includes(id));
    if (both !== undefined) add("unsupportedStrategies", `strategy "${both}" is both supported and unsupported.`);
    if (strategyIds) {
      const all = [...supportedStrategies, ...unsupportedStrategies];
      if (all.length !== strategyIds.length || strategyIds.some((id) => !all.includes(id))) add("supportedStrategies", "every enabled strategy must be either supported or unsupported.");
    }
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}
