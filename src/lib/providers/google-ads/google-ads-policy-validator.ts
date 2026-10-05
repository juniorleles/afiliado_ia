/**
 * Host record domain: campaign policy validator.
 *
 * Pure local rules for campaign structure, ad groups, responsive search ads,
 * required fields, URLs, tracking templates, duplicate assets, and metadata.
 * It rejects missing required fields, invalid URLs, duplicate assets, invalid
 * metadata, and a corrupted campaign model. It only reports problems: it never
 * builds, stores, submits a record for review, or changes what it is given.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsPolicyArea, GoogleAdsPolicyIssue, GoogleAdsPolicyIssueKind } from "./google-ads-policy-snapshot";
import { GOOGLE_ADS_POLICY_AREAS, GOOGLE_ADS_POLICY_ISSUE_KINDS } from "./google-ads-policy-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
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
const ISSUE_FIELDS = ["id", "kind", "area", "field", "message"] as const;

export interface GoogleAdsCampaignPolicyValidator {
  validateInput(input: unknown): GoogleAdsPolicyIssue[];
  validateCampaignStructure(input: unknown): GoogleAdsPolicyIssue[];
  validateAdGroups(input: unknown): GoogleAdsPolicyIssue[];
  validateResponsiveSearchAds(input: unknown): GoogleAdsPolicyIssue[];
  validateRequiredFields(input: unknown): GoogleAdsPolicyIssue[];
  validateUrls(input: unknown): GoogleAdsPolicyIssue[];
  validateTrackingTemplates(input: unknown): GoogleAdsPolicyIssue[];
  validateDuplicateAssets(input: unknown): GoogleAdsPolicyIssue[];
  validateMetadata(input: unknown): GoogleAdsPolicyIssue[];
  validateIssue(input: unknown): GoogleAdsIssue[];
  validateReport(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsPolicyMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

export function isWellFormedPolicyUrl(value: unknown): boolean {
  return typeof value === "string" && HTTPS.test(value);
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function issue(id: string, kind: GoogleAdsPolicyIssueKind, area: GoogleAdsPolicyArea, field: string, message: string): GoogleAdsPolicyIssue {
  return { id, kind, area, field, message };
}

let issueSerial = 0;
function nextIssueId(prefix: string): string {
  issueSerial += 1;
  return `${prefix}-${issueSerial}`;
}

function resetIssueSerial(): void {
  issueSerial = 0;
}

function campaignsOf(model: unknown): unknown[] {
  if (!isPlainRecord(model) || !Array.isArray(model.campaigns)) return [];
  return model.campaigns;
}

function adGroupsOf(model: unknown): unknown[] {
  if (!isPlainRecord(model) || !Array.isArray(model.adGroups)) return [];
  return model.adGroups;
}

function rsaListOf(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (isPlainRecord(input) && Array.isArray(input.responsiveSearchAds)) return input.responsiveSearchAds;
  return [];
}

function rsaModelOf(input: Record<string, unknown>): unknown {
  return input.responsiveSearchAds;
}

function namedId(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "") return value.id;
  return null;
}

export function createGoogleAdsCampaignPolicyValidator(): GoogleAdsCampaignPolicyValidator {
  function validateMetadataValue(value: unknown, field: string, idPrefix: string): GoogleAdsPolicyIssue[] {
    if (value === undefined) return [];
    if (!isFlatGoogleAdsPolicyMetadata(value)) {
      return [issue(nextIssueId(idPrefix), "ERROR", "metadata", field, "Invalid Metadata: a flat record of text, numbers, booleans, or null is required.")];
    }
    return [];
  }

  function validateCampaignStructure(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input) || !("campaignModel" in input)) {
      return [issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaignModel", "Corrupted Campaign Model: a campaign model is required.")];
    }
    const model = input.campaignModel;
    if (model === null || !isPlainRecord(model)) {
      return [issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaignModel", "Corrupted Campaign Model: campaignModel must be an object.")];
    }
    const issues: GoogleAdsPolicyIssue[] = [];
    if (idOf(model) === null) {
      issues.push(issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaignModel.id", "Corrupted Campaign Model: a campaign model id is required."));
    }
    if (!("campaigns" in model)) {
      issues.push(issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaigns", "Corrupted Campaign Model: campaigns must be listed."));
    } else if (!Array.isArray(model.campaigns)) {
      issues.push(issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaigns", "Corrupted Campaign Model: campaigns must be a list."));
    } else {
      model.campaigns.forEach((item, index) => {
        if (!isPlainRecord(item)) {
          issues.push(issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", `campaigns[${index}]`, "Corrupted Campaign Model: a campaign record must be an object."));
        }
      });
      if (model.campaigns.length === 0) {
        issues.push(issue(nextIssueId("warn"), "WARNING", "campaignStructure", "campaigns", "No campaigns are listed."));
      }
    }
    return issues;
  }

  function validateRequiredFields(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsPolicyIssue[] = [];
    campaignsOf(input.campaignModel).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const path = `campaigns[${index}]`;
      if (typeof item.name !== "string" || item.name.trim() === "") {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.name`, `Missing Required Fields: campaign name is required.`));
      }
      if (namedId(item.budget) === null) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.budget`, "Missing Required Fields: a budget record is required."));
      }
      if (namedId(item.settings) === null) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.settings`, "Missing Required Fields: a settings record is required."));
      }
      if (namedId(item.bidStrategy) === null) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.bidStrategy`, "Missing Required Fields: a bid strategy record is required."));
      }
    });
    adGroupsOf(input.adGroupModel).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const path = `adGroups[${index}]`;
      if (typeof item.name !== "string" || item.name.trim() === "") {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.name`, "Missing Required Fields: an ad group name is required."));
      }
      if (typeof item.campaignId !== "string" || item.campaignId.trim() === "") {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.campaignId`, "Missing Required Fields: an ad group campaign id is required."));
      }
      if (namedId(item.defaultBid) === null) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.defaultBid`, "Missing Required Fields: a default bid record is required."));
      }
    });
    rsaListOf(rsaModelOf(input)).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const path = `responsiveSearchAds[${index}]`;
      if (!Array.isArray(item.headlines) || item.headlines.length === 0) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.headlines`, "Missing Required Fields: at least one headline is required."));
      }
      if (!Array.isArray(item.descriptions) || item.descriptions.length === 0) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.descriptions`, "Missing Required Fields: at least one description is required."));
      }
      if (!isPlainRecord(item.finalUrl) && typeof item.finalUrl !== "string") {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", `${path}.finalUrl`, "Missing Required Fields: a final URL is required."));
      }
    });
    return issues;
  }

  function validateAdGroups(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    if (input.adGroupModel === undefined) {
      return [issue(nextIssueId("info"), "INFORMATION", "adGroups", "adGroupModel", "An ad group model was not given.")];
    }
    if (input.adGroupModel === null || !isPlainRecord(input.adGroupModel)) {
      return [issue(nextIssueId("req"), "ERROR", "adGroups", "adGroupModel", "Missing Required Fields: adGroupModel must be an object.")];
    }
    const issues: GoogleAdsPolicyIssue[] = [];
    if (idOf(input.adGroupModel) === null) {
      issues.push(issue(nextIssueId("req"), "ERROR", "adGroups", "adGroupModel.id", "Missing Required Fields: an ad group model id is required."));
    }
    const campaignIds = new Set(campaignsOf(input.campaignModel).map((item) => idOf(item)).filter((id): id is string => id !== null));
    const groups = adGroupsOf(input.adGroupModel);
    if (!Array.isArray((input.adGroupModel as Record<string, unknown>).adGroups)) {
      issues.push(issue(nextIssueId("req"), "ERROR", "adGroups", "adGroups", "Missing Required Fields: adGroups must be a list."));
      return issues;
    }
    if (groups.length === 0 && campaignIds.size > 0) {
      issues.push(issue(nextIssueId("warn"), "WARNING", "adGroups", "adGroups", "No ad groups are listed."));
    }
    groups.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push(issue(nextIssueId("req"), "ERROR", "adGroups", `adGroups[${index}]`, "Missing Required Fields: an ad group record must be an object."));
        return;
      }
      if (typeof item.campaignId === "string" && campaignIds.size > 0 && !campaignIds.has(item.campaignId)) {
        issues.push(issue(nextIssueId("req"), "ERROR", "adGroups", `adGroups[${index}].campaignId`, `Missing Required Fields: ad group names campaign "${item.campaignId}", which is not listed.`));
      }
    });
    return issues;
  }

  function validateResponsiveSearchAds(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    if (input.responsiveSearchAds === undefined) {
      return [issue(nextIssueId("info"), "INFORMATION", "responsiveSearchAds", "responsiveSearchAds", "A responsive search ad model was not given.")];
    }
    const issues: GoogleAdsPolicyIssue[] = [];
    const model = input.responsiveSearchAds;
    if (!Array.isArray(model) && !isPlainRecord(model)) {
      issues.push(issue(nextIssueId("req"), "ERROR", "responsiveSearchAds", "responsiveSearchAds", "Missing Required Fields: responsiveSearchAds must be a list or a model."));
      return issues;
    }
    const groupIds = new Set(adGroupsOf(input.adGroupModel).map((item) => idOf(item)).filter((id): id is string => id !== null));
    const ads = rsaListOf(model);
    ads.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push(issue(nextIssueId("req"), "ERROR", "responsiveSearchAds", `responsiveSearchAds[${index}]`, "Missing Required Fields: an RSA record must be an object."));
        return;
      }
      if (typeof item.adGroupId === "string" && groupIds.size > 0 && !groupIds.has(item.adGroupId)) {
        issues.push(issue(nextIssueId("req"), "ERROR", "responsiveSearchAds", `responsiveSearchAds[${index}].adGroupId`, `Missing Required Fields: RSA names ad group "${item.adGroupId}", which is not listed.`));
      }
    });
    return issues;
  }

  function validateUrls(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsPolicyIssue[] = [];
    rsaListOf(rsaModelOf(input)).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const raw = isPlainRecord(item.finalUrl) ? item.finalUrl.url : item.finalUrl;
      if (raw === undefined) return;
      if (!isWellFormedPolicyUrl(raw)) {
        issues.push(issue(nextIssueId("url"), "ERROR", "urls", `responsiveSearchAds[${index}].finalUrl`, "Invalid URLs: a well-formed https address is required."));
      }
    });
    return issues;
  }

  function validateTrackingTemplates(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsPolicyIssue[] = [];
    rsaListOf(rsaModelOf(input)).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const tracking = item.trackingTemplate;
      if (tracking === undefined || tracking === null) {
        issues.push(issue(nextIssueId("rec"), "RECOMMENDATION", "trackingTemplates", `responsiveSearchAds[${index}].trackingTemplate`, "A tracking template is not listed."));
        return;
      }
      const text = typeof tracking === "string" ? tracking : isPlainRecord(tracking) ? tracking.text : null;
      if (typeof text !== "string" || text.trim() === "") {
        issues.push(issue(nextIssueId("req"), "ERROR", "trackingTemplates", `responsiveSearchAds[${index}].trackingTemplate`, "Missing Required Fields: a tracking template line is required."));
      }
    });
    return issues;
  }

  function duplicateScan(ids: readonly string[], field: string, prefix: string): GoogleAdsPolicyIssue[] {
    const issues: GoogleAdsPolicyIssue[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (seen.has(id)) issues.push(issue(nextIssueId("dup"), "ERROR", "duplicateAssets", field, `Duplicate Assets: "${id}" is already listed.`));
      seen.add(id);
    }
    void prefix;
    return issues;
  }

  function validateDuplicateAssets(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsPolicyIssue[] = [];
    issues.push(...duplicateScan(campaignsOf(input.campaignModel).map((item) => idOf(item) ?? ""), "campaigns", "campaign"));
    issues.push(...duplicateScan(adGroupsOf(input.adGroupModel).map((item) => idOf(item) ?? ""), "adGroups", "ad group"));
    issues.push(...duplicateScan(rsaListOf(rsaModelOf(input)).map((item) => idOf(item) ?? ""), "responsiveSearchAds", "rsa"));
    rsaListOf(rsaModelOf(input)).forEach((item, index) => {
      if (!isPlainRecord(item)) return;
      const headlines = Array.isArray(item.headlines) ? item.headlines.map((headline) => idOf(headline) ?? "") : [];
      const headlineTexts = Array.isArray(item.headlines)
        ? item.headlines.map((headline) => (isPlainRecord(headline) && typeof headline.text === "string" ? headline.text : ""))
        : [];
      const descriptions = Array.isArray(item.descriptions) ? item.descriptions.map((description) => idOf(description) ?? "") : [];
      const pinned = Array.isArray(item.pinnedAssets) ? item.pinnedAssets.map((asset) => idOf(asset) ?? "") : [];
      issues.push(...duplicateScan(headlines, `responsiveSearchAds[${index}].headlines`, "headline"));
      issues.push(...duplicateScan(headlineTexts, `responsiveSearchAds[${index}].headlines`, "headline"));
      issues.push(...duplicateScan(descriptions, `responsiveSearchAds[${index}].descriptions`, "description"));
      issues.push(...duplicateScan(pinned, `responsiveSearchAds[${index}].pinnedAssets`, "asset"));
    });
    return issues;
  }

  function validateMetadata(input: unknown): GoogleAdsPolicyIssue[] {
    if (!isPlainRecord(input)) return [];
    const issues: GoogleAdsPolicyIssue[] = [];
    for (const key of CONTEXT_METADATA) issues.push(...validateMetadataValue(input[key], key, "meta"));
    if (isPlainRecord(input.campaignModel)) {
      issues.push(...validateMetadataValue(input.campaignModel.metadata, "campaignModel.metadata", "meta"));
      campaignsOf(input.campaignModel).forEach((item, index) => {
        if (isPlainRecord(item)) issues.push(...validateMetadataValue(item.metadata, `campaigns[${index}].metadata`, "meta"));
      });
    }
    if (isPlainRecord(input.adGroupModel)) {
      issues.push(...validateMetadataValue(input.adGroupModel.metadata, "adGroupModel.metadata", "meta"));
      adGroupsOf(input.adGroupModel).forEach((item, index) => {
        if (isPlainRecord(item)) issues.push(...validateMetadataValue(item.metadata, `adGroups[${index}].metadata`, "meta"));
      });
    }
    rsaListOf(rsaModelOf(input)).forEach((item, index) => {
      if (isPlainRecord(item)) issues.push(...validateMetadataValue(item.metadata, `responsiveSearchAds[${index}].metadata`, "meta"));
    });
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsPolicyIssue[] {
    resetIssueSerial();
    if (!isPlainRecord(input)) {
      return [issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", "campaignModel", "Corrupted Campaign Model: an object of models and context is required.")];
    }
    const issues: GoogleAdsPolicyIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push(issue(nextIssueId("corrupt"), "ERROR", "campaignStructure", key, `Corrupted Campaign Model: unexpected member "${key}".`));
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value) || idOf(value) === null) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", key, `Missing Required Fields: "${key}" must be an id holder.`));
      }
    }
    if (input.executionContracts !== undefined) {
      if (!Array.isArray(input.executionContracts)) {
        issues.push(issue(nextIssueId("req"), "ERROR", "requiredFields", "executionContracts", "Missing Required Fields: executionContracts must be a list of id holders."));
      }
    }
    issues.push(...validateCampaignStructure(input));
    issues.push(...validateAdGroups(input));
    issues.push(...validateResponsiveSearchAds(input));
    issues.push(...validateRequiredFields(input));
    issues.push(...validateUrls(input));
    issues.push(...validateTrackingTemplates(input));
    issues.push(...validateDuplicateAssets(input));
    issues.push(...validateMetadata(input));
    return issues;
  }

  function validateIssue(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "issue", message: "Corrupted Campaign Model: an issue record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of ISSUE_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Missing Required Fields: issue member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Required Fields: a well-formed issue id is required." });
    }
    if (input.kind !== undefined && !(GOOGLE_ADS_POLICY_ISSUE_KINDS as readonly string[]).includes(input.kind as string)) {
      issues.push({ field: "kind", message: "Missing Required Fields: an issue kind is not supported." });
    }
    if (input.area !== undefined && !(GOOGLE_ADS_POLICY_AREAS as readonly string[]).includes(input.area as string)) {
      issues.push({ field: "area", message: "Missing Required Fields: an issue area is not supported." });
    }
    if (typeof input.field !== "string" || input.field.trim() === "") {
      issues.push({ field: "field", message: "Missing Required Fields: an issue field is required." });
    }
    if (typeof input.message !== "string" || input.message.trim() === "") {
      issues.push({ field: "message", message: "Missing Required Fields: an issue message is required." });
    }
    return issues;
  }

  function validateReport(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "report", message: "Corrupted Campaign Model: a validation report is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Required Fields: a well-formed report id is required." });
    }
    if (input.status !== "OK" && input.status !== "REJECTED") {
      issues.push({ field: "status", message: "Missing Required Fields: a report status is not supported." });
    }
    if (!Array.isArray(input.issues)) issues.push({ field: "issues", message: "Missing Required Fields: issues must be a list." });
    if (!Array.isArray(input.warnings)) issues.push({ field: "warnings", message: "Missing Required Fields: warnings must be a list of text." });
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Corrupted Campaign Model: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.validationId !== "string" || !RECORD_ID.test(input.validationId)) {
      issues.push({ field: "validationId", message: "Missing Required Fields: a well-formed validation id is required." });
    }
    if (!Array.isArray(input.issueIds)) issues.push({ field: "issueIds", message: "Missing Required Fields: issueIds must be a list of ids." });
    return issues;
  }

  return {
    validateInput,
    validateCampaignStructure,
    validateAdGroups,
    validateResponsiveSearchAds,
    validateRequiredFields,
    validateUrls,
    validateTrackingTemplates,
    validateDuplicateAssets,
    validateMetadata,
    validateIssue,
    validateReport,
    validateSnapshot,
  };
}
