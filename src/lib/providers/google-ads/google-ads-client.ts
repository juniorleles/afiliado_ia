/**
 * Host record domain: Google Ads API client.
 *
 * Turns a read-only authentication context, prepared request, execution
 * metadata, runtime metadata, and configuration into one frozen execution
 * result, parsed response, error report, statistics, and snapshot. It
 * validates the session, detects the version, executes one local request, and
 * parses the response. It never builds a campaign, never retries, never runs
 * a batch, and never sends a record. A refused input returns REJECTED with
 * issues and no execution. This layer stays offline.
 *
 * This client is not a campaign builder and not a business-rule host.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  computeGoogleAdsClientStatistics,
  copyPlainGoogleAdsClient,
  createGoogleAdsClientHealth,
  createGoogleAdsClientSnapshot,
  detectGoogleAdsClientVersion,
  type GoogleAdsClientHealth,
  type GoogleAdsClientHealthStatus,
  type GoogleAdsClientSnapshot,
  type GoogleAdsClientStatistics,
  type GoogleAdsClientVersion,
  type GoogleAdsExecutionResult,
  type GoogleAdsParsedResponse,
} from "./google-ads-client-health";
import { createGoogleAdsRequestExecutor, type GoogleAdsRequestExecutor } from "./google-ads-client-executor";
import { createGoogleAdsResponseParser, type GoogleAdsResponseParser } from "./google-ads-client-parser";
import { createGoogleAdsErrorMapper, type GoogleAdsClientErrorReport, type GoogleAdsErrorMapper } from "./google-ads-client-errors";

export const GOOGLE_ADS_CLIENT_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsClientStatus = (typeof GOOGLE_ADS_CLIENT_STATUSES)[number];

export type GoogleAdsClientClock = () => number;
export type GoogleAdsClientTimestamp = () => string;
export type GoogleAdsClientIdFactory = () => string;

export interface GoogleAdsApiClientInput {
  authenticationContext: { id: string; sessionId: string; clientId: string; customerId?: string | null };
  preparedRequest: { id: string; payloadId?: string; version?: string; mode?: string; body: Record<string, unknown> };
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
}

export interface GoogleAdsApiClientResult {
  status: GoogleAdsClientStatus;
  issues: GoogleAdsIssue[];
  execution: GoogleAdsExecutionResult | null;
  parsedResponse: GoogleAdsParsedResponse | null;
  errors: GoogleAdsClientErrorReport;
  metadata: GoogleAdsMetadata;
  statistics: GoogleAdsClientStatistics | null;
  snapshot: GoogleAdsClientSnapshot | null;
  health: GoogleAdsClientHealthStatus;
  version: GoogleAdsClientVersion | null;
  executionTime: number;
}

export interface GoogleAdsApiClient {
  readonly executor: GoogleAdsRequestExecutor;
  readonly parser: GoogleAdsResponseParser;
  readonly errors: GoogleAdsErrorMapper;
  readonly health: GoogleAdsClientHealth;
  execute(input: unknown): GoogleAdsApiClientResult;
  healthCheck(input: unknown): ReturnType<GoogleAdsClientHealth["check"]>;
  detectVersion(input: unknown): ReturnType<GoogleAdsClientHealth["detectVersion"]>;
  getSnapshot(clientId: string): GoogleAdsClientSnapshot | null;
}

export interface GoogleAdsApiClientOptions {
  executor?: GoogleAdsRequestExecutor;
  parser?: GoogleAdsResponseParser;
  errors?: GoogleAdsErrorMapper;
  health?: GoogleAdsClientHealth;
  now?: GoogleAdsClientClock;
  timestamp?: GoogleAdsClientTimestamp;
  idFactory?: GoogleAdsClientIdFactory;
}

const INPUT_MEMBERS = ["authenticationContext", "preparedRequest", "executionMetadata", "runtimeMetadata", "configuration"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const defaultClock: GoogleAdsClientClock = () => performance.now();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

function isFlatMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function validateMetadata(input: unknown, field: string): GoogleAdsIssue[] {
  if (input === undefined) return [];
  if (!isFlatMetadata(input)) {
    return [{ field, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
  }
  return [];
}

function validateSession(input: unknown): GoogleAdsIssue[] {
  if (!isPlainRecord(input)) return [{ field: "authenticationContext", message: "Invalid Session: an authentication context is required." }];
  const issues: GoogleAdsIssue[] = [];
  if (textOf(input.id) === null || !RECORD_ID.test(String(input.id))) {
    issues.push({ field: "authenticationContext.id", message: "Invalid Session: a well-formed authentication id is required." });
  }
  if (textOf(input.sessionId) === null) {
    issues.push({ field: "authenticationContext.sessionId", message: "Invalid Session: a session id is required." });
  }
  if (textOf(input.clientId) === null) {
    issues.push({ field: "authenticationContext.clientId", message: "Invalid Session: a client id is required." });
  }
  if (textOf(input.customerId) === null) {
    issues.push({ field: "authenticationContext.customerId", message: "Authorization Error: a customer id is required." });
  }
  if (typeof input.mode === "string" && input.mode !== "OFFLINE") {
    issues.push({ field: "authenticationContext.mode", message: "Invalid Session: the session must stay offline." });
  }
  return issues;
}

function validateRequest(input: unknown): GoogleAdsIssue[] {
  if (!isPlainRecord(input)) return [{ field: "preparedRequest", message: "Invalid Request: a prepared request is required." }];
  const issues: GoogleAdsIssue[] = [];
  if (textOf(input.id) === null) {
    issues.push({ field: "preparedRequest.id", message: "Invalid Request: a prepared request id is required." });
  }
  if (!isPlainRecord(input.body)) {
    issues.push({ field: "preparedRequest.body", message: "Invalid Request: a prepared request body is required." });
  }
  if (typeof input.mode === "string" && input.mode !== "OFFLINE") {
    issues.push({ field: "preparedRequest.mode", message: "Transport Error: the prepared request must stay offline." });
  }
  return issues;
}

function validateInput(input: unknown): GoogleAdsIssue[] {
  if (!isPlainRecord(input)) return [{ field: "client", message: "Invalid Metadata: an object of a session and a prepared request is required." }];
  const issues: GoogleAdsIssue[] = [];
  for (const key of Object.keys(input)) {
    if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
      issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
    }
  }
  if (!("authenticationContext" in input)) issues.push({ field: "authenticationContext", message: "Invalid Session: an authentication context is required." });
  else issues.push(...validateSession(input.authenticationContext));
  if (!("preparedRequest" in input)) issues.push({ field: "preparedRequest", message: "Invalid Request: a prepared request is required." });
  else issues.push(...validateRequest(input.preparedRequest));
  for (const key of CONTEXT_METADATA) {
    issues.push(...validateMetadata(input[key], key));
  }
  return issues;
}

function refused(
  issues: GoogleAdsIssue[],
  createdAt: string,
  id: string,
  metadata: GoogleAdsMetadata,
  mapper: GoogleAdsErrorMapper,
  version: GoogleAdsClientVersion | null,
  executionTime = 0,
): GoogleAdsApiClientResult {
  const errors = mapper.map(issues, id, createdAt);
  return {
    status: "REJECTED",
    issues,
    execution: null,
    parsedResponse: null,
    errors,
    metadata,
    statistics: computeGoogleAdsClientStatistics({ requestCount: 0, responseCount: 0, errorCount: errors.errors.length, executionTime }),
    snapshot: null,
    health: "UNAVAILABLE",
    version,
    executionTime,
  };
}

export function createGoogleAdsApiClient(options: GoogleAdsApiClientOptions = {}): GoogleAdsApiClient {
  const executor = options.executor ?? createGoogleAdsRequestExecutor();
  const parser = options.parser ?? createGoogleAdsResponseParser();
  const errors = options.errors ?? createGoogleAdsErrorMapper();
  const health = options.health ?? createGoogleAdsClientHealth();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `client-${++serial}`);
  const snapshots = new Map<string, GoogleAdsClientSnapshot>();

  return {
    executor,
    parser,
    errors,
    health,
    healthCheck: (input) => health.check(input),
    detectVersion: (input) => health.detectVersion(input),
    execute(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const detected = detectGoogleAdsClientVersion(input);
        const metadata = isPlainRecord(input) && isPlainRecord(input.executionMetadata) ? copyPlainGoogleAdsClient(input.executionMetadata as GoogleAdsMetadata) : {};
        const inputIssues = [...validateInput(input), ...detected.issues];
        if (inputIssues.length > 0) return refused(inputIssues, createdAt, id, metadata, errors, detected.version, Math.max(0, now() - start));
        const draft = input as GoogleAdsApiClientInput;
        const version = detected.version ?? "v1";
        const executed = executor.execute({
          id,
          sessionId: draft.authenticationContext.sessionId,
          requestId: draft.preparedRequest.id,
          requestBody: draft.preparedRequest.body,
          version,
          metadata,
          createdAt,
        });
        if (executed.issues.length > 0 || executed.execution === null) {
          return refused(executed.issues, createdAt, id, metadata, errors, version, Math.max(0, now() - start));
        }
        const parsed = parser.parse(executed.execution);
        if (parsed.issues.length > 0 || parsed.response === null) {
          return refused(parsed.issues, createdAt, id, metadata, errors, version, Math.max(0, now() - start));
        }
        const executionTime = Math.max(0, now() - start);
        const snapshot = createGoogleAdsClientSnapshot({
          clientId: id,
          sessionId: draft.authenticationContext.sessionId,
          requestId: draft.preparedRequest.id,
          version,
          health: "OFFLINE",
          createdAt,
          metadata,
        });
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          execution: executed.execution,
          parsedResponse: parsed.response,
          errors: errors.map([], id, createdAt),
          metadata: executed.execution.metadata,
          statistics: computeGoogleAdsClientStatistics({ requestCount: 1, responseCount: 1, errorCount: 0, executionTime }),
          snapshot,
          health: "OFFLINE",
          version,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "client", message: error instanceof Error ? error.message : "Invalid Request: the client could not execute the request." }],
          new Date().toISOString(),
          "client-0",
          {},
          errors,
          null,
        );
      }
    },
    getSnapshot: (clientId) => snapshots.get(clientId) ?? null,
  };
}
