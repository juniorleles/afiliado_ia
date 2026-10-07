/**
 * Host record domain: responsive search ad validator.
 *
 * Pure rules for builder input, named records, the assembled model, and
 * snapshots. It rejects a missing headline, a missing description, an invalid
 * final URL, duplicate headlines, duplicate descriptions, and invalid
 * metadata. It only reports problems: it never builds, stores, or changes
 * what it is given.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "campaignModel",
  "adGroupModel",
  "executionPlan",
  "executionContracts",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
  "responsiveSearchAds",
  "headlines",
  "descriptions",
  "finalUrls",
  "displayPaths",
  "trackingTemplates",
  "urlSuffixes",
  "pinnedAssets",
] as const;
const CONTEXT_RECORDS = ["executionPlan", "decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const RSA_FIELDS = ["id", "adGroupId", "headlineIds", "descriptionIds", "finalUrlId"] as const;
const MODEL_FIELDS = [
  "id",
  "campaignModelId",
  "adGroupModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "responsiveSearchAds",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;
const SNAPSHOT_FIELDS = [
  "rsaModelId",
  "campaignModelId",
  "adGroupModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "rsaIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsRsaValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateRsa(input: unknown): GoogleAdsIssue[];
  validateHeadline(input: unknown): GoogleAdsIssue[];
  validateDescription(input: unknown): GoogleAdsIssue[];
  validateFinalUrl(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateModel(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
  validateHeadlineGraph(ids: readonly string[], texts?: readonly string[]): GoogleAdsIssue[];
  validateDescriptionGraph(ids: readonly string[], texts?: readonly string[]): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsRsaMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

export function isWellFormedFinalUrl(value: unknown): boolean {
  return typeof value === "string" && HTTPS.test(value);
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function validateIdHolderList(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Missing Headline: ${field} must be a list of id holders.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    const id = idOf(item);
    if (id === null) issues.push({ field: path, message: `Missing Headline: "${field}" must carry a non-empty id.` });
    else if (seen.has(id)) issues.push({ field: `${path}.id`, message: `Missing Headline: "${id}" is already listed.` });
    else seen.add(id);
  });
  return issues;
}

function validateTextCatalog(input: unknown, field: string, missing: string, duplicate: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `${missing}: ${field} must be a list.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  const texts = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: `${missing}: a ${field.slice(0, -1)} must be an object.` });
      return;
    }
    if (typeof item.id !== "string" || !RECORD_ID.test(item.id)) {
      issues.push({ field: `${path}.id`, message: `${missing}: a well-formed record id is required.` });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `${duplicate}: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    if (typeof item.text !== "string" || item.text.trim() === "") {
      issues.push({ field: `${path}.text`, message: `${missing}: a non-empty line is required.` });
    } else if (texts.has(item.text)) {
      issues.push({ field: `${path}.text`, message: `${duplicate}: "${item.text}" is already listed.` });
    } else {
      texts.add(item.text);
    }
    if (item.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

function validateUrlCatalog(input: unknown): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field: "finalUrls", message: "Invalid Final URL: finalUrls must be a list." }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `finalUrls[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: "Invalid Final URL: a destination must be an object." });
      return;
    }
    if (typeof item.id !== "string" || !RECORD_ID.test(item.id)) {
      issues.push({ field: `${path}.id`, message: "Invalid Final URL: a well-formed record id is required." });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `Invalid Final URL: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    if (!isWellFormedFinalUrl(item.url)) {
      issues.push({ field: `${path}.url`, message: "Invalid Final URL: a well-formed https address is required." });
    }
    if (item.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

function validateNamedCatalog(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Invalid Final URL: ${field} must be a list.` }];
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: `Invalid Final URL: a ${field.slice(0, -1)} must be an object.` });
      return;
    }
    if (typeof item.id !== "string" || !RECORD_ID.test(item.id)) {
      issues.push({ field: `${path}.id`, message: "Invalid Final URL: a well-formed record id is required." });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `Invalid Final URL: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    const label = typeof item.text === "string" ? item.text : typeof item.name === "string" ? item.name : "";
    if (label.trim() === "") {
      issues.push({ field: `${path}.text`, message: "Invalid Final URL: a non-empty record text is required." });
    }
    if (item.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

function duplicateIds(ids: readonly string[], field: string, prefix: string): GoogleAdsIssue[] {
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push({ field, message: `${prefix}: "${id}" is already listed.` });
    seen.add(id);
  }
  return issues;
}

function duplicateTexts(texts: readonly string[], field: string, prefix: string): GoogleAdsIssue[] {
  const issues: GoogleAdsIssue[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (seen.has(text)) issues.push({ field, message: `${prefix}: "${text}" is already listed.` });
    seen.add(text);
  }
  return issues;
}

export function createGoogleAdsRsaValidator(): GoogleAdsRsaValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsRsaMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateHeadlineGraph(ids: readonly string[], texts: readonly string[] = []): GoogleAdsIssue[] {
    return [...duplicateIds(ids, "headlines", "Duplicate Headlines"), ...duplicateTexts(texts, "headlines", "Duplicate Headlines")];
  }

  function validateDescriptionGraph(ids: readonly string[], texts: readonly string[] = []): GoogleAdsIssue[] {
    return [...duplicateIds(ids, "descriptions", "Duplicate Descriptions"), ...duplicateTexts(texts, "descriptions", "Duplicate Descriptions")];
  }

  function validateHeadline(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "headline", message: "Missing Headline: a headline record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Headline: a well-formed headline id is required." });
    }
    if (typeof input.text !== "string" || input.text.trim() === "") {
      issues.push({ field: "text", message: "Missing Headline: a non-empty headline is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateDescription(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "description", message: "Missing Description: a description record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Description: a well-formed description id is required." });
    }
    if (typeof input.text !== "string" || input.text.trim() === "") {
      issues.push({ field: "text", message: "Missing Description: a non-empty description is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateFinalUrl(input: unknown): GoogleAdsIssue[] {
    if (typeof input === "string") {
      return isWellFormedFinalUrl(input) ? [] : [{ field: "url", message: "Invalid Final URL: a well-formed https address is required." }];
    }
    if (!isPlainRecord(input)) return [{ field: "finalUrl", message: "Invalid Final URL: a destination record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Final URL: a well-formed destination id is required." });
    }
    if (!isWellFormedFinalUrl(input.url)) {
      issues.push({ field: "url", message: "Invalid Final URL: a well-formed https address is required." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    return issues;
  }

  function validateRsa(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "responsiveSearchAd", message: "Missing Headline: an RSA record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of RSA_FIELDS) {
      if (input[field] === undefined) {
        if (field === "headlineIds") issues.push({ field, message: "Missing Headline: headline ids are required." });
        else if (field === "descriptionIds") issues.push({ field, message: "Missing Description: description ids are required." });
        else if (field === "finalUrlId") issues.push({ field, message: "Invalid Final URL: a final URL id is required." });
        else issues.push({ field, message: `Missing Headline: member "${field}" is missing.` });
      }
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Headline: a well-formed RSA id is required." });
    }
    if (input.adGroupId !== undefined && (typeof input.adGroupId !== "string" || !RECORD_ID.test(input.adGroupId))) {
      issues.push({ field: "adGroupId", message: "Missing Headline: a well-formed ad group id is required." });
    }
    if (input.headlineIds !== undefined) {
      if (!Array.isArray(input.headlineIds) || input.headlineIds.some((id) => typeof id !== "string")) {
        issues.push({ field: "headlineIds", message: "Missing Headline: headlineIds must be a list of ids." });
      } else if (input.headlineIds.length === 0) {
        issues.push({ field: "headlineIds", message: "Missing Headline: at least one headline is required." });
      } else {
        issues.push(...validateHeadlineGraph(input.headlineIds as string[]));
      }
    }
    if (input.descriptionIds !== undefined) {
      if (!Array.isArray(input.descriptionIds) || input.descriptionIds.some((id) => typeof id !== "string")) {
        issues.push({ field: "descriptionIds", message: "Missing Description: descriptionIds must be a list of ids." });
      } else if (input.descriptionIds.length === 0) {
        issues.push({ field: "descriptionIds", message: "Missing Description: at least one description is required." });
      } else {
        issues.push(...validateDescriptionGraph(input.descriptionIds as string[]));
      }
    }
    if (input.finalUrlId !== undefined && (typeof input.finalUrlId !== "string" || !RECORD_ID.test(input.finalUrlId))) {
      issues.push({ field: "finalUrlId", message: "Invalid Final URL: a well-formed destination id is required." });
    }
    for (const field of ["displayPathId", "trackingTemplateId", "urlSuffixId"] as const) {
      if (input[field] !== undefined && (typeof input[field] !== "string" || !RECORD_ID.test(input[field] as string))) {
        issues.push({ field, message: "Invalid Final URL: a well-formed destination record id is required." });
      }
    }
    if (input.pinnedAssetIds !== undefined && (!Array.isArray(input.pinnedAssetIds) || input.pinnedAssetIds.some((id) => typeof id !== "string"))) {
      issues.push({ field: "pinnedAssetIds", message: "Invalid Final URL: pinnedAssetIds must be a list of ids." });
    }
    if (input.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
    }
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string"))) {
      issues.push({ field: "warnings", message: "Missing Headline: warnings must be a list of text." });
    }
    return issues;
  }

  function validateHolder(input: unknown, field: string): GoogleAdsIssue[] {
    if (input === undefined || input === null) return [{ field, message: `Missing Headline: ${field} is required.` }];
    if (!isPlainRecord(input)) return [{ field, message: `Missing Headline: ${field} must be an id holder.` }];
    if (idOf(input) === null) return [{ field, message: `Missing Headline: ${field} must carry a non-empty id.` }];
    return [];
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "responsiveSearchAd", message: "Missing Headline: an object of RSA records and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Missing Headline: unexpected member "${key}".` });
      }
    }
    issues.push(...validateHolder(input.campaignModel, "campaignModel"));
    issues.push(...validateHolder(input.adGroupModel, "adGroupModel"));
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Missing Headline: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Missing Headline: "${key}" must carry a non-empty id.` });
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      if (!isFlatGoogleAdsRsaMetadata(value)) {
        issues.push({ field: key, message: `Invalid Metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
      }
    }
    issues.push(...validateIdHolderList(input.executionContracts, "executionContracts"));
    if (!("responsiveSearchAds" in input)) issues.push({ field: "responsiveSearchAds", message: "Missing Headline: responsive search ads are required." });
    else if (!Array.isArray(input.responsiveSearchAds)) issues.push({ field: "responsiveSearchAds", message: "Missing Headline: responsiveSearchAds must be a list." });
    else {
      input.responsiveSearchAds.forEach((item, index) => {
        const path = `responsiveSearchAds[${index}]`;
        const itemIssues = validateRsa(item);
        for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
      });
    }
    issues.push(...validateTextCatalog(input.headlines, "headlines", "Missing Headline", "Duplicate Headlines"));
    issues.push(...validateTextCatalog(input.descriptions, "descriptions", "Missing Description", "Duplicate Descriptions"));
    issues.push(...validateUrlCatalog(input.finalUrls));
    issues.push(...validateNamedCatalog(input.displayPaths, "displayPaths"));
    issues.push(...validateNamedCatalog(input.trackingTemplates, "trackingTemplates"));
    issues.push(...validateNamedCatalog(input.urlSuffixes, "urlSuffixes"));
    issues.push(...validateNamedCatalog(input.pinnedAssets, "pinnedAssets"));
    return issues;
  }

  function validateNullableId(value: unknown, field: string): GoogleAdsIssue[] {
    if (value !== null && (typeof value !== "string" || value.trim() === "")) {
      return [{ field, message: `Missing Headline: ${field} must be a non-empty id or null.` }];
    }
    return [];
  }

  function validateModel(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "model", message: "Missing Headline: an RSA model is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of MODEL_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Missing Headline: model member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Missing Headline: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.campaignModelId, "campaignModelId"));
    issues.push(...validateNullableId(input.adGroupModelId, "adGroupModelId"));
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Missing Headline: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.responsiveSearchAds)) issues.push({ field: "responsiveSearchAds", message: "Missing Headline: responsiveSearchAds must be a list." });
    else {
      input.responsiveSearchAds.forEach((item, index) => {
        const path = `responsiveSearchAds[${index}]`;
        if (!isPlainRecord(item)) {
          issues.push({ field: path, message: "Missing Headline: a built RSA must be an object." });
          return;
        }
        if (!Array.isArray(item.headlines) || item.headlines.length === 0) {
          issues.push({ field: `${path}.headlines`, message: "Missing Headline: at least one headline is required." });
        } else {
          const ids = item.headlines.map((headline) => (isPlainRecord(headline) && typeof headline.id === "string" ? headline.id : ""));
          const texts = item.headlines.map((headline) => (isPlainRecord(headline) && typeof headline.text === "string" ? headline.text : ""));
          issues.push(...validateHeadlineGraph(ids, texts));
        }
        if (!Array.isArray(item.descriptions) || item.descriptions.length === 0) {
          issues.push({ field: `${path}.descriptions`, message: "Missing Description: at least one description is required." });
        } else {
          const ids = item.descriptions.map((description) => (isPlainRecord(description) && typeof description.id === "string" ? description.id : ""));
          const texts = item.descriptions.map((description) => (isPlainRecord(description) && typeof description.text === "string" ? description.text : ""));
          issues.push(...validateDescriptionGraph(ids, texts));
        }
        if (!isPlainRecord(item.finalUrl) || !isWellFormedFinalUrl(item.finalUrl.url)) {
          issues.push({ field: `${path}.finalUrl`, message: "Invalid Final URL: a well-formed https address is required." });
        }
        if (!Array.isArray(item.pinnedAssets)) {
          issues.push({ field: `${path}.pinnedAssets`, message: "Invalid Final URL: pinnedAssets must be a list." });
        }
        if (item.metadata !== undefined && !isFlatGoogleAdsRsaMetadata(item.metadata)) {
          issues.push({ field: `${path}.metadata`, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
      });
    }
    if (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string")) {
      issues.push({ field: "warnings", message: "Missing Headline: warnings must be a list of text." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.executionTime !== "number" || !Number.isFinite(input.executionTime) || input.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Missing Headline: executionTime must be a finite number of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Missing Headline: createdAt must be an ISO-8601 instant in UTC." });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Missing Headline: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of SNAPSHOT_FIELDS) {
      if (input[field] === undefined) issues.push({ field, message: `Missing Headline: snapshot member "${field}" is missing.` });
    }
    if (typeof input.rsaModelId !== "string" || !RECORD_ID.test(input.rsaModelId)) {
      issues.push({ field: "rsaModelId", message: "Missing Headline: a well-formed model id is required." });
    }
    issues.push(...validateNullableId(input.campaignModelId, "campaignModelId"));
    issues.push(...validateNullableId(input.adGroupModelId, "adGroupModelId"));
    issues.push(...validateNullableId(input.executionPlanId, "executionPlanId"));
    issues.push(...validateNullableId(input.decisionAnalysisId, "decisionAnalysisId"));
    issues.push(...validateNullableId(input.workflowSnapshotId, "workflowSnapshotId"));
    if (!Array.isArray(input.executionContractIds) || input.executionContractIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "executionContractIds", message: "Missing Headline: executionContractIds must be a list of ids." });
    }
    if (!Array.isArray(input.rsaIds) || input.rsaIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "rsaIds", message: "Missing Headline: rsaIds must be a list of ids." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Missing Headline: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateRsa,
    validateHeadline,
    validateDescription,
    validateFinalUrl,
    validateMetadata,
    validateModel,
    validateSnapshot,
    validateHeadlineGraph,
    validateDescriptionGraph,
  };
}
