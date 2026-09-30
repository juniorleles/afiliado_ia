import { ART_DIRECTION_IS_EVIDENCE } from "@/lib/visual-concept/firewall";
import { directVisualArt, type ArtDirectionBrief } from "@/lib/visual-concept/art-director";
import type { VisualBrief } from "@/lib/visual-concept/types";

export const VISUAL_MASTER_ART_DIRECTION_VERSION = "visual-master-art-direction-v1";

export type MasterArtDirectionBrief = {
  artDirectorVersion: typeof VISUAL_MASTER_ART_DIRECTION_VERSION;
  artDirectionIsEvidence: false;
  masterDirection: "HYBRID_A_B_C";
  baseVisualLanguage: "A_EDITORIAL";
  productLanguage: "B_PRODUCT";
  conversionLanguage: "C_CONVERSION";
  editorialArchetype: ArtDirectionBrief["primaryArchetype"];
  editorialInfluence: ArtDirectionBrief["secondaryInfluence"];
  productArchetype: ArtDirectionBrief["primaryArchetype"];
  productInfluence: ArtDirectionBrief["secondaryInfluence"];
  conversionArchetype: ArtDirectionBrief["primaryArchetype"];
  conversionInfluence: ArtDirectionBrief["secondaryInfluence"];
  visualContext: ArtDirectionBrief["visualContext"];
  heroStrategy: string;
  typographyCharacter: string;
  photographicLanguage: string;
  materialVocabulary: string[];
  depthStrategy: string;
  whitespaceStrategy: string;
  sectionChoreography: string[];
  productStaging: string;
  ctaVisualStrategy: string;
  faqVisualStrategy: string;
  visualNarrative: string;
  avoidPatterns: string[];
};

export function directVisualMaster(brief: VisualBrief): MasterArtDirectionBrief {
  const editorial = directVisualArt(brief, "PREMIUM_EDITORIAL");
  const product = directVisualArt(brief, "PREMIUM_PRODUCT");
  const conversion = directVisualArt(brief, "PREMIUM_CONVERSION");
  return {
    artDirectorVersion: VISUAL_MASTER_ART_DIRECTION_VERSION,
    artDirectionIsEvidence: ART_DIRECTION_IS_EVIDENCE,
    masterDirection: "HYBRID_A_B_C",
    baseVisualLanguage: "A_EDITORIAL",
    productLanguage: "B_PRODUCT",
    conversionLanguage: "C_CONVERSION",
    editorialArchetype: editorial.primaryArchetype,
    editorialInfluence: editorial.secondaryInfluence,
    productArchetype: product.primaryArchetype,
    productInfluence: product.secondaryInfluence,
    conversionArchetype: conversion.primaryArchetype,
    conversionInfluence: conversion.secondaryInfluence,
    visualContext: editorial.visualContext,
    heroStrategy:
      "An editorial photographic field with asymmetric oversized type and intentional negative space. A proportional material product stage, with soft shadow and depth, sits inside that field. The source asset is visible and does not dominate the viewport. One restrained action. Not a poster, not a text-left product-right template, and not a decision banner.",
    typographyCharacter:
      "High-contrast display serif for editorial headlines, restrained sans for interface text, and clear size steps so grouped information stays scannable.",
    photographicLanguage: editorial.photographicLanguage,
    materialVocabulary: [...editorial.materialVocabulary, "layered planes"],
    depthStrategy:
      "A modest foreground stage, midground material and photography, and open background light. Use cropping, planes, and soft shadow more than effects.",
    whitespaceStrategy:
      "Large editorial whitespace between visual moments. The same whitespace separates decisions so the page stays scannable.",
    sectionChoreography: [
      "01 HERO: editorial photographic field, asymmetric type, proportional material product stage, restrained action",
      "02 OVERVIEW: oversized typography with one clear information group",
      "03 FEATURE / VALUE STORY: editorial image and type relationship, scannable grouping, no card grid",
      "04 VISUAL STORY: full-bleed photographic pause for atmosphere, material, and pacing",
      "05 USAGE: quiet, highly readable, and calm",
      "06 RETURN POLICY: dark/light contrast transition, factual return wording only",
      "07 DECISION / CTA: wide premium closing action with clear hierarchy",
      "08 FAQ: scannable question sequence, not a card grid",
      "09 FOOTER / DISCLOSURE: quiet legal area",
    ],
    productStaging:
      "Leave one blank product stage in the hero, about one fifth of the page width, on a quiet material surface. Do not draw a package. The original packshot is placed afterward. Do not enlarge it into the dominant object, and do not repeat it.",
    ctaVisualStrategy:
      "One restrained hero action and one clear closing action. The closing action is visually important and remains premium. No urgency, scarcity, discount, or result promise. The action never covers the packshot.",
    faqVisualStrategy:
      "A scannable sequence of questions already present in allowed copy, with clear boundaries and open spacing. Not a card grid and not new questions.",
    visualNarrative: "OPEN → editorial pause → INFORM → visual breath → DECISION → RESOLVE",
    avoidPatterns: [
      ...new Set([...editorial.avoidPatterns, ...product.avoidPatterns, ...conversion.avoidPatterns]),
      "concatenated alternate layouts",
      "enormous vendor asset",
      "repeated card grid",
      "infographic",
      "amazon listing",
      "tailwind demo",
    ],
  };
}
