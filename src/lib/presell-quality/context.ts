import type { V4Model } from "@/lib/product-showcase/v4/model";
import { defaultEvaluationMeta, type ApprovedAssetRef, type PresellEvaluationInput, type PresellScreenshotRef } from "@/lib/presell-quality/input";
import type { QualityPresentationPatch } from "@/lib/presell-quality/patch";
import { sha256Text } from "@/lib/presell-quality/fingerprint";
import { editorialHeroMode, galleryPresentationOf } from "@/lib/product-showcase/v4/presentation";

export function renderedCopyFromModel(model: V4Model): string {
  const sections = model.blueprint.sections.flatMap((section) => [
    section.headline.text,
    ...section.body.map((item) => item.text),
    ...section.items.map((item) => item.text.text),
  ]);
  return [
    model.copy.headline.text,
    model.copy.subheadline?.text ?? "",
    model.copy.valueProposition?.text ?? "",
    model.copy.introduction.text,
    ...sections,
  ]
    .filter((item) => item.trim().length > 0)
    .join("\n");
}

export function pageStructureFromModel(model: V4Model): unknown {
  const gallery = galleryPresentationOf({
    heroMode: editorialHeroMode(Boolean(model.commercialImage)),
    galleryImages: model.galleryImages,
  });
  return {
    composition: model.composition,
    density: model.density,
    hopSlot: model.hopSlot,
    sandbox: Boolean(model.sandbox?.mode),
    hasHeroImage: Boolean(model.commercialImage),
    galleryCount: gallery.render ? (model.galleryImages?.length ?? 0) : 0,
    storedGalleryCount: model.galleryImages?.length ?? 0,
    galleryRender: gallery.render,
    galleryEligibility: gallery.eligibleForEditorialPresentation,
    sections: model.blueprint.sections.map((section) => ({
      type: section.sectionType,
      headline: section.headline.text,
      bodyCount: section.body.length,
      itemCount: section.items.length,
    })),
    qualityPatch: model.qualityPatch?.applied ?? [],
  };
}

export function contentFingerprintOf(model: V4Model): string {
  return sha256Text(renderedCopyFromModel(model));
}

export function presentationFingerprintOf(model: V4Model): string {
  const gallery = galleryPresentationOf({
    heroMode: editorialHeroMode(Boolean(model.commercialImage)),
    galleryImages: model.galleryImages,
  });
  return sha256Text(
    JSON.stringify({
      heroMode: gallery.heroMode,
      galleryRender: gallery.render,
      composition: model.composition,
      hopSlot: model.hopSlot,
      titles: model.qualityPatch?.titles ?? null,
      sections: model.blueprint.sections.map((section) => section.sectionType),
    }),
  );
}

export function pageVersionTokenOf(input: { iteration: number; patch: QualityPresentationPatch | null }): string {
  return `i${input.iteration}:${sha256Text(JSON.stringify(input.patch ?? null))}`;
}

export function evaluationInputFromModel(input: {
  campaignId: number;
  generationId: string;
  model: V4Model;
  screenshots: { desktop: PresellScreenshotRef | null; mobile: PresellScreenshotRef | null };
  approvedFacts: string[];
  evidenceReferences: string[];
  approvedAssets: ApprovedAssetRef[];
  editorialConstraints: string[];
  previewPath?: string | null;
  iteration: number;
  patch: QualityPresentationPatch | null;
}): PresellEvaluationInput {
  const meta = defaultEvaluationMeta();
  return {
    campaignId: input.campaignId,
    generationId: input.generationId,
    productContractVersion: meta.productContractVersion,
    rendererVersion: meta.rendererVersion,
    screenshots: input.screenshots,
    pageStructure: pageStructureFromModel(input.model),
    renderedCopy: renderedCopyFromModel(input.model),
    approvedFacts: input.approvedFacts,
    evidenceReferences: input.evidenceReferences,
    approvedAssets: input.approvedAssets,
    editorialConstraints: input.editorialConstraints,
    rubricVersion: meta.rubricVersion,
    promptVersion: meta.promptVersion,
    previewPath: input.previewPath ?? null,
    pageVersionToken: pageVersionTokenOf({ iteration: input.iteration, patch: input.patch }),
  };
}
