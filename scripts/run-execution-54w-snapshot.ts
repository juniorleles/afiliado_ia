// npx tsx scripts/run-execution-54w-snapshot.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { presentCampaignSources } from "../src/lib/campaign-sources/present.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";

const DIR = path.join("data/evidence/execution-54w-real-presell-generation/reports");

function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  mkdirSync(DIR, { recursive: true });
  const campaign = getCampaignById(237);
  if (!campaign) throw new Error("Campaign 237 missing.");
  const sources = readCampaignSources(237);
  const presented = presentCampaignSources(sources);
  const snap = snapshotProductResearch(237);
  const indicators = indicatorsFromResearch(snap.latest);
  const media = selectReviewMedia({
    assets: snap.latest?.discoveredAssets,
    productName: snap.latest?.productName || campaign.name,
    campaignId: 237,
  });
  const generation = loadApprovedReviewGeneration(237);
  const model = generation?.generationId ? readGenerationModel(generation.generationId) : null;
  const record = generation?.generationId ? readGeneration(generation.generationId) : null;
  const payload = {
    campaign: { id: campaign.id, name: campaign.name },
    coverage: `${indicators.researchCoverage.total}/${indicators.researchCoverage.max}`,
    review: `${indicators.reviewCompletion.accepted}/${indicators.reviewCompletion.total}`,
    assets: `${indicators.assetApproval.approved}/${indicators.assetApproval.total}`,
    publication: indicators.publicationReadiness.status,
    commercial: indicators.commercialAuthorization,
    sales: presented.salesPage?.originalUrl ?? null,
    affiliate: presented.affiliateResource?.originalUrl ?? null,
    hop: presented.trackingHop ? sanitizeSharedUrl(presented.trackingHop.originalUrl) : null,
    authorized: presented.authorizedDestination?.originalUrl ?? null,
    acceptedFacts: acceptedProposals(snap.latest).map((item) => ({
      field: item.field,
      verification: item.verification,
      evidenceIds: item.evidenceIds,
    })),
    media: {
      approved: media.approvedCount,
      eligible: media.eligibleCount,
      used: media.usedCount,
      heroStatus: media.heroStatus,
      approvedItems: media.approved.map((item) => ({
        id: item.assetId,
        kind: item.galleryKind,
        role: item.role,
        used: item.used,
        eligibility: item.editorialEligibility,
      })),
      excluded: media.excluded.map((item) => ({
        id: item.assetId,
        kind: item.galleryKind,
        reason: item.exclusionReason,
      })),
    },
    generation: generation
      ? {
          id: generation.generationId,
          status: generation.status,
          previewPath: generation.previewPath,
          contract: generation.productContractStatus,
          hero: generation.heroImageStatus,
          sandboxCta: record?.sandbox?.ctaPath ?? null,
          hopHref: model?.hopHref ?? null,
          aiUsed: record?.copy?.aiUsed ?? false,
          aiStatus: record?.ai?.status ?? null,
        }
      : null,
  };
  writeFileSync(path.join(DIR, "campaign-237-generation.json"), `${JSON.stringify(payload, null, 2)}\n`);
  if (model) writeFileSync(path.join(DIR, "generated-model-summary.json"), `${JSON.stringify({
    composition: model.composition,
    theme: model.theme,
    density: model.density,
    hopSlot: model.hopSlot,
    hopHref: model.hopHref ?? null,
    sandbox: model.sandbox ?? null,
    hasHero: Boolean(model.commercialImage),
    galleryCount: model.galleryImages?.length ?? 0,
    sections: model.blueprint.sections.map((item) => item.sectionType),
    contractStatus: model.contract.status,
  }, null, 2)}\n`);
  console.log(`54W snapshot assets=${payload.assets} hero=${payload.media.heroStatus} generation=${payload.generation?.id ?? "none"}`);
}

main();
