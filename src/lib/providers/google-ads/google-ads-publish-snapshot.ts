/**
 * Host record domain: publish snapshot.
 *
 * A frozen record of one explicit publish run: the publish id, the execution
 * plan id, the provider id, the campaign id, the named operation, the status,
 * a creation timestamp, and flat metadata. It never reaches an outside
 * system, never retries, and never changes a budget. This layer stays
 * offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_PUBLISH_OPERATIONS = ["CREATE", "UPDATE", "PAUSE", "RESUME", "ARCHIVE"] as const;
export type GoogleAdsPublishOperationKind = (typeof GOOGLE_ADS_PUBLISH_OPERATIONS)[number];

export const GOOGLE_ADS_PUBLISH_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsPublishStatus = (typeof GOOGLE_ADS_PUBLISH_STATUSES)[number];

export const GOOGLE_ADS_PUBLISH_RESULT_KEYS = [
  "id",
  "operation",
  "status",
  "planId",
  "providerId",
  "campaignId",
  "sessionId",
  "response",
  "metadata",
  "createdAt",
  "executionTime",
] as const;

export interface GoogleAdsPublishResult {
  id: string;
  operation: GoogleAdsPublishOperationKind;
  status: GoogleAdsPublishStatus;
  planId: string;
  providerId: string;
  campaignId: string;
  sessionId: string | null;
  response: Record<string, unknown>;
  metadata: GoogleAdsMetadata;
  createdAt: string;
  executionTime: number;
}

export const GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS = [
  "publishId",
  "planId",
  "providerId",
  "campaignId",
  "operation",
  "status",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsPublishSnapshot {
  publishId: string;
  planId: string;
  providerId: string;
  campaignId: string;
  operation: GoogleAdsPublishOperationKind;
  status: GoogleAdsPublishStatus;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsPublishSnapshotInit {
  publishId: string;
  planId: string;
  providerId: string;
  campaignId: string;
  operation: GoogleAdsPublishOperationKind;
  status: GoogleAdsPublishStatus;
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

export const GOOGLE_ADS_PUBLISH_STATISTICS_KEYS = ["operationCount", "successCount", "errorCount", "executionTime"] as const;

export interface GoogleAdsPublishStatistics {
  operationCount: number;
  successCount: number;
  errorCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsPublish<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsPublish(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsPublish<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsPublish(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsPublish(inner)])) as T;
  }
  return value;
}

export function createGoogleAdsPublishSnapshot(init: GoogleAdsPublishSnapshotInit): GoogleAdsPublishSnapshot {
  return freezeDeepGoogleAdsPublish({
    publishId: init.publishId,
    planId: init.planId,
    providerId: init.providerId,
    campaignId: init.campaignId,
    operation: init.operation,
    status: init.status,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsPublish(init.metadata ?? {}),
  });
}

export function createGoogleAdsPublishResult(init: GoogleAdsPublishResult): GoogleAdsPublishResult {
  return freezeDeepGoogleAdsPublish({
    id: init.id,
    operation: init.operation,
    status: init.status,
    planId: init.planId,
    providerId: init.providerId,
    campaignId: init.campaignId,
    sessionId: init.sessionId,
    response: copyPlainGoogleAdsPublish(init.response),
    metadata: copyPlainGoogleAdsPublish(init.metadata),
    createdAt: init.createdAt,
    executionTime: init.executionTime,
  });
}

export function computeGoogleAdsPublishStatistics(init: GoogleAdsPublishStatistics): GoogleAdsPublishStatistics {
  return freezeDeepGoogleAdsPublish({
    operationCount: init.operationCount,
    successCount: init.successCount,
    errorCount: init.errorCount,
    executionTime: init.executionTime,
  });
}
