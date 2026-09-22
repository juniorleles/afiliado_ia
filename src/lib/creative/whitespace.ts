import { MAX_DECORATIVE_GEOMETRY, type GeometryVariant, type ScenePlan, type WhitespaceKind } from "@/lib/creative/types";

export function classifySceneWhitespace(scene: Pick<ScenePlan, "kind" | "rhythm" | "weight" | "sectionIds">): WhitespaceKind {
  if (scene.kind === "CTA_TRANSITION_SCENE") return "CONTENT_GAP";
  if (scene.kind === "HERO_PRODUCT_STAGE" || scene.kind === "GUARANTEE_STATEMENT_SCENE") {
    return "INTENTIONAL_NEGATIVE_SPACE";
  }
  if (scene.rhythm === "QUIET" && scene.sectionIds.length === 0) return "COMPOSITION_IMBALANCE";
  if (scene.weight === "DETAIL" && scene.rhythm === "EDITORIAL") return "INTENTIONAL_NEGATIVE_SPACE";
  return "INTENTIONAL_NEGATIVE_SPACE";
}

export function geometryForScene(kind: ScenePlan["kind"], used: GeometryVariant[]): GeometryVariant {
  if (used.length >= MAX_DECORATIVE_GEOMETRY) return "none";
  if (kind === "HERO_PRODUCT_STAGE") return used.includes("orb") ? "none" : "orb";
  if (kind === "INGREDIENT_SHOWCASE") return used.includes("grain") ? "none" : "grain";
  if (kind === "CONSIDERATION_EDITORIAL_SCENE" || kind === "EDITORIAL_EXPLAINER") {
    return used.includes("line") ? "none" : "line";
  }
  return "none";
}

export function decorateScenes(scenes: ScenePlan[]): ScenePlan[] {
  const used: GeometryVariant[] = [];
  return scenes.map((scene) => {
    const geometry = geometryForScene(scene.kind, used);
    if (geometry !== "none") used.push(geometry);
    return {
      ...scene,
      geometry,
      whitespace: classifySceneWhitespace(scene),
    };
  });
}

export function visualMomentKinds(scenes: ScenePlan[]): string[] {
  return scenes.filter((scene) => scene.visualMoment).map((scene) => scene.kind);
}

export function repeatedGeometryCount(scenes: ScenePlan[]): Map<GeometryVariant, number> {
  const counts = new Map<GeometryVariant, number>();
  for (const scene of scenes) {
    if (scene.geometry === "none") continue;
    counts.set(scene.geometry, (counts.get(scene.geometry) || 0) + 1);
  }
  return counts;
}
