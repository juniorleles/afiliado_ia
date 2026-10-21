/**
 * Universal design system tokens (Execution 50). Prototype layer for the future V4 renderer.
 *
 * Tokens describe how things look. They never describe what a product is: no theme, size or spacing
 * value is tied to a category, a brand or a slug. A theme is a palette, not a product type.
 */

export type ThemeId = "ink" | "forest" | "ember" | "midnight";

export type ThemeTokens = {
  id: ThemeId;
  label: string;
  scheme: "light" | "dark";
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  /** Text and icons placed on `accent`. */
  accentInk: string;
  /** Accent used as text on bg/surface. Always meets 4.5:1. */
  accentText: string;
  accentSoft: string;
  /** Used on hover for solid accent surfaces. */
  accentHover: string;
  focus: string;
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  ink: {
    id: "ink",
    label: "Ink",
    scheme: "light",
    bg: "#f5f6f8",
    surface: "#ffffff",
    surfaceAlt: "#eceff4",
    ink: "#101828",
    muted: "#475467",
    line: "#d5dae3",
    accent: "#2447d6",
    accentInk: "#ffffff",
    accentText: "#1c3bb5",
    accentSoft: "#e6ebfd",
    accentHover: "#1c3bb5",
    focus: "#1c3bb5",
  },
  forest: {
    id: "forest",
    label: "Forest",
    scheme: "light",
    bg: "#f6f3ec",
    surface: "#fffdf9",
    surfaceAlt: "#eee8da",
    ink: "#1b1a16",
    muted: "#57523f",
    line: "#dad2bf",
    accent: "#1d5b45",
    accentInk: "#ffffff",
    accentText: "#1d5b45",
    accentSoft: "#e0eee7",
    accentHover: "#144232",
    focus: "#1d5b45",
  },
  ember: {
    id: "ember",
    label: "Ember",
    scheme: "light",
    bg: "#fbf5f1",
    surface: "#ffffff",
    surfaceAlt: "#f4e8e1",
    ink: "#211612",
    muted: "#5b4740",
    line: "#e6d4ca",
    accent: "#b2361a",
    accentInk: "#ffffff",
    accentText: "#9a2d14",
    accentSoft: "#fbe5de",
    accentHover: "#8f2a12",
    focus: "#9a2d14",
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    scheme: "dark",
    bg: "#0d1220",
    surface: "#161d2f",
    surfaceAlt: "#1e2842",
    ink: "#f1f4fa",
    muted: "#aeb7ca",
    line: "#2f3a58",
    accent: "#82a6ff",
    accentInk: "#0a1124",
    accentText: "#9db8ff",
    accentSoft: "#202e57",
    accentHover: "#a3bcff",
    focus: "#9db8ff",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEMES;
}

export const TYPOGRAPHY = {
  fontSans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
  fontDisplay: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`,
  /** Fluid sizes. Body copy never drops below 1rem. */
  scale: {
    display: { size: "clamp(2.375rem, 1.5rem + 3.8vw, 4.25rem)", line: "1.04", tracking: "-0.025em", weight: "750" },
    h1: { size: "clamp(2.125rem, 1.4rem + 3.1vw, 3.5rem)", line: "1.06", tracking: "-0.022em", weight: "750" },
    h2: { size: "clamp(1.625rem, 1.2rem + 1.7vw, 2.375rem)", line: "1.15", tracking: "-0.015em", weight: "720" },
    h3: { size: "1.1875rem", line: "1.3", tracking: "-0.005em", weight: "680" },
    lead: { size: "clamp(1.125rem, 1.02rem + 0.45vw, 1.375rem)", line: "1.5", tracking: "0", weight: "400" },
    body: { size: "1rem", line: "1.65", tracking: "0", weight: "400" },
    small: { size: "0.9375rem", line: "1.55", tracking: "0", weight: "400" },
    caption: { size: "0.8125rem", line: "1.45", tracking: "0.01em", weight: "500" },
    eyebrow: { size: "0.8125rem", line: "1.2", tracking: "0.12em", weight: "700" },
  },
} as const;

/** 4 px base. Names are positions on the scale, not meanings. */
export const SPACE = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.5rem",
  6: "2rem",
  7: "3rem",
  8: "4rem",
  9: "6rem",
  10: "8rem",
} as const;

export const RADIUS = { sm: "8px", md: "14px", lg: "22px", pill: "999px" } as const;

export const CONTAINER = { narrow: "46rem", content: "70rem", wide: "80rem", gutter: "clamp(1.125rem, 4vw, 2.5rem)" } as const;

/** Section vertical rhythm. */
export const RHYTHM = { section: "clamp(3.25rem, 2.2rem + 4.4vw, 6.25rem)", tight: "clamp(2.25rem, 1.7rem + 2.4vw, 3.75rem)" } as const;

export const BREAKPOINTS = { sm: 640, md: 960, lg: 1200 } as const;

export const MIN_TARGET_PX = 44;

function cssVars(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `${key}:${value};`).join("");
}

/** Declarations shared by every theme: type, space, radius, container. */
export function baseTokenCss(): string {
  const type: Array<[string, string]> = [["--ds-font-sans", TYPOGRAPHY.fontSans], ["--ds-font-display", TYPOGRAPHY.fontDisplay]];
  for (const [name, spec] of Object.entries(TYPOGRAPHY.scale)) {
    type.push([`--ds-${name}-size`, spec.size], [`--ds-${name}-line`, spec.line], [`--ds-${name}-tracking`, spec.tracking], [`--ds-${name}-weight`, spec.weight]);
  }
  const space = Object.entries(SPACE).map(([key, value]): [string, string] => [`--ds-space-${key}`, value]);
  const radius = Object.entries(RADIUS).map(([key, value]): [string, string] => [`--ds-radius-${key}`, value]);
  const container = Object.entries(CONTAINER).map(([key, value]): [string, string] => [`--ds-container-${key}`, value]);
  const rhythm = Object.entries(RHYTHM).map(([key, value]): [string, string] => [`--ds-rhythm-${key}`, value]);
  return `.ds-root{${cssVars([...type, ...space, ...radius, ...container, ...rhythm, ["--ds-target", `${MIN_TARGET_PX}px`]])}}`;
}

export function themeCss(): string {
  return Object.values(THEMES)
    .map((theme) => {
      const entries: Array<[string, string]> = [
        ["--ds-bg", theme.bg],
        ["--ds-surface", theme.surface],
        ["--ds-surface-alt", theme.surfaceAlt],
        ["--ds-ink", theme.ink],
        ["--ds-muted", theme.muted],
        ["--ds-line", theme.line],
        ["--ds-accent", theme.accent],
        ["--ds-accent-ink", theme.accentInk],
        ["--ds-accent-text", theme.accentText],
        ["--ds-accent-soft", theme.accentSoft],
        ["--ds-accent-hover", theme.accentHover],
        ["--ds-focus", theme.focus],
        ["color-scheme", theme.scheme],
      ];
      return `.ds-root[data-ds-theme="${theme.id}"]{${cssVars(entries)}}`;
    })
    .join("");
}

/** The whole token stylesheet. Injected by the root so the tokens in this file are the single source. */
export function designSystemTokenCss(): string {
  return baseTokenCss() + themeCss();
}

// --- Contrast (WCAG 2.1) -------------------------------------------------------------------------------

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text/background pair the components use. Each must meet the stated minimum. */
export function themeContrastPairs(theme: ThemeTokens): Array<{ name: string; fg: string; bg: string; min: number }> {
  return [
    { name: "ink on bg", fg: theme.ink, bg: theme.bg, min: 4.5 },
    { name: "ink on surface", fg: theme.ink, bg: theme.surface, min: 4.5 },
    { name: "ink on surfaceAlt", fg: theme.ink, bg: theme.surfaceAlt, min: 4.5 },
    { name: "muted on bg", fg: theme.muted, bg: theme.bg, min: 4.5 },
    { name: "muted on surface", fg: theme.muted, bg: theme.surface, min: 4.5 },
    { name: "muted on surfaceAlt", fg: theme.muted, bg: theme.surfaceAlt, min: 4.5 },
    { name: "accentInk on accent", fg: theme.accentInk, bg: theme.accent, min: 4.5 },
    { name: "accentInk on accentHover", fg: theme.accentInk, bg: theme.accentHover, min: theme.scheme === "dark" ? 3 : 4.5 },
    { name: "accentText on bg", fg: theme.accentText, bg: theme.bg, min: 4.5 },
    { name: "accentText on surface", fg: theme.accentText, bg: theme.surface, min: 4.5 },
    { name: "accentText on accentSoft", fg: theme.accentText, bg: theme.accentSoft, min: 4.5 },
    { name: "ink on accentSoft", fg: theme.ink, bg: theme.accentSoft, min: 4.5 },
    { name: "focus on bg", fg: theme.focus, bg: theme.bg, min: 3 },
    { name: "focus on surface", fg: theme.focus, bg: theme.surface, min: 3 },
  ];
}
