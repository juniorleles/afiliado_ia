export {
  CREATIVE_COMPOSITION_VERSION,
  NARRATIVE_ROLES,
  SCENE_KINDS,
  CONTENT_WEIGHTS,
  ASSET_USES,
  RHYTHM_BEATS,
  MAX_PACKSHOT_USES,
  MAX_DECORATIVE_GEOMETRY,
} from "@/lib/creative/types";
export type {
  CreativeCompositionPlan,
  ScenePlan,
  NarrativeRole,
  SceneKind,
  ContentWeight,
  AssetUse,
  AssetSlot,
  GeometryVariant,
  WhitespaceKind,
} from "@/lib/creative/types";
export { parseCreativeCompositionPlan, serializeCreativeCompositionPlan, creativePlansEqual } from "@/lib/creative/plan";
export { createCreativeCompositionPlan, applyCreativeActionCodes } from "@/lib/creative/planner";
export {
  stickyCtaShouldShow,
  STICKY_COLLISION_PADDING_PX,
  STICKY_SCROLL_INTENT_PX,
} from "@/lib/creative/sticky";
export {
  classifySceneWhitespace,
  decorateScenes,
  geometryForScene,
  repeatedGeometryCount,
} from "@/lib/creative/whitespace";
export {
  HERO_IMAGE_SIZES,
  SUPPORT_IMAGE_SIZES,
  PRODUCT_IMAGE_WIDTHS,
  productImageSrcSet,
  productImageSizes,
} from "@/lib/creative/image";
