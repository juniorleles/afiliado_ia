/**
 * Persist the operator-provided Joint Genesis HopLink.
 * Does not publish and does not change composition or presentation.
 */
import { getCampaignBySlug, updateCampaign } from "../src/lib/campaigns.ts";
import { isClickBankHopUrl } from "../src/lib/clickbank-hop.ts";

const SLUG = "joint-genesis-controlled-ready-13";
const OPERATOR_HOP = "https://93673lt0ykfjdj161evsm8rxca.hop.clickbank.net";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const stored = getCampaignBySlug(SLUG);
if (!stored) fail("campaign missing");
if (stored.publicationStatus !== "draft") fail("campaign is not draft");
if (!isClickBankHopUrl(OPERATOR_HOP)) fail("operator hop host is not a ClickBank hop");

const before = {
  status: stored.publicationStatus,
  page: stored.pageComposition,
  creative: stored.creativeCompositionJson,
  productionPage: stored.productionPageComposition,
  productionCreative: stored.productionCreativeCompositionJson,
  presentation: stored.productionPresentation,
  headline: stored.headline,
};

const updated = updateCampaign(stored.id, {
  name: stored.name,
  slug: stored.slug,
  headline: stored.headline,
  body: stored.body,
  ctaLabel: stored.ctaLabel,
  affiliateUrl: OPERATOR_HOP,
  headScript: stored.headScript,
  adHeadline: stored.adHeadline,
  pageTemplate: stored.pageTemplate,
  pageComposition: stored.pageComposition,
  productImageSrc: stored.productImageSrc,
  productImageProvenance: stored.productImageProvenance,
  subheadline: stored.subheadline,
  sourceFactsJson: stored.sourceFactsJson,
  designPlanJson: stored.designPlanJson,
  visualTheme: stored.visualTheme,
  designVersion: stored.designVersion,
  productAssetStatus: stored.productAssetStatus,
  productAssetMetadata: stored.productAssetMetadata,
  creativeCompositionJson: stored.creativeCompositionJson,
  creativeCompositionVersion: stored.creativeCompositionVersion,
});

if (updated.publicationStatus !== "draft" || updated.publicationStatus !== before.status) fail("publication status changed");
if (updated.pageComposition !== before.page) fail("lab composition changed");
if (updated.creativeCompositionJson !== before.creative) fail("lab creative changed");
if (updated.productionPageComposition !== before.productionPage) fail("production page changed");
if (updated.productionCreativeCompositionJson !== before.productionCreative) fail("production creative changed");
if (updated.productionPresentation !== before.presentation) fail("presentation changed");
if (updated.headline !== before.headline) fail("headline changed");
if (updated.affiliateUrl !== OPERATOR_HOP) fail("affiliate url was not stored");
if (new URL(updated.affiliateUrl).hostname !== "93673lt0ykfjdj161evsm8rxca.hop.clickbank.net") fail("hostname changed");

console.log("OPERATOR_HOP_CONFIGURED=YES");
console.log("PUBLICATION_STATUS=draft");
console.log("COMPOSITION_CHANGED=NO");
