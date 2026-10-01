/**
 * Commercial Intent Signal: validator.
 *
 * Rejects an invalid evidence context, a missing provider, a repeated
 * dimension, invalid metadata, and malformed candidate, provider evidence, or
 * result. It reports problems and never changes its input.
 *
 * Provider evidence is held to the contract exactly: a known channel, known
 * dimensions, non-empty observation text, and no extra keys. A provider cannot
 * slip a score, strength, or recommendation past it.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import {
  COMMERCIAL_INTENT_CHANNELS,
  COMMERCIAL_INTENT_OBSERVATION_KEYS,
  COMMERCIAL_INTENT_PAYLOAD_KEYS,
} from "./commercial-intent-provider-contract";
import { COMMERCIAL_INTENT_DIMENSIONS } from "./commercial-intent-result";
import { SIGNAL_RESULT_STATUSES } from "./opportunity-signal-contract";
import { isPlainObject } from "./providers/evidence-provider-context";
import { isProviderVersion, validateEvidenceContext } from "./providers/evidence-provider-validator";

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

/** Rejects a dimension list that is empty, has an unknown dimension, or repeats one. */
export function validateCommercialIntentDimensions(input: unknown): OpportunityIssue[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [{ field: "dimensions", message: "Dimensions must be a non-empty list." }];
  }
  const issues: OpportunityIssue[] = [];
  const seen = new Set<unknown>();
  for (const dimension of input) {
    if (!oneOf(COMMERCIAL_INTENT_DIMENSIONS, dimension)) {
      issues.push({ field: "dimensions", message: `Dimension "${String(dimension)}" is not supported.` });
    } else if (seen.has(dimension)) {
      issues.push({ field: "dimensions", message: `Duplicate dimension "${String(dimension)}".` });
    }
    seen.add(dimension);
  }
  return issues;
}

/** The evidence context a signal built must be valid before any provider is asked. */
export function validateCommercialIntentContext(context: unknown): OpportunityIssue[] {
  return validateEvidenceContext(context).map((issue) => ({ field: issue.field, message: `Invalid evidence context: ${issue.message}` }));
}

/** At least one enabled provider must be able to supply commercial-intent evidence for this context. */
export function validateCommercialIntentProviders(applicableProviderCount: number): OpportunityIssue[] {
  return applicableProviderCount > 0
    ? []
    : [{ field: "providers", message: "Missing provider: no enabled provider supplies commercial intent evidence for this context." }];
}

function validateMetadata(value: unknown): OpportunityIssue[] {
  const ok =
    isPlainObject(value) &&
    Object.entries(value).every(
      ([key, v]) =>
        key.trim() !== "" &&
        (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))),
    );
  return ok ? [] : [{ field: "metadata", message: "Metadata is invalid: a flat object of strings, numbers, booleans, or null with non-empty keys is required." }];
}

function validateCandidate(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "candidate", message: `Candidate is invalid: ${message}` }];
  if (value === undefined || value === null) return [{ field: "candidate", message: "Candidate is required." }];
  if (!isPlainObject(value)) return bad("an object is required.");
  for (const field of ["id", "source", "url", "title"] as const) {
    if (!isNonEmptyText(value[field])) return bad(`${field} must be non-empty text.`);
  }
  return [];
}

/** Checks one provider's payload against the contract. */
export function validateCommercialIntentEvidence(payload: unknown, label = "payload"): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "sources", message: `Evidence from ${label} is invalid: ${message}` }];
  if (!isPlainObject(payload)) return bad("an object is required.");
  const extra = Object.keys(payload).filter((key) => !oneOf(COMMERCIAL_INTENT_PAYLOAD_KEYS, key));
  if (extra.length > 0) return bad(`unexpected key "${extra[0]}".`);
  if (!oneOf(COMMERCIAL_INTENT_CHANNELS, payload.channel)) return bad("channel is not supported.");
  if (!Array.isArray(payload.observations)) return bad("observations must be a list.");
  for (const [index, observation] of payload.observations.entries()) {
    const at = `observation ${index}`;
    if (!isPlainObject(observation)) return bad(`${at} must be an object.`);
    const unknownKey = Object.keys(observation).find((key) => !oneOf(COMMERCIAL_INTENT_OBSERVATION_KEYS, key));
    if (unknownKey !== undefined) return bad(`${at} has unexpected key "${unknownKey}".`);
    if (!oneOf(COMMERCIAL_INTENT_DIMENSIONS, observation.dimension)) return bad(`${at} has an unsupported dimension.`);
    if (!isNonEmptyText(observation.evidence)) return bad(`${at} must say what was observed.`);
    if (observation.sourceUrl !== undefined && !isNonEmptyText(observation.sourceUrl)) return bad(`${at} has an empty sourceUrl.`);
  }
  return [];
}

function validateSources(value: unknown): OpportunityIssue[] {
  if (!Array.isArray(value)) return [{ field: "sources", message: "Sources must be a list." }];
  const issues: OpportunityIssue[] = [];
  const ids = new Set<string>();
  for (const [index, source] of value.entries()) {
    if (!isPlainObject(source)) {
      issues.push({ field: "sources", message: `Source ${index} must be an object.` });
      continue;
    }
    if (!isNonEmptyText(source.providerId)) {
      issues.push({ field: "sources", message: `Source ${index} must name its provider.` });
      continue;
    }
    if (ids.has(source.providerId)) issues.push({ field: "sources", message: `Duplicate provider "${source.providerId}".` });
    ids.add(source.providerId);
    if (!isProviderVersion(source.providerVersion)) issues.push({ field: "sources", message: `Source "${source.providerId}" must carry its provider's version.` });
    issues.push(...validateCommercialIntentEvidence(source.payload, `provider "${source.providerId}"`));
  }
  return issues;
}

/** Absent and null optional inputs are skipped; anything else supplied must be valid. */
export function validateCommercialIntentInputs(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "inputs", message: "Commercial intent inputs are missing." }];
  const issues = [...validateCandidate(input.candidate), ...validateSources(input.sources)];
  const present = (key: string) => input[key] !== undefined && input[key] !== null;
  if (present("warnings") && (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w)))) {
    issues.push({ field: "warnings", message: "Warnings must be a list of text." });
  }
  if (present("dimensions")) issues.push(...validateCommercialIntentDimensions(input.dimensions));
  if (present("metadata")) issues.push(...validateMetadata(input.metadata));
  return issues;
}

/** Checks a result: supported status, no repeated dimension, no dimension both available and missing, flat metadata. */
export function validateCommercialIntentResult(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "result", message: "Result must be an object." }];
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!oneOf(SIGNAL_RESULT_STATUSES, input.status)) add("status", "Status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && input.confidence >= 0 && input.confidence <= 1)) {
    add("confidence", "Confidence must be null or a number from 0 to 1.");
  }
  const seen = new Set<unknown>();
  for (const list of ["availableDimensions", "missingDimensions"] as const) {
    const value = input[list];
    if (!Array.isArray(value)) {
      add(list, `"${list}" must be a list of dimensions.`);
      continue;
    }
    for (const dimension of value) {
      if (!oneOf(COMMERCIAL_INTENT_DIMENSIONS, dimension)) add(list, `Dimension "${String(dimension)}" is not supported.`);
      else if (seen.has(dimension)) add(list, `Duplicate dimension "${String(dimension)}".`);
      seen.add(dimension);
    }
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  issues.push(...validateMetadata(input.metadata));
  return issues;
}
