import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Campaign } from "@/lib/campaigns";
import { visualConceptConfig, VISUAL_CONCEPT_PROMPT_VERSION, type VisualConceptConfig } from "@/lib/visual-concept/config";
import { buildVisualBrief, resolvePackshotPath } from "@/lib/visual-concept/brief";
import { ART_DIRECTION_VERSION, directVisualArt, type ArtDirectionBrief } from "@/lib/visual-concept/art-director";
import { composeSourcePackshot, resolveConceptComposition } from "@/lib/visual-concept/compose";
import { buildVisualConceptPrompt } from "@/lib/visual-concept/prompt";
import type { ImageProvider } from "@/lib/visual-concept/provider";
import { findRunByContentVersion, findRunByRequest, saveRun, type StoredRun } from "@/lib/visual-concept/store";
import {
  VISUAL_DIRECTIONS,
  type ConceptMetadata,
  type GenerationPlan,
  type GenerationStatus,
  type VisualDirectionFamily,
} from "@/lib/visual-concept/types";

export type GenerationRequest = {
  campaign: Campaign;
  generationReason: string;
  generationRequestId: string;
  confirmGeneration: boolean;
  regenerate?: boolean;
  directions?: readonly VisualDirectionFamily[];
};

export type GenerationResult = {
  status: GenerationStatus;
  plan: GenerationPlan | null;
  run: StoredRun | null;
  providerCalls: number;
};

export function selectVisualDirections(requested?: readonly VisualDirectionFamily[]) {
  if (!requested) return [...VISUAL_DIRECTIONS];
  const seen = new Set<string>();
  const selected = [];
  for (const family of requested) {
    const found = VISUAL_DIRECTIONS.find((item) => item.family === family);
    if (!found || seen.has(found.key)) return null;
    seen.add(found.key);
    selected.push(found);
  }
  return selected.length > 0 ? selected : null;
}

export function planVisualConceptGeneration(
  campaign: Campaign,
  env: NodeJS.ProcessEnv = process.env,
  directions?: readonly VisualDirectionFamily[],
): GenerationPlan | null {
  const brief = buildVisualBrief(campaign);
  if (!brief) return null;
  const selected = selectVisualDirections(directions);
  if (!selected) return null;
  const config = visualConceptConfig(env);
  const packshot = brief.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  const composition = resolveConceptComposition(packshotPath, config.outputFormat);
  return {
    model: config.conceptModel,
    masterModel: config.masterModel,
    quality: config.quality,
    size: config.size,
    format: composition.format,
    plannedImageCount: selected.length,
    estimatedCallCount: selected.length,
    operation: "generations",
    compositionStrategy: composition.strategy,
    contentVersion: brief.contentVersion,
    openaiApiKeyConfigured: Boolean(env.OPENAI_API_KEY?.trim()),
  };
}

function blocked(status: GenerationStatus, plan: GenerationPlan | null): GenerationResult {
  return { status, plan, run: null, providerCalls: 0 };
}

export async function generateVisualConcepts(
  request: GenerationRequest,
  deps: {
    root: string;
    provider: ImageProvider;
    apiKeyConfigured: () => boolean;
    now?: () => string;
    env?: NodeJS.ProcessEnv;
    createId?: () => string;
  },
): Promise<GenerationResult> {
  const env = deps.env ?? process.env;
  const plan = planVisualConceptGeneration(request.campaign, env, request.directions);
  const brief = buildVisualBrief(request.campaign);
  if (!request.confirmGeneration) return blocked("BLOCKED_NOT_CONFIRMED", plan);
  if (!request.generationReason.trim()) return blocked("BLOCKED_MISSING_REASON", plan);
  if (!request.generationRequestId.trim()) return blocked("BLOCKED_MISSING_REQUEST_ID", plan);
  if (!brief || !plan) return blocked("BLOCKED_NOT_CONFIRMED", plan);

  const existingRequest = findRunByRequest(deps.root, request.campaign.slug, request.generationRequestId);
  if (existingRequest) return { status: "REUSED_REQUEST", plan, run: existingRequest, providerCalls: 0 };

  const existingContent = findRunByContentVersion(deps.root, request.campaign.slug, brief.contentVersion);
  if (existingContent && !request.regenerate) {
    return { status: "BLOCKED_EXISTING", plan, run: existingContent, providerCalls: 0 };
  }
  if (!deps.apiKeyConfigured()) return blocked("BLOCKED_MISSING_API_KEY", plan);

  const selected = selectVisualDirections(request.directions);
  if (!selected) return blocked("BLOCKED_NOT_CONFIRMED", plan);
  const config: VisualConceptConfig = visualConceptConfig(env);
  const createdAt = deps.now?.() ?? new Date().toISOString();
  const generationId = deps.createId?.() ?? randomUUID();
  const packshot = brief.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const referenceImagePath = packshot ? resolvePackshotPath(packshot.src) : null;
  const composition = resolveConceptComposition(referenceImagePath, config.outputFormat);
  const concepts = [];
  const artDirections: ArtDirectionBrief[] = [];
  let providerCalls = 0;
  for (const direction of selected) {
    const artDirection = directVisualArt(brief, direction.family);
    artDirections.push(artDirection);
    const prompt = buildVisualConceptPrompt(brief, direction.family, {
      reserveProductStage: composition.reserveProductStage,
      artDirection,
    });
    providerCalls += 1;
    const generated = await deps.provider.create({
      model: config.conceptModel,
      prompt,
      size: config.size,
      quality: config.quality,
      outputFormat: composition.format,
      idempotencyKey: `${request.generationRequestId}:${direction.key}`,
      operation: "generations",
    });
    const overlay = composition.strategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE" && referenceImagePath;
    const bytes = overlay
      ? composeSourcePackshot({
          backgroundPng: generated,
          packshotPng: readFileSync(referenceImagePath),
          direction: direction.family,
        })
      : generated;
    const metadata: ConceptMetadata = {
      generationId,
      generationRequestId: request.generationRequestId,
      generationReason: request.generationReason.trim(),
      createdAt,
      campaignId: request.campaign.id,
      campaignSlug: request.campaign.slug,
      direction: direction.family,
      directionKey: direction.key,
      model: config.conceptModel,
      masterModel: config.masterModel,
      size: config.size,
      quality: config.quality,
      format: composition.format,
      promptVersion: VISUAL_CONCEPT_PROMPT_VERSION,
      artDirectorVersion: ART_DIRECTION_VERSION,
      contentVersion: brief.contentVersion,
      assetReferences: brief.availableAssets.map((asset) => asset.id),
      operation: "generations",
      compositionStrategy: composition.strategy,
      generatedPixelsArtifact: overlay ? `raw.${composition.format}` : `concept.${composition.format}`,
      compositedArtifact: overlay ? `concept.${composition.format}` : null,
      sourcePackshotReference: packshot?.id ?? null,
      role: "VISUAL_CONCEPT",
      generatedVisualIsEvidence: false,
      imageTextReimportAllowed: false,
      humanPublicationApproved: false,
    };
    concepts.push({ key: direction.key, metadata, bytes, rawBytes: overlay ? generated : undefined });
  }
  const run = saveRun({
    root: deps.root,
    slug: request.campaign.slug,
    generationId,
    generationRequestId: request.generationRequestId,
    contentVersion: brief.contentVersion,
    createdAt,
    brief,
    artDirections,
    concepts,
  });
  return { status: "GENERATED", plan, run, providerCalls };
}
