/**
 * Presentation plans only. Category words choose atmosphere.
 * They never add a claim, a section, or a fact.
 */

export const SECTION_ART_DIRECTOR_VERSION = "section-art-director-v2";

export const LAYOUT_ARCHETYPES = [
  "EDITORIAL_SPLIT",
  "VISUAL_GRID",
  "FEATURE_MOSAIC",
  "DENSE_FACT_GRID",
  "SPOTLIGHT",
  "DARK_BAND",
  "LIGHT_EDITORIAL",
  "PRODUCT_STAGE",
  "OFFER_STAGE",
  "GUARANTEE_BAND",
  "CONTENT_CLUSTER",
  "COMPARISON_GRID",
  "MINIMAL_TEXT",
  "CLOSING_STAGE",
] as const;

export type LayoutArchetype = (typeof LAYOUT_ARCHETYPES)[number];
export type SurfaceTreatment = "light" | "dark" | "editorial" | "stage" | "band";
export type VisualDensity = "airy" | "balanced" | "dense";
export type AssetStrategy = "SOURCE_ASSET" | "GENERATED_DECORATIVE" | "ICONOGRAPHIC" | "CSS_DECORATIVE" | "NONE";
export type MotifFamily = "clarity" | "movement" | "technical" | "calm" | "editorial";

export type DecorativeAssetRecord = {
  purpose: string;
  section: string;
  provider: "local-css";
  promptVersion: typeof SECTION_ART_DIRECTOR_VERSION;
  factualAuthority: "NONE";
};

export type SectionArtPlan = {
  sectionRole: string;
  layoutArchetype: LayoutArchetype;
  surfaceTreatment: SurfaceTreatment;
  visualDensity: VisualDensity;
  assetStrategy: AssetStrategy;
  iconStrategy: "geometric" | "instructional" | "none";
  typographyEmphasis: "display" | "editorial" | "compact";
  decorativeStrategy: "motif-wash" | "none";
  contentGrouping: "single" | "grid" | "mosaic" | "cluster";
  responsiveBehavior: "stack" | "reflow-grid" | "stage-stack";
  factualAuthority: "NONE";
  decorativeAsset: DecorativeAssetRecord | null;
};

export type SectionArtDirection = {
  version: typeof SECTION_ART_DIRECTOR_VERSION;
  motif: MotifFamily;
  factualAuthority: "NONE";
  sections: SectionArtPlan[];
};

const MOTIFS: Array<{ id: MotifFamily; pattern: RegExp }> = [
  { id: "clarity", pattern: /\b(vision|eyesight|optical|sight)\b/i },
  { id: "movement", pattern: /\b(joint|mobility|flexibility|movement)\b/i },
  { id: "technical", pattern: /\b(software|dashboard|interface|application)\b/i },
  { id: "calm", pattern: /\b(sleep|calm|bedtime)\b/i },
];

const SURFACE_CYCLE: SurfaceTreatment[] = ["light", "editorial", "dark", "band", "stage"];

/** Atmosphere from authorized wording. The first matching family wins. */
export function motifFromAuthorizedCopy(text: string): MotifFamily {
  for (const motif of MOTIFS) {
    if (motif.pattern.test(text)) return motif.id;
  }
  return "editorial";
}

function archetypeFor(id: string, count: number, packshotReady: boolean): LayoutArchetype {
  if (id === "hero") return packshotReady ? "PRODUCT_STAGE" : "EDITORIAL_SPLIT";
  if (id === "overview" || id === "overview-bridge") return "MINIMAL_TEXT";
  if (id === "ingredients") {
    if (count > 8) return "DENSE_FACT_GRID";
    if (count > 3) return "VISUAL_GRID";
    return "EDITORIAL_SPLIT";
  }
  if (id === "usage") return "CONTENT_CLUSTER";
  if (id === "features") {
    if (count >= 4) return "FEATURE_MOSAIC";
    if (count <= 1) return "SPOTLIGHT";
    return "EDITORIAL_SPLIT";
  }
  if (id === "guarantee") return "GUARANTEE_BAND";
  if (id === "offer") return count > 1 ? "OFFER_STAGE" : "COMPARISON_GRID";
  if (id === "closing") return "CLOSING_STAGE";
  if (id === "faq") return "LIGHT_EDITORIAL";
  return "MINIMAL_TEXT";
}

function preferredSurface(archetype: LayoutArchetype): SurfaceTreatment {
  switch (archetype) {
    case "PRODUCT_STAGE":
    case "OFFER_STAGE":
    case "COMPARISON_GRID":
      return "stage";
    case "FEATURE_MOSAIC":
    case "DARK_BAND":
    case "CLOSING_STAGE":
      return "dark";
    case "GUARANTEE_BAND":
    case "CONTENT_CLUSTER":
      return "band";
    case "DENSE_FACT_GRID":
    case "EDITORIAL_SPLIT":
    case "SPOTLIGHT":
      return "editorial";
    case "LIGHT_EDITORIAL":
    case "MINIMAL_TEXT":
    case "VISUAL_GRID":
      return "light";
    default:
      return "light";
  }
}

function nextSurface(preferred: SurfaceTreatment, previous: SurfaceTreatment | null): SurfaceTreatment {
  if (previous == null || preferred !== previous) return preferred;
  const start = SURFACE_CYCLE.indexOf(preferred);
  for (let step = 1; step < SURFACE_CYCLE.length; step += 1) {
    const candidate = SURFACE_CYCLE[(start + step) % SURFACE_CYCLE.length];
    if (candidate !== previous) return candidate;
  }
  return preferred;
}

function densityFor(archetype: LayoutArchetype, count: number): VisualDensity {
  if (archetype === "DENSE_FACT_GRID" || count > 8) return "dense";
  if (archetype === "PRODUCT_STAGE" || archetype === "SPOTLIGHT" || archetype === "MINIMAL_TEXT") return "airy";
  return "balanced";
}

function assetFor(id: string, packshotReady: boolean): AssetStrategy {
  if ((id === "hero" || id === "closing") && packshotReady) return "SOURCE_ASSET";
  if (id === "ingredients" || id === "features") return "ICONOGRAPHIC";
  if (id === "usage") return "ICONOGRAPHIC";
  if (id === "guarantee" || id === "hero" || id === "overview-bridge") return "CSS_DECORATIVE";
  return "NONE";
}

function planSection(
  id: string,
  count: number,
  packshotReady: boolean,
  previous: SurfaceTreatment | null,
): SectionArtPlan {
  const layoutArchetype = archetypeFor(id, count, packshotReady);
  const decorative = layoutArchetype === "MINIMAL_TEXT" || id === "faq" || id === "offer" ? "none" : "motif-wash";
  return {
    sectionRole: id,
    layoutArchetype,
    surfaceTreatment: nextSurface(preferredSurface(layoutArchetype), previous),
    visualDensity: densityFor(layoutArchetype, count),
    assetStrategy: assetFor(id, packshotReady),
    iconStrategy: id === "usage" ? "instructional" : id === "ingredients" || id === "features" ? "geometric" : "none",
    typographyEmphasis: id === "hero" || id === "offer" ? "display" : layoutArchetype === "DENSE_FACT_GRID" ? "compact" : "editorial",
    decorativeStrategy: decorative,
    contentGrouping:
      layoutArchetype === "FEATURE_MOSAIC"
        ? "mosaic"
        : layoutArchetype === "CONTENT_CLUSTER"
          ? "cluster"
          : layoutArchetype === "DENSE_FACT_GRID" || layoutArchetype === "VISUAL_GRID" || layoutArchetype === "OFFER_STAGE"
            ? "grid"
            : "single",
    responsiveBehavior: id === "hero" || id === "offer" || id === "closing" ? "stage-stack" : layoutArchetype === "DENSE_FACT_GRID" || layoutArchetype === "VISUAL_GRID" || layoutArchetype === "FEATURE_MOSAIC" ? "reflow-grid" : "stack",
    factualAuthority: "NONE",
    decorativeAsset:
      decorative === "none"
        ? null
        : {
            purpose: "section atmosphere",
            section: id,
            provider: "local-css",
            promptVersion: SECTION_ART_DIRECTOR_VERSION,
            factualAuthority: "NONE",
          },
  };
}

export function directSectionArt(input: {
  authorizedCopy: string;
  sections: ReadonlyArray<{ id: string; itemCount: number }>;
  packshotReady: boolean;
}): SectionArtDirection {
  const sections: SectionArtPlan[] = [];
  let previous: SurfaceTreatment | null = null;
  const withHero = input.sections.some((section) => section.id === "hero")
    ? input.sections
    : [{ id: "hero", itemCount: 1 }, ...input.sections];
  for (const section of withHero) {
    const plan = planSection(section.id, section.itemCount, input.packshotReady, previous);
    sections.push(plan);
    previous = plan.surfaceTreatment;
  }
  return {
    version: SECTION_ART_DIRECTOR_VERSION,
    motif: motifFromAuthorizedCopy(input.authorizedCopy),
    factualAuthority: "NONE",
    sections,
  };
}

export function artPlanFor(direction: SectionArtDirection, role: string): SectionArtPlan | undefined {
  return direction.sections.find((section) => section.sectionRole === role);
}
