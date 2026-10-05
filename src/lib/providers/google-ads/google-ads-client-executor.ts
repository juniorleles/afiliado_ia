/**
 * Host record domain: request executor.
 *
 * Attaches a read-only session to a prepared request and records one local
 * execution. It does not reach an outside system, send a record, retry, or
 * run a batch. This layer stays offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyPlainGoogleAdsClient,
  freezeDeepGoogleAdsClient,
  type GoogleAdsClientVersion,
  type GoogleAdsExecutionResult,
} from "./google-ads-client-health";

export interface GoogleAdsRequestExecutorInit {
  id: string;
  sessionId: string;
  requestId: string;
  requestBody: unknown;
  version: GoogleAdsClientVersion;
  metadata?: GoogleAdsMetadata;
  createdAt: string;
}

export interface GoogleAdsRequestExecutor {
  execute(init: GoogleAdsRequestExecutorInit): { execution: GoogleAdsExecutionResult | null; issues: GoogleAdsIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function createGoogleAdsRequestExecutor(): GoogleAdsRequestExecutor {
  return {
    execute(init) {
      if (!init.sessionId || !init.requestId) {
        return { execution: null, issues: [{ field: "execution", message: "Invalid Request: a session id and a request id are required." }] };
      }
      const body = isPlainRecord(init.requestBody)
        ? copyPlainGoogleAdsClient(init.requestBody)
        : { status: "OFFLINE", requestId: init.requestId, sessionId: init.sessionId };
      return {
        execution: freezeDeepGoogleAdsClient({
          id: init.id,
          requestId: init.requestId,
          sessionId: init.sessionId,
          status: "OK",
          version: init.version,
          mode: "OFFLINE",
          body,
          createdAt: init.createdAt,
          metadata: copyPlainGoogleAdsClient(init.metadata ?? {}),
        }),
        issues: [],
      };
    },
  };
}
