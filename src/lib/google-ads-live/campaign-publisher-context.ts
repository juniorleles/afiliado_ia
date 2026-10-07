/**
 * Host record domain: read-only campaign publish context.
 *
 * Interface only. One run is given a draft, an authenticated session, and a
 * customer id. The draft is read and not written back.
 */
export type CampaignPublishMetadata = Record<string, string | number | boolean | null>;

export const CAMPAIGN_PUBLISH_CONTEXT_MEMBERS = [
  "draft",
  "session",
  "customerId",
  "developerToken",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export const CAMPAIGN_DRAFT_KEYS = [
  "draftId",
  "name",
  "budgetName",
  "status",
  "channelType",
  "amountMicros",
  "deliveryMethod",
  "bidding",
  "targetGoogleSearch",
  "targetSearchNetwork",
  "targetContentNetwork",
] as const;

export interface CampaignDraft {
  draftId: string;
  name: string;
  budgetName: string;
  status: "PAUSED";
  channelType: "SEARCH";
  amountMicros: number;
  deliveryMethod: "STANDARD";
  bidding: "MANUAL_CPC";
  targetGoogleSearch: boolean;
  targetSearchNetwork: boolean;
  targetContentNetwork: boolean;
}

export interface CampaignPublishSession {
  sessionId: string;
  authenticated: true;
  tokenType: string;
  expiresIn: number;
  accessToken: string;
}

/**
 * Read-only bundle one publish run may be given.
 * Nothing here is written back.
 */
export interface CampaignPublishContext {
  draft?: CampaignDraft;
  session?: CampaignPublishSession;
  customerId?: string;
  developerToken?: string;
  executionMetadata?: CampaignPublishMetadata;
  runtimeMetadata?: CampaignPublishMetadata;
}
