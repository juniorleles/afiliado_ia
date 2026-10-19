import type { LandingDocument } from "@/lib/landing-composer/types";
import type { ShowcaseImage } from "@/lib/product-showcase/model";

/**
 * Demo-only crops. They live under public/ and are served only by the lab demo.
 * They are not Product Facts and must not be referenced by a real campaign page.
 * The files were extracted one folder deeper than the public path name.
 */

const DEMO_ASSET_BASE = "/demo-assets/harbor-demo-assets/harbor-demo-assets/harbor-demo-assets";

const INGREDIENTS = [
  ["Northpetal", "ingredient-northpetal.jpg"],
  ["Ambergill", "ingredient-ambergill.jpg"],
  ["Cinder Cap", "ingredient-cinder-cap.jpg"],
  ["Pale Gill", "ingredient-pale-gill.jpg"],
  ["Moss Button", "ingredient-moss-button.jpg"],
  ["River Ear", "ingredient-river-ear.jpg"],
  ["Salt Cap", "ingredient-salt-cap.jpg"],
  ["Ember Gill", "ingredient-ember-gill.jpg"],
  ["Paper Cap", "ingredient-paper-cap.jpg"],
  ["Night Ear", "ingredient-night-ear.jpg"],
] as const;

function demoSrc(file: string): string {
  return `${DEMO_ASSET_BASE}/${file}`;
}

export const DEMO_HERO: ShowcaseImage = {
  src: demoSrc("hero-photo.jpg"),
  alt: "Fictional Harbor Capsule demo still life. Not a product photograph.",
};

export const DEMO_FORMAT: ShowcaseImage = {
  src: demoSrc("capsules-photo.jpg"),
  alt: "Fictional demo capsule crop. Not a product photograph.",
};

export const DEMO_INGREDIENTS: Array<{ name: string; src: string; alt: string }> = INGREDIENTS.map(([name, file]) => ({
  name,
  src: demoSrc(file),
  alt: `Fictional demo crop for ${name}. Not a product photograph.`,
}));

export function demoDocument(): LandingDocument {
  return {
    version: 1,
    campaignId: 0,
    language: "en",
    generatedAt: "2026-10-15T00:00:00.000Z",
    sections: [
      { sectionId: "hero", content: { headline: "Harbor Capsule", subheadline: "Daily capsule." }, warnings: [] },
      { sectionId: "benefits", content: { fromFacts: ["Easy once-daily capsule", "Supports healthy cholesterol levels"] }, warnings: [] },
      { sectionId: "ingredients", content: { names: INGREDIENTS.map(([name]) => name) }, warnings: [] },
      { sectionId: "guarantee", content: { text: "60-day refund" }, warnings: [] },
      { sectionId: "problem", content: { cautions: ["This product is not intended to diagnose, treat, cure, or prevent any disease."] }, warnings: [] },
    ],
    seo: null,
    schema: null,
    metadata: { approachId: null, compositionTimeMs: 0, inputFingerprint: "showcase-demo", cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
}
