/**
 * Host record domain: authentication snapshot.
 *
 * A frozen record of one offline authentication run: the authentication id,
 * the session id, the client id, the customer id, the mode, a health token, a
 * creation timestamp, and flat metadata. It never reaches an outside system,
 * never opens a token flow, and never sends a record. This layer stays
 * offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_AUTHENTICATION_MODES = ["OFFLINE"] as const;
export type GoogleAdsAuthenticationMode = (typeof GOOGLE_ADS_AUTHENTICATION_MODES)[number];

export const GOOGLE_ADS_AUTHENTICATION_HEALTH = ["OFFLINE", "UNAVAILABLE"] as const;
export type GoogleAdsAuthenticationHealth = (typeof GOOGLE_ADS_AUTHENTICATION_HEALTH)[number];

export const GOOGLE_ADS_CONFIGURATION_STATUSES = ["LOADED", "REJECTED"] as const;
export type GoogleAdsConfigurationStatus = (typeof GOOGLE_ADS_CONFIGURATION_STATUSES)[number];

export const GOOGLE_ADS_OAUTH_CONFIGURATION_KEYS = [
  "clientId",
  "clientSecret",
  "developerToken",
  "refreshToken",
  "accessToken",
  "customerId",
  "loginCustomerId",
  "environment",
  "mode",
] as const;

export interface GoogleAdsOAuthConfiguration {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string | null;
  accessToken: string | null;
  customerId: string;
  loginCustomerId: string | null;
  environment: string;
  mode: GoogleAdsAuthenticationMode;
}

export const GOOGLE_ADS_TOKEN_RECORD_KEYS = ["sessionId", "accessToken", "refreshToken", "developerToken"] as const;

export interface GoogleAdsTokenRecord {
  sessionId: string;
  accessToken: string | null;
  refreshToken: string | null;
  developerToken: string;
}

export const GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS = [
  "id",
  "clientId",
  "customerId",
  "loginCustomerId",
  "environment",
  "mode",
  "sessionId",
  "configurationStatus",
  "metadata",
  "createdAt",
] as const;

export interface GoogleAdsAuthenticationContext {
  id: string;
  clientId: string;
  customerId: string;
  loginCustomerId: string | null;
  environment: string;
  mode: GoogleAdsAuthenticationMode;
  sessionId: string;
  configurationStatus: GoogleAdsConfigurationStatus;
  metadata: GoogleAdsMetadata;
  createdAt: string;
}

export const GOOGLE_ADS_SESSION_METADATA_KEYS = [
  "id",
  "authenticationId",
  "customerId",
  "loginCustomerId",
  "environment",
  "mode",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsSessionMetadata {
  id: string;
  authenticationId: string;
  customerId: string;
  loginCustomerId: string | null;
  environment: string;
  mode: GoogleAdsAuthenticationMode;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_AUTHENTICATION_REPORT_KEYS = [
  "id",
  "status",
  "issues",
  "configurationStatus",
  "health",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsAuthenticationReport {
  id: string;
  status: "OK" | "REJECTED";
  issues: readonly { field: string; message: string }[];
  configurationStatus: GoogleAdsConfigurationStatus;
  health: GoogleAdsAuthenticationHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS = [
  "authenticationId",
  "sessionId",
  "clientId",
  "customerId",
  "mode",
  "health",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsAuthenticationSnapshot {
  authenticationId: string;
  sessionId: string | null;
  clientId: string | null;
  customerId: string | null;
  mode: GoogleAdsAuthenticationMode;
  health: GoogleAdsAuthenticationHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsAuthenticationSnapshotInit {
  authenticationId: string;
  sessionId: string | null;
  clientId: string | null;
  customerId: string | null;
  mode: GoogleAdsAuthenticationMode;
  health: GoogleAdsAuthenticationHealth;
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsAuthenticationHealthReport {
  status: GoogleAdsAuthenticationHealth;
  mode: GoogleAdsAuthenticationMode;
  issues: readonly { field: string; message: string }[];
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsAuthentication<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsAuthentication(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsAuthentication<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsAuthentication(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsAuthentication(inner)])) as T;
  }
  return value;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsAuthenticationSnapshot(init: GoogleAdsAuthenticationSnapshotInit): GoogleAdsAuthenticationSnapshot {
  return freezeDeepGoogleAdsAuthentication({
    authenticationId: init.authenticationId,
    sessionId: init.sessionId,
    clientId: init.clientId,
    customerId: init.customerId,
    mode: init.mode,
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsAuthentication(init.metadata ?? {}),
  });
}
