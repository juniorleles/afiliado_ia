/**
 * LP Builder foundation.
 * Overrides sit after a generated landing page. They do not read ProductFacts
 * and they do not regenerate the page.
 */

export const LP_SECTION_TARGETS = [
  "hero",
  "cta",
  "features",
  "ingredients",
  "faq",
  "pricing",
  "guarantee",
  "warnings",
  "shipping",
  "returns",
  "manufacturer",
  "footer",
] as const;

export type LpSectionTarget = (typeof LP_SECTION_TARGETS)[number];

export const LP_COMPONENT_ROLES = ["headline", "text", "list", "image", "button"] as const;

export type LpComponentRole = (typeof LP_COMPONENT_ROLES)[number];

export type OverrideAudit = {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

export type LandingPageListItem = {
  id: string;
  text: string;
};

export type LandingPageAsset = {
  id: string;
  src: string;
  alt: string;
};

export type LandingPageComponent = {
  id: string;
  role: LpComponentRole;
  text: string;
  items: LandingPageListItem[];
  assetId: string | null;
  visible: boolean;
};

export type LandingPageSection = {
  id: string;
  target: LpSectionTarget;
  heading: string;
  visible: boolean;
  components: LandingPageComponent[];
};

export type LandingPageTheme = {
  colors: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
};

export type LandingPageLayout = {
  width: string;
  alignment: string;
};

/** Generated or effective landing page. The same shape is used for both. */
export type LandingPageDocument = {
  sections: LandingPageSection[];
  theme: LandingPageTheme;
  assets: LandingPageAsset[];
  layout: LandingPageLayout;
};

export type SectionOverride = OverrideAudit & {
  sectionId: string;
  heading?: string;
};

export type ComponentOverride = OverrideAudit & {
  componentId: string;
  text?: string;
  items?: LandingPageListItem[];
  visible?: boolean;
};

export type AssetOverride = OverrideAudit & {
  assetId: string;
  src?: string;
  alt?: string;
};

export type LayoutOverride = OverrideAudit & {
  width?: string;
  alignment?: string;
};

export type ThemeOverride = OverrideAudit & {
  colors?: Record<string, string>;
  typography?: Record<string, string>;
  spacing?: Record<string, string>;
};

export type VisibilityOverride = OverrideAudit & {
  sectionId: string;
  visible: boolean;
};

export type OrderOverride = OverrideAudit & {
  sectionIds: string[];
};

/** Every collection is optional. An empty object leaves the generated page untouched. */
export type LandingPageOverride = {
  sections?: SectionOverride[];
  components?: ComponentOverride[];
  assets?: AssetOverride[];
  layout?: LayoutOverride;
  theme?: ThemeOverride;
  visibility?: VisibilityOverride[];
  order?: OrderOverride;
};

export function createOverrideAudit(input: { actor: string; at: string; version?: number }): OverrideAudit {
  const version = input.version ?? 1;
  return {
    createdAt: input.at,
    updatedAt: input.at,
    createdBy: input.actor,
    updatedBy: input.actor,
    version,
  };
}
