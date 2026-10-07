/**
 * Host record domain: campaign validation statistics.
 *
 * Pure counters derived from a local validation run. It never changes an
 * issue, never reaches an outside system, and never names a scale.
 */
import type { GoogleAdsPolicyIssue, GoogleAdsPolicyIssueKind } from "./google-ads-policy-snapshot";
import { GOOGLE_ADS_POLICY_ISSUE_KINDS } from "./google-ads-policy-snapshot";

export interface GoogleAdsPolicyStatistics {
  issueCount: number;
  errorCount: number;
  warningCount: number;
  recommendationCount: number;
  informationCount: number;
  campaignCount: number;
  adGroupCount: number;
  rsaCount: number;
}

export interface GoogleAdsPolicyStatisticsExtras {
  campaignCount?: number;
  adGroupCount?: number;
  rsaCount?: number;
}

export function computeGoogleAdsCampaignValidationStatistics(
  issues: readonly GoogleAdsPolicyIssue[],
  extras: GoogleAdsPolicyStatisticsExtras = {},
): GoogleAdsPolicyStatistics {
  const byKind = Object.fromEntries(GOOGLE_ADS_POLICY_ISSUE_KINDS.map((kind) => [kind, 0])) as Record<GoogleAdsPolicyIssueKind, number>;
  for (const item of issues) byKind[item.kind] += 1;
  return {
    issueCount: issues.length,
    errorCount: byKind.ERROR,
    warningCount: byKind.WARNING,
    recommendationCount: byKind.RECOMMENDATION,
    informationCount: byKind.INFORMATION,
    campaignCount: extras.campaignCount ?? 0,
    adGroupCount: extras.adGroupCount ?? 0,
    rsaCount: extras.rsaCount ?? 0,
  };
}
