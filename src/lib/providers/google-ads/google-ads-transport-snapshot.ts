/**
 * Host record domain: transport snapshot.
 *
 * A frozen record of one offline transport run: the transport id, the payload
 * id, the prepared request id, the prepared response id, the mode, a health
 * token, a creation timestamp, and flat metadata. It never reaches an outside
 * system, never authenticates, and never sends a record. This layer stays
 * offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_TRANSPORT_MODES = ["OFFLINE"] as const;
export type GoogleAdsTransportMode = (typeof GOOGLE_ADS_TRANSPORT_MODES)[number];

export const GOOGLE_ADS_TRANSPORT_HEALTH = ["OFFLINE", "UNAVAILABLE"] as const;
export type GoogleAdsTransportHealth = (typeof GOOGLE_ADS_TRANSPORT_HEALTH)[number];

export const GOOGLE_ADS_TRANSPORT_VERSIONS = ["v1"] as const;
export type GoogleAdsTransportVersion = (typeof GOOGLE_ADS_TRANSPORT_VERSIONS)[number];

export const GOOGLE_ADS_TRANSPORT_REQUEST_MODEL_KEYS = [
  "id",
  "campaignModelId",
  "adGroupModelId",
  "rsaModelId",
  "executionPlanId",
  "executionContractIds",
  "campaignRequests",
  "campaignBudgetRequests",
  "campaignSettingsRequests",
  "adGroupRequests",
  "keywordRequests",
  "responsiveSearchAdRequests",
  "trackingRequests",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

export const GOOGLE_ADS_TRANSPORT_REQUEST_LISTS = [
  "campaignRequests",
  "campaignBudgetRequests",
  "campaignSettingsRequests",
  "adGroupRequests",
  "keywordRequests",
  "responsiveSearchAdRequests",
  "trackingRequests",
] as const;

export const GOOGLE_ADS_PREPARED_REQUEST_KEYS = ["id", "payloadId", "version", "mode", "body", "text", "metadata", "createdAt"] as const;

export interface GoogleAdsPreparedRequest {
  id: string;
  payloadId: string;
  version: GoogleAdsTransportVersion;
  mode: GoogleAdsTransportMode;
  body: Record<string, unknown>;
  text: string;
  metadata: GoogleAdsMetadata;
  createdAt: string;
}

export const GOOGLE_ADS_PREPARED_RESPONSE_KEYS = ["id", "requestId", "version", "mode", "status", "body", "text", "metadata", "createdAt"] as const;

export interface GoogleAdsPreparedResponse {
  id: string;
  requestId: string;
  version: GoogleAdsTransportVersion;
  mode: GoogleAdsTransportMode;
  status: "OFFLINE";
  body: Record<string, unknown>;
  text: string;
  metadata: GoogleAdsMetadata;
  createdAt: string;
}

export const GOOGLE_ADS_TRANSPORT_REPORT_KEYS = ["id", "status", "issues", "mode", "health", "createdAt", "metadata"] as const;

export interface GoogleAdsTransportReport {
  id: string;
  status: "OK" | "REJECTED";
  issues: readonly { field: string; message: string }[];
  mode: GoogleAdsTransportMode;
  health: GoogleAdsTransportHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_TRANSPORT_STATISTICS_KEYS = [
  "requestCount",
  "responseCount",
  "resourceCount",
  "issueCount",
  "executionTime",
] as const;

export interface GoogleAdsTransportStatistics {
  requestCount: number;
  responseCount: number;
  resourceCount: number;
  issueCount: number;
  executionTime: number;
}

export const GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS = [
  "transportId",
  "payloadId",
  "requestId",
  "responseId",
  "mode",
  "health",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsTransportSnapshot {
  transportId: string;
  payloadId: string | null;
  requestId: string | null;
  responseId: string | null;
  mode: GoogleAdsTransportMode;
  health: GoogleAdsTransportHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsTransportSnapshotInit {
  transportId: string;
  payloadId: string | null;
  requestId: string | null;
  responseId: string | null;
  mode: GoogleAdsTransportMode;
  health: GoogleAdsTransportHealth;
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsTransportHealthReport {
  status: GoogleAdsTransportHealth;
  mode: GoogleAdsTransportMode;
  issues: readonly { field: string; message: string }[];
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsTransport<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsTransport(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsTransport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsTransport(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsTransport(inner)])) as T;
  }
  return value;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsTransportSnapshot(init: GoogleAdsTransportSnapshotInit): GoogleAdsTransportSnapshot {
  return freezeDeepGoogleAdsTransport({
    transportId: init.transportId,
    payloadId: init.payloadId,
    requestId: init.requestId,
    responseId: init.responseId,
    mode: init.mode,
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsTransport(init.metadata ?? {}),
  });
}

export function computeGoogleAdsTransportStatistics(init: {
  requestCount: number;
  responseCount: number;
  resourceCount: number;
  issueCount: number;
  executionTime: number;
}): GoogleAdsTransportStatistics {
  return freezeDeepGoogleAdsTransport({
    requestCount: init.requestCount,
    responseCount: init.responseCount,
    resourceCount: init.resourceCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function serializeGoogleAdsTransportBody(value: unknown): { body: Record<string, unknown>; text: string } {
  const body = copyPlainGoogleAdsTransport(typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  let text = "{}";
  try {
    text = JSON.stringify(body) ?? "{}";
  } catch {
    text = "{}";
  }
  return { body, text };
}

export function deserializeGoogleAdsTransportBody(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return copyPlainGoogleAdsTransport(parsed as Record<string, unknown>);
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return copyPlainGoogleAdsTransport(value as Record<string, unknown>);
  }
  return {};
}

export function resourceCountOf(requestModel: unknown): number {
  if (typeof requestModel !== "object" || requestModel === null) return 0;
  const record = requestModel as Record<string, unknown>;
  let count = 0;
  for (const key of GOOGLE_ADS_TRANSPORT_REQUEST_LISTS) {
    const list = record[key];
    if (Array.isArray(list)) count += list.length;
  }
  return count;
}
