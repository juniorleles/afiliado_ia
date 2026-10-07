/**
 * Host record domain: read-only metrics collection context.
 *
 * Interface only. One run is given an authenticated session, a customer id,
 * and campaign resource names. Nothing here is written back.
 */
export type MetricsMetadata = Record<string, string | number | boolean | null>;

export const METRICS_CONTEXT_MEMBERS = [
  "session",
  "customerId",
  "developerToken",
  "campaignResourceNames",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export const METRICS_SESSION_KEYS = ["sessionId", "authenticated", "tokenType", "expiresIn", "accessToken"] as const;

export interface MetricsSession {
  sessionId: string;
  authenticated: true;
  tokenType: string;
  expiresIn: number;
  accessToken: string;
}

/**
 * Read-only bundle one collection run may be given.
 * Nothing here is written back.
 */
export interface MetricsContext {
  session?: MetricsSession;
  customerId?: string;
  developerToken?: string;
  campaignResourceNames?: string[];
  executionMetadata?: MetricsMetadata;
  runtimeMetadata?: MetricsMetadata;
}
