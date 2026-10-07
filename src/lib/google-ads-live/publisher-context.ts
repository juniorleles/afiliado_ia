/**
 * Host record domain: read-only ad group and responsive search ad context.
 *
 * Interface only. One run is given an authenticated session, a published
 * paused campaign, and a draft. Drafts are read and not written back.
 */
export type PublishMetadata = Record<string, string | number | boolean | null>;

export const AD_GROUP_PUBLISH_CONTEXT_MEMBERS = [
  "session",
  "publishedCampaign",
  "adGroupDraft",
  "developerToken",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export const RSA_PUBLISH_CONTEXT_MEMBERS = [
  "session",
  "publishedCampaign",
  "publishedAdGroup",
  "rsaDraft",
  "developerToken",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export const PUBLISH_SESSION_KEYS = ["sessionId", "authenticated", "tokenType", "expiresIn", "accessToken"] as const;

export interface PublishSession {
  sessionId: string;
  authenticated: true;
  tokenType: string;
  expiresIn: number;
  accessToken: string;
}

export const PUBLISHED_CAMPAIGN_REF_KEYS = ["draftId", "customerId", "resourceName", "campaignId", "status", "publishedAt"] as const;

export interface PublishedCampaignRef {
  draftId: string;
  customerId: string;
  resourceName: string;
  campaignId: string;
  status: "PAUSED";
  publishedAt: string;
}

export const AD_GROUP_DRAFT_KEYS = ["draftId", "name", "status", "type", "cpcBidMicros"] as const;

export interface AdGroupDraft {
  draftId: string;
  name: string;
  status: "PAUSED";
  type: "SEARCH_STANDARD";
  cpcBidMicros: number;
}

export const RSA_ASSET_KEYS = ["text", "pinnedField"] as const;

export const HEADLINE_PINS = ["HEADLINE_1", "HEADLINE_2", "HEADLINE_3"] as const;
export type HeadlinePin = (typeof HEADLINE_PINS)[number];

export const DESCRIPTION_PINS = ["DESCRIPTION_1", "DESCRIPTION_2"] as const;
export type DescriptionPin = (typeof DESCRIPTION_PINS)[number];

export interface RsaHeadline {
  text: string;
  pinnedField: HeadlinePin | null;
}

export interface RsaDescription {
  text: string;
  pinnedField: DescriptionPin | null;
}

export const RSA_DRAFT_KEYS = ["draftId", "status", "headlines", "descriptions", "finalUrls", "path1", "path2"] as const;

export interface RsaDraft {
  draftId: string;
  status: "PAUSED";
  headlines: RsaHeadline[];
  descriptions: RsaDescription[];
  finalUrls: string[];
  path1: string;
  path2: string;
}

export const POLICY_REVIEW_STATUSES = ["REVIEW_IN_PROGRESS", "REVIEWED", "UNDER_APPEAL"] as const;
export type PolicyReviewStatus = (typeof POLICY_REVIEW_STATUSES)[number];

export const POLICY_APPROVAL_STATUSES = ["UNSPECIFIED", "UNKNOWN", "APPROVED", "APPROVED_LIMITED", "AREA_OF_INTEREST_ONLY", "DISAPPROVED"] as const;
export type PolicyApprovalStatus = (typeof POLICY_APPROVAL_STATUSES)[number];

export interface PublishIssue {
  field: string;
  message: string;
}

export const PUBLISHED_AD_GROUP_KEYS = [
  "draftId",
  "customerId",
  "campaignResourceName",
  "resourceName",
  "adGroupId",
  "status",
  "publishedAt",
] as const;

export interface PublishedAdGroup {
  draftId: string;
  customerId: string;
  campaignResourceName: string;
  resourceName: string;
  adGroupId: string;
  status: "PAUSED";
  publishedAt: string;
}

export const AD_GROUP_API_RESPONSE_KEYS = ["httpStatus", "adGroupResourceName", "observedStatus"] as const;

export interface AdGroupApiResponse {
  httpStatus: number;
  adGroupResourceName: string;
  observedStatus: "PAUSED";
}

export const PUBLISH_STATISTICS_KEYS = ["requestCount", "operationCount", "publishedCount", "issueCount", "executionTime"] as const;

export interface PublishStatistics {
  requestCount: number;
  operationCount: number;
  publishedCount: number;
  issueCount: number;
  executionTime: number;
}

export const AD_GROUP_PUBLISH_CONTEXT_RECORD_KEYS = ["draftId", "customerId", "campaignResourceName"] as const;

export interface AdGroupPublishContextRecord {
  draftId: string;
  customerId: string;
  campaignResourceName: string;
}

export const AD_GROUP_PUBLISH_SNAPSHOT_KEYS = [
  "publishId",
  "publishedAdGroup",
  "apiResponse",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface AdGroupPublishSnapshot {
  publishId: string;
  publishedAdGroup: PublishedAdGroup;
  apiResponse: AdGroupApiResponse;
  statistics: PublishStatistics;
  context: AdGroupPublishContextRecord;
  createdAt: string;
  origin: "OBSERVED";
  provenance: "DIRECT_SOURCE";
  metadata: PublishMetadata;
}

export const AD_GROUP_PUBLISH_RESULT_KEYS = [
  "status",
  "issues",
  "publishedAdGroup",
  "apiResponse",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface AdGroupPublishResult {
  status: "OK" | "REJECTED";
  issues: PublishIssue[];
  publishedAdGroup: PublishedAdGroup | null;
  apiResponse: AdGroupApiResponse | null;
  statistics: PublishStatistics;
  snapshot: AdGroupPublishSnapshot | null;
  metadata: PublishMetadata;
  executionTime: number;
}

export const PUBLISHED_RSA_KEYS = [
  "draftId",
  "customerId",
  "campaignResourceName",
  "adGroupResourceName",
  "resourceName",
  "adId",
  "status",
  "policyReviewStatus",
  "approvalStatus",
  "publishedAt",
] as const;

export interface PublishedRsa {
  draftId: string;
  customerId: string;
  campaignResourceName: string;
  adGroupResourceName: string;
  resourceName: string;
  adId: string;
  status: "PAUSED";
  policyReviewStatus: PolicyReviewStatus;
  approvalStatus: PolicyApprovalStatus;
  publishedAt: string;
}

export const RSA_API_RESPONSE_KEYS = ["httpStatus", "adResourceName", "observedStatus", "policyReviewStatus", "approvalStatus"] as const;

export interface RsaApiResponse {
  httpStatus: number;
  adResourceName: string;
  observedStatus: "PAUSED";
  policyReviewStatus: PolicyReviewStatus;
  approvalStatus: PolicyApprovalStatus;
}

export const RSA_PUBLISH_CONTEXT_RECORD_KEYS = ["draftId", "customerId", "campaignResourceName", "adGroupResourceName"] as const;

export interface RsaPublishContextRecord {
  draftId: string;
  customerId: string;
  campaignResourceName: string;
  adGroupResourceName: string;
}

export const RSA_PUBLISH_SNAPSHOT_KEYS = [
  "publishId",
  "publishedRsa",
  "apiResponse",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RsaPublishSnapshot {
  publishId: string;
  publishedRsa: PublishedRsa;
  apiResponse: RsaApiResponse;
  statistics: PublishStatistics;
  context: RsaPublishContextRecord;
  createdAt: string;
  origin: "OBSERVED";
  provenance: "DIRECT_SOURCE";
  metadata: PublishMetadata;
}

export const RSA_PUBLISH_RESULT_KEYS = [
  "status",
  "issues",
  "publishedRsa",
  "apiResponse",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RsaPublishResult {
  status: "OK" | "REJECTED";
  issues: PublishIssue[];
  publishedRsa: PublishedRsa | null;
  apiResponse: RsaApiResponse | null;
  statistics: PublishStatistics;
  snapshot: RsaPublishSnapshot | null;
  metadata: PublishMetadata;
  executionTime: number;
}
