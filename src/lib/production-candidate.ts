import type { Campaign } from "@/lib/campaigns";
import { getCampaignById } from "@/lib/campaigns";
import { getDb } from "@/lib/db";

export {
  applyProductionCandidate,
  hasProductionCandidate,
  PRODUCTION_PRESENTATION_ID,
} from "@/lib/production-candidate-view";

export function saveProductionCandidateSnapshot(
  id: number,
  snapshot: {
    productionPageComposition: string;
    productionCreativeCompositionJson: string;
    productionPresentation: string;
  },
): Campaign {
  const existing = getCampaignById(id);
  if (!existing) throw new Error("Campaign not found.");
  if (existing.publicationStatus !== "draft") {
    throw new Error("Production candidate snapshot is written only while publicationStatus is draft.");
  }
  const result = getDb()
    .prepare(
      `UPDATE campaigns
       SET productionPageComposition = @productionPageComposition,
           productionCreativeCompositionJson = @productionCreativeCompositionJson,
           productionPresentation = @productionPresentation,
           updatedAt = @updatedAt
       WHERE id = @id AND publicationStatus = 'draft'`,
    )
    .run({
      ...snapshot,
      updatedAt: new Date().toISOString(),
      id,
    });
  if (result.changes !== 1) {
    throw new Error("Production candidate snapshot was not written.");
  }
  const updated = getCampaignById(id);
  if (!updated) throw new Error("Campaign disappeared after snapshot.");
  if (updated.publicationStatus !== "draft") throw new Error("publicationStatus changed.");
  if (updated.pageComposition !== existing.pageComposition) throw new Error("stored pageComposition changed.");
  if (updated.creativeCompositionJson !== existing.creativeCompositionJson) {
    throw new Error("stored creativeCompositionJson changed.");
  }
  if (updated.headline !== existing.headline) throw new Error("stored headline changed.");
  if (updated.affiliateUrl !== existing.affiliateUrl) throw new Error("affiliateUrl changed.");
  if (updated.publicationStatus !== existing.publicationStatus) throw new Error("publication status diverged.");
  return updated;
}
