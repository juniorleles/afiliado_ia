/**
 * Channel Suitability Signal: channel definitions.
 *
 * Definitions only. A definition says what a channel structurally needs; it
 * holds no data about any product, any market, any account, any price, or any
 * audience, and it calls no platform. Nothing here ranks channels or says one
 * is better than another.
 *
 * A requirement lists needs. A need is satisfied by information the
 * Opportunity analysis reported, found through the need's source dimensions.
 * Needs come in two kinds:
 *  - STRUCTURAL: something the channel cannot run without having, such as the
 *    price a listing must show. Reported missing, it makes the channel
 *    unsupported.
 *  - CONTEXTUAL: market or audience evidence. Evidence not being found is not
 *    evidence that a channel does not fit, so it only leaves the dimension
 *    not assessed and never makes a channel unsupported.
 *
 * These are initial structural definitions for review. They can be replaced
 * or extended by passing definitions to the signal, and the source dimensions
 * can be replaced the same way. "future" is a placeholder: it reserves a place
 * for channels not yet defined and is never available.
 */
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { ChannelDimension } from "./channel-suitability-result";

export const CHANNEL_FAMILIES = ["SEARCH", "SHOPPING", "AUTOMATED", "DISPLAY", "VIDEO", "SOCIAL", "NATIVE", "ORGANIC", "OWNED", "FUTURE"] as const;
export type ChannelFamily = (typeof CHANNEL_FAMILIES)[number];

/** DEFINED channels can be available. PLACEHOLDER channels reserve a place and never are. */
export const CHANNEL_STATUSES = ["DEFINED", "PLACEHOLDER"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

/** What a channel can need from the offer, the page, or the context. */
export const CHANNEL_NEEDS = [
  "PRICE_INFORMATION",
  "OFFER_DETAIL",
  "RETURNS_INFORMATION",
  "PRODUCT_DESCRIPTION",
  "CONTENT_DEPTH",
  "MEDIA_ASSETS",
  "PAGE_READINESS",
  "BRAND_PRESENCE",
  "AUDIENCE_EVIDENCE",
  "INTENT_EVIDENCE",
  "AWARENESS_STAGE",
  "CONSIDERATION_STAGE",
  "DECISION_STAGE",
] as const;
export type ChannelNeed = (typeof CHANNEL_NEEDS)[number];

export const CHANNEL_NEED_KINDS = ["STRUCTURAL", "CONTEXTUAL"] as const;
export type ChannelNeedKind = (typeof CHANNEL_NEED_KINDS)[number];

export const NEED_KIND: Readonly<Record<ChannelNeed, ChannelNeedKind>> = freezeDeepTraffic({
  PRICE_INFORMATION: "STRUCTURAL",
  OFFER_DETAIL: "STRUCTURAL",
  RETURNS_INFORMATION: "STRUCTURAL",
  PRODUCT_DESCRIPTION: "STRUCTURAL",
  CONTENT_DEPTH: "STRUCTURAL",
  MEDIA_ASSETS: "STRUCTURAL",
  PAGE_READINESS: "STRUCTURAL",
  BRAND_PRESENCE: "STRUCTURAL",
  AUDIENCE_EVIDENCE: "CONTEXTUAL",
  INTENT_EVIDENCE: "CONTEXTUAL",
  AWARENESS_STAGE: "CONTEXTUAL",
  CONSIDERATION_STAGE: "CONTEXTUAL",
  DECISION_STAGE: "CONTEXTUAL",
});

/**
 * The Opportunity dimensions that can satisfy each need. They are
 * alternatives: any one of them being reported is enough to say the need has
 * been looked at.
 */
export type NeedSources = Readonly<Record<ChannelNeed, readonly string[]>>;

export const DEFAULT_NEED_SOURCES: NeedSources = freezeDeepTraffic({
  PRICE_INFORMATION: ["PRICING", "PRICING_COVERAGE"],
  OFFER_DETAIL: ["OFFER_COVERAGE", "FEATURES", "FEATURE_COVERAGE"],
  RETURNS_INFORMATION: ["RETURNS", "GUARANTEE", "GUARANTEE_COVERAGE"],
  PRODUCT_DESCRIPTION: ["FEATURES", "FEATURE_COVERAGE", "SUPPORTING_CONTENT"],
  CONTENT_DEPTH: ["INFORMATION_DENSITY", "SUPPORTING_CONTENT", "FAQ", "FAQ_COVERAGE"],
  MEDIA_ASSETS: ["MEDIA_AVAILABILITY"],
  PAGE_READINESS: ["PRESENTATION_READINESS", "CTA_AVAILABILITY"],
  BRAND_PRESENCE: ["MANUFACTURER"],
  AUDIENCE_EVIDENCE: ["MARKET_DEMAND", "PROBLEM_AWARENESS"],
  INTENT_EVIDENCE: ["PURCHASE_INTENT", "SEARCH_PRESENCE"],
  AWARENESS_STAGE: ["PROBLEM_AWARENESS"],
  CONSIDERATION_STAGE: ["SOLUTION_AWARENESS"],
  DECISION_STAGE: ["BUYER_READINESS", "PURCHASE_INTENT"],
});

/** The dimensions whose requirements are lists of needs. Availability and policy sensitivity are read differently. */
export const REQUIREMENT_DIMENSIONS = [
  "OFFER_COMPATIBILITY",
  "CONTENT_COMPATIBILITY",
  "CREATIVE_REQUIREMENTS",
  "LANDING_PAGE_READINESS",
  "BRAND_DEPENDENCY",
  "AUDIENCE_MATCH",
  "FUNNEL_COMPATIBILITY",
  "TRAFFIC_INTENT",
] as const satisfies readonly ChannelDimension[];
export type RequirementDimension = (typeof REQUIREMENT_DIMENSIONS)[number];

export type ChannelRequirements = Readonly<Record<RequirementDimension, readonly ChannelNeed[]>>;

export interface ChannelDefinition {
  /** Lowercase letters, digits, and hyphens, starting with a letter. */
  readonly id: string;
  readonly name: string;
  readonly family: ChannelFamily;
  readonly status: ChannelStatus;
  /** Whether the platform reviews content before it runs. Read only for policy sensitivity. */
  readonly reviewsContent: boolean;
  readonly requirements: ChannelRequirements;
}

const requirements = (over: Partial<Record<RequirementDimension, readonly ChannelNeed[]>>): ChannelRequirements => ({
  OFFER_COMPATIBILITY: [],
  CONTENT_COMPATIBILITY: [],
  CREATIVE_REQUIREMENTS: [],
  LANDING_PAGE_READINESS: [],
  BRAND_DEPENDENCY: [],
  AUDIENCE_MATCH: [],
  FUNNEL_COMPATIBILITY: [],
  TRAFFIC_INTENT: [],
  ...over,
});

const define = (id: string, name: string, family: ChannelFamily, reviewsContent: boolean, over: Partial<Record<RequirementDimension, readonly ChannelNeed[]>>, status: ChannelStatus = "DEFINED"): ChannelDefinition => ({
  id,
  name,
  family,
  status,
  reviewsContent,
  requirements: requirements(over),
});

const SEARCH_NEEDS = {
  OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
  CONTENT_COMPATIBILITY: ["PRODUCT_DESCRIPTION"],
  LANDING_PAGE_READINESS: ["PAGE_READINESS"],
  FUNNEL_COMPATIBILITY: ["DECISION_STAGE"],
  TRAFFIC_INTENT: ["INTENT_EVIDENCE"],
} as const satisfies Partial<Record<RequirementDimension, readonly ChannelNeed[]>>;

const SOCIAL_NEEDS = {
  OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
  CONTENT_COMPATIBILITY: ["PRODUCT_DESCRIPTION"],
  CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"],
  LANDING_PAGE_READINESS: ["PAGE_READINESS"],
  BRAND_DEPENDENCY: ["BRAND_PRESENCE"],
  AUDIENCE_MATCH: ["AUDIENCE_EVIDENCE"],
  FUNNEL_COMPATIBILITY: ["AWARENESS_STAGE"],
} as const satisfies Partial<Record<RequirementDimension, readonly ChannelNeed[]>>;

export const DEFAULT_CHANNEL_DEFINITIONS: readonly ChannelDefinition[] = freezeDeepTraffic([
  define("google-search", "Google Search", "SEARCH", true, SEARCH_NEEDS),
  define("google-shopping", "Google Shopping", "SHOPPING", true, {
    OFFER_COMPATIBILITY: ["PRICE_INFORMATION", "OFFER_DETAIL", "RETURNS_INFORMATION"],
    CONTENT_COMPATIBILITY: ["PRODUCT_DESCRIPTION"],
    CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    FUNNEL_COMPATIBILITY: ["DECISION_STAGE"],
    TRAFFIC_INTENT: ["INTENT_EVIDENCE"],
  }),
  define("performance-max", "Performance Max", "AUTOMATED", true, {
    OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
    CONTENT_COMPATIBILITY: ["PRODUCT_DESCRIPTION"],
    CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    AUDIENCE_MATCH: ["AUDIENCE_EVIDENCE"],
  }),
  define("display", "Display", "DISPLAY", true, {
    OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
    CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    AUDIENCE_MATCH: ["AUDIENCE_EVIDENCE"],
    FUNNEL_COMPATIBILITY: ["AWARENESS_STAGE"],
  }),
  define("youtube", "YouTube", "VIDEO", true, { ...SOCIAL_NEEDS }),
  define("microsoft-ads", "Microsoft Ads", "SEARCH", true, SEARCH_NEEDS),
  define("facebook", "Facebook", "SOCIAL", true, SOCIAL_NEEDS),
  define("instagram", "Instagram", "SOCIAL", true, SOCIAL_NEEDS),
  define("tiktok", "TikTok", "SOCIAL", true, SOCIAL_NEEDS),
  define("pinterest", "Pinterest", "SOCIAL", true, { ...SOCIAL_NEEDS, FUNNEL_COMPATIBILITY: ["CONSIDERATION_STAGE"] }),
  define("native-ads", "Native Ads", "NATIVE", true, {
    OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
    CONTENT_COMPATIBILITY: ["CONTENT_DEPTH"],
    CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    AUDIENCE_MATCH: ["AUDIENCE_EVIDENCE"],
    FUNNEL_COMPATIBILITY: ["CONSIDERATION_STAGE"],
  }),
  define("seo", "SEO", "ORGANIC", false, {
    CONTENT_COMPATIBILITY: ["CONTENT_DEPTH", "PRODUCT_DESCRIPTION"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    BRAND_DEPENDENCY: ["BRAND_PRESENCE"],
    FUNNEL_COMPATIBILITY: ["CONSIDERATION_STAGE"],
    TRAFFIC_INTENT: ["INTENT_EVIDENCE"],
  }),
  define("email", "Email", "OWNED", false, {
    OFFER_COMPATIBILITY: ["OFFER_DETAIL"],
    CONTENT_COMPATIBILITY: ["CONTENT_DEPTH"],
    LANDING_PAGE_READINESS: ["PAGE_READINESS"],
    BRAND_DEPENDENCY: ["BRAND_PRESENCE"],
    FUNNEL_COMPATIBILITY: ["CONSIDERATION_STAGE"],
  }),
  define("future", "Future Channels", "FUTURE", false, {}, "PLACEHOLDER"),
]);
