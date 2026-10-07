/**
 * Host record domain: ad group validator.
 *
 * Pure rules for builder input, named records, the assembled model, and
 * snapshots. It rejects a duplicate ad group, a duplicate keyword, a missing
 * name, an invalid bid strategy, and invalid metadata. It only reports
 * problems: it never builds, stores, or changes what it is given.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "campaignModel",
  "executionPlan",
  "executionContracts",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
  "adGroups",
  "defaultBids",
  "bidStrategies",
  "targetCpas",
  "targetRoas",
  "keywords",
  "negativeKeywords",
  "audiences",
  "devices",
] as const;
const CONTEXT_RECORDS = ["executionPlan", "decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const AD_GROUP_FIELDS = ["id", "name", "campaignId", "defaultBidId"] as const;
const NAMED_CATALOGS = ["defaultBids", "bidStrategies", "targetCpas", "targetRoas", "audiences", "devices"] as const;
const MODEL_FIELDS = [
  "id",
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "adGroups",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;
const SNAPSHOT_FIELDS = [
  "adGroupModelId",
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "adGroupIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsAdGroupValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateAdGroup(input: unknown): GoogleAdsIssue[];
  validateKeyword(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateModel(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
  validateGraph(adGroupIds: readonly string[]): GoogleAdsIssue[];
  validateKeywordGraph(keywordIds: readonly string[]): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsAdGroupMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function validateIdHolderList(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Duplicate Ad Group: ${field} must be a list of id holders.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    const id = idOf(item);
    if (id === null) {
      issues.push({ field: path, message: `Duplicate Ad Group: "${field}" must carry a non-empty id.` });
    } else if (seen.has(id)) {
      issues.push({ field: `${path}.id`, message: `Duplicate Ad Group: "${id}" is already listed.` });
    } else {
      seen.add(id);
    }
  });
  return issues;
}

function validateNamedCatalog(input: unknown, field: string, invalid: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `${invalid}: ${field} must be a list.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: `${invalid}: a ${field.slice(0, -1)} must be an object.` });
      return;
    }
    if (typeof item.id !== "string" || !RECORD_ID.test(item.id)) {
      issues.push({ field: `${path}.id`, message: `${invalid}: a well-formed record id is required.` });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `${invalid}: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    if (typeof item.name !== "string" || item.name.trim() === "") {
      issues.push({ field: `${path}.name`, message: `${invalid}: a non-empty record name is required.` });
    }
    if (item.metadata !== undefined && !isFlatGoogleAdsAdGroupMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

export function createGoogleAdsAdGroupValidator(): GoogleAdsAdGroupValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsAdGroupMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateGraph(adGroupIds: readonly string[]): GoogleAdsIssue[] {
    const issues: GoogleAdsIssue[] = [];
    const seen = new Set<string>();
    for (const id of adGroupIds) {
      if (seen.has(id)) issues.push({ field: "adGroups", message: `Duplicate Ad Group: "${id}" is already listed.` });
      seen.add(id);
    }
    return issues;
  }

  function validateKeywordGraph(keywordIds: readonly string[]): GoogleAdsIssue[] {
    const issues: GoogleAdsIssue[] = [];
    const seen = new Set<string>();
    for (const id of keywordIds) {
      if (seen.has(id)) issues.push({ field: "keywords", message: `Duplicate Keyword: "${id}" is already listed.` });
      seen.add(id);
    }
    return issues;
  }

  function validateAdGroup(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "adGroup", message: "Duplicate Ad Group: an ad group record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of AD_GROUP_FIELDS) {
      if (input[field] === undefined) {
        if (field === "name") issues.push({ field: "name", message: "Missing Name: an ad group name is required." });
        else issues.push({ field, message: `Duplicate Ad Group: member "${field}" is missing.` });
      }
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Duplicate Ad Group: a well-formed ad group id is required." });
    }
    if (input.name !== undefined && (typeof input.name !== "string" || input.name.trim() === "")) {
      issues.push({ field: "name", message: "Missing Name: an ad group name is required." });
    }
    if (input.campaignId !== undefined && (typeof input.campaignId !== "string" || !RECORD_ID.test(input.campaignId))) {
      issues.push({ field: "campaignId", message: "Duplicate Ad Group: a well-formed campaign id is required." });
    }
    if (input.defaultBidId !== undefined && (typeof input.defaultBidId !== "string" || !RECORD_ID.test(input.defaultBidId))) {
      issues.push({ field: "defaultBidId", message: "Invalid Bid Strategy: a well-formed default bid id is required." });
    }
    for (const field of ["bidStrategyId", "targetCpaId", "targetRoasId"] as const) {
      if (input[field] !== undefined && (typeof input[field] !== "string" || !RECORD_ID.test(input[field] as string))) {
        issues.push({ field, message: "Invalid Bid Strategy: a well-formed bid record id is required." });
      }
    }
    if (input.keywordIds !== undefined && (!Array.isArray(input.keywordIds) || input.keywordIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "keywordIds", message: "Duplicate Keyword: keywordIds must be a list of ids." });
    }
    if (input.negativeKeywordIds !== undefined && (!Array.isArray(input.negativeKeywordIds) || input.negativeKeywordIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "negativeKeywordIds", message: "Duplicate Keyword: negativeKeywordIds must be a list of ids." });
    }
    if (input.audienceIds !== undefined && (!Array.isArray(input.audienceIds) || input.audienceIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "audienceIds", message: "Duplicate Ad Group: audienceIds must be a list of ids." });
    }
    if (input.deviceIds !== undefined && (!Array.isArray(input.deviceIds) || input.deviceIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "deviceIds", message: "Duplicate Ad Group: deviceIds must be a list of ids." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsAdGroupMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string"))) {
      issues.push({ field: "warnings", message: "Duplicate Ad Group: warnings must be a list of text." });
    }
    return issues;
  }

  function validateKeyword(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "keyword", message: "Duplicate Keyword: a keyword record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Duplicate Keyword: a well-formed term id is required." });
    }
    if (typeof input.adGroupId !== "string" || !RECORD_ID.test(input.adGroupId)) {
      issues.push({ field: "adGroupId", message: "Duplicate Keyword: a well-formed ad group id is required." });
    }
    if (typeof input.text !== "string" || input.text.trim() === "") {
      issues.push({ field: "text", message: "Duplicate Keyword: a non-empty term is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsAdGroupMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateNegativeKeyword(input: unknown, path: string): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: path, message: "Duplicate Keyword: a negative keyword record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: `${path}.id`, message: "Duplicate Keyword: a well-formed term id is required." });
    }
    if (typeof input.text !== "string" || input.text.trim() === "") {
      issues.push({ field: `${path}.text`, message: "Duplicate Keyword: a non-empty term is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsAdGroupMetadata(input.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "adGroup", message: "Duplicate Ad Group: an object of ad group records and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Duplicate Ad Group: unexpected member "${key}".` });
      }
    }
    if (!("campaignModel" in input) || input.campaignModel === undefined || input.campaignModel === null) {
      issues.push({ field: "campaignModel", message: "Duplicate Ad Group: a campaign model is required." });
    } else if (!isPlainRecord(input.campaignModel)) {
      issues.push({ field: "campaignModel", message: "Duplicate Ad Group: campaignModel must be an id holder." });
    } else if (idOf(input.campaignModel) === null) {
      issues.push({ field: "campaignModel", message: "Duplicate Ad Group: campaignModel must carry a non-empty id." });
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Duplicate Ad Group: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Duplicate Ad Group: "${key}" must carry a non-empty id.` });
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      if (!isFlatGoogleAdsAdGroupMetadata(value)) {
        issues.push({ field: key, message: `Invalid Metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
      }
    }
    issues.push(...validateIdHolderList(input.executionContracts, "executionContracts"));
    if (!("adGroups" in input)) issues.push({ field: "adGroups", message: "Duplicate Ad Group: ad groups are required." });
    else if (!Array.isArray(input.adGroups)) issues.push({ field: "adGroups", message: "Duplicate Ad Group: adGroups must be a list." });
    else {
      const ids: string[] = [];
      input.adGroups.forEach((item, index) => {
        const path = `adGroups[${index}]`;
        const itemIssues = validateAdGroup(item);
        for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
        if (isPlainRecord(item) && typeof item.id === "string") ids.push(item.id);
        if (isPlainRecord(item) && Array.isArray(item.keywordIds) && item.keywordIds.every((id) => typeof id === "string")) {
          issues.push(...validateKeywordGraph(item.keywordIds as string[]).map((issue) => ({ field: `${path}.${issue.field}`, message: issue.message })));
        }
      });
      issues.push(...validateGraph(ids));
    }
    if (input.keywords !== undefined) {
      if (!Array.isArray(input.keywords)) issues.push({ field: "keywords", message: "Duplicate Keyword: keywords must be a list." });
      else {
        const ids: string[] = [];
        input.keywords.forEach((item, index) => {
          const path = `keywords[${index}]`;
          const itemIssues = validateKeyword(item);
          for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
          if (isPlainRecord(item) && typeof item.id === "string") ids.push(item.id);
        });
        issues.push(...validateKeywordGraph(ids));
      }
    }
    if (input.negativeKeywords !== undefined) {
      if (!Array.isArray(input.negativeKeywords)) issues.push({ field: "negativeKeywords", message: "Duplicate Keyword: negativeKeywords must be a list." });
      else {
        const ids: string[] = [];
        input.negativeKeywords.forEach((item, index) => {
          const path = `negativeKeywords[${index}]`;
          issues.push(...validateNegativeKeyword(item, path));
          if (isPlainRecord(item) && typeof item.id === "string") ids.push(item.id);
        });
        issues.push(...validateKeywordGraph(ids).map((issue) => ({ field: "negativeKeywords", message: issue.message })));
      }
    }
    const bidInvalid = new Set(["defaultBids", "bidStrategies", "targetCpas", "targetRoas"]);
    for (const field of NAMED_CATALOGS) {
      issues.push(...validateNamedCatalog(input[field], field, bidInvalid.has(field) ? "Invalid Bid Strategy" : "Duplicate Ad Group"));
    }
    return issues;
  }

  function validateNullableId(value: unknown, field: string): GoogleAdsIssue[] {
    if (value !== null && (typeof value !== "string" || value.trim() === "")) {
      return [{ field, message: `Duplicate Ad Group: ${field} must be a non-empty id or null.` }];
    }
    return [];
  }

  function validateModel(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "model", message: "Duplicate Ad Group: an ad group model is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of MODEL_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Duplicate Ad Group: model member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Duplicate Ad Group: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.campaignModelId, "campaignModelId"));
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Duplicate Ad Group: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.adGroups)) issues.push({ field: "adGroups", message: "Duplicate Ad Group: adGroups must be a list." });
    else {
      const ids = input.adGroups.map((item) => (isPlainRecord(item) && typeof item.id === "string" ? item.id : ""));
      issues.push(...validateGraph(ids));
      input.adGroups.forEach((item, index) => {
        const path = `adGroups[${index}]`;
        if (!isPlainRecord(item)) {
          issues.push({ field: path, message: "Duplicate Ad Group: a built ad group must be an object." });
          return;
        }
        if (typeof item.name !== "string" || item.name.trim() === "") {
          issues.push({ field: `${path}.name`, message: "Missing Name: an ad group name is required." });
        }
        if (!isPlainRecord(item.defaultBid) || typeof item.defaultBid.id !== "string") {
          issues.push({ field: `${path}.defaultBid`, message: "Invalid Bid Strategy: a default bid record is required." });
        }
        if (!isPlainRecord(item.bidStrategy) || typeof item.bidStrategy.id !== "string") {
          issues.push({ field: `${path}.bidStrategy`, message: "Invalid Bid Strategy: a bid strategy record is required." });
        }
        if (item.targetCpa !== null && (!isPlainRecord(item.targetCpa) || typeof item.targetCpa.id !== "string")) {
          issues.push({ field: `${path}.targetCpa`, message: "Invalid Bid Strategy: target CPA must be a record or null." });
        }
        if (item.targetRoas !== null && (!isPlainRecord(item.targetRoas) || typeof item.targetRoas.id !== "string")) {
          issues.push({ field: `${path}.targetRoas`, message: "Invalid Bid Strategy: target ROAS must be a record or null." });
        }
        if (!Array.isArray(item.keywords) || !Array.isArray(item.negativeKeywords) || !Array.isArray(item.audiences) || !Array.isArray(item.devices)) {
          issues.push({ field: path, message: "Duplicate Ad Group: keywords, negative keywords, audiences, and devices must be lists." });
        } else {
          const keywordIds = item.keywords.map((keyword) => (isPlainRecord(keyword) && typeof keyword.id === "string" ? keyword.id : ""));
          issues.push(...validateKeywordGraph(keywordIds));
        }
        if (item.metadata !== undefined && !isFlatGoogleAdsAdGroupMetadata(item.metadata)) {
          issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
      });
    }
    if (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string")) {
      issues.push({ field: "warnings", message: "Duplicate Ad Group: warnings must be a list of text." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.executionTime !== "number" || !Number.isFinite(input.executionTime) || input.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Duplicate Ad Group: executionTime must be a finite number of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Duplicate Ad Group: createdAt must be an ISO-8601 instant in UTC." });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Duplicate Ad Group: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of SNAPSHOT_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Duplicate Ad Group: snapshot member "${field}" is missing.` });
    }
    if (typeof input.adGroupModelId !== "string" || !RECORD_ID.test(input.adGroupModelId)) {
      issues.push({ field: "adGroupModelId", message: "Duplicate Ad Group: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.campaignModelId, "campaignModelId"));
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Duplicate Ad Group: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.adGroupIds) || input.adGroupIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "adGroupIds", message: "Duplicate Ad Group: adGroupIds must be a list of ids." });
    } else {
      issues.push(...validateGraph(input.adGroupIds as string[]));
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Duplicate Ad Group: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateAdGroup,
    validateKeyword,
    validateMetadata,
    validateModel,
    validateSnapshot,
    validateGraph,
    validateKeywordGraph,
  };
}
