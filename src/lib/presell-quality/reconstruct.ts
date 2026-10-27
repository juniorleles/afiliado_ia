import { campaignIntegritySnapshot } from "@/lib/campaign-sources/resolve-commercial";
import { runApprovedReviewGeneration } from "@/lib/lp-generator/from-approved-review";
import { readGenerationModel, writeGenerationModel } from "@/lib/lp-generator/store";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import { proposeEditorialPlan, type EditorialPlan } from "@/lib/presell-quality/editorial-plan";
import { emptyPatch, writeQualityPatch, type QualityPresentationPatch } from "@/lib/presell-quality/patch";
import { editorialHeroMode } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import type { SectionType } from "@/lib/conversion-strategy/types";

const APPROVED_FIELDS = ["description", "ingredients", "howItWorks", "guarantee"] as const;

export type EditorialReconstruction = {
  campaignId: number;
  status: "RECONSTRUCTED" | "INSUFFICIENT_APPROVED_CONTENT" | "FAILED";
  generationId: string | null;
  previewPath: string | null;
  heroMode: "EDITORIAL_NO_IMAGE" | "PACKSHOT_SPLIT";
  approvedFactsUsed: string[];
  unapprovedFactsUsed: string[];
  plan: EditorialPlan | null;
  productContractPreserved: boolean;
  assetApprovalsPreserved: boolean;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  errors: string[];
};

export function applyEditorialReconstruction(model: V4Model, plan: EditorialPlan): V4Model {
  const titles: Partial<Record<SectionType, string>> = { ...(model.qualityPatch?.titles ?? {}) };
  for (const section of plan.sections) {
    if (section.type === "hero") continue;
    titles[section.type as SectionType] = section.title;
  }
  const heroMode = plan.heroMode;
  const commercialImage = heroMode === "EDITORIAL_NO_IMAGE" ? undefined : model.commercialImage;
  const composition = heroMode === "EDITORIAL_NO_IMAGE" ? "information-first" : model.composition;
  const patch: QualityPresentationPatch = {
    ...(model.qualityPatch ?? emptyPatch()),
    titles,
    applied: [...new Set([...(model.qualityPatch?.applied ?? []), "IMPROVE_SECTION_TITLES", "RETITLE_USAGE_SECTION"])],
  };
  return {
    ...model,
    composition,
    commercialImage,
    blueprint: {
      ...model.blueprint,
      narrative: {
        ...model.blueprint.narrative,
        compositionHint: composition,
        shape: commercialImage ? model.blueprint.narrative.shape : "FACTS_LED",
      },
    },
    qualityPatch: patch,
  };
}

export async function reconstructApprovedPresell(campaignId: number): Promise<EditorialReconstruction> {
  const before = campaignIntegritySnapshot(campaignId);
  const generated = await runApprovedReviewGeneration({ campaignId });
  const run = readLatestProductResearch(campaignId);
  const accepted = acceptedProposals(run).map((item) => item.field);
  const plan = proposeEditorialPlan({ run, media: generated.media });
  if (!generated.generationId || !generated.previewPath) {
    return {
      campaignId,
      status: generated.status === "INSUFFICIENT_APPROVED_CONTENT" ? "INSUFFICIENT_APPROVED_CONTENT" : "FAILED",
      generationId: generated.generationId,
      previewPath: generated.previewPath,
      heroMode: plan.heroMode,
      approvedFactsUsed: accepted,
      unapprovedFactsUsed: [],
      plan,
      productContractPreserved: JSON.stringify(before.acceptedFacts) === JSON.stringify(campaignIntegritySnapshot(campaignId).acceptedFacts),
      assetApprovalsPreserved: JSON.stringify(before.approvedAssets) === JSON.stringify(campaignIntegritySnapshot(campaignId).approvedAssets),
      commercialAuthorization: "BLOCKED",
      publicationReadiness: "BLOCKED",
      errors: generated.errors,
    };
  }
  const stored = readGenerationModel(generated.generationId);
  if (!stored) {
    return {
      campaignId,
      status: "FAILED",
      generationId: generated.generationId,
      previewPath: generated.previewPath,
      heroMode: plan.heroMode,
      approvedFactsUsed: accepted,
      unapprovedFactsUsed: [],
      plan,
      productContractPreserved: true,
      assetApprovalsPreserved: true,
      commercialAuthorization: "BLOCKED",
      publicationReadiness: "BLOCKED",
      errors: ["Generation model was not persisted."],
    };
  }
  const reconstructed = applyEditorialReconstruction(stored, plan);
  writeGenerationModel(generated.generationId, reconstructed);
  writeQualityPatch(generated.generationId, reconstructed.qualityPatch ?? emptyPatch());
  const after = campaignIntegritySnapshot(campaignId);
  return {
    campaignId,
    status: "RECONSTRUCTED",
    generationId: generated.generationId,
    previewPath: generated.previewPath,
    heroMode: editorialHeroMode(Boolean(reconstructed.commercialImage)),
    approvedFactsUsed: accepted.filter((field) => (APPROVED_FIELDS as readonly string[]).includes(field) || accepted.includes(field)),
    unapprovedFactsUsed: [],
    plan,
    productContractPreserved: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    assetApprovalsPreserved: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    errors: generated.errors,
  };
}
