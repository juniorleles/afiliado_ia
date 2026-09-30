import { orderedVisibleSections, type PresellPage, type PresellSectionId } from "@/lib/presell-page";
import { packshotAvailable, type DesignPlan } from "@/lib/design/plan";
import { uniqueActionCodes } from "@/lib/design/planner";
import type { VisualQaActionCode, VisualQaFinding } from "@/lib/visual-qa/types";
import { STICKY_COLLISION_PADDING_PX, STICKY_SCROLL_INTENT_PX } from "@/lib/creative/sticky";
import { decorateScenes } from "@/lib/creative/whitespace";
import {
  CREATIVE_COMPOSITION_VERSION,
  MAX_PACKSHOT_USES,
  type AssetSlot,
  type AssetUse,
  type ContentWeight,
  type CreativeCompositionPlan,
  type DesktopComposition,
  type MobileComposition,
  type NarrativeRole,
  type RhythmBeat,
  type SceneKind,
  type ScenePlan,
} from "@/lib/creative/types";

function slot(
  id: AssetSlot["id"],
  role: AssetUse,
  extras: Partial<AssetSlot> = {},
): AssetSlot {
  return {
    id,
    role,
    fit: extras.fit ?? (role === "PRIMARY_HERO" ? "stage" : "contain"),
    position: extras.position ?? "center",
    priority: extras.priority ?? (role === "PRIMARY_HERO" ? "PRIMARY" : "SUPPORTING"),
    desktop: extras.desktop ?? { scale: role === "PRIMARY_HERO" ? "lg" : role === "DECORATIVE_SUPPORT" ? "sm" : "md", overlap: role === "PRIMARY_HERO" },
    mobile: extras.mobile ?? { scale: role === "PRIMARY_HERO" ? "lg" : "sm", overlap: false },
  };
}

function scene(input: {
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
  visualMoment?: boolean;
}): ScenePlan {
  return {
    geometry: "none",
    whitespace: "INTENTIONAL_NEGATIVE_SPACE",
    visualMoment: Boolean(input.visualMoment),
    ...input,
  };
}

function usageItemCount(section: { paragraphs: string[]; bullets: string[] }): number {
  return section.paragraphs.length + section.bullets.length;
}

export function createCreativeCompositionPlan(input: {
  page: PresellPage;
  design: DesignPlan;
  findings?: VisualQaFinding[];
}): CreativeCompositionPlan {
  const ready = packshotAvailable(input.design);
  const codes = uniqueActionCodes(input.findings ?? []);
  const collapseHard = codes.includes("COLLAPSE_SECONDARY_DETAILS") || codes.includes("REDUCE_VISIBLE_CONTENT_DENSITY");
  const promoteProduct = ready && (codes.includes("PROMOTE_PRODUCT_VISUAL") || codes.includes("CREATE_HERO_FOCAL_POINT") || codes.length === 0);
  const visible = orderedVisibleSections(input.page);
  const used = new Set<PresellSectionId>();
  const scenes: ScenePlan[] = [];
  let packshotUses = 0;

  function takeAsset(use: AssetUse, make: () => AssetSlot | null): { assetUse: AssetUse; slot: AssetSlot | null } {
    if (!ready || use === "NONE") return { assetUse: "NONE", slot: null };
    if (packshotUses >= MAX_PACKSHOT_USES) return { assetUse: "NONE", slot: null };
    const next = make();
    if (!next) return { assetUse: "NONE", slot: null };
    packshotUses += 1;
    return { assetUse: use, slot: next };
  }

  const heroAsset = takeAsset("PRIMARY_HERO", () =>
    slot("heroPrimary", "PRIMARY_HERO", {
      position: "offset-end",
      desktop: { scale: "lg", overlap: true },
      mobile: { scale: "lg", overlap: false },
    }),
  );
  scenes.push(
    scene({
      id: "hero",
      kind: "HERO_PRODUCT_STAGE",
      narrativeRole: "INTRODUCE",
      sectionIds: [],
      weight: "PRIMARY",
      rhythm: "HIGH_IMPACT",
      assetUse: heroAsset.assetUse,
      slot: heroAsset.slot,
      desktopComposition: ready ? "HERO_STAGE_ASYMMETRIC" : "HERO_EDITORIAL_EMPTY",
      mobileComposition: ready ? "PRODUCT_FIRST_STACK" : "EDITORIAL_STACK",
      collapsed: false,
      visibleLeadCount: codes.includes("CREATE_HERO_FOCAL_POINT") ? 2 : 3,
      visualMoment: ready,
    }),
  );

  const byId = (id: PresellSectionId) => visible.find((section) => section.id === id);

  function pushOverview(): void {
    const overview = byId("overview");
    if (!overview || used.has("overview")) return;
    scenes.push(
      scene({
        id: "overview",
        kind: "EDITORIAL_EXPLAINER",
        narrativeRole: "EXPLAIN",
        sectionIds: ["overview"],
        weight: "PRIMARY",
        rhythm: "EDITORIAL",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "EDITORIAL_COLUMNS",
        mobileComposition: "READING_STACK",
        collapsed: false,
        visibleLeadCount: 8,
      }),
    );
    used.add("overview");
  }

  if (input.page.template === "BUYER_GUIDE") {
    pushOverview();
  }

  const ingredients = byId("ingredients");
  if (ingredients) {
    const asset = takeAsset(promoteProduct ? "SECTION_ANCHOR" : "NONE", () =>
      slot("sectionAnchor", "SECTION_ANCHOR", {
        position: "bleed-left",
        desktop: { scale: "md", overlap: true },
        mobile: { scale: "sm", overlap: false },
      }),
    );
    scenes.push(
      scene({
        id: "ingredients",
        kind: "INGREDIENT_SHOWCASE",
        narrativeRole: "ORIENT",
        sectionIds: ["ingredients"],
        weight: "PRIMARY",
        rhythm: "VISUAL",
        assetUse: asset.assetUse,
        slot: asset.slot,
        desktopComposition: "INGREDIENT_ORBIT_WIDE",
        mobileComposition: "FACT_STACK",
        collapsed: true,
        visibleLeadCount: Math.max(ingredients.cards.length, ingredients.bullets.length, ingredients.paragraphs.length, 1),
        visualMoment: true,
      }),
    );
    used.add("ingredients");
  }

  const usage = byId("usage");
  const features = byId("features");
  if (usage) {
    const sparseUsage = usageItemCount(usage) <= 2;
    const asset = takeAsset(promoteProduct && sparseUsage ? "TRANSITION_ANCHOR" : "NONE", () =>
      slot("edgeProduct", "TRANSITION_ANCHOR", {
        position: "edge",
        fit: "contain",
        desktop: { scale: "sm", overlap: false },
        mobile: { scale: "sm", overlap: false },
      }),
    );
    scenes.push(
      scene({
        id: "usage",
        kind: "NUMBERED_USAGE_SCENE",
        narrativeRole: "EXPLAIN",
        sectionIds: ["usage"],
        weight: "PRIMARY",
        rhythm: "INFORMATIONAL",
        assetUse: asset.assetUse,
        slot: asset.slot,
        desktopComposition: "USAGE_NUMBER_SPLIT",
        mobileComposition: "NUMBER_THEN_COPY",
        collapsed: false,
        visibleLeadCount: 8,
      }),
    );
    used.add("usage");
  }

  if (features && !used.has("features")) {
    scenes.push(
      scene({
        id: "features",
        kind: "PRODUCT_CHARACTERISTICS_SCENE",
        narrativeRole: "DIFFERENTIATE",
        sectionIds: ["features"],
        weight: "SUPPORTING",
        rhythm: "INFORMATIONAL",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "FACT_ANCHOR_ASYMMETRIC",
        mobileComposition: "FACT_STACK",
        collapsed: true,
        visibleLeadCount: collapseHard ? 3 : 4,
      }),
    );
    used.add("features");
  }

  const considerations = byId("considerations");
  if (considerations) {
    scenes.push(
      scene({
        id: "considerations",
        kind: "CONSIDERATION_EDITORIAL_SCENE",
        narrativeRole: "CONSIDER",
        sectionIds: ["considerations"],
        weight: "DETAIL",
        rhythm: "EDITORIAL",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "EDITORIAL_COLUMNS",
        mobileComposition: "READING_STACK",
        collapsed: true,
        visibleLeadCount: collapseHard ? 1 : 2,
      }),
    );
    used.add("considerations");
  }

  pushOverview();

  const pros = byId("pros");
  if (pros) {
    scenes.push(
      scene({
        id: "pros",
        kind: "EDITORIAL_EXPLAINER",
        narrativeRole: "DIFFERENTIATE",
        sectionIds: ["pros"],
        weight: "SUPPORTING",
        rhythm: "QUIET",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "EDITORIAL_COLUMNS",
        mobileComposition: "READING_STACK",
        collapsed: true,
        visibleLeadCount: 3,
      }),
    );
    used.add("pros");
  }

  if (input.design.ctaStrategy.afterPrimaryFacts) {
    scenes.push(
      scene({
        id: "cta-bridge",
        kind: "CTA_TRANSITION_SCENE",
        narrativeRole: "ACT",
        sectionIds: [],
        weight: "SUPPORTING",
        rhythm: "QUIET",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "CTA_BRIDGE",
        mobileComposition: "CTA_STACK",
        collapsed: false,
        visibleLeadCount: 1,
      }),
    );
  }

  const guarantee = byId("guarantee");
  if (guarantee) {
    scenes.push(
      scene({
        id: "guarantee",
        kind: "GUARANTEE_STATEMENT_SCENE",
        narrativeRole: "REASSURE",
        sectionIds: ["guarantee"],
        weight: "PRIMARY",
        rhythm: "HIGH_IMPACT",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "GUARANTEE_STATEMENT",
        mobileComposition: "GUARANTEE_STACK",
        collapsed: false,
        visibleLeadCount: 1,
        visualMoment: true,
      }),
    );
    used.add("guarantee");
  }

  const faq = byId("faq");
  scenes.push(
    scene({
      id: "trust",
      kind: "TRUST_DISCLOSURE_SCENE",
      narrativeRole: "DISCLOSE",
      sectionIds: faq ? ["faq"] : [],
      weight: "DETAIL",
      rhythm: "TRUST",
      assetUse: "NONE",
      slot: null,
      desktopComposition: "TRUST_BAND",
      mobileComposition: "TRUST_STACK",
      collapsed: true,
      visibleLeadCount: 4,
    }),
  );
  if (faq) used.add("faq");

  for (const section of visible) {
    if (used.has(section.id) || section.id === "quickSummary") continue;
    scenes.push(
      scene({
        id: section.id,
        kind: "EDITORIAL_EXPLAINER",
        narrativeRole: "EXPLAIN",
        sectionIds: [section.id],
        weight: "DETAIL",
        rhythm: "QUIET",
        assetUse: "NONE",
        slot: null,
        desktopComposition: "EDITORIAL_COLUMNS",
        mobileComposition: "READING_STACK",
        collapsed: true,
        visibleLeadCount: 2,
      }),
    );
  }

  const narrative = [...new Set(scenes.map((item) => item.narrativeRole))];
  return {
    version: CREATIVE_COMPOSITION_VERSION,
    narrative,
    scenes: decorateScenes(scenes),
    stickyCta: {
      showAfterHeroCtaLeaves: true,
      hideWhenPrimaryCtaVisible: true,
      hideNearFooter: true,
      hideWhenGuaranteeVisible: true,
      requireScrollIntentPx: STICKY_SCROLL_INTENT_PX,
      compact: true,
      collisionPaddingPx: STICKY_COLLISION_PADDING_PX,
    },
    appliedActionCodes: codes,
    packshotReady: ready,
  };
}

export function applyCreativeActionCodes(
  plan: CreativeCompositionPlan,
  codes: VisualQaActionCode[],
): CreativeCompositionPlan {
  const next: CreativeCompositionPlan = structuredClone(plan);
  for (const code of codes) {
    if (!next.appliedActionCodes.includes(code)) next.appliedActionCodes.push(code);
    if (code === "CREATE_HERO_FOCAL_POINT") {
      const hero = next.scenes.find((scene) => scene.kind === "HERO_PRODUCT_STAGE");
      if (hero) {
        hero.visibleLeadCount = Math.min(hero.visibleLeadCount, 2);
        hero.weight = "PRIMARY";
        if (hero.slot) {
          hero.slot.desktop = { scale: "lg", overlap: true };
          hero.slot.mobile = { scale: "lg", overlap: false };
        }
      }
    }
    if (code === "PROMOTE_PRODUCT_VISUAL") {
      const ingredients = next.scenes.find((scene) => scene.kind === "INGREDIENT_SHOWCASE");
      if (ingredients && next.packshotReady && ingredients.assetUse === "NONE") {
        ingredients.assetUse = "SECTION_ANCHOR";
        ingredients.slot = slot("sectionAnchor", "SECTION_ANCHOR", {
          position: "bleed-left",
          desktop: { scale: "md", overlap: true },
          mobile: { scale: "sm", overlap: false },
        });
        ingredients.visualMoment = true;
      }
      const used = next.scenes.filter((scene) => scene.assetUse !== "NONE").length;
      const usage = next.scenes.find(
        (scene) => scene.kind === "PRODUCT_FACT_SCENE" || scene.kind === "NUMBERED_USAGE_SCENE",
      );
      if (usage && next.packshotReady && usage.assetUse === "NONE" && used < MAX_PACKSHOT_USES) {
        usage.assetUse = "TRANSITION_ANCHOR";
        usage.slot = slot("edgeProduct", "TRANSITION_ANCHOR", {
          position: "edge",
          fit: "contain",
          desktop: { scale: "sm", overlap: false },
          mobile: { scale: "sm", overlap: false },
        });
      }
    }
    if (code === "COLLAPSE_SECONDARY_DETAILS" || code === "REDUCE_VISIBLE_CONTENT_DENSITY") {
      for (const scene of next.scenes) {
        if (scene.id === "overview" || scene.sectionIds[0] === "overview") continue;
        if (scene.weight === "DETAIL" || scene.weight === "SUPPORTING") {
          scene.collapsed = true;
          scene.visibleLeadCount = Math.min(scene.visibleLeadCount, scene.weight === "DETAIL" ? 1 : 2);
        }
      }
    }
    if (code === "IMPROVE_MOBILE_COMPOSITION") {
      for (const scene of next.scenes) {
        if (scene.kind === "HERO_PRODUCT_STAGE" && next.packshotReady) {
          scene.mobileComposition = "PRODUCT_FIRST_STACK";
        }
      }
    }
  }
  return next;
}
