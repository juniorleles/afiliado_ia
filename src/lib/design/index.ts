export {
  DESIGN_PLAN_VERSION,
  VISUAL_THEMES,
  HERO_VARIANTS,
  SECTION_VARIANTS,
  CONTENT_PRIORITIES,
  parseDesignPlan,
  serializeDesignPlan,
  isVisualTheme,
  isHeroVariant,
} from "@/lib/design/plan";
export type { DesignPlan, VisualTheme, HeroVariant, SectionVariant, ContentPriority } from "@/lib/design/plan";
export { createDesignPlan, applyActionCodes } from "@/lib/design/planner";
export {
  MAX_VISUAL_OPTIMIZATION_ITERATIONS,
  applyDesignToCampaign,
  runVisualOptimization,
  assertNoFactualRewrite,
  planForCampaign,
} from "@/lib/design/optimize";
export { CREATIVE_COMPOSITION_VERSION } from "@/lib/creative/types";
