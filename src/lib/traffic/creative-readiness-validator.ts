/**
 * Creative Readiness Signal: validator.
 *
 * Judges what goes into the signal and what comes out. It rejects a missing
 * context, a duplicate asset, a duplicate format, invalid metadata, and an
 * invalid creative definition, and it rejects any result that carries a score,
 * a ranking, or a recommendation.
 *
 * It reports problems and never throws or changes its input. It knows the
 * shape of an asset, a format, and of the Opportunity analysis and
 * explanation, and nothing about any particular product or advertising
 * platform.
 */
import {
  CREATIVE_ASSET_FAMILIES,
  CREATIVE_ASSET_KEYS,
  CREATIVE_DIMENSIONS,
  CREATIVE_FORMAT_FAMILIES,
  CREATIVE_FORMAT_KEYS,
  CREATIVE_INPUT_KEYS,
  CREATIVE_REQUIREMENT_KINDS,
  CREATIVE_RESULT_KEYS,
  CREATIVE_STATUSES,
} from "./creative-readiness-result";
import { TRAFFIC_SIGNAL_RESULT_STATUSES } from "./traffic-signal-contract";
import { isFlatTrafficMetadata, isPlainTrafficData, validateTrafficSignalContext } from "./traffic-signal-validator";
import type { TrafficIssue } from "./traffic-validator";

const CREATIVE_ID = /^[a-z][a-z0-9-]*$/;
const SECTION_KIND = /^[a-z][a-z0-9_-]*$/i;
const USABLE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;
const ASSET_SOURCE_KEYS = ["opportunityDimensions", "sectionKinds", "evidenceFields", "planSections", "planHeroStrategies", "planVariants"] as const;
const CONTENT_KEYS = ["evidenceContext", "landingPage", "presentationPlan", "manualOverrides"] as const;
const PLAN_KEYS = ["heroStrategy", "sectionVisibility", "sectionVariants"] as const;

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const textOrNull = (value: unknown): boolean => value === null || isText(value);

/** Splits a comma-separated list. Empty parts are kept as empty strings so a stray comma is reported. */
export function splitCreativeList(value: unknown): string[] {
  return typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()) : [];
}

function validateIdList(ids: string[], field: string, label: string): TrafficIssue[] {
  const issues: TrafficIssue[] = [];
  if (ids.some((id) => !CREATIVE_ID.test(id))) issues.push({ field, message: `Invalid context: "${field.split(".").slice(1).join(".")}" must contain only ${label} ids, with no empty entry.` });
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated !== undefined) issues.push({ field, message: `Duplicate ${label} "${repeated}" in "${field.split(".").slice(1).join(".")}".` });
  return issues;
}

function validateSourceLists(sources: Record<string, unknown>, prefix: string): TrafficIssue[] {
  const issues: TrafficIssue[] = [];
  for (const key of Object.keys(sources)) {
    if (!oneOf(ASSET_SOURCE_KEYS, key)) issues.push({ field: `${prefix}.${key}`, message: `Invalid creative definition: unexpected source "${key}".` });
  }
  for (const key of ASSET_SOURCE_KEYS) {
    const list = sources[key];
    if (!Array.isArray(list) || list.some((item) => !isNonEmptyText(item))) issues.push({ field: `${prefix}.${key}`, message: `Invalid creative definition: "${key}" must be a list of text.` });
    else if (new Set(list).size !== list.length) issues.push({ field: `${prefix}.${key}`, message: `Invalid creative definition: "${key}" must not repeat an entry.` });
  }
  return issues;
}

/** Checks one creative asset: id, family, dimension, sources, and that it is metadata only. */
export function validateCreativeAsset(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "asset", message: "Invalid creative definition: an asset must be an object." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `asset.${field}`, message: `Invalid creative definition: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(CREATIVE_ASSET_KEYS, key)) add(key, `unexpected field "${key}": an asset is metadata only and carries no generated file, score, or recommendation.`);
  }
  if (!isText(input.id) || !CREATIVE_ID.test(input.id)) add("id", "id must be lowercase letters, digits, and hyphens, starting with a letter.");
  if (!isNonEmptyText(input.name)) add("name", "name must be non-empty text.");
  if (!isNonEmptyText(input.description)) add("description", "description must be non-empty text.");
  if (!oneOf(CREATIVE_DIMENSIONS, input.dimension)) add("dimension", "dimension is not a creative dimension.");
  if (!oneOf(CREATIVE_ASSET_FAMILIES, input.family)) add("family", "family is not supported.");
  if (!oneOf(CREATIVE_STATUSES, input.status)) add("status", "status is not supported.");
  if (typeof input.enabled !== "boolean") add("enabled", "enabled must be true or false.");
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!isRecord(input.sources)) add("sources", "sources must be an object of the lists that can establish the asset.");
  else issues.push(...validateSourceLists(input.sources, "asset.sources"));
  return issues;
}

/** Checks a list of assets: each asset, no id used twice, and no dimension used twice. */
export function validateCreativeAssets(input: unknown): TrafficIssue[] {
  if (!Array.isArray(input)) return [{ field: "assets", message: "Invalid creative definition: the assets must be a list." }];
  const issues: TrafficIssue[] = [];
  const seen = new Set<string>();
  const dimensions = new Map<string, string>();
  input.forEach((asset, index) => {
    issues.push(...validateCreativeAsset(asset).map((issue) => ({ field: `assets[${index}].${issue.field}`, message: issue.message })));
    const id = isRecord(asset) ? asset.id : undefined;
    const dimension = isRecord(asset) ? asset.dimension : undefined;
    if (isText(id)) {
      if (seen.has(id)) issues.push({ field: `assets[${index}].id`, message: `Duplicate asset "${id}".` });
      seen.add(id);
    }
    if (isText(id) && isText(dimension)) {
      const owner = dimensions.get(dimension);
      if (owner !== undefined && owner !== id) issues.push({ field: `assets[${index}].dimension`, message: `Duplicate asset "${id}": dimension "${dimension}" is already used by "${owner}".` });
      else dimensions.set(dimension, id);
    }
  });
  return issues;
}

/** Checks one creative format: id, family, status, requirements, and that it is metadata only. */
export function validateCreativeFormat(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "format", message: "Invalid creative definition: a format must be an object." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `format.${field}`, message: `Invalid creative definition: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(CREATIVE_FORMAT_KEYS, key)) add(key, `unexpected field "${key}": a format is metadata only and carries no generated file, score, or recommendation.`);
  }
  if (!isText(input.id) || !CREATIVE_ID.test(input.id)) add("id", "id must be lowercase letters, digits, and hyphens, starting with a letter.");
  if (!isNonEmptyText(input.name)) add("name", "name must be non-empty text.");
  if (!isNonEmptyText(input.description)) add("description", "description must be non-empty text.");
  if (!oneOf(CREATIVE_FORMAT_FAMILIES, input.family)) add("family", "family is not supported.");
  if (!oneOf(CREATIVE_STATUSES, input.status)) add("status", "status is not supported.");
  if (typeof input.enabled !== "boolean") add("enabled", "enabled must be true or false.");
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  const required = input.requirements;
  if (!isRecord(required)) {
    add("requirements", "requirements must be an object covering every creative dimension.");
    return issues;
  }
  for (const key of Object.keys(required)) {
    if (!oneOf(CREATIVE_DIMENSIONS, key)) add(`requirements.${key}`, `"${key}" is not a creative dimension.`);
  }
  for (const dimension of CREATIVE_DIMENSIONS) {
    if (!oneOf(CREATIVE_REQUIREMENT_KINDS, required[dimension])) add(`requirements.${dimension}`, `"${dimension}" must be STRUCTURAL, CONTEXTUAL, or NOT_APPLICABLE.`);
  }
  return issues;
}

/** Checks a list of formats: each format, and no id used twice. */
export function validateCreativeFormats(input: unknown): TrafficIssue[] {
  if (!Array.isArray(input)) return [{ field: "formats", message: "Invalid creative definition: the formats must be a list." }];
  const issues: TrafficIssue[] = [];
  const seen = new Set<string>();
  input.forEach((format, index) => {
    issues.push(...validateCreativeFormat(format).map((issue) => ({ field: `formats[${index}].${issue.field}`, message: issue.message })));
    const id = isRecord(format) ? format.id : undefined;
    if (isText(id)) {
      if (seen.has(id)) issues.push({ field: `formats[${index}].id`, message: `Duplicate format "${id}".` });
      seen.add(id);
    }
  });
  return issues;
}

/**
 * Checks the settings the signal reads. An asset or format listed twice is a
 * duplicate, and an id in both lists contradicts itself.
 */
export function validateCreativeConfiguration(configuration: unknown): TrafficIssue[] {
  if (!isFlatTrafficMetadata(configuration)) return [{ field: "configuration", message: 'Invalid metadata: "configuration" must be a flat object of strings, numbers, booleans, or null with non-empty keys.' }];
  const settings = configuration as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
  const lists: Record<string, string[]> = {};
  const keys: Array<{ key: string; label: string }> = [
    { key: CREATIVE_INPUT_KEYS.formatsEnabled, label: "format" },
    { key: CREATIVE_INPUT_KEYS.formatsDisabled, label: "format" },
    { key: CREATIVE_INPUT_KEYS.assetsEnabled, label: "asset" },
    { key: CREATIVE_INPUT_KEYS.assetsDisabled, label: "asset" },
  ];
  for (const { key, label } of keys) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    if (!isText(value)) {
      issues.push({ field: `configuration.${key}`, message: `Invalid context: "${key}" must be a comma-separated list of ${label} ids.` });
      continue;
    }
    const ids = splitCreativeList(value);
    issues.push(...validateIdList(ids, `configuration.${key}`, label));
    lists[key] = ids;
  }
  const formatBoth = (lists[CREATIVE_INPUT_KEYS.formatsEnabled] ?? []).find((id) => (lists[CREATIVE_INPUT_KEYS.formatsDisabled] ?? []).includes(id));
  if (formatBoth !== undefined) issues.push({ field: "configuration", message: `Invalid context: format "${formatBoth}" is both enabled and disabled.` });
  const assetBoth = (lists[CREATIVE_INPUT_KEYS.assetsEnabled] ?? []).find((id) => (lists[CREATIVE_INPUT_KEYS.assetsDisabled] ?? []).includes(id));
  if (assetBoth !== undefined) issues.push({ field: "configuration", message: `Invalid context: asset "${assetBoth}" is both enabled and disabled.` });
  return issues;
}

/**
 * Checks a Traffic Context before the signal reads it: that there is one, that
 * it is valid, and that its Opportunity analysis is present, usable, and
 * shaped as the Resolver produces it.
 */
export function validateCreativeReadinessContext(context: unknown): TrafficIssue[] {
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
  issues.push(...validateCreativeConfiguration(context.configuration));
  return issues;
}

function validatePresentationPlan(plan: unknown, add: (field: string, message: string) => void): void {
  if (!isRecord(plan)) {
    add("presentationPlan", "the Presentation Plan must be an object, or null when there is none.");
    return;
  }
  for (const key of Object.keys(plan)) {
    if (!oneOf(PLAN_KEYS, key)) add(`presentationPlan.${key}`, `unexpected field "${key}": only heroStrategy, sectionVisibility, and sectionVariants are read.`);
  }
  if (!("heroStrategy" in plan) || !(plan.heroStrategy === null || isNonEmptyText(plan.heroStrategy))) add("presentationPlan.heroStrategy", "heroStrategy must be non-empty text or null.");
  const visibility = plan.sectionVisibility;
  if (visibility !== null && visibility !== undefined) {
    if (!isRecord(visibility)) add("presentationPlan.sectionVisibility", "sectionVisibility must be an object of section names to true or false, or null.");
    else {
      for (const [key, value] of Object.entries(visibility)) {
        if (!isNonEmptyText(key)) add("presentationPlan.sectionVisibility", "section names must be non-empty text.");
        else if (typeof value !== "boolean") add(`presentationPlan.sectionVisibility.${key}`, "each section's visibility must be true or false.");
      }
    }
  }
  const variants = plan.sectionVariants;
  if (variants !== null && variants !== undefined) {
    if (!isRecord(variants)) add("presentationPlan.sectionVariants", "sectionVariants must be an object of section names to labels, or null.");
    else {
      for (const [key, value] of Object.entries(variants)) {
        if (!isNonEmptyText(key)) add("presentationPlan.sectionVariants", "section names must be non-empty text.");
        else if (!isNonEmptyText(value)) add(`presentationPlan.sectionVariants.${key}`, "each variant label must be non-empty text.");
      }
    }
  }
}

/** Checks the supplied content: Evidence, Landing Page Structure, Presentation Plan, and effective manual overrides. */
export function validateCreativeReadinessContent(input: unknown): TrafficIssue[] {
  if (input === null) return [];
  if (!isRecord(input) || !isPlainTrafficData(input)) return [{ field: "content", message: "Invalid content: the supplied content must be plain data." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `content.${field}`, message: `Invalid content: ${message}` });
  for (const key of CONTENT_KEYS) if (!(key in input)) add(key, `"${key}" is missing; use null when there is none.`);

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
  if (input.presentationPlan !== null && input.presentationPlan !== undefined) validatePresentationPlan(input.presentationPlan, add);
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
export function validateCreativeReadinessInputs(input: unknown): TrafficIssue[] {
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
  if (isFlatTrafficMetadata(input.configuration)) issues.push(...validateCreativeConfiguration(input.configuration));
  issues.push(...validateCreativeAssets(input.assets));
  issues.push(...validateCreativeFormats(input.formats));
  if ("content" in input) issues.push(...validateCreativeReadinessContent(input.content));
  return issues;
}

function validateSortedIdList(value: unknown, key: string, label: string, issues: TrafficIssue[], add: (field: string, message: string) => void): string[] | null {
  if (!Array.isArray(value) || value.some((id) => !isText(id) || !CREATIVE_ID.test(id))) {
    add(key, `"${key}" must be a list of ${label} ids.`);
    return null;
  }
  const repeated = value.find((id, i) => value.indexOf(id) !== i);
  if (repeated !== undefined) add(key, `Duplicate ${label} "${repeated}" in "${key}".`);
  if (value.some((id, i) => i > 0 && value[i - 1] > id)) add(key, `"${key}" must be sorted by id, so that order implies no ranking.`);
  return value as string[];
}

/** Checks a result: its fields, its lists, and that nothing in it is a score, a ranking, or a recommendation. */
export function validateCreativeReadinessResult(input: unknown, formatIds?: readonly string[]): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "result", message: "Invalid result: an object is required." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid result: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(CREATIVE_RESULT_KEYS, key)) add(key, `unexpected field "${key}": a result carries no score, ranking, or recommendation.`);
  }
  for (const key of CREATIVE_RESULT_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);
  if (!oneOf(TRAFFIC_SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1)) add("confidence", "confidence must be a number from 0 to 1, or null.");

  const availableAssets = validateSortedIdList(input.availableAssets, "availableAssets", "asset", issues, add);
  const missingAssets = validateSortedIdList(input.missingAssets, "missingAssets", "asset", issues, add);
  const supportedFormats = validateSortedIdList(input.supportedFormats, "supportedFormats", "format", issues, add);
  const unsupportedFormats = validateSortedIdList(input.unsupportedFormats, "unsupportedFormats", "format", issues, add);

  if (availableAssets && missingAssets) {
    const both = availableAssets.find((id) => missingAssets.includes(id));
    if (both !== undefined) add("missingAssets", `asset "${both}" is both available and missing.`);
  }
  if (supportedFormats && unsupportedFormats) {
    const both = supportedFormats.find((id) => unsupportedFormats.includes(id));
    if (both !== undefined) add("unsupportedFormats", `format "${both}" is both supported and unsupported.`);
    if (formatIds) {
      const all = [...supportedFormats, ...unsupportedFormats];
      if (all.length !== formatIds.length || formatIds.some((id) => !all.includes(id))) add("supportedFormats", "every enabled format must be either supported or unsupported.");
    }
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}
