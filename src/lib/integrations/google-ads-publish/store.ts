/**
 * Local record of one paused Google Ads publish.
 *
 * Resource names and observed delivery numbers only. No tokens.
 */
import { getDb } from "@/lib/db";

export type GoogleAdsPublication = {
  id: string;
  localCampaignId: number;
  customerId: string;
  googleCampaignId: string | null;
  campaignResourceName: string | null;
  adGroupId: string | null;
  adGroupResourceName: string | null;
  adIds: string[];
  keywordResourceNames: string[];
  assetResourceNames: string[];
  status: "PAUSED";
  campaignType: "SEARCH";
  bidding: "MANUAL_CPC" | "MAXIMIZE_CLICKS";
  budgetMicros: number;
  impressions: number | null;
  clicks: number | null;
  costMicros: number | null;
  publishedAt: string;
};

type Row = {
  id: string;
  local_campaign_id: number;
  customer_id: string;
  google_campaign_id: string | null;
  campaign_resource_name: string | null;
  ad_group_id: string | null;
  ad_group_resource_name: string | null;
  ad_ids_json: string;
  keyword_resource_names_json: string;
  asset_resource_names_json: string;
  status: string;
  campaign_type: string;
  bidding: string;
  budget_micros: number;
  impressions: number | null;
  clicks: number | null;
  cost_micros: number | null;
  published_at: string;
};

function strings(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function fromRow(row: Row): GoogleAdsPublication | null {
  if (row.status !== "PAUSED" || row.campaign_type !== "SEARCH") return null;
  if (row.bidding !== "MANUAL_CPC" && row.bidding !== "MAXIMIZE_CLICKS") return null;
  return {
    id: row.id,
    localCampaignId: row.local_campaign_id,
    customerId: row.customer_id,
    googleCampaignId: row.google_campaign_id,
    campaignResourceName: row.campaign_resource_name,
    adGroupId: row.ad_group_id,
    adGroupResourceName: row.ad_group_resource_name,
    adIds: strings(row.ad_ids_json),
    keywordResourceNames: strings(row.keyword_resource_names_json),
    assetResourceNames: strings(row.asset_resource_names_json),
    status: "PAUSED",
    campaignType: "SEARCH",
    bidding: row.bidding,
    budgetMicros: row.budget_micros,
    impressions: row.impressions,
    clicks: row.clicks,
    costMicros: row.cost_micros,
    publishedAt: row.published_at,
  };
}

export function readGoogleAdsPublication(localCampaignId: number): GoogleAdsPublication | null {
  const row = getDb()
    .prepare("SELECT * FROM google_ads_publications WHERE local_campaign_id = ? ORDER BY published_at DESC LIMIT 1")
    .get(localCampaignId) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function insertGoogleAdsPublication(record: GoogleAdsPublication): void {
  getDb()
    .prepare(
      `INSERT INTO google_ads_publications (
        id, local_campaign_id, customer_id, google_campaign_id, campaign_resource_name, ad_group_id,
        ad_group_resource_name, ad_ids_json, keyword_resource_names_json, asset_resource_names_json,
        status, campaign_type, bidding, budget_micros, impressions, clicks, cost_micros, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAUSED', 'SEARCH', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.localCampaignId,
      record.customerId,
      record.googleCampaignId,
      record.campaignResourceName,
      record.adGroupId,
      record.adGroupResourceName,
      JSON.stringify(record.adIds),
      JSON.stringify(record.keywordResourceNames),
      JSON.stringify(record.assetResourceNames),
      record.bidding,
      record.budgetMicros,
      record.impressions,
      record.clicks,
      record.costMicros,
      record.publishedAt,
    );
}
