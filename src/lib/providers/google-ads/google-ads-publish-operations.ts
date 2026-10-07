/**
 * Host record domain: publish operations.
 *
 * Each operation restates an explicit create, update, pause, resume, or
 * archive record. It does not choose an operation, adjust a budget, retry, or
 * reach an outside system. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import { copyPlainGoogleAdsPublish, freezeDeepGoogleAdsPublish, type GoogleAdsPublishOperationKind } from "./google-ads-publish-snapshot";

export interface GoogleAdsPublishOperationInput {
  planId: string;
  providerId: string;
  campaignId: string;
  sessionId: string | null;
}

export interface GoogleAdsPublishOperationRecord {
  operation: GoogleAdsPublishOperationKind;
  planId: string;
  providerId: string;
  campaignId: string;
  sessionId: string | null;
}

export interface GoogleAdsPublishOperation {
  readonly kind: GoogleAdsPublishOperationKind;
  apply(input: GoogleAdsPublishOperationInput): { record: GoogleAdsPublishOperationRecord; issues: GoogleAdsIssue[] };
}

function recordOf(kind: GoogleAdsPublishOperationKind, input: GoogleAdsPublishOperationInput): GoogleAdsPublishOperationRecord {
  return freezeDeepGoogleAdsPublish(copyPlainGoogleAdsPublish({
    operation: kind,
    planId: input.planId,
    providerId: input.providerId,
    campaignId: input.campaignId,
    sessionId: input.sessionId,
  }));
}

function createOperation(kind: GoogleAdsPublishOperationKind): GoogleAdsPublishOperation {
  return {
    kind,
    apply(input) {
      if (!input.planId || !input.providerId || !input.campaignId) {
        return { record: recordOf(kind, { planId: input.planId ?? "", providerId: input.providerId ?? "", campaignId: input.campaignId ?? "", sessionId: input.sessionId }), issues: [{ field: "operation", message: "Invalid Execution Plan: a plan id, provider id, and campaign id are required." }] };
      }
      return { record: recordOf(kind, input), issues: [] };
    },
  };
}

export function createGoogleAdsCampaignCreateOperation(): GoogleAdsPublishOperation {
  return createOperation("CREATE");
}

export function createGoogleAdsCampaignUpdateOperation(): GoogleAdsPublishOperation {
  return createOperation("UPDATE");
}

export function createGoogleAdsCampaignPauseOperation(): GoogleAdsPublishOperation {
  return createOperation("PAUSE");
}

export function createGoogleAdsCampaignResumeOperation(): GoogleAdsPublishOperation {
  return createOperation("RESUME");
}

export function createGoogleAdsCampaignArchiveOperation(): GoogleAdsPublishOperation {
  return createOperation("ARCHIVE");
}

export function googleAdsPublishOperationOf(kind: GoogleAdsPublishOperationKind): GoogleAdsPublishOperation {
  if (kind === "CREATE") return createGoogleAdsCampaignCreateOperation();
  if (kind === "UPDATE") return createGoogleAdsCampaignUpdateOperation();
  if (kind === "PAUSE") return createGoogleAdsCampaignPauseOperation();
  if (kind === "RESUME") return createGoogleAdsCampaignResumeOperation();
  return createGoogleAdsCampaignArchiveOperation();
}
