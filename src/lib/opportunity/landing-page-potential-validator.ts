/**
 * Landing Page Potential Signal: input validator.
 *
 * Rejects a missing or malformed ProductFacts, completeness report, or
 * presentation plan, and any supplied quality prediction, evidence result,
 * manual overrides, or metadata that is not valid. It reports problems and
 * never changes its input.
 *
 * The id lists below mirror the platform's own enums. Only type imports reach
 * the platform, so the lists are typed against them and a test compares them
 * with the runtime values.
 */
import type { DensityLabel, ReadinessLabel } from "@/lib/lp-quality-predictor";
import type { OverrideField } from "@/lib/manual-overrides";
import type { HeroStrategy } from "@/lib/presentation-plan";
import type { ProductDensity } from "@/lib/product-profile";
import { EVIDENCE_DIMENSIONS } from "./evidence-result";
import { EVIDENCE_COMPLETENESS_SECTIONS, EVIDENCE_PLAN_SECTIONS, validateEvidenceInputs } from "./evidence-validator";
import { SIGNAL_RESULT_STATUSES } from "./opportunity-signal-contract";
import type { OpportunityIssue } from "./opportunity-validator";

export const LP_POTENTIAL_DENSITIES: readonly ProductDensity[] = ["LOW", "MEDIUM", "HIGH", "PREMIUM"];
export const LP_POTENTIAL_HERO_STRATEGIES: readonly HeroStrategy[] = ["IDENTITY", "VALUE", "BENEFIT", "DESCRIPTION", "FEATURE_CHIPS"];
export const LP_POTENTIAL_DENSITY_LABELS: readonly DensityLabel[] = ["High", "Medium", "Low"];
export const LP_POTENTIAL_READINESS_LABELS: readonly ReadinessLabel[] = ["Ready", "Partial", "Thin"];
export const LP_POTENTIAL_OVERRIDE_FIELDS: readonly OverrideField[] = [
  "productName",
  "manufacturer",
  "description",
  "ingredients",
  "features",
  "faq",
  "usage",
  "guarantee",
  "warnings",
  "pricing",
  "cta",
  "trackingUrl",
];

const SECTION_STATUSES: readonly string[] = ["COMPLETE", "PARTIAL", "MISSING"];

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

function validateFacts(facts: unknown): OpportunityIssue[] {
  return validateEvidenceInputs({ facts }).filter((issue) => issue.field === "facts");
}

function validateCompleteness(value: unknown): OpportunityIssue[] {
  if (value === undefined || value === null) return [{ field: "completeness", message: "Completeness report is required." }];
  const bad = (message: string) => [{ field: "completeness", message: `Completeness report is invalid: ${message}` }];
  if (!isObject(value) || !Array.isArray(value.sections)) return bad("a report with a sections list is required.");
  const seen = new Set<string>();
  for (const section of value.sections) {
    if (!isObject(section) || !oneOf(EVIDENCE_COMPLETENESS_SECTIONS, section.id)) return bad("a section has an unsupported id.");
    const id = String(section.id);
    if (!oneOf(SECTION_STATUSES, section.status)) return bad(`section "${id}" has an unsupported status.`);
    if (!isCount(section.found) || !isCount(section.recommended)) return bad(`section "${id}" needs non-negative found and recommended counts.`);
    if (seen.has(id)) return bad(`section "${id}" is repeated.`);
    seen.add(id);
  }
  return [];
}

function validatePlan(value: unknown): OpportunityIssue[] {
  if (value === undefined || value === null) return [{ field: "presentationPlan", message: "Presentation plan is required." }];
  const bad = (message: string) => [{ field: "presentationPlan", message: `Presentation plan is invalid: ${message}` }];
  if (!isObject(value)) return bad("a plan is required.");
  const visibility = value.sectionVisibility;
  if (!isObject(visibility) || EVIDENCE_PLAN_SECTIONS.some((section) => typeof visibility[section] !== "boolean")) {
    return bad("sectionVisibility must cover every section with true or false.");
  }
  if (!Array.isArray(value.sectionOrder) || value.sectionOrder.some((section) => !oneOf(EVIDENCE_PLAN_SECTIONS, section))) {
    return bad("sectionOrder must be a list of supported sections.");
  }
  if (!oneOf(LP_POTENTIAL_DENSITIES, value.density)) return bad("density is not supported.");
  if (!oneOf(LP_POTENTIAL_HERO_STRATEGIES, value.heroStrategy)) return bad("heroStrategy is not supported.");
  return [];
}

function validatePrediction(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "qualityPrediction", message: `LP quality prediction is invalid: ${message}` }];
  if (!isObject(value)) return bad("a prediction is required.");
  if (!oneOf(LP_POTENTIAL_DENSITY_LABELS, value.informationDensity) || !oneOf(LP_POTENTIAL_DENSITY_LABELS, value.visualDensity)) {
    return bad("informationDensity and visualDensity need a supported label.");
  }
  if (!oneOf(LP_POTENTIAL_READINESS_LABELS, value.conversionReadiness) || !oneOf(LP_POTENTIAL_READINESS_LABELS, value.croReadiness)) {
    return bad("conversionReadiness and croReadiness need a supported label.");
  }
  return [];
}

function validateEvidence(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "evidence", message: `Evidence result is invalid: ${message}` }];
  if (!isObject(value)) return bad("a result is required.");
  if (!oneOf(SIGNAL_RESULT_STATUSES, value.status)) return bad("status is not supported.");
  if (value.confidence !== null && !(typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1)) {
    return bad("confidence must be null or a number from 0 to 1.");
  }
  const lists = [value.availableDimensions, value.missingDimensions];
  if (lists.some((list) => !Array.isArray(list) || list.some((dimension) => !oneOf(EVIDENCE_DIMENSIONS, dimension)))) {
    return bad("availableDimensions and missingDimensions must be lists of supported dimensions.");
  }
  const available = new Set(value.availableDimensions as unknown[]);
  if ((value.missingDimensions as unknown[]).some((dimension) => available.has(dimension))) {
    return bad("a dimension cannot be both available and missing.");
  }
  return [];
}

function validateOverrides(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "manualOverrides", message: `Manual overrides are invalid: ${message}` }];
  if (!Array.isArray(value)) return bad("a list of effective values is required.");
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isObject(entry) || !oneOf(LP_POTENTIAL_OVERRIDE_FIELDS, entry.field)) return bad("an entry has an unsupported field.");
    const field = String(entry.field);
    if (entry.value === undefined) return bad(`"${field}" has no effective value.`);
    if (seen.has(field)) return bad(`"${field}" is repeated.`);
    seen.add(field);
  }
  return [];
}

function validateMetadata(value: unknown): OpportunityIssue[] {
  const ok =
    isObject(value) &&
    Object.entries(value).every(
      ([key, v]) =>
        key.trim() !== "" &&
        (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))),
    );
  return ok ? [] : [{ field: "metadata", message: "Metadata is invalid: a flat object of strings, numbers, booleans, or null with non-empty keys is required." }];
}

/** Validates a supplied Evidence Signal result on its own. */
export function validateLandingPageEvidence(value: unknown): OpportunityIssue[] {
  return validateEvidence(value);
}

/** Absent and null optional inputs are skipped; anything else supplied must be valid. */
export function validateLandingPagePotentialInputs(input: unknown): OpportunityIssue[] {
  if (!isObject(input)) return [{ field: "inputs", message: "Landing page potential inputs are missing." }];
  const issues = [...validateFacts(input.facts), ...validateCompleteness(input.completeness), ...validatePlan(input.presentationPlan)];
  const present = (key: string) => input[key] !== undefined && input[key] !== null;
  if (present("qualityPrediction")) issues.push(...validatePrediction(input.qualityPrediction));
  if (present("evidence")) issues.push(...validateEvidence(input.evidence));
  if (present("manualOverrides")) issues.push(...validateOverrides(input.manualOverrides));
  if (present("metadata")) issues.push(...validateMetadata(input.metadata));
  return issues;
}
