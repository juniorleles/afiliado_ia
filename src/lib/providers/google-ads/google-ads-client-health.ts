/**
 * Host record domain: client health.
 *
 * Local health and version checks for one offline client run. It reports
 * OFFLINE when a session and prepared request are well-formed, and
 * UNAVAILABLE when they are not. It never reaches an outside system, never
 * sends a record, and never retries. This layer stays offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";

export const GOOGLE_ADS_CLIENT_MODES = ["OFFLINE"] as const;
export type GoogleAdsClientMode = (typeof GOOGLE_ADS_CLIENT_MODES)[number];

export const GOOGLE_ADS_CLIENT_HEALTH = ["OFFLINE", "UNAVAILABLE"] as const;
export type GoogleAdsClientHealthStatus = (typeof GOOGLE_ADS_CLIENT_HEALTH)[number];

export const GOOGLE_ADS_CLIENT_VERSIONS = ["v1"] as const;
export type GoogleAdsClientVersion = (typeof GOOGLE_ADS_CLIENT_VERSIONS)[number];

export const GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS = [
  "clientId",
  "sessionId",
  "requestId",
  "version",
  "health",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsClientSnapshot {
  clientId: string;
  sessionId: string | null;
  requestId: string | null;
  version: GoogleAdsClientVersion | null;
  health: GoogleAdsClientHealthStatus;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsClientSnapshotInit {
  clientId: string;
  sessionId: string | null;
  requestId: string | null;
  version: GoogleAdsClientVersion | null;
  health: GoogleAdsClientHealthStatus;
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

export const GOOGLE_ADS_CLIENT_STATISTICS_KEYS = ["requestCount", "responseCount", "errorCount", "executionTime"] as const;

export interface GoogleAdsClientStatistics {
  requestCount: number;
  responseCount: number;
  errorCount: number;
  executionTime: number;
}

export const GOOGLE_ADS_EXECUTION_RESULT_KEYS = [
  "id",
  "requestId",
  "sessionId",
  "status",
  "version",
  "mode",
  "body",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsExecutionResult {
  id: string;
  requestId: string;
  sessionId: string;
  status: "OK" | "REJECTED";
  version: GoogleAdsClientVersion;
  mode: GoogleAdsClientMode;
  body: Record<string, unknown>;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_PARSED_RESPONSE_KEYS = ["id", "requestId", "status", "version", "body", "metadata", "createdAt"] as const;

export interface GoogleAdsParsedResponse {
  id: string;
  requestId: string;
  status: "OFFLINE";
  version: GoogleAdsClientVersion;
  body: Record<string, unknown>;
  metadata: GoogleAdsMetadata;
  createdAt: string;
}

export interface GoogleAdsClientHealthReport {
  status: GoogleAdsClientHealthStatus;
  mode: GoogleAdsClientMode;
  version: GoogleAdsClientVersion | null;
  issues: readonly GoogleAdsIssue[];
}

export interface GoogleAdsClientHealth {
  check(input: unknown): GoogleAdsClientHealthReport;
  detectVersion(input: unknown): { version: GoogleAdsClientVersion | null; issues: GoogleAdsIssue[] };
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsClient<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsClient(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsClient<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsClient(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsClient(inner)])) as T;
  }
  return value;
}

export function createGoogleAdsClientSnapshot(init: GoogleAdsClientSnapshotInit): GoogleAdsClientSnapshot {
  return freezeDeepGoogleAdsClient({
    clientId: init.clientId,
    sessionId: init.sessionId,
    requestId: init.requestId,
    version: init.version,
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsClient(init.metadata ?? {}),
  });
}

export function computeGoogleAdsClientStatistics(init: {
  requestCount: number;
  responseCount: number;
  errorCount: number;
  executionTime: number;
}): GoogleAdsClientStatistics {
  return freezeDeepGoogleAdsClient({
    requestCount: init.requestCount,
    responseCount: init.responseCount,
    errorCount: init.errorCount,
    executionTime: init.executionTime,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function detectGoogleAdsClientVersion(input: unknown): { version: GoogleAdsClientVersion | null; issues: GoogleAdsIssue[] } {
  const issues: GoogleAdsIssue[] = [];
  let token: unknown;
  if (isPlainRecord(input)) {
    if (isPlainRecord(input.configuration) && input.configuration.version !== undefined) token = input.configuration.version;
    else if (isPlainRecord(input.preparedRequest) && input.preparedRequest.version !== undefined) token = input.preparedRequest.version;
  }
  if (token === undefined || token === null || token === "") {
    return { version: "v1", issues: [] };
  }
  if (typeof token === "string" && (GOOGLE_ADS_CLIENT_VERSIONS as readonly string[]).includes(token)) {
    return { version: token as GoogleAdsClientVersion, issues: [] };
  }
  issues.push({ field: "version", message: `Unsupported API Version: "${String(token)}" is not supported.` });
  return { version: null, issues };
}

export function createGoogleAdsClientHealth(): GoogleAdsClientHealth {
  return {
    detectVersion(input) {
      return detectGoogleAdsClientVersion(input);
    },
    check(input) {
      const detected = detectGoogleAdsClientVersion(input);
      if (!isPlainRecord(input)) {
        return freezeDeepGoogleAdsClient({
          status: "UNAVAILABLE",
          mode: "OFFLINE",
          version: detected.version,
          issues: [{ field: "client", message: "Invalid Metadata: an object of a session and a prepared request is required." }],
        });
      }
      const issues: GoogleAdsIssue[] = [...detected.issues];
      const session = input.authenticationContext;
      if (!isPlainRecord(session) || textOf(session.sessionId) === null || textOf(session.clientId) === null) {
        issues.push({ field: "authenticationContext", message: "Invalid Session: a well-formed offline session is required." });
      }
      const request = input.preparedRequest;
      if (!isPlainRecord(request) || textOf(request.id) === null || !isPlainRecord(request.body)) {
        issues.push({ field: "preparedRequest", message: "Invalid Request: a prepared request with a body is required." });
      }
      return freezeDeepGoogleAdsClient({
        status: issues.length > 0 ? "UNAVAILABLE" : "OFFLINE",
        mode: "OFFLINE",
        version: detected.version,
        issues,
      });
    },
  };
}
