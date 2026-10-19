/**
 * Affiliate-program traffic and terms record for a campaign.
 * Does not publish ads and does not change content gates.
 */

import { getDb } from "@/lib/db";
import { getCampaignById } from "@/lib/campaigns";

export type TrafficPolicyStatus = "BLOCKED" | "ALLOWED" | "UNKNOWN";
export type GoogleAdsPolicyStatus = "UNKNOWN" | "REVIEW_REQUIRED" | "BLOCKED";

export type AffiliateProgramRecord = {
  version: 1;
  platform: "ClickBank";
  vendorId: string | null;
  affiliatePageUrl: string;
  termsUrl: string;
  termsVerifiedAt: string;
  productSalesUrl: string | null;
  brandPpc: TrafficPolicyStatus;
  genericSearchPpc: TrafficPolicyStatus;
  googleAdsPolicy: GoogleAdsPolicyStatus;
  directCheckoutLinking: "FORBIDDEN" | "ALLOWED" | "UNKNOWN";
  personalHoplink: string | null;
  notes: string[];
};

export function readAffiliateProgram(campaignId: number): AffiliateProgramRecord | null {
  const row = getDb().prepare("SELECT affiliateProgramJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { affiliateProgramJson: string | null }
    | undefined;
  if (!row?.affiliateProgramJson) return null;
  try {
    const parsed = JSON.parse(row.affiliateProgramJson) as AffiliateProgramRecord;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAffiliateProgram(campaignId: number, record: AffiliateProgramRecord): void {
  const existing = getCampaignById(campaignId);
  if (!existing) throw new Error("Campaign not found.");
  if (record.personalHoplink?.includes("YourClickBankNickname")) {
    throw new Error("Placeholder affiliate IDs are not valid hoplinks.");
  }
  getDb()
    .prepare("UPDATE campaigns SET affiliateProgramJson = ?, updatedAt = ? WHERE id = ?")
    .run(JSON.stringify(record), new Date().toISOString(), campaignId);
  const updated = getCampaignById(campaignId);
  if (!updated) throw new Error("Failed to read campaign after affiliate program write.");
  if (
    updated.publicationStatus !== existing.publicationStatus
    || updated.publishedAt !== existing.publishedAt
    || updated.sourceFactsJson !== existing.sourceFactsJson
  ) {
    throw new Error("Affiliate program write must not change publication or Product Facts.");
  }
}
