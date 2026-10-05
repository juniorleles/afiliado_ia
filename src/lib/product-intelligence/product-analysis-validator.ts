/**
 * Host record domain: product analysis validator.
 *
 * Checks the input shape, that each module ran once, and that the finished
 * artifacts are frozen. It does not run a module and does not judge a product.
 */
import { PRODUCT_ANALYSIS_CONTEXT_MEMBERS, PRODUCT_ANALYSIS_STAGES, type ProductAnalysis, type ProductAnalysisExecution, type ProductAnalysisIssue, type ProductAnalysisMetadata } from "./product-analysis-snapshot";

export interface ProductAnalysisValidator {
  validateInput(input: unknown): ProductAnalysisIssue[];
  validateExecutions(executions: readonly ProductAnalysisExecution[]): ProductAnalysisIssue[];
  validateArtifacts(analysis: ProductAnalysis): ProductAnalysisIssue[];
}

const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFlat(value: unknown): value is ProductAnalysisMetadata {
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).every(([key, inner]) => key.trim() !== "" && (inner === null || typeof inner === "string" || typeof inner === "boolean" || (typeof inner === "number" && Number.isFinite(inner))));
}

function isFrozenRecord(value: unknown): boolean {
  return isPlainRecord(value) && Object.isFrozen(value);
}

export function createProductAnalysisValidator(): ProductAnalysisValidator {
  function validateInput(input: unknown): ProductAnalysisIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ClickBank product record is required." }];
    }
    const issues: ProductAnalysisIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PRODUCT_ANALYSIS_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    for (const key of ["marketplaceUrl", "marketplaceProductId", "rawHtml", "landingHtml", "searchContext"] as const) {
      if (typeof input[key] !== "string") {
        issues.push({ field: key, message: "Missing ProductFacts: marketplace URL, product id, marketplace HTML, landing HTML, and search context are required." });
      }
    }
    for (const key of METADATA_FIELDS) {
      if (input[key] !== undefined && !isFlat(input[key])) {
        issues.push({ field: key, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
      }
    }
    return issues;
  }

  function validateExecutions(executions: readonly ProductAnalysisExecution[]): ProductAnalysisIssue[] {
    const issues: ProductAnalysisIssue[] = [];
    const seen = new Map<string, number>();
    for (const entry of executions) seen.set(entry.stage, entry.count);
    for (const stage of PRODUCT_ANALYSIS_STAGES) {
      if (seen.get(stage) !== 1) {
        issues.push({ field: stage, message: `Module "${stage}" must execute once.` });
      }
    }
    return issues;
  }

  function validateArtifacts(analysis: ProductAnalysis): ProductAnalysisIssue[] {
    const issues: ProductAnalysisIssue[] = [];
    const fields = ["productFacts", "evidenceGraph", "decisionAnalysis", "workflow", "executionPlan", "googleAdsDraft"] as const;
    for (const field of fields) {
      if (!isFrozenRecord(analysis[field])) {
        issues.push({ field, message: `Immutable ${field}: the finished record must stay frozen.` });
      }
    }
    return issues;
  }

  return { validateInput, validateExecutions, validateArtifacts };
}
