/**
 * Host record domain: registry contract.
 *
 * Interface only. The registry is the single list of campaigns, groups, and
 * terms the host may use. It supports registering a record, validating one
 * without registering it, and listing them. No implementation ships in this
 * step.
 *
 * Register rejects a duplicate group id or a duplicate term id. Validate
 * reports without registering.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsAdGroup, GoogleAdsCampaign, GoogleAdsKeyword } from "./google-ads-types";

export interface GoogleAdsRegistry {
  /** Adds a campaign. Rejects an invalid campaign. */
  registerCampaign(campaign: GoogleAdsCampaign): GoogleAdsCampaign;
  /** Adds a group. Rejects an invalid group or a duplicate group id. */
  registerAdGroup(adGroup: GoogleAdsAdGroup): GoogleAdsAdGroup;
  /** Adds a term. Rejects an invalid term or a duplicate term id. */
  registerKeyword(keyword: GoogleAdsKeyword): GoogleAdsKeyword;
  getCampaign(id: string): GoogleAdsCampaign | null;
  getAdGroup(id: string): GoogleAdsAdGroup | null;
  getKeyword(id: string): GoogleAdsKeyword | null;
  listCampaigns(): GoogleAdsCampaign[];
  listAdGroups(): GoogleAdsAdGroup[];
  listKeywords(): GoogleAdsKeyword[];
  /** Reports problems with a campaign without registering it. */
  validateCampaign(campaign: unknown): GoogleAdsIssue[];
  /** Reports problems with a group without registering it. */
  validateAdGroup(adGroup: unknown): GoogleAdsIssue[];
  /** Reports problems with a term without registering it. */
  validateKeyword(keyword: unknown): GoogleAdsIssue[];
}
