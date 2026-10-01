/**
 * Competition Signal: validator.
 *
 * Rejects an invalid evidence context, a missing provider, a repeated
 * dimension, invalid metadata, and malformed candidate, evidence, or research.
 * It reports problems and never changes its input.
 *
 * The id lists below mirror the platform's own enums. Only type imports reach
 * the platform, so the lists are typed against them and a test compares them
 * with the runtime values.
 */
import type {
  MarketIntentKind,
  MarketResearchQuality,
  MarketResearchStatus,
  MarketSourceClass,
} from "@/lib/market-research/types";
import type { OpportunityIssue } from "./opportunity-validator";
import { COMPETITION_DIMENSIONS } from "./competition-result";
import { SIGNAL_RESULT_STATUSES } from "./opportunity-signal-contract";
import { isPlainObject } from "./providers/evidence-provider-context";
import { isProviderVersion, validateEvidenceContext } from "./providers/evidence-provider-validator";

export const COMPETITION_SOURCE_CLASSES: readonly MarketSourceClass[] = [
  "BRAND",
  "SELLER",
  "RETAILER",
  "EDITORIAL",
  "FORUM/COMMUNITY",
  "OTHER",
  "UNKNOWN",
];
export const COMPETITION_INTENT_KINDS: readonly MarketIntentKind[] = [
  "REVIEW_INTENT",
  "BUYER_GUIDE_INTENT",
  "EDUCATIONAL_INTENT",
  "COMPARISON_INTENT",
  "QUESTION_INTENT",
  "SAFETY_CONCERN",
  "INGREDIENT_RESEARCH",
  "PRICE_CONCERN",
  "TRUST_CONCERN",
];
export const COMPETITION_RESEARCH_STATUSES: readonly MarketResearchStatus[] = ["FRESH", "STALE", "UNAVAILABLE"];
export const COMPETITION_RESEARCH_QUALITIES: readonly MarketResearchQuality[] = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"];

type Obj = Record<string, unknown>;

const isText = (value: unknown): value is string => typeof value === "string";
const isCount = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= 0;
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

/** Rejects a dimension list that is empty, has an unknown dimension, or repeats one. */
export function validateCompetitionDimensions(input: unknown): OpportunityIssue[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [{ field: "dimensions", message: "Dimensions must be a non-empty list." }];
  }
  const issues: OpportunityIssue[] = [];
  const seen = new Set<unknown>();
  for (const dimension of input) {
    if (!oneOf(COMPETITION_DIMENSIONS, dimension)) {
      issues.push({ field: "dimensions", message: `Dimension "${String(dimension)}" is not supported.` });
    } else if (seen.has(dimension)) {
      issues.push({ field: "dimensions", message: `Duplicate dimension "${String(dimension)}".` });
    }
    seen.add(dimension);
  }
  return issues;
}

/** The evidence context a signal built must be valid before any provider is asked. */
export function validateCompetitionContext(context: unknown): OpportunityIssue[] {
  return validateEvidenceContext(context).map((issue) => ({ field: issue.field, message: `Invalid evidence context: ${issue.message}` }));
}

/** At least one enabled provider must be able to supply research for this context. */
export function validateCompetitionProviders(applicableProviderCount: number): OpportunityIssue[] {
  return applicableProviderCount > 0
    ? []
    : [{ field: "providers", message: "Missing provider: no enabled provider supplies research evidence for this context." }];
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
    if (!isText(value[field]) || (value[field] as string).trim() === "") return bad(`${field} must be non-empty text.`);
  }
  return [];
}

function validateResearch(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "evidence", message: `Research is invalid: ${message}` }];
  if (!isPlainObject(value)) return bad("a report is required.");
  if (!isText(value.productName)) return bad("productName must be text.");
  if (!oneOf(COMPETITION_RESEARCH_STATUSES, value.status)) return bad("status is not supported.");
  if (!oneOf(COMPETITION_RESEARCH_QUALITIES, value.quality)) return bad("quality is not supported.");
  if (
    !Array.isArray(value.sources) ||
    value.sources.some(
      (s) =>
        !isPlainObject(s) ||
        !isText(s.url) ||
        typeof s.usable !== "boolean" ||
        typeof s.promotional !== "boolean" ||
        !oneOf(COMPETITION_SOURCE_CLASSES, s.classification) ||
        !isText(s.classificationReason),
    )
  ) {
    return bad("sources need a url, usable and promotional flags, a classification, and its reason.");
  }
  const signals = value.signals;
  if (!isPlainObject(signals)) return bad("signals are required.");
  for (const count of ["reviewOrientedResults", "educationalResults", "buyerGuideResults"] as const) {
    if (!isCount(signals[count])) return bad(`signals.${count} must be a non-negative integer.`);
  }
  if (!Array.isArray(signals.observedIntents) || signals.observedIntents.some((i) => !isPlainObject(i) || !oneOf(COMPETITION_INTENT_KINDS, i.kind))) {
    return bad("signals.observedIntents need a supported kind.");
  }
  const diversity = value.diversity;
  if (!isPlainObject(diversity) || !isCount(diversity.USABLE_SOURCES) || !isCount(diversity.PROMOTIONAL_SOURCES)) {
    return bad("diversity.USABLE_SOURCES and diversity.PROMOTIONAL_SOURCES must be non-negative integers.");
  }
  return [];
}

function validateEvidence(value: unknown): OpportunityIssue[] {
  if (value === undefined || value === null) return [{ field: "evidence", message: "Evidence is required." }];
  const bad = (message: string) => [{ field: "evidence", message: `Evidence is invalid: ${message}` }];
  if (!isPlainObject(value)) return bad("merged evidence is required.");
  if (!isPlainObject(value.items)) return bad("items are required.");
  if (!Array.isArray(value.failed)) return bad("failed must be a list.");
  if (!Array.isArray(value.warnings) || value.warnings.some((w) => !isText(w))) return bad("warnings must be a list of text.");
  const research = (value.items as Obj).RESEARCH;
  if (research === undefined) return [];
  if (!isPlainObject(research) || research.kind !== "RESEARCH") return bad("the research item must be of kind RESEARCH.");
  if (!isText(research.providerId) || research.providerId.trim() === "") return bad("the research item must name its provider.");
  if (!isProviderVersion(research.providerVersion)) return bad("the research item must carry its provider's version.");
  return validateResearch(research.payload);
}

/** Absent and null optional inputs are skipped; anything else supplied must be valid. */
export function validateCompetitionInputs(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "inputs", message: "Competition inputs are missing." }];
  const issues = [...validateCandidate(input.candidate), ...validateEvidence(input.evidence)];
  const present = (key: string) => input[key] !== undefined && input[key] !== null;
  if (present("dimensions")) issues.push(...validateCompetitionDimensions(input.dimensions));
  if (present("metadata")) issues.push(...validateMetadata(input.metadata));
  return issues;
}

/** Checks a result: supported status, no repeated dimension, no dimension both available and missing, flat metadata. */
export function validateCompetitionResult(input: unknown): OpportunityIssue[] {
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
      if (!oneOf(COMPETITION_DIMENSIONS, dimension)) add(list, `Dimension "${String(dimension)}" is not supported.`);
      else if (seen.has(dimension)) add(list, `Duplicate dimension "${String(dimension)}".`);
      seen.add(dimension);
    }
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  issues.push(...validateMetadata(input.metadata));
  return issues;
}