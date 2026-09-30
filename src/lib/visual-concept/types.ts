export const VISUAL_DIRECTIONS = [
  { key: "a", family: "PREMIUM_EDITORIAL" },
  { key: "b", family: "PREMIUM_PRODUCT" },
  { key: "c", family: "PREMIUM_CONVERSION" },
] as const;

export type VisualDirectionKey = (typeof VISUAL_DIRECTIONS)[number]["key"];
export type VisualDirectionFamily = (typeof VISUAL_DIRECTIONS)[number]["family"];

export const VISUAL_ASSET_ROLES = [
  "PRODUCT_PACKSHOT",
  "PRODUCT_LOGO",
  "SELLER_PHOTOGRAPHY",
  "GENERATED_LIFESTYLE",
  "GENERATED_BACKGROUND",
  "GENERATED_DECORATIVE",
  "VISUAL_CONCEPT",
  "VISUAL_MASTER",
] as const;

export type VisualAssetRole = (typeof VISUAL_ASSET_ROLES)[number];

export type VisualAssetRecord = {
  id: string;
  role: VisualAssetRole;
  provenance: "DIRECT_SOURCE" | "MANUAL" | "GENERATED";
  src: string | null;
  authoritativeForAppearance: boolean;
  isEvidence: false;
  imageTextReimportAllowed: false;
};

export type VisualBrief = {
  campaignId: number;
  campaignSlug: string;
  contentVersion: string;
  productIdentity: {
    name: string;
  };
  categoryContext: null;
  allowedCopy: string[];
  availableAssets: VisualAssetRecord[];
  visualIdentity: {
    derivedFrom: "VALIDATED_CONSUMER_COPY_AND_PERMITTED_ASSETS";
  };
  designObjectives: string[];
  forbiddenClaims: string[];
  forbiddenVisualPatterns: string[];
  sourceReferences: string[];
};

export type ConceptMetadata = {
  generationId: string;
  generationRequestId: string;
  generationReason: string;
  createdAt: string;
  campaignId: number;
  campaignSlug: string;
  direction: VisualDirectionFamily;
  directionKey: VisualDirectionKey;
  model: string;
  masterModel: string;
  size: string;
  quality: string;
  format: string;
  promptVersion: string;
  artDirectorVersion: string;
  contentVersion: string;
  assetReferences: string[];
  operation: "generations" | "edits";
  compositionStrategy: CompositionStrategy;
  generatedPixelsArtifact: string;
  compositedArtifact: string | null;
  sourcePackshotReference: string | null;
  role: "VISUAL_CONCEPT";
  generatedVisualIsEvidence: false;
  imageTextReimportAllowed: false;
  humanPublicationApproved: false;
};

export type GenerationPlan = {
  model: string;
  masterModel: string;
  quality: string;
  size: string;
  format: string;
  plannedImageCount: number;
  estimatedCallCount: number;
  operation: "generations" | "edits";
  compositionStrategy: CompositionStrategy;
  contentVersion: string;
  openaiApiKeyConfigured: boolean;
};

export const COMPOSITION_STRATEGIES = ["SOURCE_OVERLAY_ON_RESERVED_STAGE", "MODEL_OUTPUT_ONLY"] as const;
export type CompositionStrategy = (typeof COMPOSITION_STRATEGIES)[number];

export type GenerationStatus =
  | "GENERATED"
  | "REUSED_REQUEST"
  | "BLOCKED_NOT_CONFIRMED"
  | "BLOCKED_MISSING_API_KEY"
  | "BLOCKED_EXISTING"
  | "BLOCKED_MISSING_REASON"
  | "BLOCKED_MISSING_REQUEST_ID";
