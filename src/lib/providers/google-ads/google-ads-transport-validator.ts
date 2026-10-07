/**
 * Host record domain: transport validator.
 *
 * Pure local rules for an offline transport input, a request model, a prepared
 * request, a prepared response, and snapshots. It rejects a malformed request,
 * an invalid payload, an unsupported version, invalid metadata, and transport
 * configuration errors. It only reports problems: it never sends a record or
 * changes what it is given. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  GOOGLE_ADS_PREPARED_REQUEST_KEYS,
  GOOGLE_ADS_PREPARED_RESPONSE_KEYS,
  GOOGLE_ADS_TRANSPORT_MODES,
  GOOGLE_ADS_TRANSPORT_REQUEST_LISTS,
  GOOGLE_ADS_TRANSPORT_REQUEST_MODEL_KEYS,
  GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS,
  GOOGLE_ADS_TRANSPORT_VERSIONS,
} from "./google-ads-transport-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = ["requestModel", "executionMetadata", "runtimeMetadata", "configuration"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const BLOCKED_CONFIGURATION_KEYS = ["send", "live", "online"] as const;

export interface GoogleAdsTransportValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateRequest(input: unknown): GoogleAdsIssue[];
  validatePayload(input: unknown): GoogleAdsIssue[];
  validateResponse(input: unknown): GoogleAdsIssue[];
  validateVersion(input: unknown): GoogleAdsIssue[];
  validateConfiguration(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
  validatePreparedRequest(input: unknown): GoogleAdsIssue[];
  validatePreparedResponse(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsTransportMetadata(value: unknown): value is GoogleAdsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

export function createGoogleAdsTransportValidator(): GoogleAdsTransportValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsTransportMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateVersion(input: unknown): GoogleAdsIssue[] {
    if (input === undefined || input === null || input === "") return [];
    if (typeof input !== "string" || !(GOOGLE_ADS_TRANSPORT_VERSIONS as readonly string[]).includes(input)) {
      return [{ field: "configuration.version", message: `Unsupported Version: "${String(input)}" is not supported.` }];
    }
    return [];
  }

  function validateConfiguration(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isPlainRecord(input)) {
      return [{ field: "configuration", message: "Transport Configuration Errors: configuration must be a flat record." }];
    }
    const issues: GoogleAdsIssue[] = [];
    issues.push(...validateMetadata(input).map((item) => ({ field: "configuration", message: item.message })));
    if (typeof input.mode === "string" && !(GOOGLE_ADS_TRANSPORT_MODES as readonly string[]).includes(input.mode)) {
      issues.push({ field: "configuration.mode", message: `Transport Configuration Errors: mode "${input.mode}" is not allowed.` });
    } else if (input.mode !== undefined && typeof input.mode !== "string") {
      issues.push({ field: "configuration.mode", message: "Transport Configuration Errors: mode must be a text token." });
    }
    for (const key of BLOCKED_CONFIGURATION_KEYS) {
      if (input[key] === true || input[key] === key) {
        issues.push({ field: `configuration.${key}`, message: `Transport Configuration Errors: "${key}" is not allowed while the layer stays offline.` });
      }
    }
    if ("version" in input) issues.push(...validateVersion(input.version));
    return issues;
  }

  function validatePayload(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "requestModel", message: "Invalid Payload: a request model is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_TRANSPORT_REQUEST_MODEL_KEYS) {
      if (input[field] === undefined) {
        issues.push({ field, message: `Invalid Payload: request model member "${field}" is missing.` });
      }
    }
    for (const field of GOOGLE_ADS_TRANSPORT_REQUEST_LISTS) {
      const list = input[field];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        issues.push({ field, message: `Invalid Payload: ${field} must be a list.` });
        continue;
      }
      list.forEach((item, index) => {
        if (!isPlainRecord(item)) {
          issues.push({ field: `${field}[${index}]`, message: "Invalid Payload: a request record must be an object." });
          return;
        }
        if (idOf(item) === null) {
          issues.push({ field: `${field}[${index}].id`, message: "Invalid Payload: a request record id is required." });
        }
        if (item.metadata !== undefined && !isFlatGoogleAdsTransportMetadata(item.metadata)) {
          issues.push({ field: `${field}[${index}].metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
      });
    }
    if (input.metadata !== undefined) issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validateRequest(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "requestModel", message: "Malformed Request: a request model object is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "requestModel.id", message: "Malformed Request: a well-formed request model id is required." });
    }
    issues.push(...validatePayload(input));
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "transport", message: "Malformed Request: an object of a request model and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Malformed Request: unexpected member "${key}".` });
      }
    }
    if (!("requestModel" in input) || input.requestModel === null) {
      issues.push({ field: "requestModel", message: "Malformed Request: a request model is required." });
    } else {
      issues.push(...validateRequest(input.requestModel));
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      issues.push(...validateMetadata(value).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    if (input.configuration !== undefined) issues.push(...validateConfiguration(input.configuration));
    return issues;
  }

  function validatePreparedRequest(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "preparedRequest", message: "Malformed Request: a prepared request is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_PREPARED_REQUEST_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Payload: prepared request member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Malformed Request: a well-formed prepared request id is required." });
    }
    if (input.mode !== "OFFLINE") {
      issues.push({ field: "mode", message: "Transport Configuration Errors: a prepared request must stay offline." });
    }
    if (typeof input.version === "string") issues.push(...validateVersion(input.version));
    if (!isPlainRecord(input.body)) issues.push({ field: "body", message: "Invalid Payload: a prepared request body must be an object." });
    if (typeof input.text !== "string") issues.push({ field: "text", message: "Invalid Payload: a prepared request text must be a string." });
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Payload: createdAt must be an ISO-8601 instant in UTC." });
    }
    return issues;
  }

  function validateResponse(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "response", message: "Invalid Payload: a response record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.status === "string" && input.status !== "OFFLINE") {
      issues.push({ field: "status", message: "Transport Configuration Errors: a response must stay offline." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validatePreparedResponse(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "preparedResponse", message: "Invalid Payload: a prepared response is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_PREPARED_RESPONSE_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Payload: prepared response member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Payload: a well-formed prepared response id is required." });
    }
    if (input.mode !== "OFFLINE" || input.status !== "OFFLINE") {
      issues.push({ field: "mode", message: "Transport Configuration Errors: a prepared response must stay offline." });
    }
    if (typeof input.version === "string") issues.push(...validateVersion(input.version));
    if (!isPlainRecord(input.body)) issues.push({ field: "body", message: "Invalid Payload: a prepared response body must be an object." });
    if (typeof input.text !== "string") issues.push({ field: "text", message: "Invalid Payload: a prepared response text must be a string." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Payload: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Payload: snapshot member "${field}" is missing.` });
    }
    if (typeof input.transportId !== "string" || !RECORD_ID.test(input.transportId)) {
      issues.push({ field: "transportId", message: "Invalid Payload: a well-formed transport id is required." });
    }
    if (input.mode !== "OFFLINE") {
      issues.push({ field: "mode", message: "Transport Configuration Errors: a snapshot must stay offline." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateRequest,
    validatePayload,
    validateResponse,
    validateVersion,
    validateConfiguration,
    validateMetadata,
    validateSnapshot,
    validatePreparedRequest,
    validatePreparedResponse,
  };
}
