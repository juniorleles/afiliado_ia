/**
 * Host record domain: response parser.
 *
 * Turns a local execution record or a serialized body into one frozen parsed
 * response. It does not reach an outside system, send a record, or retry.
 * This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  copyPlainGoogleAdsClient,
  freezeDeepGoogleAdsClient,
  type GoogleAdsClientVersion,
  type GoogleAdsParsedResponse,
} from "./google-ads-client-health";

export interface GoogleAdsResponseParser {
  parse(input: unknown): { response: GoogleAdsParsedResponse | null; issues: GoogleAdsIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function bodyOf(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isPlainRecord(parsed) ? copyPlainGoogleAdsClient(parsed) : null;
    } catch {
      return null;
    }
  }
  if (isPlainRecord(value)) return copyPlainGoogleAdsClient(value);
  return null;
}

export function createGoogleAdsResponseParser(): GoogleAdsResponseParser {
  return {
    parse(input) {
      if (!isPlainRecord(input)) {
        return { response: null, issues: [{ field: "response", message: "Malformed Response: a response record is required." }] };
      }
      const body = bodyOf(input.body) ?? (typeof input.text === "string" ? bodyOf(input.text) : isPlainRecord(input.body) ? null : bodyOf(input));
      if (body === null) {
        return { response: null, issues: [{ field: "response.body", message: "Malformed Response: a response body object is required." }] };
      }
      const requestId = typeof input.requestId === "string" && input.requestId.trim() !== "" ? input.requestId : typeof input.id === "string" ? input.id : "";
      if (requestId === "") {
        return { response: null, issues: [{ field: "response.requestId", message: "Malformed Response: a request id is required." }] };
      }
      const version = input.version === "v1" ? "v1" : "v1";
      const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
      const metadata = isPlainRecord(input.metadata) ? copyPlainGoogleAdsClient(input.metadata as GoogleAdsMetadata) : {};
      const response = freezeDeepGoogleAdsClient({
        id: typeof input.id === "string" && input.id.trim() !== "" ? input.id : requestId,
        requestId,
        status: "OFFLINE" as const,
        version: version as GoogleAdsClientVersion,
        body,
        metadata,
        createdAt,
      });
      return { response, issues: [] };
    },
  };
}
