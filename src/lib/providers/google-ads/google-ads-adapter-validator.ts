/**
 * Host record domain: adapter validator.
 *
 * Pure local rules for adapter input, mapped records, the assembled payload,
 * and snapshots. It rejects an invalid mapping, missing required fields, an
 * unsupported capability, duplicate resources, and invalid metadata. It only
 * reports problems: it never sends a request or changes what it is given.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import { GOOGLE_ADS_ADAPTER_CAPABILITIES, GOOGLE_ADS_REQUEST_PAYLOAD_KEYS, type GoogleAdsMappedRequests } from "./google-ads-adapter-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "campaignModel",
  "adGroupModel",
  "responsiveSearchAds",
  "executionPlan",
  "executionContracts",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_RECORDS = ["executionPlan"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
export interface GoogleAdsValidationAdapter {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateCapabilities(input: unknown): GoogleAdsIssue[];
  validateMapping(input: unknown): GoogleAdsIssue[];
  validatePayload(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsAdapterMetadata(value: unknown): value is GoogleAdsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function capabilityTokens(configuration: unknown): string[] {
  if (!isPlainRecord(configuration)) return [];
  const tokens: string[] = [];
  if (typeof configuration.capability === "string") tokens.push(configuration.capability);
  if (typeof configuration.capabilities === "string") {
    tokens.push(...configuration.capabilities.split(",").map((item) => item.trim()).filter(Boolean));
  }
  return tokens;
}

export function createGoogleAdsValidationAdapter(): GoogleAdsValidationAdapter {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsAdapterMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateCapabilities(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsIssue[] = [];
    const tokens = capabilityTokens(input.configuration);
    for (const token of tokens) {
      if (!(GOOGLE_ADS_ADAPTER_CAPABILITIES as readonly string[]).includes(token)) {
        issues.push({ field: "configuration.capability", message: `Unsupported Capability: "${token}" is not supported.` });
      }
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "adapter", message: "Invalid Mapping: an object of models and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Mapping: unexpected member "${key}".` });
      }
    }
    if (!("campaignModel" in input) || input.campaignModel === null || !isPlainRecord(input.campaignModel)) {
      issues.push({ field: "campaignModel", message: "Invalid Mapping: a campaign model is required." });
    } else if (idOf(input.campaignModel) === null) {
      issues.push({ field: "campaignModel.id", message: "Invalid Mapping: a campaign model id is required." });
    } else if ("campaigns" in input.campaignModel && !Array.isArray(input.campaignModel.campaigns)) {
      issues.push({ field: "campaigns", message: "Invalid Mapping: campaigns must be a list." });
    }
    if (input.adGroupModel !== undefined && input.adGroupModel !== null) {
      if (!isPlainRecord(input.adGroupModel) || idOf(input.adGroupModel) === null) {
        issues.push({ field: "adGroupModel", message: "Invalid Mapping: adGroupModel must be an id holder." });
      }
    }
    if (input.responsiveSearchAds !== undefined && input.responsiveSearchAds !== null) {
      if (!Array.isArray(input.responsiveSearchAds) && !isPlainRecord(input.responsiveSearchAds)) {
        issues.push({ field: "responsiveSearchAds", message: "Invalid Mapping: responsiveSearchAds must be a list or a model." });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value) || idOf(value) === null) {
        issues.push({ field: key, message: `Invalid Mapping: "${key}" must be an id holder.` });
      }
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      issues.push(...validateMetadata(value).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    if (input.executionContracts !== undefined && !Array.isArray(input.executionContracts)) {
      issues.push({ field: "executionContracts", message: "Missing Required Fields: executionContracts must be a list of id holders." });
    }
    issues.push(...validateCapabilities(input));
    return issues;
  }

  function duplicateIds(ids: readonly string[], field: string): GoogleAdsIssue[] {
    const issues: GoogleAdsIssue[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (seen.has(id)) issues.push({ field, message: `Duplicate Resources: "${id}" is already listed.` });
      seen.add(id);
    }
    return issues;
  }

  function validateMapping(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "mapping", message: "Invalid Mapping: a mapped request set is required." }];
    const mapping = input as Partial<GoogleAdsMappedRequests>;
    const issues: GoogleAdsIssue[] = [];
    const lists: Array<[unknown, string]> = [
      [mapping.campaignRequests, "campaignRequests"],
      [mapping.campaignBudgetRequests, "campaignBudgetRequests"],
      [mapping.campaignSettingsRequests, "campaignSettingsRequests"],
      [mapping.adGroupRequests, "adGroupRequests"],
      [mapping.keywordRequests, "keywordRequests"],
      [mapping.responsiveSearchAdRequests, "responsiveSearchAdRequests"],
      [mapping.trackingRequests, "trackingRequests"],
    ];
    for (const [list, field] of lists) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        issues.push({ field, message: `Invalid Mapping: ${field} must be a list.` });
        continue;
      }
      const ids = list.map((item) => idOf(item) ?? "");
      issues.push(...duplicateIds(ids, field));
      list.forEach((item, index) => {
        if (!isPlainRecord(item)) {
          issues.push({ field: `${field}[${index}]`, message: "Invalid Mapping: a request record must be an object." });
          return;
        }
        if (idOf(item) === null) {
          issues.push({ field: `${field}[${index}].id`, message: "Invalid Mapping: a request id is required." });
        }
        if (item.resource === "campaign" || item.resource === "adGroup" || item.resource === "campaignBudget") {
          if (typeof item.name !== "string" || item.name.trim() === "") {
            issues.push({ field: `${field}[${index}].name`, message: "Missing Required Fields: a request name is required." });
          }
        }
        if (item.metadata !== undefined && !isFlatGoogleAdsAdapterMetadata(item.metadata)) {
          issues.push({ field: `${field}[${index}].metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
      });
    }
    return issues;
  }

  function validatePayload(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "payload", message: "Invalid Mapping: a request payload is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_REQUEST_PAYLOAD_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Missing Required Fields: payload member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Required Fields: a well-formed payload id is required." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.executionTime !== "number" || !Number.isFinite(input.executionTime) || input.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Missing Required Fields: executionTime must be a finite number of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Missing Required Fields: createdAt must be an ISO-8601 instant in UTC." });
    }
    const mappingIssues = validateMapping({
      campaignRequests: input.campaignRequests,
      campaignBudgetRequests: input.campaignBudgetRequests,
      campaignSettingsRequests: input.campaignSettingsRequests,
      adGroupRequests: input.adGroupRequests,
      keywordRequests: input.keywordRequests,
      responsiveSearchAdRequests: input.responsiveSearchAdRequests,
      trackingRequests: input.trackingRequests,
    });
    issues.push(...mappingIssues);
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Mapping: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.payloadId !== "string" || !RECORD_ID.test(input.payloadId)) {
      issues.push({ field: "payloadId", message: "Missing Required Fields: a well-formed payload id is required." });
    }
    if (!Array.isArray(input.resourceIds) || input.resourceIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "resourceIds", message: "Missing Required Fields: resourceIds must be a list of ids." });
    } else {
      issues.push(...duplicateIds(input.resourceIds as string[], "resourceIds"));
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateCapabilities,
    validateMapping,
    validatePayload,
    validateSnapshot,
    validateMetadata,
  };
}
