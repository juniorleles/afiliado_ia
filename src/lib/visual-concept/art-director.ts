import { ART_DIRECTION_IS_EVIDENCE } from "@/lib/visual-concept/firewall";
import type { VisualBrief, VisualDirectionFamily } from "@/lib/visual-concept/types";

export const ART_DIRECTION_VERSION = "visual-art-director-v1";

export const VISUAL_ARCHETYPES = [
  "EDITORIAL_LUXURY",
  "PRODUCT_LED_DTC",
  "ATMOSPHERIC_WELLNESS",
  "CLINICAL_MODERN",
  "NATURAL_PREMIUM",
  "TECHNICAL_MODERN",
  "MINIMAL_HIGH_CONTRAST",
  "STRUCTURED_CONVERSION",
] as const;

export type VisualArchetype = (typeof VISUAL_ARCHETYPES)[number];

export type VisualContextId =
  | "sleep-atmosphere"
  | "oral-care-atmosphere"
  | "mobility-atmosphere"
  | "hearing-atmosphere"
  | "focus-atmosphere"
  | "unspecified";

export type ArtDirectionBrief = {
  artDirectorVersion: typeof ART_DIRECTION_VERSION;
  artDirectionIsEvidence: false;
  direction: VisualDirectionFamily;
  primaryArchetype: VisualArchetype;
  secondaryInfluence: VisualArchetype;
  visualContext: VisualContextId;
  mood: string;
  visualNarrative: string;
  visualKeywords: string[];
  paletteStrategy: string;
  typographyCharacter: string;
  photographicLanguage: string;
  materialVocabulary: string[];
  productStaging: string;
  heroComposition: string;
  sectionChoreography: string[];
  sectionContrastStrategy: string;
  spatialRhythm: string;
  imageryStrategy: string;
  decorativeStrategy: string;
  ctaVisualStrategy: string;
  faqVisualStrategy: string;
  footerStrategy: string;
  depthStrategy: string;
  whitespaceStrategy: string;
  visualDensityStrategy: string;
  differentiationStrategy: string;
  avoidPatterns: string[];
};

const PRIMARY: Record<VisualDirectionFamily, VisualArchetype> = {
  PREMIUM_EDITORIAL: "EDITORIAL_LUXURY",
  PREMIUM_PRODUCT: "PRODUCT_LED_DTC",
  PREMIUM_CONVERSION: "STRUCTURED_CONVERSION",
};

const SECONDARY: Record<VisualDirectionFamily, readonly VisualArchetype[]> = {
  PREMIUM_EDITORIAL: ["ATMOSPHERIC_WELLNESS", "NATURAL_PREMIUM", "MINIMAL_HIGH_CONTRAST"],
  PREMIUM_PRODUCT: ["NATURAL_PREMIUM", "TECHNICAL_MODERN", "ATMOSPHERIC_WELLNESS", "CLINICAL_MODERN"],
  PREMIUM_CONVERSION: ["MINIMAL_HIGH_CONTRAST", "CLINICAL_MODERN", "TECHNICAL_MODERN"],
};

const CONTEXTS: Array<{ id: Exclude<VisualContextId, "unspecified">; pattern: RegExp; photography: string; materials: string[] }> = [
  {
    id: "sleep-atmosphere",
    pattern: /\b(sleep|bedtime|night|insomnia)\b/i,
    photography: "quiet atmosphere, soft gradients, night photography, low visual noise, and calm spacing",
    materials: ["soft gradient", "matte cloth", "dim natural light", "subtle grain"],
  },
  {
    id: "oral-care-atmosphere",
    pattern: /\b(teeth|dental|oral|gum)\b/i,
    photography: "clean close-up light, smooth mineral surfaces, precise edges, and high clarity",
    materials: ["glass", "smooth stone", "bright studio light", "matte ceramic"],
  },
  {
    id: "mobility-atmosphere",
    pattern: /\b(movement|flexibility|mobility)\b/i,
    photography: "unhurried natural light, open ground, tactile materials, and calm physical space",
    materials: ["stone", "soft shadow", "natural light", "matte surfaces"],
  },
  {
    id: "hearing-atmosphere",
    pattern: /\b(hearing|ear|audio)\b/i,
    photography: "soft acoustic space, close detail, muted reflections, and low visual noise",
    materials: ["soft gradient", "matte surfaces", "quiet studio light"],
  },
  {
    id: "focus-atmosphere",
    pattern: /\b(focus|cognitive|memory|attention)\b/i,
    photography: "clear fields, restrained contrast, focused light, and uncluttered planes",
    materials: ["paper", "architectural geometry", "controlled studio light"],
  },
];

const NARRATIVE: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL: "OPEN → VISUAL PAUSE → EXPAND → INFORM → RESOLVE",
  PREMIUM_PRODUCT: "OPEN → INTRODUCE → material depth → VISUAL PAUSE → INFORM → DECISION",
  PREMIUM_CONVERSION: "OPEN → INFORM → REINFORCE → DECISION → RESOLVE",
};

const HERO: Record<VisualDirectionFamily, readonly string[]> = {
  PREMIUM_EDITORIAL: [
    "Oversized display type owns an asymmetric open field. The product is a small precise object in negative space. This is not a text-left product-right interface.",
    "A full-bleed photographic pause sits beside a narrow column of oversized type. The product rests low in the open field, not as a poster subject.",
    "Editorial cropping: one large image plane, generous unused space, and the product as a quiet anchor rather than the headline.",
  ],
  PREMIUM_PRODUCT: [
    "The product stage is the visual anchor inside the first viewport, with material depth and shadow around a blank pedestal. The headline is secondary. This is not a poster and not a text-left product-right SaaS hero.",
    "The product stage is the visual anchor on a wide architectural surface. Type sits in a short line above it. The stage owns more than half the viewport.",
    "The product stage is the visual anchor, centered and large among layered planes and a soft shadow. Surrounding type stays narrow.",
  ],
  PREMIUM_CONVERSION: [
    "One headline and one action lead. The product is a supporting object, smaller than the decision. The split is chosen for scannability, not as a default SaaS template.",
    "A clear decision band comes first. The product stage is secondary and contained. Hierarchy is the design, not decoration.",
    "High-legibility type and one primary action occupy the opening. The blank product stage is present but does not dominate the decision.",
  ],
};

const CHOREOGRAPHY: Record<VisualDirectionFamily, readonly string[][]> = {
  PREMIUM_EDITORIAL: [
    [
      "Hero: asymmetric oversized typography",
      "Overview: split editorial section",
      "Feature: full-bleed visual section",
      "Visual story: image-led transition",
      "Usage: quiet information section",
      "Return policy: contained informational section",
      "Decision: wide closing CTA",
      "FAQ: open editorial list",
      "Footer: low-contrast disclosure",
    ],
    [
      "Hero: full-bleed visual section",
      "Overview: oversized typography moment",
      "Feature: asymmetric composition",
      "Visual story: quiet information section",
      "Usage: image-led transition",
      "Return policy: dark/light transition",
      "Decision: wide closing CTA",
      "FAQ: spacious questions",
      "Footer: legal disclosure area",
    ],
  ],
  PREMIUM_PRODUCT: [
    [
      "Hero: product-focused stage",
      "Overview: material full-bleed visual section",
      "Feature: split editorial section",
      "Visual story: image-led transition",
      "Usage: quiet information section",
      "Return policy: contained informational section",
      "Decision: wide closing CTA with a second product moment",
      "FAQ: contained questions, no repeated boxes",
      "Footer: disclosure area",
    ],
    [
      "Hero: deep product-focused stage",
      "Overview: dark/light transition",
      "Feature: asymmetric composition",
      "Visual story: full-bleed visual section",
      "Usage: quiet information section",
      "Return policy: narrow informational band",
      "Decision: wide closing CTA",
      "FAQ: calm stacked questions",
      "Footer: low-contrast legal area",
    ],
  ],
  PREMIUM_CONVERSION: [
    [
      "Hero: decision-led opening",
      "Overview: contained informational section",
      "Feature: scannable split editorial section",
      "Visual story: full-bleed visual pause",
      "Usage: quiet information section",
      "Return policy: compact reassurance band",
      "Decision: wide closing CTA",
      "FAQ: scannable questions",
      "Footer: disclosure area",
    ],
    [
      "Hero: one action and a supporting product stage",
      "Overview: quiet information section",
      "Feature: asymmetric composition with a clear index",
      "Visual story: image-led transition",
      "Usage: contained informational section",
      "Return policy: dark/light transition",
      "Decision: wide closing CTA",
      "FAQ: direct questions",
      "Footer: legal disclosure area",
    ],
  ],
};

const STAGING: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL:
    "Editorial negative space, a quiet pedestal, and a soft shadow. Leave the product stage blank. The original packshot is placed afterward and must not be redrawn.",
  PREMIUM_PRODUCT:
    "A deliberate stage: pedestal or architectural surface, layered planes, and controlled shadow. Leave the product stage blank. The original packshot is placed afterward and must not be redrawn.",
  PREMIUM_CONVERSION:
    "A contained calm surface beside the decision, at a smaller scale. Leave the product stage blank. The original packshot is placed afterward and must not be redrawn.",
};

const DENSITY: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL: "Open, then a large visual pause, then a quiet information band, then a decisive close.",
  PREMIUM_PRODUCT: "Product-heavy opening, a material pause, a quieter informational middle, a product return, then a decisive close.",
  PREMIUM_CONVERSION: "Dense decision information, one open visual breath, then a structured close.",
};

const CTA: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL: "A small precise action, repeated once at the close. Not a promotional banner.",
  PREMIUM_PRODUCT: "One strong action near the product stage, then a wide closing action. The action never covers the packshot.",
  PREMIUM_CONVERSION: "The primary action is the most legible element in the decision band and returns once at the close.",
};

const DEPTH: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL: "Overlap a large photograph with a type plane. Use cropping and negative-space contrast more than effects.",
  PREMIUM_PRODUCT: "Separate foreground stage, midground material, and background light. Use soft shadow and layered planes.",
  PREMIUM_CONVERSION: "Use restrained depth: one elevated decision surface, a quieter background, and no decorative clutter.",
};

const TYPE: Record<VisualDirectionFamily, string> = {
  PREMIUM_EDITORIAL: "High-contrast display serif for headlines, restrained sans for interface text.",
  PREMIUM_PRODUCT: "Humanist premium sans for the system, with a display face only for the short product moment.",
  PREMIUM_CONVERSION: "Modern geometric sans, high legibility, clear size steps, no decorative script.",
};

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  return length === 0 ? 0 : hash % length;
}

export function deriveVisualContext(allowedCopy: readonly string[]): VisualContextId {
  const text = allowedCopy.join("\n");
  for (const context of CONTEXTS) {
    if (context.pattern.test(text)) return context.id;
  }
  return "unspecified";
}

export function directVisualArt(brief: VisualBrief, direction: VisualDirectionFamily): ArtDirectionBrief {
  const visualContext = deriveVisualContext(brief.allowedCopy);
  const context = CONTEXTS.find((item) => item.id === visualContext);
  const seed = `${direction}:${visualContext}:${brief.contentVersion}`;
  const secondaryChoices = SECONDARY[direction];
  const secondaryInfluence = secondaryChoices[stableIndex(seed, secondaryChoices.length)];
  const heroChoices = HERO[direction];
  const heroComposition = heroChoices[stableIndex(`${seed}:hero`, heroChoices.length)];
  const choreographyChoices = CHOREOGRAPHY[direction];
  const sectionChoreography = choreographyChoices[stableIndex(`${seed}:sections`, choreographyChoices.length)];
  const photography =
    context?.photography ?? "neutral premium commerce light, with no assumed category atmosphere";
  const materials = context?.materials ?? ["paper", "soft gradient", "studio light", "subtle grain"];
  return {
    artDirectorVersion: ART_DIRECTION_VERSION,
    artDirectionIsEvidence: ART_DIRECTION_IS_EVIDENCE,
    direction,
    primaryArchetype: PRIMARY[direction],
    secondaryInfluence,
    visualContext,
    mood:
      direction === "PREMIUM_EDITORIAL"
        ? "Restrained, spacious, and literary."
        : direction === "PREMIUM_PRODUCT"
          ? "Tactile, confident, and product-led."
          : "Clear, calm, and decisive.",
    visualNarrative: NARRATIVE[direction],
    visualKeywords:
      direction === "PREMIUM_EDITORIAL"
        ? ["editorial pacing", "oversized type", "open field", "visual pause"]
        : direction === "PREMIUM_PRODUCT"
          ? ["product stage", "material depth", "DTC sophistication", "layered planes"]
          : ["decision hierarchy", "scannable bands", "one action", "structured close"],
    paletteStrategy: `Derive contrast from the ${secondaryInfluence} influence. Do not recolor the source packshot. Do not use palette alone as the difference between concepts.`,
    typographyCharacter: TYPE[direction],
    photographicLanguage: photography,
    materialVocabulary: materials,
    productStaging: STAGING[direction],
    heroComposition,
    sectionChoreography: [...sectionChoreography],
    sectionContrastStrategy: "Alternate full-bleed, split, quiet, and decisive bands. Do not repeat one container.",
    spatialRhythm: DENSITY[direction],
    imageryStrategy:
      "Every generated image has one role: atmosphere, depth, transition, materiality, context, visual pause, or composition balance. Do not add filler photography or factual evidence.",
    decorativeStrategy: "Decoration supports transitions and depth. It does not add seals, stars, badges, or benefit icons.",
    ctaVisualStrategy: CTA[direction],
    faqVisualStrategy: "Questions are a readable sequence with clear boundaries, not a grid of cards.",
    footerStrategy: "A quiet legal and disclosure area. No promotional seals.",
    depthStrategy: DEPTH[direction],
    whitespaceStrategy:
      direction === "PREMIUM_CONVERSION"
        ? "Whitespace separates decisions. It does not leave the page empty of structure."
        : "Large intentional whitespace between visual moments.",
    visualDensityStrategy: DENSITY[direction],
    differentiationStrategy:
      "Change hero geometry, section rhythm, image scale, product scale, photographic density, transitions, type character, and depth. Do not differentiate by palette or stock photos alone.",
    avoidPatterns: [
      "poster",
      "advertisement",
      "social creative",
      "single photographic composition",
      "stacked cards",
      "generic AI wellness template",
      "text-left product-right SaaS hero",
      "wireframe",
      "cheap advertorial",
      "invented slogans",
      "person plus product plus outcome",
      "repeating vendor badges or label text outside the source packshot",
    ],
  };
}
