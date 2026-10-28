import { getCampaignById } from "@/lib/campaigns";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { readCampaignSources } from "@/lib/campaign-sources/store";
import { currentSalesUrl } from "@/lib/campaign-sources/present";
import { readLatestProductResearch, readProductResearchRun } from "@/lib/product-research/store";
import { acceptedProposals, approvedContentStatus } from "@/lib/product-research/approved-facts";
import { enrichApprovedFactsForGeneration } from "@/lib/presell-quality/approved-generation-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import { readSandboxPresellPointer, writeSandboxPresellPointer, type SandboxPresellPointer } from "@/lib/product-research/sandbox-presell";
import { runGeneration } from "@/lib/lp-generator/run";
import { readGeneration, readGenerationModel, writeGeneration } from "@/lib/lp-generator/store";
import type { GenerationRecord, ReviewContentStatus } from "@/lib/lp-generator/types";

export type ApprovedReviewGeneration = {
  status: ReviewContentStatus;
  generationId: string | null;
  previewPath: string | null;
  record: GenerationRecord | null;
  pointer: SandboxPresellPointer | null;
  media: ReturnType<typeof selectReviewMedia>;
  approvedFacts: string[];
  heroImageStatus: "SELECTED" | "HERO_IMAGE_MISSING";
  productContractStatus: string;
  errors: string[];
  limitations: string[];
  publicationReadiness: "BLOCKED";
  commercialAuthorization: "BLOCKED";
};

function emptyResult(
  status: ReviewContentStatus,
  input: Partial<ApprovedReviewGeneration> & { media: ApprovedReviewGeneration["media"] },
): ApprovedReviewGeneration {
  return {
    status,
    generationId: input.generationId ?? null,
    previewPath: input.previewPath ?? null,
    record: input.record ?? null,
    pointer: input.pointer ?? null,
    media: input.media,
    approvedFacts: input.approvedFacts ?? [],
    heroImageStatus: input.heroImageStatus ?? input.media.heroStatus,
    productContractStatus: input.productContractStatus ?? "UNKNOWN",
    errors: input.errors ?? [],
    limitations: input.limitations ?? [],
    publicationReadiness: "BLOCKED",
    commercialAuthorization: "BLOCKED",
  };
}

export function loadApprovedReviewGeneration(campaignId: number): ApprovedReviewGeneration | null {
  const pointer = readSandboxPresellPointer(campaignId);
  if (!pointer) return null;
  const record = readGeneration(pointer.generationId);
  if (!record || record.campaignId !== campaignId) return null;
  const run = record.researchRunId
    ? readProductResearchRun(campaignId, record.researchRunId)
    : readLatestProductResearch(campaignId);
  const media = selectReviewMedia({
    assets: run?.discoveredAssets,
    productName: record.input.productName,
    campaignId,
  });
  return emptyResult(record.review?.contentStatus ?? pointer.contentStatus, {
    generationId: record.id,
    previewPath: record.previewPath,
    record,
    pointer,
    media,
    approvedFacts: record.review?.approvedFacts ?? [],
    heroImageStatus: record.review?.heroImageStatus ?? media.heroStatus,
    productContractStatus: record.review?.productContractStatus ?? pointer.productContractStatus,
    errors: record.errors,
    limitations: record.limitations,
  });
}

export async function runApprovedReviewGeneration(input: {
  campaignId: number;
  runId?: string;
}): Promise<ApprovedReviewGeneration> {
  const campaign = getCampaignById(input.campaignId);
  if (!campaign) {
    return emptyResult("FAILED", {
      media: selectReviewMedia({ assets: [], productName: "", campaignId: input.campaignId }),
      productContractStatus: "MISSING_CAMPAIGN",
      errors: ["Campaign not found."],
    });
  }
  const run = input.runId
    ? readProductResearchRun(input.campaignId, input.runId)
    : readLatestProductResearch(input.campaignId);
  if (!run) {
    return emptyResult("INSUFFICIENT_APPROVED_CONTENT", {
      media: selectReviewMedia({ assets: [], productName: campaign.name, campaignId: input.campaignId }),
      productContractStatus: "MISSING_RESEARCH_RUN",
      errors: ["INSUFFICIENT_APPROVED_CONTENT"],
      limitations: ["No research run is available for this campaign."],
    });
  }
  const accepted = acceptedProposals(run);
  const brief = readCampaignBrief(input.campaignId);
  const productName = brief?.productName || run.productName || campaign.name;
  const salesUrl = currentSalesUrl(readCampaignSources(input.campaignId)) || run.seeds.find((item) => /^https?:\/\//i.test(item)) || "";
  const media = selectReviewMedia({ assets: run.discoveredAssets, productName, campaignId: input.campaignId });
  const approvedFacts = accepted.map((item) => item.field);
  if (accepted.length === 0) {
    return emptyResult("INSUFFICIENT_APPROVED_CONTENT", {
      pointer: readSandboxPresellPointer(input.campaignId),
      media,
      approvedFacts,
      productContractStatus: "INSUFFICIENT_FOR_PAGE",
      errors: ["INSUFFICIENT_APPROVED_CONTENT"],
      limitations: ["A sandbox presell needs at least one human-approved fact. Pending proposals are not used."],
    });
  }
  if (!salesUrl) {
    return emptyResult("FAILED", {
      media,
      approvedFacts,
      productContractStatus: "MISSING_SALES_URL",
      errors: ["A current sales page URL is required to persist the generation record."],
    });
  }
  const facts = enrichApprovedFactsForGeneration({ run, productName, sourceUrl: salesUrl }).facts;
  const record = await runGeneration(
    {
      productName,
      salesUrl,
      language: "en",
      market: "US",
      goal: "INFORM",
    },
    {
      force: true,
      allowPaidAi: false,
      injectedFacts: facts,
      injectedApprovedAssets: run.discoveredAssets ?? [],
      sandboxMode: true,
      campaignId: input.campaignId,
      researchRunId: run.runId,
    },
  );
  record.limitations.push("AUTHORIZED_DESTINATION remains empty. Tracking HopLink is not a commercial destination.");
  record.limitations.push("COMMERCIAL_AUTHORIZATION=BLOCKED. PUBLICATION_READINESS=BLOCKED.");
  const thin = approvedContentStatus(run) === "INSUFFICIENT_APPROVED_CONTENT";
  const qualityBlocked = record.gateLabels?.CONTENT_PASS === false || record.qualityInspection?.status === "BLOCKED";
  let contentStatus: ReviewContentStatus = "GENERATED";
  if (record.status === "FAILED" && !record.previewPath) contentStatus = "FAILED";
  else if (thin) contentStatus = "INSUFFICIENT_APPROVED_CONTENT";
  else if (qualityBlocked || record.status === "NEEDS_REVIEW") contentStatus = "BLOCKED_QUALITY_GATE";
  record.campaignId = input.campaignId;
  record.researchRunId = run.runId;
  record.review = {
    approvedFacts,
    contentStatus,
    heroImageStatus: media.heroStatus,
    productContractStatus: readGenerationModel(record.id)?.contract.status ?? "UNKNOWN",
    media: {
      approved: media.approvedCount,
      eligible: media.eligibleCount,
      used: media.usedCount,
      excluded: media.excluded.map((item) => ({
        assetId: item.assetId,
        assetUrl: item.assetUrl,
        reason: item.exclusionReason,
      })),
    },
  };
  writeGeneration(record);
  const pointer =
    record.previewPath
      ? writeSandboxPresellPointer({
          campaignId: input.campaignId,
          generationId: record.id,
          researchRunId: run.runId,
          productContractStatus: record.review.productContractStatus,
          contentStatus,
          previewPath: record.previewPath,
          createdAt: record.timings.createdAt,
          updatedAt: new Date().toISOString(),
        })
      : readSandboxPresellPointer(input.campaignId);
  return emptyResult(contentStatus, {
    generationId: record.id,
    previewPath: record.previewPath,
    record,
    pointer,
    media,
    approvedFacts,
    heroImageStatus: media.heroStatus,
    productContractStatus: record.review.productContractStatus,
    errors: record.errors,
    limitations: record.limitations,
  });
}
