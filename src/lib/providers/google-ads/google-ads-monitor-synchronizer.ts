/**
 * Host record domain: campaign synchronizer.
 *
 * Restates a published campaign and a provider state into one frozen
 * synchronization result. It observes listed status tokens and a timestamp.
 * It never creates a campaign, never repairs drift, and never reaches an
 * outside system. This layer stays offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  copyPlainGoogleAdsMonitor,
  freezeDeepGoogleAdsMonitor,
  type GoogleAdsProviderStatus,
  type GoogleAdsSynchronizationResult,
} from "./google-ads-monitor-snapshot";

export interface GoogleAdsCampaignSynchronizerInit {
  id: string;
  publishedCampaign: unknown;
  providerState: unknown;
  metadata?: GoogleAdsMetadata;
  synchronizedAt: string;
}

export interface GoogleAdsCampaignSynchronizer {
  synchronize(init: GoogleAdsCampaignSynchronizerInit): { result: GoogleAdsSynchronizationResult; providerStatus: GoogleAdsProviderStatus };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function campaignIdOf(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return textOf(value.campaignId) ?? textOf(value.id);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function createGoogleAdsCampaignSynchronizer(): GoogleAdsCampaignSynchronizer {
  return {
    synchronize(init) {
      const published = isRecord(init.publishedCampaign) ? init.publishedCampaign : {};
      const provider = isRecord(init.providerState) ? init.providerState : {};
      const campaignId = campaignIdOf(init.providerState) ?? campaignIdOf(init.publishedCampaign);
      const providerStatus: GoogleAdsProviderStatus = freezeDeepGoogleAdsMonitor({
        campaignId,
        campaignStatus: pick(provider.campaignStatus ?? published.campaignStatus, ["ACTIVE", "PAUSED", "ARCHIVED", "UNKNOWN"], "UNKNOWN"),
        budgetStatus: pick(provider.budgetStatus ?? published.budgetStatus, ["PRESENT", "MISSING", "UNKNOWN"], "UNKNOWN"),
        approvalStatus: pick(provider.approvalStatus ?? published.approvalStatus, ["APPROVED", "PENDING", "DISAPPROVED", "UNKNOWN"], "UNKNOWN"),
        policyStatus: pick(provider.policyStatus ?? published.policyStatus, ["CLEAR", "FLAGGED", "UNKNOWN"], "UNKNOWN"),
        adGroupStatus: pick(provider.adGroupStatus ?? published.adGroupStatus, ["ACTIVE", "PAUSED", "UNKNOWN"], "UNKNOWN"),
        adStatus: pick(provider.adStatus ?? published.adStatus, ["ACTIVE", "PAUSED", "UNKNOWN"], "UNKNOWN"),
      });
      const result: GoogleAdsSynchronizationResult = freezeDeepGoogleAdsMonitor({
        id: init.id,
        campaignId: providerStatus.campaignId,
        campaignStatus: providerStatus.campaignStatus,
        budgetStatus: providerStatus.budgetStatus,
        approvalStatus: providerStatus.approvalStatus,
        policyStatus: providerStatus.policyStatus,
        adGroupStatus: providerStatus.adGroupStatus,
        adStatus: providerStatus.adStatus,
        synchronizedAt: init.synchronizedAt,
        metadata: copyPlainGoogleAdsMonitor(init.metadata ?? {}),
      });
      return { result, providerStatus };
    },
  };
}
