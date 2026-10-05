/**
 * Host record domain: client error mapper.
 *
 * Maps local issues into a frozen error report. It names authentication,
 * authorization, validation, transport, rate, temporary, and permanent
 * errors. It only classifies records it is given: it never retries, never
 * sends a record, and never changes the input. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import { copyPlainGoogleAdsClient, freezeDeepGoogleAdsClient } from "./google-ads-client-health";

export const GOOGLE_ADS_CLIENT_ERROR_KINDS = [
  "AUTHENTICATION",
  "AUTHORIZATION",
  "VALIDATION",
  "TRANSPORT",
  "RATE",
  "TEMPORARY",
  "PERMANENT",
] as const;
export type GoogleAdsClientErrorKind = (typeof GOOGLE_ADS_CLIENT_ERROR_KINDS)[number];

export const GOOGLE_ADS_CLIENT_ERROR_KEYS = ["kind", "field", "message"] as const;

export interface GoogleAdsClientError {
  kind: GoogleAdsClientErrorKind;
  field: string;
  message: string;
}

export const GOOGLE_ADS_CLIENT_ERROR_REPORT_KEYS = ["id", "errors", "createdAt"] as const;

export interface GoogleAdsClientErrorReport {
  id: string;
  errors: readonly GoogleAdsClientError[];
  createdAt: string;
}

export interface GoogleAdsErrorMapper {
  map(issues: readonly GoogleAdsIssue[], id: string, createdAt: string): GoogleAdsClientErrorReport;
  kindOf(issue: GoogleAdsIssue): GoogleAdsClientErrorKind;
}

function kindOf(issue: GoogleAdsIssue): GoogleAdsClientErrorKind {
  const text = `${issue.field} ${issue.message}`;
  if (/Invalid Session|Authentication Error/i.test(text)) return "AUTHENTICATION";
  if (/Authorization Error/i.test(text)) return "AUTHORIZATION";
  if (/Transport Error/i.test(text)) return "TRANSPORT";
  if (/Rate/.test(text) && /Limit Error/i.test(text)) return "RATE";
  if (/Temporary Error/i.test(text)) return "TEMPORARY";
  if (/Permanent Error|Malformed Response/i.test(text)) return "PERMANENT";
  if (/Unsupported API Version|Invalid Request|Invalid Metadata|Validation Error/i.test(text)) return "VALIDATION";
  return "VALIDATION";
}

export function createGoogleAdsErrorMapper(): GoogleAdsErrorMapper {
  return {
    kindOf,
    map(issues, id, createdAt) {
      return freezeDeepGoogleAdsClient({
        id,
        errors: issues.map((issue) => ({ kind: kindOf(issue), field: issue.field, message: issue.message })),
        createdAt,
      });
    },
  };
}

export function copyGoogleAdsClientErrorReport(report: GoogleAdsClientErrorReport): GoogleAdsClientErrorReport {
  return freezeDeepGoogleAdsClient(copyPlainGoogleAdsClient(report));
}
