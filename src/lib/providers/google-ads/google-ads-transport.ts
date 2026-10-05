/**
 * Host record domain: Google Ads transport.
 *
 * Turns a read-only request model, execution metadata, runtime metadata, and
 * configuration into one frozen prepared request, prepared response, validation
 * report, statistics, and snapshot. It prepares, serializes, deserializes, and
 * checks health. It never authenticates, never reaches an outside system, and
 * never sends a record. A refused input returns REJECTED with issues and no
 * prepared records. This layer stays offline.
 *
 * This transport is not an adapter, not a campaign builder, and not an
 * authentication host.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  computeGoogleAdsTransportStatistics,
  copyPlainGoogleAdsTransport,
  createGoogleAdsTransportSnapshot,
  freezeDeepGoogleAdsTransport,
  resourceCountOf,
  type GoogleAdsPreparedRequest,
  type GoogleAdsPreparedResponse,
  type GoogleAdsTransportHealth,
  type GoogleAdsTransportHealthReport,
  type GoogleAdsTransportMode,
  type GoogleAdsTransportReport,
  type GoogleAdsTransportSnapshot,
  type GoogleAdsTransportStatistics,
  type GoogleAdsTransportVersion,
} from "./google-ads-transport-snapshot";
import { createGoogleAdsRequestTransport, type GoogleAdsRequestTransport } from "./google-ads-transport-request";
import { createGoogleAdsResponseTransport, type GoogleAdsResponseTransport } from "./google-ads-transport-response";
import { createGoogleAdsTransportValidator, type GoogleAdsTransportValidator } from "./google-ads-transport-validator";

export const GOOGLE_ADS_TRANSPORT_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsTransportStatus = (typeof GOOGLE_ADS_TRANSPORT_STATUSES)[number];

export type GoogleAdsTransportClock = () => number;
export type GoogleAdsTransportTimestamp = () => string;
export type GoogleAdsTransportIdFactory = () => string;

export interface GoogleAdsTransportInput {
  requestModel: { id: string };
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
}

export interface GoogleAdsTransportResult {
  status: GoogleAdsTransportStatus;
  issues: GoogleAdsIssue[];
  preparedRequest: GoogleAdsPreparedRequest | null;
  preparedResponse: GoogleAdsPreparedResponse | null;
  report: GoogleAdsTransportReport;
  statistics: GoogleAdsTransportStatistics | null;
  snapshot: GoogleAdsTransportSnapshot | null;
  metadata: GoogleAdsMetadata;
  health: GoogleAdsTransportHealth;
  executionTime: number;
}

export interface GoogleAdsTransport {
  readonly requestTransport: GoogleAdsRequestTransport;
  readonly responseTransport: GoogleAdsResponseTransport;
  readonly validator: GoogleAdsTransportValidator;
  prepare(input: unknown): GoogleAdsTransportResult;
  healthCheck(input: unknown): GoogleAdsTransportHealthReport;
  getSnapshot(transportId: string): GoogleAdsTransportSnapshot | null;
}

export interface GoogleAdsTransportOptions {
  requestTransport?: GoogleAdsRequestTransport;
  responseTransport?: GoogleAdsResponseTransport;
  validator?: GoogleAdsTransportValidator;
  now?: GoogleAdsTransportClock;
  timestamp?: GoogleAdsTransportTimestamp;
  idFactory?: GoogleAdsTransportIdFactory;
}

const defaultClock: GoogleAdsTransportClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function versionOf(configuration: unknown): GoogleAdsTransportVersion {
  if (isRecord(configuration) && configuration.version === "v1") return "v1";
  return "v1";
}

function modeOf(): GoogleAdsTransportMode {
  return "OFFLINE";
}

function reportOf(init: {
  id: string;
  status: GoogleAdsTransportStatus;
  issues: GoogleAdsIssue[];
  health: GoogleAdsTransportHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}): GoogleAdsTransportReport {
  return freezeDeepGoogleAdsTransport({
    id: init.id,
    status: init.status,
    issues: [...init.issues],
    mode: "OFFLINE",
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsTransport(init.metadata),
  });
}

function refused(issues: GoogleAdsIssue[], createdAt: string, id: string, metadata: GoogleAdsMetadata, executionTime = 0): GoogleAdsTransportResult {
  const health: GoogleAdsTransportHealth = "UNAVAILABLE";
  return {
    status: "REJECTED",
    issues,
    preparedRequest: null,
    preparedResponse: null,
    report: reportOf({ id, status: "REJECTED", issues, health, createdAt, metadata }),
    statistics: computeGoogleAdsTransportStatistics({ requestCount: 0, responseCount: 0, resourceCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    health,
    executionTime,
  };
}

export function createGoogleAdsTransport(options: GoogleAdsTransportOptions = {}): GoogleAdsTransport {
  const requestTransport = options.requestTransport ?? createGoogleAdsRequestTransport();
  const responseTransport = options.responseTransport ?? createGoogleAdsResponseTransport();
  const validator = options.validator ?? createGoogleAdsTransportValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `transport-${++serial}`);
  const snapshots = new Map<string, GoogleAdsTransportSnapshot>();

  return {
    requestTransport,
    responseTransport,
    validator,
    healthCheck(input) {
      try {
        const issues = validator.validateInput(input);
        return freezeDeepGoogleAdsTransport({
          status: issues.length > 0 ? "UNAVAILABLE" : "OFFLINE",
          mode: "OFFLINE",
          issues,
        });
      } catch (error) {
        return freezeDeepGoogleAdsTransport({
          status: "UNAVAILABLE",
          mode: "OFFLINE",
          issues: [{ field: "transport", message: error instanceof Error ? error.message : "Transport Configuration Errors: health could not be checked." }],
        });
      }
    },
    prepare(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const inputIssues = validator.validateInput(input);
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainGoogleAdsTransport(input.executionMetadata as GoogleAdsMetadata) : {};
        if (inputIssues.length > 0) return refused(inputIssues, createdAt, id, metadata, Math.max(0, now() - start));
        const draft = input as GoogleAdsTransportInput;
        const version = versionOf(draft.configuration);
        const mode = modeOf();
        const preparedRequest = requestTransport.prepare({
          id,
          requestModel: draft.requestModel,
          version,
          mode,
          metadata,
          createdAt,
        });
        const preparedResponse = responseTransport.prepare({
          id,
          requestId: preparedRequest.id,
          payloadId: preparedRequest.payloadId,
          version,
          mode,
          metadata,
          createdAt,
        });
        const executionTime = Math.max(0, now() - start);
        const builtIssues = [
          ...validator.validatePreparedRequest(preparedRequest),
          ...validator.validatePreparedResponse(preparedResponse),
          ...validator.validateResponse(preparedResponse),
        ];
        if (builtIssues.length > 0) return refused(builtIssues, createdAt, id, metadata, executionTime);
        const snapshot = createGoogleAdsTransportSnapshot({
          transportId: id,
          payloadId: preparedRequest.payloadId,
          requestId: preparedRequest.id,
          responseId: preparedResponse.id,
          mode,
          health: "OFFLINE",
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, createdAt, id, metadata, executionTime);
        snapshots.set(id, snapshot);
        const statistics = computeGoogleAdsTransportStatistics({
          requestCount: 1,
          responseCount: 1,
          resourceCount: resourceCountOf(draft.requestModel),
          issueCount: 0,
          executionTime,
        });
        return {
          status: "OK",
          issues: [],
          preparedRequest,
          preparedResponse,
          report: reportOf({ id, status: "OK", issues: [], health: "OFFLINE", createdAt, metadata }),
          statistics,
          snapshot,
          metadata: preparedRequest.metadata,
          health: "OFFLINE",
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "transport", message: error instanceof Error ? error.message : "Malformed Request: the transport could not prepare the records." }],
          new Date().toISOString(),
          "transport-0",
          {},
        );
      }
    },
    getSnapshot: (transportId) => snapshots.get(transportId) ?? null,
  };
}
