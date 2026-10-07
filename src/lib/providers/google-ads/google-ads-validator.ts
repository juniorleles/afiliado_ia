/**
 * Host record domain: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No graph walks ship in this step. The rules a later step must hold:
 *
 *  - Invalid Campaign: a campaign record that is not well-formed is rejected;
 *  - Duplicate Ad Group: a second registration of the same group id is
 *    rejected;
 *  - Duplicate Keyword: a second registration of the same term id is rejected;
 *  - Invalid URL: a destination that is not a well-formed address is rejected;
 *  - Invalid Metadata: metadata must be a flat record of text, numbers,
 *    booleans, or null.
 *
 * This validator does not judge an execution contract or an execution plan.
 */
import type { GoogleAdsAdGroup, GoogleAdsCampaign, GoogleAdsKeyword } from "./google-ads-types";

export interface GoogleAdsIssue {
  field: string;
  message: string;
}

export interface GoogleAdsValidator {
  validateCampaign(input: unknown): GoogleAdsIssue[];
  validateAdGroup(input: unknown): GoogleAdsIssue[];
  validateKeyword(input: unknown): GoogleAdsIssue[];
  validateUrl(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateContext(input: unknown): GoogleAdsIssue[];
  validateModel(input: unknown): GoogleAdsIssue[];
  /** Invalid Campaign, Duplicate Ad Group, Duplicate Keyword. */
  validateGraph(campaigns: GoogleAdsCampaign[], adGroups: GoogleAdsAdGroup[], keywords: GoogleAdsKeyword[]): GoogleAdsIssue[];
}
