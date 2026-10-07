/**
 * Host record domain: product batch validator.
 *
 * Checks the batch envelope. A bad envelope is rejected before any product
 * runs. One bad product is not decided here. It does not fetch a page and
 * it does not approve a product.
 */
import { BATCH_CONTEXT_MEMBERS, BATCH_SOURCES } from "./batch-context";
import { BATCH_SNAPSHOT_KEYS, type BatchIssue, type BatchMetadata } from "./batch-snapshot";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface BatchValidator {
  validateInput(input: unknown): BatchIssue[];
  validateSnapshot(input: unknown): BatchIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

function isFlat(value: unknown): value is BatchMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

export function createBatchValidator(): BatchValidator {
  function validateMetadata(input: unknown, field: string): BatchIssue[] {
    if (input === undefined) return [];
    if (!isFlat(input)) {
      return [{ field, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateInput(input: unknown): BatchIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "products", message: "Missing Product List: a product list, marketplace feed, or product URL list is required." }];
    }
    const issues: BatchIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(BATCH_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    for (const key of METADATA_FIELDS) issues.push(...validateMetadata(input[key], key));
    let count = 0;
    for (const source of BATCH_SOURCES) {
      const value = input[source];
      if (value === undefined) continue;
      if (!Array.isArray(value)) {
        issues.push({ field: source, message: `Invalid Metadata: "${source}" must be a list.` });
        continue;
      }
      count += value.length;
    }
    if (!BATCH_SOURCES.some((source) => input[source] !== undefined)) {
      issues.push({ field: "products", message: "Missing Product List: a product list, marketplace feed, or product URL list is required." });
    } else if (count === 0 && issues.length === 0) {
      issues.push({ field: "products", message: "Missing Product List: at least one product is required." });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): BatchIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: BatchIssue[] = [];
    for (const field of BATCH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.batchId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.batchId)) {
      issues.push({ field: "batchId", message: "Invalid Metadata: a well-formed batch id is required." });
    }
    if (typeof input.productCount !== "number" || !Number.isInteger(input.productCount) || input.productCount < 0) {
      issues.push({ field: "productCount", message: "Invalid Metadata: productCount must be an integer of 0 or more." });
    }
    if (typeof input.rankedCount !== "number" || !Number.isInteger(input.rankedCount) || input.rankedCount < 0) {
      issues.push({ field: "rankedCount", message: "Invalid Metadata: rankedCount must be an integer of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata, "metadata"));
    return issues;
  }

  return { validateInput, validateSnapshot };
}
