/**
 * Host record domain: publish error mapper.
 *
 * Maps local issues into a frozen error report. It names authentication,
 * validation, provider, transport, rate, conflict, and unknown errors. It
 * never retries and never changes the input. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import { copyPlainGoogleAdsPublish, freezeDeepGoogleAdsPublish } from "./google-ads-publish-snapshot";

export const GOOGLE_ADS_PUBLISH_ERROR_KINDS = [
  "AUTHENTICATION",
  "VALIDATION",
  "PROVIDER",
  "TRANSPORT",
  "RATE",
  "CONFLICT",
  "UNKNOWN",
] as const;
export type GoogleAdsPublishErrorKind = (typeof GOOGLE_ADS_PUBLISH_ERROR_KINDS)[number];

export interface GoogleAdsPublishError {
  kind: GoogleAdsPublishErrorKind;
  field: string;
  message: string;
}

export const GOOGLE_ADS_PUBLISH_ERROR_REPORT_KEYS = ["id", "errors", "createdAt"] as const;

export interface GoogleAdsPublishErrorReport {
  id: string;
  errors: readonly GoogleAdsPublishError[];
  createdAt: string;
}

export interface GoogleAdsPublishErrorMapper {
  map(issues: readonly GoogleAdsIssue[], id: string, createdAt: string): GoogleAdsPublishErrorReport;
  kindOf(issue: GoogleAdsIssue): GoogleAdsPublishErrorKind;
}

function kindOf(issue: GoogleAdsIssue): GoogleAdsPublishErrorKind {
  const text = `${issue.field} ${issue.message}`;
  if (/Missing Authentication|Authentication Failure|Invalid Session/i.test(text)) return "AUTHENTICATION";
  if (/Provider Failure|Malformed Provider Response/i.test(text)) return "PROVIDER";
  if (/Transport Failure/i.test(text)) return "TRANSPORT";
  if (/Rate/.test(text) && /Limit/i.test(text)) return "RATE";
  if (/Conflict/i.test(text)) return "CONFLICT";
  if (/Unknown Error/i.test(text)) return "UNKNOWN";
  if (/Invalid Execution Plan|Unsupported Operation|Invalid Metadata|Validation Failure|Invalid Request/i.test(text)) return "VALIDATION";
  return "UNKNOWN";
}

export function createGoogleAdsPublishErrorMapper(): GoogleAdsPublishErrorMapper {
  return {
    kindOf,
    map(issues, id, createdAt) {
      return freezeDeepGoogleAdsPublish({
        id,
        errors: issues.map((item) => ({ kind: kindOf(item), field: item.field, message: item.message })),
        createdAt,
      });
    },
  };
}

export function copyGoogleAdsPublishErrorReport(report: GoogleAdsPublishErrorReport): GoogleAdsPublishErrorReport {
  return freezeDeepGoogleAdsPublish(copyPlainGoogleAdsPublish(report));
}
