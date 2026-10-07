/**
 * Host record domain: campaign publisher client.
 *
 * Sends one mutate request and one status read. The grant is placed on the
 * request and is not returned.
 */
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRoot, googleAuthErrorCodes, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthHttpResponse, type GoogleAuthTransport } from "./google-auth-client";
import type { CampaignMutateBody } from "./campaign-operation-builder";
import type { CampaignPublishIssue } from "./campaign-publisher-session";

const DUPLICATE = new Set(["DUPLICATE_CAMPAIGN_NAME"]);

export interface CampaignMutateCapture {
  httpStatus: number;
  budgetResourceName: string;
  campaignResourceName: string;
  campaignId: string;
}

export type CampaignMutateResult =
  | { ok: true; capture: CampaignMutateCapture }
  | { ok: false; issues: CampaignPublishIssue[] };

export interface CampaignStatusCapture {
  observedStatus: "PAUSED";
}

export type CampaignStatusResult =
  | { ok: true; capture: CampaignStatusCapture }
  | { ok: false; issues: CampaignPublishIssue[] };

function resourceId(resourceName: string, kind: "campaignBudgets" | "campaigns"): string | null {
  const match = new RegExp(`^customers/\\d+/${kind}/(\\d+)$`).exec(resourceName.trim());
  return match?.[1] ?? null;
}

function failure(parsed: unknown, httpStatus: number): CampaignPublishIssue | null {
  const codes = googleAuthErrorCodes(parsed);
  if (codes.some((code) => DUPLICATE.has(code))) {
    return { field: "draft.name", message: "Duplicate Campaign: the account service already has this campaign name." };
  }
  if (httpStatus !== 200 || codes.length > 0) {
    return { field: "draft", message: "API Errors: the account service refused the campaign operation." };
  }
  return null;
}

export function createCampaignPublisherClient(transport?: GoogleAuthTransport) {
  const client = createGoogleAuthHttpClient(transport);
  return {
    async mutate(apiVersion: string, customerId: string, developerToken: string, accessToken: string, body: CampaignMutateBody): Promise<CampaignMutateResult> {
      const response: GoogleAuthHttpResponse = await client.send({
        url: `${googleAdsRoot(apiVersion || GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:mutate`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const parsed = parseGoogleAuthJson(response.bodyText);
      const refused = failure(parsed, response.httpStatus);
      if (refused) return { ok: false, issues: [refused] };
      if (!isGoogleAuthRecord(parsed) || !Array.isArray(parsed.mutateOperationResponses)) {
        return { ok: false, issues: [{ field: "draft", message: "API Errors: the account service did not return a campaign resource." }] };
      }
      let budgetResourceName = "";
      let campaignResourceName = "";
      for (const row of parsed.mutateOperationResponses) {
        if (!isGoogleAuthRecord(row)) continue;
        if (isGoogleAuthRecord(row.campaignBudgetResult) && typeof row.campaignBudgetResult.resourceName === "string") {
          budgetResourceName = row.campaignBudgetResult.resourceName.trim();
        }
        if (isGoogleAuthRecord(row.campaignResult) && typeof row.campaignResult.resourceName === "string") {
          campaignResourceName = row.campaignResult.resourceName.trim();
        }
      }
      const campaignId = resourceId(campaignResourceName, "campaigns");
      if (campaignId === null || resourceId(budgetResourceName, "campaignBudgets") === null) {
        return { ok: false, issues: [{ field: "draft", message: "API Errors: the account service did not return a campaign resource." }] };
      }
      return { ok: true, capture: { httpStatus: response.httpStatus, budgetResourceName, campaignResourceName, campaignId } };
    },
    async readStatus(apiVersion: string, customerId: string, developerToken: string, accessToken: string, campaignResourceName: string): Promise<CampaignStatusResult> {
      const query = `SELECT campaign.id, campaign.status, campaign.resource_name FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`;
      const response = await client.send({
        url: `${googleAdsRoot(apiVersion || GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:search`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query }),
      });
      const parsed = parseGoogleAuthJson(response.bodyText);
      const refused = failure(parsed, response.httpStatus);
      if (refused) return { ok: false, issues: [refused] };
      if (!isGoogleAuthRecord(parsed) || !Array.isArray(parsed.results) || parsed.results.length === 0) {
        return { ok: false, issues: [{ field: "draft", message: "API Errors: the account service did not return the campaign status." }] };
      }
      const row = parsed.results[0];
      if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.campaign) || row.campaign.resourceName !== campaignResourceName) {
        return { ok: false, issues: [{ field: "draft", message: "API Errors: the account service did not return the campaign status." }] };
      }
      if (row.campaign.status !== "PAUSED") {
        return { ok: false, issues: [{ field: "draft.status", message: `API Errors: the campaign ${campaignResourceName} was not paused.` }] };
      }
      return { ok: true, capture: { observedStatus: "PAUSED" } };
    },
  };
}
