/**
 * CreativeCompositionPlan v1 — presentation only.
 * Never invents facts, assets, quotes, or commercial signals.
 */

import type { PresellSectionId } from "@/lib/presell-page";
import type { VisualQaActionCode } from "@/lib/visual-qa/types";

export const CREATIVE_COMPOSITION_VERSION = 1 as const;

export const NARRATIVE_ROLES = [
  "INTRODUCE",
  "ORIENT",
  "EXPLAIN",
  "DIFFERENTIATE",
  "CONSIDER",
  "REASSURE",
  "DISCLOSE",
  "ACT",
] as const;
export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];

export const SCENE_KINDS = [
  "HERO_PRODUCT_STAGE",
  "PRODUCT_FACT_SCENE",
  "INGREDIENT_SHOWCASE",
  "EDITORIAL_EXPLAINER",
  "NUMBERED_USAGE_SCENE",
  "PRODUCT_CHARACTERISTICS_SCENE",
  "CONSIDERATION_EDITORIAL_SCENE",
  "GUARANTEE_STATEMENT_SCENE",
  "TRUST_DISCLOSURE_SCENE",
  "CTA_TRANSITION_SCENE",
] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

export const CONTENT_WEIGHTS = ["PRIMARY", "SUPPORTING", "DETAIL"] as const;
export type ContentWeight = (typeof CONTENT_WEIGHTS)[number];

export const ASSET_USES = [
  "PRIMARY_HERO",
  "SECONDARY_CONTEXT",
  "SECTION_ANCHOR",
  "TRANSITION_ANCHOR",
  "DECORATIVE_SUPPORT",
  "NONE",
] as const;
export type AssetUse = (typeof ASSET_USES)[number];

export const MAX_PACKSHOT_USES = 3;
export const MAX_DECORATIVE_GEOMETRY = 2;

export const GEOMETRY_VARIANTS = ["none", "orb", "grain", "line", "frame", "arch"] as const;
export type GeometryVariant = (typeof GEOMETRY_VARIANTS)[number];

export const WHITESPACE_KINDS = ["INTENTIONAL_NEGATIVE_SPACE", "CONTENT_GAP", "COMPOSITION_IMBALANCE"] as const;
export type WhitespaceKind = (typeof WHITESPACE_KINDS)[number];

export const RHYTHM_BEATS = [
  "HIGH_IMPACT",
  "INFORMATIONAL",
  "VISUAL",
  "QUIET",
  "EDITORIAL",
  "TRUST",
] as const;
export type RhythmBeat = (typeof RHYTHM_BEATS)[number];

export const DESKTOP_COMPOSITIONS = [
  "HERO_STAGE_ASYMMETRIC",
  "HERO_EDITORIAL_EMPTY",
  "INGREDIENT_ORBIT_WIDE",
  "USAGE_NUMBER_SPLIT",
  "FACT_ANCHOR_ASYMMETRIC",
  "EDITORIAL_COLUMNS",
  "ASYMMETRIC_READING",
  "GUARANTEE_STATEMENT",
  "TRUST_BAND",
  "CTA_BRIDGE",
] as const;
export type DesktopComposition = (typeof DESKTOP_COMPOSITIONS)[number];

export const MOBILE_COMPOSITIONS = [
  "PRODUCT_FIRST_STACK",
  "EDITORIAL_STACK",
  "NUMBER_THEN_COPY",
  "FACT_STACK",
  "READING_STACK",
  "GUARANTEE_STACK",
  "TRUST_STACK",
  "CTA_STACK",
] as const;
export type MobileComposition = (typeof MOBILE_COMPOSITIONS)[number];

export const SLOT_IDS = ["heroPrimary", "sectionAnchor", "edgeProduct", "supportingAsset"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export type AssetSlot = {
  id: SlotId;
  role: AssetUse;
  fit: "contain" | "stage";
  position: "center" | "offset-end" | "bleed-left" | "bleed-right" | "edge";
  priority: ContentWeight;
  desktop: { scale: "lg" | "md" | "sm"; overlap: boolean };
  mobile: { scale: "lg" | "md" | "sm"; overlap: boolean };
};

export type ScenePlan = {
  id: string;
  kind: SceneKind;
  narrativeRole: NarrativeRole;
  sectionIds: PresellSectionId[];
  weight: ContentWeight;
  rhythm: RhythmBeat;
  assetUse: AssetUse;
  slot: AssetSlot | null;
  desktopComposition: DesktopComposition;
  mobileComposition: MobileComposition;
  collapsed: boolean;
  visibleLeadCount: number;
  geometry: GeometryVariant;
  whitespace: WhitespaceKind;
  visualMoment: boolean;
};

export type StickyCtaPlan = {
  showAfterHeroCtaLeaves: boolean;
  hideWhenPrimaryCtaVisible: boolean;
  hideNearFooter: boolean;
  hideWhenGuaranteeVisible: boolean;
  requireScrollIntentPx: number;
  compact: boolean;
  collisionPaddingPx: number;
};

export type CreativeCompositionPlan = {
  version: typeof CREATIVE_COMPOSITION_VERSION;
  narrative: NarrativeRole[];
  scenes: ScenePlan[];
  stickyCta: StickyCtaPlan;
  appliedActionCodes: VisualQaActionCode[];
  packshotReady: boolean;
};
