/**
 * Evidence Signal: input validator.
 *
 * Rejects a missing or malformed ProductFacts, and any supplied completeness
 * report, research report, presentation plan, boundary classification, or
 * metadata that is not valid. It reports problems and never changes its input.
 *
 * The id lists below mirror the platform's own enums. Only type imports reach
 * the platform, so the lists are typed against them and a test compares them
 * with the runtime values.
 */
import type { CompletenessSectionId, SectionStatus } from "@/lib/completeness-engine";
import type { BoundaryClass, BoundaryConfidence } from "@/lib/content-boundary";
import type { MarketResearchStatus, MarketResearchQuality } from "@/lib/market-research/types";
import type { PlanSection } from "@/lib/presentation-plan";
import type { FactConfidence, FactField } from "@/lib/product-facts";
import type { OpportunityIssue } from "./opportunity-validator";

export const EVIDENCE_FACT_CONFIDENCES: readonly FactConfidence[] = [
  "DIRECT_SOURCE",
  "HEURISTIC_EXTRACTION",
  "AI_SOURCE_CLASSIFICATION",
  "MANUAL",
  "NOT_FOUND",
];

export const EVIDENCE_FACT_FIELDS: readonly FactField[] = [
  "productName",
  "description",
  "features",
  "ingredientsOrComponents",
  "usageInformation",
  "cautions",
  "pricingInformation",
  "guaranteeInformation",
  "manufacturer",
];

export const EVIDENCE_COMPLETENESS_SECTIONS: readonly CompletenessSectionId[] = [
  "identity",
  "description",
  "hero",
  "ingredients",
  "features",
  "usage",
  "warnings",
  "guarantee",
  "pricing",
  "returns",
  "shipping",
  "manufacturer",
  "faq",
  "images",
  "visualAssets",
];

const SECTION_STATUSES: readonly SectionStatus[] = ["COMPLETE", "PARTIAL", "MISSING"];

export const EVIDENCE_PLAN_SECTIONS: readonly PlanSection[] = [
  "hero",
  "description",
  "features",
  "ingredients",
  "usage",
  "pricing",
  "guarantee",
  "warnings",
  "manufacturer",
  "faq",
  "closing",
];

export const EVIDENCE_BOUNDARY_CLASSES: readonly BoundaryClass[] = [
  "PAGE_STRUCTURE",
  "PRIMARY_NAVIGATION",
  "SECONDARY_NAVIGATION",
  "FOOTER",
  "HEADER",
  "SIDEBAR",
  "COOKIE",
  "UTILITY",
  "LEGAL",
  "BREADCRUMB",
  "PRODUCT_CONTENT",
  "PRODUCT_DESCRIPTION",
  "INGREDIENT",
  "FEATURE",
  "FAQ",
  "USAGE",
  "WARNING",
  "GUARANTEE",
  "PRICING",
  "RETURN_POLICY",
  "SHIPPING",
  "MANUFACTURER",
  "COMPARISON_TABLE",
  "COMPARISON_HEADER",
  "COMPARISON_ROW_LABEL",
  "COMPARISON_VALUE",
  "DECORATIVE_CELL",
];

const BOUNDARY_CONFIDENCES: readonly BoundaryConfidence[] = ["HIGH", "MEDIUM", "LOW"];
const RESEARCH_STATUSES: readonly MarketResearchStatus[] = ["FRESH", "STALE", "UNAVAILABLE"];
const RESEARCH_QUALITIES: readonly MarketResearchQuality[] = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"];

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isProvenance = (value: unknown): boolean => (EVIDENCE_FACT_CONFIDENCES as readonly unknown[]).includes(value);

function validateFacts(facts: unknown): OpportunityIssue[] {
  if (!isObject(facts)) return [{ field: "facts", message: "ProductFacts is required." }];
  const issues: OpportunityIssue[] = [];
  const bad = (message: string) => issues.push({ field: "facts", message: `ProductFacts is invalid: ${message}` });

  if (!isText(facts.productName)) bad("productName must be text.");
  for (const list of ["features", "ingredientsOrComponents", "usageInformation", "cautions", "importWarnings"] as const) {
    if (!isTextList(facts[list])) bad(`${list} must be a list of text.`);
  }
  for (const scalar of ["description", "pricingInformation", "guaranteeInformation", "manufacturer"] as const) {
    if (facts[scalar] !== undefined && !isText(facts[scalar])) bad(`${scalar} must be text when present.`);
  }

  if (!isObject(facts.confidence)) {
    bad("confidence is required.");
  } else {
    for (const field of EVIDENCE_FACT_FIELDS) {
      if (!isProvenance((facts.confidence as Obj)[field])) bad(`confidence.${field} is not a supported provenance.`);
    }
  }

  if (!Array.isArray(facts.sourceSnippets)) {
    bad("sourceSnippets must be a list.");
  } else if (
    facts.sourceSnippets.some(
      (s) => !isObject(s) || !isText(s.field) || !isText(s.text) || !isText(s.sourceUrl) || !isProvenance(s.confidence),
    )
  ) {
    bad("every source snippet needs field, text, sourceUrl, and a supported provenance.");
  }

  for (const list of ["returnsInformation", "shippingInformation", "ingredientContext"] as const) {
    const value = facts[list];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((i) => !isObject(i) || !isText(i.statement) || !isProvenance(i.provenance))) {
      bad(`${list} entries need a statement and a supported provenance.`);
    }
  }
  if (facts.productFormat !== undefined) {
    const f = facts.productFormat;
    if (!isObject(f) || !isText(f.statement) || !isProvenance(f.provenance)) bad("productFormat needs a statement and a supported provenance.");
  }
  if (facts.offerFacts !== undefined) {
    if (!Array.isArray(facts.offerFacts) || facts.offerFacts.some((o) => !isObject(o) || !isText(o.sourceUrl))) {
      bad("offerFacts entries need a sourceUrl.");
    }
  }
  return issues;
}

function validateCompleteness(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "completeness", message: `Completeness is invalid: ${message}` }];
  if (!isObject(value) || !Array.isArray(value.sections)) return bad("a report with a sections list is required.");
  const seen = new Set<string>();
  for (const section of value.sections) {
    if (!isObject(section) || !(EVIDENCE_COMPLETENESS_SECTIONS as readonly unknown[]).includes(section.id)) {
      return bad("a section has an unsupported id.");
    }
    if (!(SECTION_STATUSES as readonly unknown[]).includes(section.status)) return bad(`section "${String(section.id)}" has an unsupported status.`);
    if (seen.has(section.id as string)) return bad(`section "${String(section.id)}" is repeated.`);
    seen.add(section.id as string);
  }
  return [];
}

function validateResearch(value: unknown): OpportunityIssue[] {
  const bad = (message: string) => [{ field: "research", message: `Research is invalid: ${message}` }];
  if (!isObject(value)) return bad("a report is required.");
  if (!isText(value.productName)) return bad("productName must be text.");
  if (!(RESEARCH_STATUSES as readonly unknown[]).includes(value.status)) return bad("status is not supported.");
  if (!(RESEARCH_QUALITIES as readonly unknown[]).includes(value.quality)) return bad("quality is not supported.");
  if (!Array.isArray(value.sources) || value.sources.some((s) => !isObject(s) || !isText(s.url) || typeof s.usable !== "boolean")) {
    return bad("sources need a url and a usable flag.");
  }
  const usable = isObject(value.diversity) ? value.diversity.USABLE_SOURCES : undefined;
  if (typeof usable !== "number" || !Number.isInteger(usable) || usable < 0) return bad("diversity.USABLE_SOURCES must be a non-negative integer.");
  return [];
}

function validatePlan(value: unknown): OpportunityIssue[] {
  const visibility = isObject(value) ? value.sectionVisibility : undefined;
  if (!isObject(visibility) || EVIDENCE_PLAN_SECTIONS.some((s) => typeof visibility[s] !== "boolean")) {
    return [{ field: "presentationPlan", message: "Presentation plan is invalid: sectionVisibility must cover every section with true or false." }];
  }
  return [];
}

function validateBoundary(value: unknown): OpportunityIssue[] {
  const ok =
    Array.isArray(value) &&
    value.every(
      (s) =>
        isObject(s) &&
        (EVIDENCE_BOUNDARY_CLASSES as readonly unknown[]).includes(s.classification) &&
        (BOUNDARY_CONFIDENCES as readonly unknown[]).includes(s.confidence),
    );
  return ok ? [] : [{ field: "boundary", message: "Boundary classification is invalid: a list of sections with a supported classification and confidence is required." }];
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

/** Absent and null optional inputs are skipped; anything else supplied must be valid. */
export function validateEvidenceInputs(input: unknown): OpportunityIssue[] {
  if (!isObject(input)) return [{ field: "inputs", message: "Evidence inputs are missing." }];
  const issues = validateFacts(input.facts);
  const present = (key: string) => input[key] !== undefined && input[key] !== null;
  if (present("completeness")) issues.push(...validateCompleteness(input.completeness));
  if (present("research")) issues.push(...validateResearch(input.research));
  if (present("presentationPlan")) issues.push(...validatePlan(input.presentationPlan));
  if (present("boundary")) issues.push(...validateBoundary(input.boundary));
  if (present("metadata")) issues.push(...validateMetadata(input.metadata));
  return issues;
}
