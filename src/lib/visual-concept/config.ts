/**
 * Central image-model configuration.
 * Defaults follow the current OpenAI Images API guide:
 * gpt-image-2.5-flare at quality low for exploration.
 * gpt-image-2.5-sunburst at quality high and portrait 1024x1536 for the visual master.
 */

export const VISUAL_CONCEPT_PROMPT_VERSION = "visual-concept-prompt-v3";
export const VISUAL_MASTER_VERSION = "visual-master-v1";
export const VISUAL_MASTER_PROMPT_VERSION = "visual-master-prompt-v1";

export const VISUAL_CONCEPT_DEFAULTS = {
  conceptModel: "gpt-image-2.5-flare",
  masterModel: "gpt-image-2.5-sunburst",
  quality: "low",
  masterQuality: "high",
  size: "1024x1536",
  masterSize: "1024x1536",
  outputFormat: "jpeg",
  plannedImageCount: 3,
} as const;

export type VisualConceptQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";
export type VisualConceptSize = "1024x1024" | "1536x1024" | "1024x1536";
export type VisualConceptFormat = "png" | "jpeg" | "webp";

export type VisualConceptConfig = {
  conceptModel: string;
  masterModel: string;
  quality: VisualConceptQuality;
  masterQuality: VisualConceptQuality;
  size: VisualConceptSize;
  masterSize: VisualConceptSize;
  outputFormat: VisualConceptFormat;
  plannedImageCount: number;
  estimatedCallCount: number;
};

const QUALITIES = new Set<VisualConceptQuality>(["low", "medium", "high", "xhigh", "max", "auto"]);
const SIZES = new Set<VisualConceptSize>(["1024x1024", "1536x1024", "1024x1536"]);
const FORMATS = new Set<VisualConceptFormat>(["png", "jpeg", "webp"]);

function pick<T extends string>(value: string | undefined, allowed: Set<T>, fallback: T): T {
  const trimmed = value?.trim() as T | undefined;
  return trimmed && allowed.has(trimmed) ? trimmed : fallback;
}

export function visualConceptConfig(env: NodeJS.ProcessEnv = process.env): VisualConceptConfig {
  return {
    conceptModel: env.VISUAL_CONCEPT_MODEL?.trim() || VISUAL_CONCEPT_DEFAULTS.conceptModel,
    masterModel: env.VISUAL_MASTER_MODEL?.trim() || VISUAL_CONCEPT_DEFAULTS.masterModel,
    quality: pick(env.VISUAL_CONCEPT_QUALITY, QUALITIES, VISUAL_CONCEPT_DEFAULTS.quality),
    masterQuality: pick(env.VISUAL_MASTER_QUALITY, QUALITIES, VISUAL_CONCEPT_DEFAULTS.masterQuality),
    size: pick(env.VISUAL_CONCEPT_SIZE, SIZES, VISUAL_CONCEPT_DEFAULTS.size),
    masterSize: pick(env.VISUAL_MASTER_SIZE, SIZES, VISUAL_CONCEPT_DEFAULTS.masterSize),
    outputFormat: pick(env.VISUAL_CONCEPT_FORMAT, FORMATS, VISUAL_CONCEPT_DEFAULTS.outputFormat),
    plannedImageCount: VISUAL_CONCEPT_DEFAULTS.plannedImageCount,
    estimatedCallCount: VISUAL_CONCEPT_DEFAULTS.plannedImageCount,
  };
}

export function openaiApiKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}
