import { directVisualArt, type ArtDirectionBrief } from "@/lib/visual-concept/art-director";
import { VISUAL_CONCEPT_PROMPT_VERSION } from "@/lib/visual-concept/config";
import { DIRECTION_GUIDANCE } from "@/lib/visual-concept/directions";
import type { VisualBrief, VisualDirectionFamily } from "@/lib/visual-concept/types";

const WEBSITE_SECTIONS = [
  "01 HERO",
  "02 PRODUCT OVERVIEW",
  "03 FEATURE / VALUE SECTION",
  "04 SECOND FEATURE / VISUAL STORY SECTION",
  "05 USAGE SECTION",
  "06 RETURN-POLICY SECTION",
  "07 CTA / DECISION SECTION",
  "08 FAQ SECTION",
  "09 FOOTER / DISCLOSURE AREA",
];

const TEXT_AUTHORITY = [
  "DO NOT CREATE NEW SLOGANS.",
  "DO NOT CREATE NEW BENEFIT STATEMENTS.",
  "DO NOT CREATE TESTIMONIALS.",
  "DO NOT CREATE RATINGS.",
  "DO NOT CREATE CERTIFICATIONS.",
  "DO NOT CREATE MEDICAL LANGUAGE.",
  "DO NOT CREATE PRODUCT RESULTS.",
  "DO NOT CREATE SCIENTIFIC CLAIMS.",
  "DO NOT CREATE PRICING.",
  "DO NOT CREATE DISCOUNTS.",
  "DO NOT CREATE SCARCITY.",
];

function renderArtDirection(art: ArtDirectionBrief): string {
  return [
    "ART DIRECTION",
    `Direct a ${art.primaryArchetype} website with a ${art.secondaryInfluence} influence.`,
    `Mood: ${art.mood}`,
    `Typography character: ${art.typographyCharacter}`,
    `Palette strategy: ${art.paletteStrategy}`,
    `Photographic language: ${art.photographicLanguage}`,
    `Material vocabulary: ${art.materialVocabulary.join(", ")}.`,
    "This art direction is not evidence and must not create consumer claims.",
    art.visualContext === "unspecified"
      ? "No visual atmosphere was inferred. Do not invent a product category."
      : `Atmosphere only: ${art.visualContext}. Do not turn this atmosphere into a consumer claim, benefit, or category statement.`,
    "",
    "VISUAL STORYTELLING",
    `Visual narrative: ${art.visualNarrative}`,
    `Imagery: ${art.imageryStrategy}`,
    `Decoration: ${art.decorativeStrategy}`,
    `Depth: ${art.depthStrategy}`,
    `Density: ${art.visualDensityStrategy}`,
    `Keywords: ${art.visualKeywords.join(", ")}.`,
    "",
    "PRODUCT STAGING",
    art.productStaging,
    `Hero: ${art.heroComposition}`,
    "Vendor photography may contain people, badges, or label text. Those pixels stay inside the source asset. Do not extract or repeat them elsewhere.",
    "",
    "SECTION CHOREOGRAPHY",
    ...art.sectionChoreography,
    art.sectionContrastStrategy,
    `Spatial rhythm: ${art.spatialRhythm}`,
    `CTA: ${art.ctaVisualStrategy}`,
    `FAQ: ${art.faqVisualStrategy}`,
    `Footer: ${art.footerStrategy}`,
    `Whitespace: ${art.whitespaceStrategy}`,
    `Differentiation: ${art.differentiationStrategy}`,
    `Avoid: ${art.avoidPatterns.join(", ")}.`,
  ].join("\n");
}

export function buildVisualConceptPrompt(
  brief: VisualBrief,
  direction: VisualDirectionFamily,
  options?: { reserveProductStage?: boolean; artDirection?: ArtDirectionBrief },
): string {
  const art = options?.artDirection ?? directVisualArt(brief, direction);
  const packshot = brief.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT" && asset.authoritativeForAppearance);
  const assets =
    brief.availableAssets.length === 0
      ? "No permitted product asset was supplied. Do not invent a labeled package."
      : brief.availableAssets
          .map((asset) => `${asset.role} provenance=${asset.provenance} authoritativeForAppearance=${asset.authoritativeForAppearance}`)
          .join("\n");
  const copy = brief.allowedCopy.length ? brief.allowedCopy.map((line) => `- ${line}`).join("\n") : "- none";
  const productStage = packshot
    ? [
        "The original product asset remains authoritative for product identity.",
        "Do not redesign the product label, brand logo, packaging text, or certification marks.",
        "Do not transcribe text from the product asset into headlines, badges, or new claims.",
        options?.reserveProductStage
          ? "Leave a blank product stage in the upper area of the hero. Do not draw a package. The original packshot is placed on that stage after generation."
          : "Do not draw a replacement package or a new label.",
      ].join("\n")
    : "No permitted product asset was supplied. Do not invent a labeled package.";
  return [
    "VISUAL OBJECTIVE",
    "This image is a visual design reference for an affiliate presell. It is not HTML, not consumer evidence, and not publication approval.",
    "",
    "OUTPUT FORM",
    "FULL-PAGE PREMIUM ECOMMERCE / DTC LANDING PAGE WEBSITE DESIGN MOCKUP",
    "The artifact must look like a screenshot of a professionally designed long-form website.",
    "It must visibly contain multiple website sections and appear scrollable beyond a single viewport.",
    "It must not look like an advertisement, a poster, a social-media creative, a magazine ad, a product hero image, a billboard, or an isolated promotional creative.",
    "",
    "ART DIRECTION VERSUS PRODUCT FACTS",
    "The image model owns composition, palette, lighting direction, background treatment, section rhythm, decorative imagery, visual hierarchy, and art direction.",
    "The image model does not own product identity, the product label, brand spelling, claims, benefits, testimonials, badges, certifications, or product facts.",
    "",
    "WEBSITE SECTIONS",
    "These are visual composition regions only. They do not authorize new factual content.",
    ...WEBSITE_SECTIONS,
    "",
    "WEBSITE UI",
    "Include a navigation/header, a content container, section boundaries, typographic hierarchy, buttons, alternating sections, an FAQ accordion treatment, a footer, and a legal/disclosure area.",
    "Do not make the entire canvas one photographic composition.",
    "",
    "PRODUCT IDENTITY",
    brief.productIdentity.name || "Unnamed product",
    "Visual atmosphere may follow authorized copy. It does not classify the product and it does not authorize new consumer claims.",
    "",
    "PERMITTED CONSUMER COPY",
    "Only the following allowedCopy may be intentionally requested as consumer copy.",
    copy,
    ...TEXT_AUTHORITY,
    "If accurate text rendering is difficult, prefer abstract or placeholder typographic blocks over invented claims.",
    "Generated text remains non-authoritative regardless.",
    "Do not invent testimonials, ratings, prices, medical claims, certifications, scarcity, statistics, or unsupported factual labels.",
    "",
    "AVAILABLE PRODUCT ASSETS",
    assets,
    productStage,
    "",
    "LIFESTYLE SAFETY",
    "Lifestyle imagery must be contextual, decorative, non-testimonial, non-before/after, and non-result-implying.",
    "Do not combine a person, the product, and an explicit physical outcome.",
    "Do not depict a customer testimonial, a product result, an endorsement, or medical authority.",
    "Prefer environment, botanical elements, materials, abstract wellness imagery, or a neutral lifestyle atmosphere.",
    "",
    "ICON SAFETY",
    "Icons must correspond only to authorized visible concepts or generic website navigation.",
    "Do not invent joint-health symbols, medical crosses, capsule benefit symbols, doctor symbols, or certification seals.",
    "",
    "DESIGN QUALITY",
    "Target premium direct-to-consumer ecommerce, editorial polish, strong visual storytelling, sophisticated typography, clear call-to-action hierarchy, section contrast, and intentional whitespace.",
    "Avoid a wireframe appearance, a generic interface template, a SaaS dashboard, endless cards, a cheap advertorial, poster design, and a single-scene advertisement.",
    "",
    renderArtDirection(art),
    "",
    "DESIGN DIRECTION",
    direction,
    DIRECTION_GUIDANCE[direction],
    "",
    "FORBIDDEN CLAIMS",
    brief.forbiddenClaims.join(", "),
    "",
    "FORBIDDEN VISUAL PATTERNS",
    brief.forbiddenVisualPatterns.join(", "),
    "",
    "OUTPUT INTENT",
    "Design reference / mockup only.",
    "Any text rendered inside the image is non-authoritative decorative output.",
    `promptVersion=${VISUAL_CONCEPT_PROMPT_VERSION}`,
    `contentVersion=${brief.contentVersion}`,
  ].join("\n");
}
