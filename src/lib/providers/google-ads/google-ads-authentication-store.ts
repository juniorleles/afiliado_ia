/**
 * Host record domain: token store.
 *
 * Holds frozen token records for offline sessions. It stores, gets, and lists
 * records. It does not open a token flow, rotate a token, reach an outside
 * system, or send a record. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyPlainGoogleAdsAuthentication,
  freezeDeepGoogleAdsAuthentication,
  type GoogleAdsTokenRecord,
} from "./google-ads-authentication-snapshot";
import { createGoogleAdsTokenValidator } from "./google-ads-authentication-validator";

export interface GoogleAdsTokenStore {
  put(record: GoogleAdsTokenRecord): GoogleAdsIssue[];
  get(sessionId: string): GoogleAdsTokenRecord | null;
  list(): readonly GoogleAdsTokenRecord[];
}

export function createGoogleAdsTokenStore(): GoogleAdsTokenStore {
  const validator = createGoogleAdsTokenValidator();
  const records = new Map<string, GoogleAdsTokenRecord>();
  return {
    put(record) {
      const issues = validator.validateTokens(record);
      if (issues.length > 0) return issues;
      records.set(record.sessionId, freezeDeepGoogleAdsAuthentication(copyPlainGoogleAdsAuthentication(record)));
      return [];
    },
    get: (sessionId) => records.get(sessionId) ?? null,
    list: () => [...records.values()],
  };
}
