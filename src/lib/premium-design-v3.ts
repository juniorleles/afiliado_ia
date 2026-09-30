/** Admin-preview exploration ids. They do not replace the production candidate. */
export const PREMIUM_DESIGN_V3 = {
  "v3-a": "premium-design-v3-a",
  "v3-b": "premium-design-v3-b",
  "v3-c": "premium-design-v3-c",
} as const;

export type PremiumDesignV3Query = keyof typeof PREMIUM_DESIGN_V3;

export function premiumDesignV3Presentation(design: string | string[] | undefined): string | undefined {
  const value = Array.isArray(design) ? design[0] : design;
  if (!value || !(value in PREMIUM_DESIGN_V3)) return undefined;
  return PREMIUM_DESIGN_V3[value as PremiumDesignV3Query];
}
