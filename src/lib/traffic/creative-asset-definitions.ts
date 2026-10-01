/**
 * Creative Readiness Signal: asset and format definitions.
 *
 * These are initial, generic creative assets and formats written as plain
 * metadata. They are not advertising-platform creative types, they generate
 * nothing, and they are not a classification of the product. Replace or
 * extend them through the asset registry and the format list.
 *
 * An asset is a named source of one creative dimension. A format is a named
 * set of structural and contextual requirements. The signal never assigns the
 * product to a format. "Supported" means no structural requirement was
 * reported missing.
 */
import {
  CREATIVE_DIMENSIONS,
  type CreativeAssetFamily,
  type CreativeDimension,
  type CreativeFormatFamily,
  type CreativeRequirementKind,
  type CreativeStatus,
} from "./creative-readiness-result";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficMetadata } from "./traffic-types";

export interface CreativeAssetSources {
  readonly opportunityDimensions: readonly string[];
  readonly sectionKinds: readonly string[];
  readonly evidenceFields: readonly string[];
  /** Presentation-plan sections whose visibility establishes the asset. */
  readonly planSections: readonly string[];
  /** Presentation-plan hero strategy labels that establish the asset. */
  readonly planHeroStrategies: readonly string[];
  /** Presentation-plan variant tokens, for example "pricing:COMPARISON". */
  readonly planVariants: readonly string[];
}

export interface CreativeAsset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly dimension: CreativeDimension;
  readonly family: CreativeAssetFamily;
  readonly status: CreativeStatus;
  readonly enabled: boolean;
  readonly sources: CreativeAssetSources;
  readonly metadata: Readonly<TrafficMetadata>;
}

export type CreativeFormatRequirements = Readonly<Record<CreativeDimension, CreativeRequirementKind>>;

export interface CreativeFormat {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: CreativeFormatFamily;
  readonly status: CreativeStatus;
  readonly enabled: boolean;
  readonly requirements: CreativeFormatRequirements;
  readonly metadata: Readonly<TrafficMetadata>;
}

const NOTE = { origin: "initial generic creative definition", status: "needs review" } as const;
const emptySources = (): CreativeAssetSources => ({
  opportunityDimensions: [],
  sectionKinds: [],
  evidenceFields: [],
  planSections: [],
  planHeroStrategies: [],
  planVariants: [],
});

const asset = (
  id: string,
  name: string,
  family: CreativeAssetFamily,
  dimension: CreativeDimension,
  description: string,
  sources: Partial<CreativeAssetSources>,
): CreativeAsset => ({
  id,
  name,
  description,
  dimension,
  family,
  status: "DEFINED",
  enabled: true,
  sources: { ...emptySources(), ...sources },
  metadata: { ...NOTE },
});

export const DEFAULT_CREATIVE_ASSETS: readonly CreativeAsset[] = freezeDeepTraffic([
  asset("headline", "Headline", "COPY", "HEADLINE_AVAILABILITY", "A headline the page or evidence already states.", {
    opportunityDimensions: ["HERO_STRENGTH"],
    sectionKinds: ["hero"],
    evidenceFields: ["headline"],
    planHeroStrategies: ["IDENTITY", "VALUE", "BENEFIT", "DESCRIPTION", "FEATURE_CHIPS"],
    planSections: ["hero"],
  }),
  asset("hook", "Hook", "COPY", "HOOK_AVAILABILITY", "An opening hook the page or evidence already states.", {
    opportunityDimensions: ["HERO_STRENGTH"],
    sectionKinds: ["hero"],
    evidenceFields: ["hook"],
    planHeroStrategies: ["VALUE", "BENEFIT"],
  }),
  asset("primary-benefits", "Primary Benefits", "COPY", "PRIMARY_BENEFITS", "Benefit or feature material that can appear in a creative.", {
    opportunityDimensions: ["FEATURES", "FEATURE_COVERAGE"],
    sectionKinds: ["features", "overview"],
    evidenceFields: ["benefit"],
    planSections: ["features"],
  }),
  asset("visual-assets", "Visual Assets", "VISUAL", "VISUAL_ASSETS", "Any visual media the page or evidence already has.", {
    opportunityDimensions: ["MEDIA_AVAILABILITY"],
    sectionKinds: ["media", "gallery"],
    evidenceFields: ["image"],
  }),
  asset("product-images", "Product Images", "VISUAL", "PRODUCT_IMAGES", "Product images the page or evidence already has.", {
    opportunityDimensions: ["MEDIA_AVAILABILITY"],
    sectionKinds: ["product-images", "media"],
    evidenceFields: ["product-image"],
  }),
  asset("lifestyle-images", "Lifestyle Images", "VISUAL", "LIFESTYLE_IMAGES", "Lifestyle images. Presence only; nothing here generates a scene.", {
    sectionKinds: ["lifestyle"],
    evidenceFields: ["lifestyle-image"],
  }),
  asset("social-proof", "Social Proof", "SOCIAL", "SOCIAL_PROOF", "Social-proof structure such as reviews or testimonials.", {
    opportunityDimensions: ["CONSUMER_TRUST"],
    sectionKinds: ["testimonials", "reviews"],
  }),
  asset("testimonials", "Testimonials", "SOCIAL", "TESTIMONIALS", "Testimonial structure on the page or in the evidence.", {
    sectionKinds: ["testimonials"],
    evidenceFields: ["testimonial"],
  }),
  asset("cta", "Call To Action", "OFFER", "CTA_READINESS", "A call to action the page structure already supports.", {
    opportunityDimensions: ["CTA_AVAILABILITY", "PRESENTATION_READINESS"],
    sectionKinds: ["cta", "closing"],
    planSections: ["closing"],
  }),
  asset("offer-clarity", "Offer Clarity", "OFFER", "OFFER_CLARITY", "An offer the page or evidence already states.", {
    opportunityDimensions: ["OFFER_COVERAGE", "OFFER_VISIBILITY", "HERO_STRENGTH"],
    sectionKinds: ["hero", "overview"],
    evidenceFields: ["offer"],
    planSections: ["hero", "pricing"],
  }),
  asset("brand-assets", "Brand Assets", "BRAND", "BRAND_ASSETS", "Who makes the product, as already stated.", {
    opportunityDimensions: ["MANUFACTURER"],
    sectionKinds: ["manufacturer"],
    evidenceFields: ["brand"],
    planSections: ["manufacturer"],
  }),
  asset("video-potential", "Video Potential", "MOTION", "VIDEO_POTENTIAL", "Video material already present. Presence of other media is not video.", {
    sectionKinds: ["video"],
    evidenceFields: ["video"],
  }),
  asset("comparison-potential", "Comparison Potential", "OFFER", "COMPARISON_POTENTIAL", "Comparison structure already present in the plan or the page.", {
    opportunityDimensions: ["PRICING_COVERAGE"],
    sectionKinds: ["comparison"],
    planVariants: ["pricing:COMPARISON"],
  }),
  asset("educational-content", "Educational Content", "EDUCATIONAL", "EDUCATIONAL_CONTENT", "Educational or supporting content already present.", {
    opportunityDimensions: ["FAQ", "FAQ_COVERAGE", "SUPPORTING_CONTENT", "INFORMATION_DENSITY"],
    sectionKinds: ["faq", "usage", "ingredients"],
    planSections: ["faq", "usage", "ingredients"],
  }),
]);

const none = (): CreativeFormatRequirements =>
  Object.fromEntries(CREATIVE_DIMENSIONS.map((dimension) => [dimension, "NOT_APPLICABLE"])) as CreativeFormatRequirements;

const requirements = (over: Partial<Record<CreativeDimension, CreativeRequirementKind>>): CreativeFormatRequirements => ({ ...none(), ...over });

const format = (
  id: string,
  name: string,
  family: CreativeFormatFamily,
  description: string,
  over: Partial<Record<CreativeDimension, CreativeRequirementKind>>,
  status: CreativeStatus = "DEFINED",
): CreativeFormat => ({
  id,
  name,
  description,
  family,
  status,
  enabled: true,
  requirements: requirements(over),
  metadata: { ...NOTE },
});

export const DEFAULT_CREATIVE_FORMATS: readonly CreativeFormat[] = freezeDeepTraffic([
  format("search-text", "Search Text", "TEXT", "Text-only creative that needs a headline, benefits, an offer, and a call to action.", {
    HEADLINE_AVAILABILITY: "STRUCTURAL",
    PRIMARY_BENEFITS: "STRUCTURAL",
    CTA_READINESS: "STRUCTURAL",
    OFFER_CLARITY: "STRUCTURAL",
    HOOK_AVAILABILITY: "CONTEXTUAL",
    EDUCATIONAL_CONTENT: "CONTEXTUAL",
  }),
  format("display-banner", "Display Banner", "DISPLAY", "A banner that needs a headline, visual assets, product images, and a call to action.", {
    HEADLINE_AVAILABILITY: "STRUCTURAL",
    VISUAL_ASSETS: "STRUCTURAL",
    PRODUCT_IMAGES: "STRUCTURAL",
    CTA_READINESS: "STRUCTURAL",
    OFFER_CLARITY: "CONTEXTUAL",
    BRAND_ASSETS: "CONTEXTUAL",
  }),
  format("native-ads", "Native Ads", "NATIVE", "A native placement that needs a headline, a hook, and educational material.", {
    HEADLINE_AVAILABILITY: "STRUCTURAL",
    HOOK_AVAILABILITY: "STRUCTURAL",
    EDUCATIONAL_CONTENT: "STRUCTURAL",
    VISUAL_ASSETS: "CONTEXTUAL",
    PRIMARY_BENEFITS: "CONTEXTUAL",
    CTA_READINESS: "CONTEXTUAL",
  }),
  format("video", "Video", "MOTION", "A video format that needs video material and a hook already present. Nothing here generates video.", {
    VIDEO_POTENTIAL: "STRUCTURAL",
    HOOK_AVAILABILITY: "STRUCTURAL",
    VISUAL_ASSETS: "CONTEXTUAL",
    PRIMARY_BENEFITS: "CONTEXTUAL",
    CTA_READINESS: "CONTEXTUAL",
  }),
  format("short-video", "Short Video", "MOTION", "A short video format that needs video material and a hook already present.", {
    VIDEO_POTENTIAL: "STRUCTURAL",
    HOOK_AVAILABILITY: "STRUCTURAL",
    PRIMARY_BENEFITS: "CONTEXTUAL",
  }),
  format("image-ads", "Image Ads", "IMAGE", "An image format that needs product images and a headline.", {
    PRODUCT_IMAGES: "STRUCTURAL",
    HEADLINE_AVAILABILITY: "STRUCTURAL",
    VISUAL_ASSETS: "CONTEXTUAL",
    CTA_READINESS: "CONTEXTUAL",
    OFFER_CLARITY: "CONTEXTUAL",
  }),
  format("carousel", "Carousel", "IMAGE", "A multi-image format that needs product images and primary benefits.", {
    PRODUCT_IMAGES: "STRUCTURAL",
    PRIMARY_BENEFITS: "STRUCTURAL",
    HEADLINE_AVAILABILITY: "CONTEXTUAL",
    CTA_READINESS: "CONTEXTUAL",
    COMPARISON_POTENTIAL: "CONTEXTUAL",
  }),
  format("future", "Future Formats", "FUTURE", "A placeholder for creative formats that have not been defined yet.", {}, "PLACEHOLDER"),
]);
