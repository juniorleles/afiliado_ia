import { getDb } from "@/lib/db";

/** Read-only view of the single page already stored on a campaign. */

export function landingDocumentCampaignIds(): Set<number> {
  const rows = getDb()
    .prepare(
      `SELECT id FROM campaigns
       WHERE landingDocumentJson IS NOT NULL
         AND length(trim(landingDocumentJson)) > 0`,
    )
    .all() as { id: number }[];
  return new Set(rows.map((row) => row.id));
}

export function campaignHasLanding(
  campaign: {
    id?: number;
    headline: string;
    body: string;
    pageComposition?: string | null;
    productionPageComposition?: string | null;
  },
  documents?: Set<number>,
): boolean {
  if (
    campaign.productionPageComposition?.trim()
    || campaign.pageComposition?.trim()
    || campaign.body.trim()
    || campaign.headline.trim()
  ) {
    return true;
  }
  return Boolean(campaign.id && (documents ?? landingDocumentCampaignIds()).has(campaign.id));
}

export function landingTitle(campaign: { name: string; headline: string }): string {
  return campaign.headline.trim() || campaign.name;
}
