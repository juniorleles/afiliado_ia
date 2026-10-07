/**
 * Host record domain: provider health monitor.
 *
 * Local health and consistency checks for one observe-only sync run. It
 * reports OFFLINE when a published campaign and provider state can be
 * observed, and UNAVAILABLE when they cannot. It never creates a campaign
 * and never reaches an outside system. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  freezeDeepGoogleAdsMonitor,
  type GoogleAdsObservedCampaignHealth,
  type GoogleAdsProviderHealthStatus,
} from "./google-ads-monitor-snapshot";
import { createGoogleAdsSynchronizationValidator } from "./google-ads-monitor-validator";

export interface GoogleAdsProviderHealthReport {
  status: GoogleAdsProviderHealthStatus;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  consistent: boolean;
  issues: readonly GoogleAdsIssue[];
}

export interface GoogleAdsProviderHealthMonitor {
  check(input: unknown): GoogleAdsProviderHealthReport;
}

function campaignHealthOf(issues: readonly GoogleAdsIssue[]): GoogleAdsObservedCampaignHealth {
  if (issues.some((item) => /Missing Campaign/.test(`${item.field} ${item.message}`))) return "MISSING";
  if (issues.some((item) => /State Conflict/.test(`${item.field} ${item.message}`))) return "DRIFT";
  if (issues.some((item) => /Invalid Synchronization|Invalid Metadata/.test(`${item.field} ${item.message}`))) return "UNAVAILABLE";
  return "ALIGNED";
}

export function createGoogleAdsProviderHealthMonitor(): GoogleAdsProviderHealthMonitor {
  const validator = createGoogleAdsSynchronizationValidator();
  return {
    check(input) {
      const issues = validator.validateInput(input);
      const campaignHealth = campaignHealthOf(issues);
      const consistent = issues.length === 0;
      return freezeDeepGoogleAdsMonitor({
        status: issues.length > 0 ? "UNAVAILABLE" : "OFFLINE",
        campaignHealth,
        consistent,
        issues,
      });
    },
  };
}

export function googleAdsCampaignHealthOf(issues: readonly GoogleAdsIssue[]): GoogleAdsObservedCampaignHealth {
  return campaignHealthOf(issues);
}
