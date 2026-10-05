/**
 * Host record domain: OAuth configuration.
 *
 * Loads a read-only configuration record into one frozen OAuth configuration.
 * It restates client, token, customer, and environment fields. It does not
 * open a token flow, reach an outside system, or send a record. This layer
 * stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyPlainGoogleAdsAuthentication,
  freezeDeepGoogleAdsAuthentication,
  type GoogleAdsOAuthConfiguration,
} from "./google-ads-authentication-snapshot";
import { createGoogleAdsTokenValidator } from "./google-ads-authentication-validator";

export interface GoogleAdsOAuthConfigurationLoad {
  configuration: GoogleAdsOAuthConfiguration | null;
  issues: GoogleAdsIssue[];
}

export interface GoogleAdsOAuthConfigurationLoader {
  load(input: unknown): GoogleAdsOAuthConfigurationLoad;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

export function createGoogleAdsOAuthConfiguration(): GoogleAdsOAuthConfigurationLoader {
  const validator = createGoogleAdsTokenValidator();
  return {
    load(input) {
      const issues = validator.validateConfiguration(input);
      if (issues.length > 0) return { configuration: null, issues };
      const record = isRecord(input) ? input : {};
      return {
        configuration: freezeDeepGoogleAdsAuthentication({
          clientId: textOf(record.clientId) ?? "",
          clientSecret: textOf(record.clientSecret) ?? "",
          developerToken: textOf(record.developerToken) ?? "",
          refreshToken: textOf(record.refreshToken),
          accessToken: textOf(record.accessToken),
          customerId: textOf(record.customerId) ?? "",
          loginCustomerId: textOf(record.loginCustomerId),
          environment: textOf(record.environment) ?? "local",
          mode: "OFFLINE",
        }),
        issues: [],
      };
    },
  };
}

export function copyGoogleAdsOAuthConfiguration(value: GoogleAdsOAuthConfiguration): GoogleAdsOAuthConfiguration {
  return freezeDeepGoogleAdsAuthentication(copyPlainGoogleAdsAuthentication(value));
}
