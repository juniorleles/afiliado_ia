import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { PRODUCTION_PRESENTATION_ID, saveProductionCandidateSnapshot } from "../src/lib/production-candidate.ts";

const slug = "joint-genesis-controlled-ready-13";
const before = getCampaignBySlug(slug);
if (!before?.productionPageComposition || !before.productionCreativeCompositionJson) {
  throw new Error("missing production candidate");
}
const page = before.productionPageComposition;
const creative = before.productionCreativeCompositionJson;
const hop = before.affiliateUrl;
const status = before.publicationStatus;
saveProductionCandidateSnapshot(before.id, {
  productionPageComposition: page,
  productionCreativeCompositionJson: creative,
  productionPresentation: PRODUCTION_PRESENTATION_ID,
});
const after = getCampaignBySlug(slug);
if (!after) throw new Error("campaign missing after snapshot");
if (after.productionPageComposition !== page) throw new Error("page composition changed");
if (after.productionCreativeCompositionJson !== creative) throw new Error("creative composition changed");
if (after.affiliateUrl !== hop) throw new Error("affiliate url changed");
if (after.publicationStatus !== "draft" || after.publicationStatus !== status) {
  throw new Error("publication status changed");
}
if (after.pageComposition !== before.pageComposition) throw new Error("lab composition changed");
console.log("PRESENTATION=" + after.productionPresentation);
console.log("PUBLICATION_STATUS=" + after.publicationStatus);
console.log("PAGE_UNCHANGED=YES");
console.log("AFFILIATE_URL_CHANGED=NO");
