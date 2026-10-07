/**
 * Host record domain: campaign publish session.
 *
 * A frozen copy of one paused campaign resource. Credential values are not
 * members of the published campaign or the snapshot.
 */
import type { CampaignPublishMetadata } from "./campaign-publisher-context";

export const CAMPAIGN_PUBLISH_STATUSES = ["OK", "REJECTED"] as const;
export type CampaignPublishStatus = (typeof CAMPAIGN_PUBLISH_STATUSES)[number];

export const CAMPAIGN_PUBLISH_ORIGINS = ["OBSERVED"] as const;
export type CampaignPublishOrigin = (typeof CAMPAIGN_PUBLISH_ORIGINS)[number];

export const CAMPAIGN_PUBLISH_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type CampaignPublishProvenance = (typeof CAMPAIGN_PUBLISH_PROVENANCE)[number];

export interface CampaignPublishIssue {
  field: string;
  message: string;
}

export const PUBLISHED_CAMPAIGN_KEYS = ["draftId", "customerId", "resourceName", "campaignId", "status", "publishedAt"] as const;

export interface PublishedCampaign {
  draftId: string;
  customerId: string;
  resourceName: string;
  campaignId: string;
  status: "PAUSED";
  publishedAt: string;
}

export const CAMPAIGN_API_RESPONSE_KEYS = ["httpStatus", "budgetResourceName", "campaignResourceName", "observedStatus"] as const;

export interface CampaignApiResponse {
  httpStatus: number;
  budgetResourceName: string;
  campaignResourceName: string;
  observedStatus: "PAUSED";
}

export const CAMPAIGN_PUBLISH_STATISTICS_KEYS = ["requestCount", "operationCount", "publishedCount", "issueCount", "executionTime"] as const;

export interface CampaignPublishStatistics {
  requestCount: number;
  operationCount: number;
  publishedCount: number;
  issueCount: number;
  executionTime: number;
}

export const CAMPAIGN_PUBLISH_CONTEXT_RECORD_KEYS = ["draftId", "customerId"] as const;

export interface CampaignPublishContextRecord {
  draftId: string;
  customerId: string;
}

export const CAMPAIGN_PUBLISH_SNAPSHOT_KEYS = [
  "publishId",
  "publishedCampaign",
  "apiResponse",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface CampaignPublishSnapshot {
  publishId: string;
  publishedCampaign: PublishedCampaign;
  apiResponse: CampaignApiResponse;
  statistics: CampaignPublishStatistics;
  context: CampaignPublishContextRecord;
  createdAt: string;
  origin: CampaignPublishOrigin;
  provenance: CampaignPublishProvenance;
  metadata: CampaignPublishMetadata;
}

export const CAMPAIGN_PUBLISH_RESULT_KEYS = [
  "status",
  "issues",
  "publishedCampaign",
  "apiResponse",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface CampaignPublishResult {
  status: CampaignPublishStatus;
  issues: CampaignPublishIssue[];
  publishedCampaign: PublishedCampaign | null;
  apiResponse: CampaignApiResponse | null;
  statistics: CampaignPublishStatistics;
  snapshot: CampaignPublishSnapshot | null;
  metadata: CampaignPublishMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepCampaignPublish<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepCampaignPublish(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createCampaignPublishStatistics(init: CampaignPublishStatistics): CampaignPublishStatistics {
  return freezeDeepCampaignPublish({
    requestCount: init.requestCount,
    operationCount: init.operationCount,
    publishedCount: init.publishedCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createCampaignPublishSnapshot(init: {
  publishId: string;
  publishedCampaign: PublishedCampaign;
  apiResponse: CampaignApiResponse;
  statistics: CampaignPublishStatistics;
  context: CampaignPublishContextRecord;
  createdAt: string;
  metadata?: CampaignPublishMetadata;
}): CampaignPublishSnapshot {
  return freezeDeepCampaignPublish({
    publishId: init.publishId,
    publishedCampaign: { ...init.publishedCampaign },
    apiResponse: { ...init.apiResponse },
    statistics: init.statistics,
    context: { draftId: init.context.draftId, customerId: init.context.customerId },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
