import type { PresellSectionId } from "@/lib/presell-page";
import type { VisualQaActionCode } from "@/lib/visual-qa/types";
import {
  ASSET_USES,
  CONTENT_WEIGHTS,
  CREATIVE_COMPOSITION_VERSION,
  DESKTOP_COMPOSITIONS,
  GEOMETRY_VARIANTS,
  MOBILE_COMPOSITIONS,
  NARRATIVE_ROLES,
  RHYTHM_BEATS,
  SCENE_KINDS,
  SLOT_IDS,
  WHITESPACE_KINDS,
  type AssetSlot,
  type AssetUse,
  type ContentWeight,
  type CreativeCompositionPlan,
  type DesktopComposition,
  type GeometryVariant,
  type MobileComposition,
  type NarrativeRole,
  type RhythmBeat,
  type SceneKind,
  type ScenePlan,
  type SlotId,
  type StickyCtaPlan,
  type WhitespaceKind,
} from "@/lib/creative/types";
import { STICKY_COLLISION_PADDING_PX, STICKY_SCROLL_INTENT_PX } from "@/lib/creative/sticky";
import { SECTION_IDS } from "@/lib/presell-page";

function inList<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseSlot(raw: unknown): AssetSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const desktop = (rec.desktop && typeof rec.desktop === "object" ? rec.desktop : {}) as Record<string, unknown>;
  const mobile = (rec.mobile && typeof rec.mobile === "object" ? rec.mobile : {}) as Record<string, unknown>;
  const scaleOf = (value: unknown): "lg" | "md" | "sm" =>
    value === "lg" || value === "md" || value === "sm" ? value : "md";
  return {
    id: inList(rec.id, SLOT_IDS, "sectionAnchor"),
    role: inList(rec.role, ASSET_USES, "NONE"),
    fit: rec.fit === "contain" ? "contain" : "stage",
    position:
      rec.position === "offset-end" ||
      rec.position === "bleed-left" ||
      rec.position === "bleed-right" ||
      rec.position === "edge" ||
      rec.position === "center"
        ? rec.position
        : "center",
    priority: inList(rec.priority, CONTENT_WEIGHTS, "SUPPORTING"),
    desktop: { scale: scaleOf(desktop.scale), overlap: Boolean(desktop.overlap) },
    mobile: { scale: scaleOf(mobile.scale), overlap: Boolean(mobile.overlap) },
  };
}

function parseScene(raw: unknown, index: number): ScenePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const sectionIds = Array.isArray(rec.sectionIds)
    ? rec.sectionIds.filter((id): id is PresellSectionId => typeof id === "string" && (SECTION_IDS as readonly string[]).includes(id))
    : [];
  return {
    id: typeof rec.id === "string" && rec.id ? rec.id : `scene-${index}`,
    kind: inList(rec.kind, SCENE_KINDS, "EDITORIAL_EXPLAINER"),
    narrativeRole: inList(rec.narrativeRole, NARRATIVE_ROLES, "EXPLAIN"),
    sectionIds,
    weight: inList(rec.weight, CONTENT_WEIGHTS, "SUPPORTING"),
    rhythm: inList(rec.rhythm, RHYTHM_BEATS, "INFORMATIONAL"),
    assetUse: inList(rec.assetUse, ASSET_USES, "NONE"),
    slot: parseSlot(rec.slot),
    desktopComposition: inList(rec.desktopComposition, DESKTOP_COMPOSITIONS, "EDITORIAL_COLUMNS"),
    mobileComposition: inList(rec.mobileComposition, MOBILE_COMPOSITIONS, "READING_STACK"),
    collapsed: Boolean(rec.collapsed),
    visibleLeadCount: typeof rec.visibleLeadCount === "number" && rec.visibleLeadCount > 0 ? rec.visibleLeadCount : 3,
    geometry: inList(rec.geometry, GEOMETRY_VARIANTS, "none"),
    whitespace: inList(rec.whitespace, WHITESPACE_KINDS, "INTENTIONAL_NEGATIVE_SPACE"),
    visualMoment: Boolean(rec.visualMoment),
  };
}

export function parseCreativeCompositionPlan(json: string | null | undefined): CreativeCompositionPlan | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes.map(parseScene).filter((item): item is ScenePlan => Boolean(item))
      : [];
    const sticky = (parsed.stickyCta && typeof parsed.stickyCta === "object" ? parsed.stickyCta : {}) as Record<
      string,
      unknown
    >;
    const stickyCta: StickyCtaPlan = {
      showAfterHeroCtaLeaves: sticky.showAfterHeroCtaLeaves !== false,
      hideWhenPrimaryCtaVisible: sticky.hideWhenPrimaryCtaVisible !== false,
      hideNearFooter: sticky.hideNearFooter !== false,
      hideWhenGuaranteeVisible: sticky.hideWhenGuaranteeVisible !== false,
      requireScrollIntentPx:
        typeof sticky.requireScrollIntentPx === "number" ? sticky.requireScrollIntentPx : STICKY_SCROLL_INTENT_PX,
      compact: sticky.compact !== false,
      collisionPaddingPx:
        typeof sticky.collisionPaddingPx === "number" ? sticky.collisionPaddingPx : STICKY_COLLISION_PADDING_PX,
    };
    return {
      version: CREATIVE_COMPOSITION_VERSION,
      narrative: Array.isArray(parsed.narrative)
        ? parsed.narrative.map((role) => inList(role, NARRATIVE_ROLES, "EXPLAIN"))
        : [],
      scenes,
      stickyCta,
      appliedActionCodes: Array.isArray(parsed.appliedActionCodes)
        ? (parsed.appliedActionCodes.filter((code) => typeof code === "string") as VisualQaActionCode[])
        : [],
      packshotReady: Boolean(parsed.packshotReady),
    };
  } catch {
    return null;
  }
}

export function serializeCreativeCompositionPlan(plan: CreativeCompositionPlan): string {
  return JSON.stringify({ ...plan, version: CREATIVE_COMPOSITION_VERSION });
}

export function creativePlansEqual(a: CreativeCompositionPlan, b: CreativeCompositionPlan): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type { AssetSlot, AssetUse, ContentWeight, CreativeCompositionPlan, DesktopComposition, MobileComposition, NarrativeRole, RhythmBeat, SceneKind, ScenePlan, SlotId, StickyCtaPlan };
