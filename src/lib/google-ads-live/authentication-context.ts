/**
 * Host record domain: read-only authentication context.
 *
 * Interface only. One run is given OAuth configuration and flat metadata.
 * Credential values are read for the request and are not written back.
 */
export type GoogleAuthMetadata = Record<string, string | number | boolean | null>;

export const GOOGLE_AUTH_CONTEXT_MEMBERS = ["configuration", "executionMetadata", "runtimeMetadata"] as const;

export interface GoogleAuthConfiguration {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string;
  apiVersion?: string;
}

/**
 * Read-only bundle one authentication run may be given.
 * Nothing here is written back.
 */
export interface GoogleAuthContext {
  configuration?: GoogleAuthConfiguration;
  executionMetadata?: GoogleAuthMetadata;
  runtimeMetadata?: GoogleAuthMetadata;
}
