import { readFileSync } from "node:fs";
import {
  VISUAL_MASTER_PROMPT_VERSION,
  VISUAL_MASTER_VERSION,
  visualConceptConfig,
  type VisualConceptQuality,
  type VisualConceptSize,
} from "@/lib/visual-concept/config";
import { buildVisualBrief, resolvePackshotPath } from "@/lib/visual-concept/brief";
import { composeMasterPackshot, inspectPackshotFile } from "@/lib/visual-concept/compose";
import { ART_DIRECTION_IS_EVIDENCE, GENERATED_VISUAL_IS_EVIDENCE, IMAGE_TEXT_REIMPORT_ALLOWED } from "@/lib/visual-concept/firewall";
import { directVisualMaster, VISUAL_MASTER_ART_DIRECTION_VERSION, type MasterArtDirectionBrief } from "@/lib/visual-concept/master-art-director";
import { buildVisualMasterPrompt } from "@/lib/visual-concept/master-prompt";
import type { ImageProvider } from "@/lib/visual-concept/provider";
import { saveVisualMaster, visualMasterAttemptExists, type StoredVisualMaster } from "@/lib/visual-concept/store";
import type { Campaign } from "@/lib/campaigns";
import type { VisualBrief } from "@/lib/visual-concept/types";

const MASTER_MODEL = "gpt-image-2.5-sunburst";
const SUPPORTED_QUALITIES = new Set<VisualConceptQuality>(["low", "medium", "high", "xhigh", "max", "auto"]);
const SUPPORTED_SIZES = new Set<VisualConceptSize>(["1024x1024", "1536x1024", "1024x1536"]);

export type MasterExplorationReference = {
  direction: "PREMIUM_EDITORIAL" | "PREMIUM_PRODUCT" | "PREMIUM_CONVERSION";
  generationId: string;
};

export type VisualMasterMetadata = {
  campaignId: number;
  campaignSlug: string;
  contentVersion: string;
  masterVersion: typeof VISUAL_MASTER_VERSION;
  masterDirection: "HYBRID_A_B_C";
  artDirectorVersion: typeof VISUAL_MASTER_ART_DIRECTION_VERSION;
  promptVersion: typeof VISUAL_MASTER_PROMPT_VERSION;
  model: string;
  quality: string;
  size: string;
  sourcePackshotReference: string | null;
  explorationReferences: MasterExplorationReference[];
  compositionStrategy: "SOURCE_OVERLAY_ON_RESERVED_STAGE";
  createdAt: string;
  role: "VISUAL_MASTER";
  generatedVisualIsEvidence: false;
  imageTextReimportAllowed: false;
  artDirectionIsEvidence: false;
  humanPublicationApproved: false;
  humanReview: "PENDING";
  visualDirectionSelected: "HYBRID_A_B_C";
  productOnlyDerivativeUsed: false;
  modelRecreatedPackshot: false;
  originalPackshotOverlay: boolean;
};

export type MasterGenerationStatus =
  | "GENERATED"
  | "BLOCKED_EXISTING"
  | "BLOCKED_NOT_CONFIRMED"
  | "BLOCKED_MISSING_API_KEY"
  | "BLOCKED_MODEL"
  | "BLOCKED_CONFIGURATION"
  | "BLOCKED_PACKSHOT"
  | "BLOCKED_REFERENCES"
  | "COMPOSITION_FAILED"
  | "API_ERROR";

export type MasterGenerationResult = {
  status: MasterGenerationStatus;
  providerCalls: number;
  artDirection: MasterArtDirectionBrief | null;
  brief: VisualBrief | null;
  stored: StoredVisualMaster | null;
  errorMessage: string;
};

export function planVisualMaster(campaign: Campaign, env: NodeJS.ProcessEnv = process.env) {
  const brief = buildVisualBrief(campaign);
  if (!brief) return null;
  const config = visualConceptConfig(env);
  const packshot = brief.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  const inspection = packshotPath ? inspectPackshotFile(packshotPath) : null;
  return {
    brief,
    model: config.masterModel,
    quality: config.masterQuality,
    size: config.masterSize,
    format: "png" as const,
    plannedImageCount: 1,
    operation: "generations" as const,
    packshotPath,
    usableTransparency: Boolean(inspection?.usableTransparency),
    sourcePackshotReference: packshot?.id ?? null,
    modelAvailable: config.masterModel === MASTER_MODEL,
    sizeSupported: SUPPORTED_SIZES.has(config.masterSize),
    qualitySupported: SUPPORTED_QUALITIES.has(config.masterQuality) && config.masterQuality === "high",
  };
}

export async function generateVisualMaster(
  request: {
    campaign: Campaign;
    confirmGeneration: boolean;
    explorationReferences: MasterExplorationReference[];
    now?: () => string;
  },
  deps: {
    root: string;
    provider: ImageProvider;
    apiKeyConfigured: () => boolean;
    env?: NodeJS.ProcessEnv;
  },
): Promise<MasterGenerationResult> {
  const empty = (status: MasterGenerationStatus, errorMessage = ""): MasterGenerationResult => ({
    status,
    providerCalls: 0,
    artDirection: null,
    brief: null,
    stored: null,
    errorMessage,
  });
  if (!request.confirmGeneration) return empty("BLOCKED_NOT_CONFIRMED");
  const plan = planVisualMaster(request.campaign, deps.env);
  if (!plan) return empty("BLOCKED_NOT_CONFIRMED");
  if (visualMasterAttemptExists(deps.root, request.campaign.slug)) return empty("BLOCKED_EXISTING");
  if (!plan.modelAvailable) return empty("BLOCKED_MODEL");
  if (!plan.sizeSupported || !plan.qualitySupported) return empty("BLOCKED_CONFIGURATION");
  if (!plan.packshotPath || !plan.usableTransparency) return empty("BLOCKED_PACKSHOT");
  const families = new Set(request.explorationReferences.map((item) => item.direction));
  if (families.size !== 3 || !families.has("PREMIUM_EDITORIAL") || !families.has("PREMIUM_PRODUCT") || !families.has("PREMIUM_CONVERSION")) {
    return empty("BLOCKED_REFERENCES");
  }
  if (!deps.apiKeyConfigured()) return empty("BLOCKED_MISSING_API_KEY");

  const artDirection = directVisualMaster(plan.brief);
  const prompt = buildVisualMasterPrompt(plan.brief, artDirection);
  let providerCalls = 0;
  let raw: Buffer;
  try {
    providerCalls += 1;
    raw = await deps.provider.create({
      model: plan.model,
      prompt,
      size: plan.size,
      quality: plan.quality,
      outputFormat: plan.format,
      idempotencyKey: `visual-master:${plan.brief.contentVersion}`,
      operation: "generations",
    });
  } catch (error) {
    return {
      status: "API_ERROR",
      providerCalls,
      artDirection,
      brief: plan.brief,
      stored: null,
      errorMessage: error instanceof Error ? error.message : "image request failed",
    };
  }

  const createdAt = request.now?.() ?? new Date().toISOString();
  let masterBytes: Buffer | null = null;
  let compositionFailed = false;
  try {
    masterBytes = composeMasterPackshot({
      backgroundPng: raw,
      packshotPng: readFileSync(plan.packshotPath),
    });
  } catch (error) {
    compositionFailed = true;
    masterBytes = null;
    void error;
  }
  const metadata: VisualMasterMetadata = {
    campaignId: request.campaign.id,
    campaignSlug: request.campaign.slug,
    contentVersion: plan.brief.contentVersion,
    masterVersion: VISUAL_MASTER_VERSION,
    masterDirection: "HYBRID_A_B_C",
    artDirectorVersion: VISUAL_MASTER_ART_DIRECTION_VERSION,
    promptVersion: VISUAL_MASTER_PROMPT_VERSION,
    model: plan.model,
    quality: plan.quality,
    size: plan.size,
    sourcePackshotReference: plan.sourcePackshotReference,
    explorationReferences: request.explorationReferences,
    compositionStrategy: "SOURCE_OVERLAY_ON_RESERVED_STAGE",
    createdAt,
    role: "VISUAL_MASTER",
    generatedVisualIsEvidence: GENERATED_VISUAL_IS_EVIDENCE,
    imageTextReimportAllowed: IMAGE_TEXT_REIMPORT_ALLOWED,
    artDirectionIsEvidence: ART_DIRECTION_IS_EVIDENCE,
    humanPublicationApproved: false,
    humanReview: "PENDING",
    visualDirectionSelected: "HYBRID_A_B_C",
    productOnlyDerivativeUsed: false,
    modelRecreatedPackshot: false,
    originalPackshotOverlay: masterBytes !== null,
  };
  const stored = saveVisualMaster({
    root: deps.root,
    slug: request.campaign.slug,
    brief: plan.brief,
    artDirection,
    prompt,
    rawBytes: raw,
    masterBytes,
    metadata,
  });
  return {
    status: compositionFailed ? "COMPOSITION_FAILED" : "GENERATED",
    providerCalls,
    artDirection,
    brief: plan.brief,
    stored,
    errorMessage: compositionFailed ? "packshot composition failed" : "",
  };
}
