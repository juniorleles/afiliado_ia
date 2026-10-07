/**
 * Host record domain: read-only campaign synchronization context.
 *
 * Interface only. One run is given an authenticated session, a customer id,
 * and campaign resource names. Nothing here is written back.
 */
export type CampaignSyncMetadata = Record<string, string | number | boolean | null>;

export const CAMPAIGN_SYNC_CONTEXT_MEMBERS = [
  "session",
  "customerId",
  "developerToken",
  "campaignResourceNames",
  "localSnapshot",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export const CAMPAIGN_SYNC_SESSION_KEYS = ["sessionId", "authenticated", "tokenType", "expiresIn", "accessToken"] as const;

export interface CampaignSyncSession {
  sessionId: string;
  authenticated: true;
  tokenType: string;
  expiresIn: number;
  accessToken: string;
}

/**
 * Read-only bundle one synchronization run may be given.
 * Nothing here is written back.
 */
export interface CampaignSyncContext {
  session?: CampaignSyncSession;
  customerId?: string;
  developerToken?: string;
  campaignResourceNames?: string[];
  localSnapshot?: unknown;
  executionMetadata?: CampaignSyncMetadata;
  runtimeMetadata?: CampaignSyncMetadata;
}
