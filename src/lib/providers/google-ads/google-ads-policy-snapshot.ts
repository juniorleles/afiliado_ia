/**
 * Host record domain: campaign policy snapshot.
 *
 * A frozen record of one local validation run: the validation id, the campaign
 * model id, the ad group model id, the RSA model id, the execution plan id,
 * the issue ids, campaign health, a creation timestamp, and flat metadata. It
 * never reaches an outside system, never authenticates, and never submits a
 * record for review.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_POLICY_ISSUE_KINDS = ["ERROR", "WARNING", "RECOMMENDATION", "INFORMATION"] as const;
export type GoogleAdsPolicyIssueKind = (typeof GOOGLE_ADS_POLICY_ISSUE_KINDS)[number];

export const GOOGLE_ADS_POLICY_AREAS = [
  "campaignStructure",
  "adGroups",
  "responsiveSearchAds",
  "requiredFields",
  "urls",
  "trackingTemplates",
  "duplicateAssets",
  "metadata",
] as const;
export type GoogleAdsPolicyArea = (typeof GOOGLE_ADS_POLICY_AREAS)[number];

export const GOOGLE_ADS_CAMPAIGN_HEALTH = ["HEALTHY", "ATTENTION", "UNHEALTHY"] as const;
export type GoogleAdsCampaignHealth = (typeof GOOGLE_ADS_CAMPAIGN_HEALTH)[number];

export const GOOGLE_ADS_POLICY_ISSUE_KEYS = ["id", "kind", "area", "field", "message"] as const;

export interface GoogleAdsPolicyIssue {
  id: string;
  kind: GoogleAdsPolicyIssueKind;
  area: GoogleAdsPolicyArea;
  field: string;
  message: string;
}

export const GOOGLE_ADS_POLICY_SNAPSHOT_KEYS = [
  "validationId",
  "campaignModelId",
  "adGroupModelId",
  "rsaModelId",
  "executionPlanId",
  "issueIds",
  "health",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsPolicySnapshot {
  validationId: string;
  /** The campaign model this run reads. A reference only. */
  campaignModelId: string | null;
  /** The ad group model this run reads. A reference only. */
  adGroupModelId: string | null;
  /** The RSA model this run reads. A reference only. */
  rsaModelId: string | null;
  /** The execution plan this run reads. A reference only. */
  executionPlanId: string | null;
  issueIds: readonly string[];
  health: GoogleAdsCampaignHealth;
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_POLICY_REPORT_KEYS = [
  "id",
  "status",
  "health",
  "issues",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

export interface GoogleAdsPolicyReport {
  id: string;
  status: "OK" | "REJECTED";
  health: GoogleAdsCampaignHealth;
  issues: readonly GoogleAdsPolicyIssue[];
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export interface GoogleAdsPolicySnapshotInit {
  validationId: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  rsaModelId: string | null;
  executionPlanId: string | null;
  issueIds: readonly string[];
  health: GoogleAdsCampaignHealth;
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsPolicy<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsPolicy(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsPolicy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsPolicy(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsPolicy(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

export function campaignHealthOf(issues: readonly GoogleAdsPolicyIssue[]): GoogleAdsCampaignHealth {
  if (issues.some((item) => item.kind === "ERROR")) return "UNHEALTHY";
  if (issues.some((item) => item.kind === "WARNING" || item.kind === "RECOMMENDATION")) return "ATTENTION";
  return "HEALTHY";
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsCampaignPolicySnapshot(init: GoogleAdsPolicySnapshotInit): GoogleAdsPolicySnapshot {
  return freezeDeepGoogleAdsPolicy({
    validationId: init.validationId,
    campaignModelId: init.campaignModelId,
    adGroupModelId: init.adGroupModelId,
    rsaModelId: init.rsaModelId,
    executionPlanId: init.executionPlanId,
    issueIds: [...init.issueIds],
    health: init.health,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsPolicy(init.metadata ?? {}),
  });
}
