/**
 * Host record domain: campaign validator.
 *
 * Pure rules for builder input, named records, the assembled model, and
 * snapshots. It rejects an invalid campaign, a duplicate campaign, missing
 * budget, missing bid strategy, invalid settings, and invalid metadata. It
 * only reports problems: it never builds, stores, or changes what it is given.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "executionPlan",
  "executionContracts",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
  "campaigns",
  "budgets",
  "settings",
  "networks",
  "locations",
  "languages",
  "schedules",
  "bidStrategies",
] as const;
const CONTEXT_RECORDS = ["executionPlan", "decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const CAMPAIGN_FIELDS = ["id", "name", "budgetId", "settingsId", "networkId", "scheduleId", "bidStrategyId"] as const;
const NAMED_CATALOGS = ["budgets", "networks", "locations", "languages", "schedules", "bidStrategies"] as const;
const MODEL_FIELDS = [
  "id",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "campaigns",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;
const SNAPSHOT_FIELDS = [
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "campaignIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsCampaignValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateCampaign(input: unknown): GoogleAdsIssue[];
  validateSettings(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateModel(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
  validateGraph(campaignIds: readonly string[]): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** A plain object whose values are strings, finite numbers, booleans, or null, under non-empty keys. */
export function isFlatGoogleAdsMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function validateIdHolderList(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Invalid Campaign: ${field} must be a list of id holders.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    const id = idOf(item);
    if (id === null) {
      issues.push({ field: path, message: `Invalid Campaign: "${field}" must carry a non-empty id.` });
    } else if (seen.has(id)) {
      issues.push({ field: `${path}.id`, message: `Invalid Campaign: "${id}" is already listed.` });
    } else {
      seen.add(id);
    }
  });
  return issues;
}

function validateNamedCatalog(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Invalid Campaign: ${field} must be a list.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: `Invalid Campaign: a ${field.slice(0, -1)} must be an object.` });
      return;
    }
    if (typeof item.id !== "string" || !RECORD_ID.test(item.id)) {
      issues.push({ field: `${path}.id`, message: "Invalid Campaign: a well-formed record id is required." });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `Invalid Campaign: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    if (typeof item.name !== "string" || item.name.trim() === "") {
      issues.push({ field: `${path}.name`, message: "Invalid Campaign: a non-empty record name is required." });
    }
    if (item.metadata !== undefined && !isFlatGoogleAdsMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

export function createGoogleAdsCampaignValidator(): GoogleAdsCampaignValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateGraph(campaignIds: readonly string[]): GoogleAdsIssue[] {
    const issues: GoogleAdsIssue[] = [];
    const seen = new Set<string>();
    for (const id of campaignIds) {
      if (seen.has(id)) issues.push({ field: "campaigns", message: `Duplicate Campaign: "${id}" is already listed.` });
      seen.add(id);
    }
    return issues;
  }

  function validateCampaign(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "campaign", message: "Invalid Campaign: a campaign record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of CAMPAIGN_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Campaign: member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Campaign: a well-formed campaign id is required." });
    }
    if (typeof input.name !== "string" || input.name.trim() === "") {
      issues.push({ field: "name", message: "Invalid Campaign: a non-empty campaign name is required." });
    }
    for (const field of ["budgetId", "settingsId", "networkId", "scheduleId", "bidStrategyId"] as const) {
      if (input[field] !== undefined && (typeof input[field] !== "string" || !RECORD_ID.test(input[field] as string))) {
        issues.push({ field, message: `Invalid Campaign: a well-formed ${field} is required.` });
      }
    }
    if (input.locationIds !== undefined && (!Array.isArray(input.locationIds) || input.locationIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "locationIds", message: "Invalid Campaign: locationIds must be a list of ids." });
    }
    if (input.languageIds !== undefined && (!Array.isArray(input.languageIds) || input.languageIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "languageIds", message: "Invalid Campaign: languageIds must be a list of ids." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string"))) {
      issues.push({ field: "warnings", message: "Invalid Campaign: warnings must be a list of text." });
    }
    return issues;
  }

  function validateSettings(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "settings", message: "Invalid Settings: a settings record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Settings: a well-formed settings id is required." });
    }
    if (typeof input.campaignId !== "string" || input.campaignId.trim() === "") {
      issues.push({ field: "campaignId", message: "Invalid Settings: a campaign id is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "campaign", message: "Invalid Campaign: an object of campaign records and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Campaign: unexpected member "${key}".` });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Invalid Campaign: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Invalid Campaign: "${key}" must carry a non-empty id.` });
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      if (!isFlatGoogleAdsMetadata(value)) {
        issues.push({ field: key, message: `Invalid Metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
      }
    }
    issues.push(...validateIdHolderList(input.executionContracts, "executionContracts"));
    if (!("campaigns" in input)) issues.push({ field: "campaigns", message: "Invalid Campaign: campaigns are required." });
    else if (!Array.isArray(input.campaigns)) issues.push({ field: "campaigns", message: "Invalid Campaign: campaigns must be a list." });
    else {
      const ids: string[] = [];
      input.campaigns.forEach((item, index) => {
        const path = `campaigns[${index}]`;
        const itemIssues = validateCampaign(item);
        for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
        if (isPlainRecord(item) && typeof item.id === "string") ids.push(item.id);
      });
      issues.push(...validateGraph(ids));
    }
    if (input.settings === undefined) {
      /* settings may be omitted when no campaign names a settings id */
    } else if (!Array.isArray(input.settings)) {
      issues.push({ field: "settings", message: "Invalid Settings: settings must be a list." });
    } else {
      const seen = new Set<string>();
      input.settings.forEach((item, index) => {
        const path = `settings[${index}]`;
        const itemIssues = validateSettings(item);
        for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
        if (isPlainRecord(item) && typeof item.id === "string") {
          if (seen.has(item.id)) issues.push({ field: `${path}.id`, message: `Invalid Settings: "${item.id}" is already listed.` });
          seen.add(item.id);
        }
      });
    }
    for (const field of NAMED_CATALOGS) issues.push(...validateNamedCatalog(input[field], field));
    return issues;
  }

  function validateNullableId(value: unknown, field: string): GoogleAdsIssue[] {
    if (value !== null && (typeof value !== "string" || value.trim() === "")) {
      return [{ field, message: `Invalid Campaign: ${field} must be a non-empty id or null.` }];
    }
    return [];
  }

  function validateModel(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "model", message: "Invalid Campaign: a campaign model is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of MODEL_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Campaign: model member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Campaign: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Invalid Campaign: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.campaigns)) issues.push({ field: "campaigns", message: "Invalid Campaign: campaigns must be a list." });
    else {
      const ids = input.campaigns.map((item) => (isPlainRecord(item) && typeof item.id === "string" ? item.id : ""));
      issues.push(...validateGraph(ids));
      input.campaigns.forEach((item, index) => {
        const path = `campaigns[${index}]`;
        if (!isPlainRecord(item)) {
          issues.push({ field: path, message: "Invalid Campaign: a built campaign must be an object." });
          return;
        }
        if (!isPlainRecord(item.budget) || typeof item.budget.id !== "string") {
          issues.push({ field: `${path}.budget`, message: "Missing Budget: a budget record is required." });
        }
        if (!isPlainRecord(item.bidStrategy) || typeof item.bidStrategy.id !== "string") {
          issues.push({ field: `${path}.bidStrategy`, message: "Missing Bid Strategy: a bid strategy record is required." });
        }
        if (!isPlainRecord(item.settings) || typeof item.settings.id !== "string") {
          issues.push({ field: `${path}.settings`, message: "Invalid Settings: a settings record is required." });
        }
        if (!isPlainRecord(item.network) || typeof item.network.id !== "string") {
          issues.push({ field: `${path}.network`, message: "Invalid Campaign: a network record is required." });
        }
        if (!isPlainRecord(item.schedule) || typeof item.schedule.id !== "string") {
          issues.push({ field: `${path}.schedule`, message: "Invalid Campaign: a schedule record is required." });
        }
        if (!Array.isArray(item.locations) || !Array.isArray(item.languages)) {
          issues.push({ field: path, message: "Invalid Campaign: locations and languages must be lists." });
        }
        if (item.metadata !== undefined && !isFlatGoogleAdsMetadata(item.metadata)) {
          issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
      });
    }
    if (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string")) {
      issues.push({ field: "warnings", message: "Invalid Campaign: warnings must be a list of text." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.executionTime !== "number" || !Number.isFinite(input.executionTime) || input.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Invalid Campaign: executionTime must be a finite number of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Campaign: createdAt must be an ISO-8601 instant in UTC." });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Campaign: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of SNAPSHOT_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Campaign: snapshot member "${field}" is missing.` });
    }
    if (typeof input.campaignModelId !== "string" || !RECORD_ID.test(input.campaignModelId)) {
      issues.push({ field: "campaignModelId", message: "Invalid Campaign: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Invalid Campaign: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.campaignIds) || input.campaignIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "campaignIds", message: "Invalid Campaign: campaignIds must be a list of ids." });
    } else {
      issues.push(...validateGraph(input.campaignIds as string[]));
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Campaign: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateCampaign,
    validateSettings,
    validateMetadata,
    validateModel,
    validateSnapshot,
    validateGraph,
  };
}
