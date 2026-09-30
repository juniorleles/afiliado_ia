/**
 * Documented engine assumptions that can collapse product diversity.
 * Identify only — do not hardcode per-product fixes here.
 */

export type GenericityFinding = {
  id: string;
  area: string;
  observation: string;
  legitimate: boolean;
};

export const GENERICITY_FINDINGS: GenericityFinding[] = [
  {
    id: "cta-chrome-emerald",
    area: "CTA presentation",
    observation:
      "AffiliateCta uses a fixed emerald Tailwind class rather than theme accent tokens. Different products share the same CTA chrome.",
    legitimate: false,
  },
  {
    id: "default-theme-premium",
    area: "visual theme",
    observation:
      "defaultThemeForTemplate maps REVIEW and BUYER_GUIDE both to PREMIUM. Theme diversity requires an explicit lock, not product category.",
    legitimate: false,
  },
  {
    id: "health-sections-primary",
    area: "content priority",
    observation:
      "ingredients, usage, and guarantee default to PRIMARY. Legitimate for supplements; overweight for non-health products when those facts exist.",
    legitimate: true,
  },
  {
    id: "ingredient-orbit",
    area: "section variants",
    observation:
      "Ingredient sections use INGREDIENT_ORBIT / INGREDIENT_EDITORIAL_GRID. Support for supplements is intentional; non-ingredient products omit the section.",
    legitimate: true,
  },
  {
    id: "packshot-bottle-keywords",
    area: "asset classifier",
    observation:
      "Packshot heuristics include bottle, jar, and supplement words. Bottle-shaped products score more easily than other pack forms.",
    legitimate: true,
  },
  {
    id: "premium-natural-same-hero",
    area: "hero variant",
    observation: "PREMIUM and NATURAL both default to PRODUCT_STAGE when a packshot is ready.",
    legitimate: false,
  },
  {
    id: "natural-green-palette",
    area: "theme tokens",
    observation:
      "NATURAL theme uses a green accent. It is a named theme, not auto-selected from oral-care products. CLEAN/BOLD/EDITORIAL/PREMIUM palettes also exist.",
    legitimate: true,
  },
];

export function engineMentionsProductName(source: string, name: string): boolean {
  return source.toLowerCase().includes(name.toLowerCase());
}
