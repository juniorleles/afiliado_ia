/**
 * Visual theme engine.
 * Generated theme, then theme overrides, then the effective theme.
 * Content, facts, and layout are not part of this module.
 */

import { createOverrideAudit, resolveLandingPage, type LandingPageDocument, type LandingPageTheme, type ThemeOverride } from "@/lib/lp-builder/index";

export const VISUAL_SECTIONS = [
  "hero",
  "features",
  "ingredients",
  "pricing",
  "faq",
  "guarantee",
  "warnings",
  "manufacturer",
  "footer",
  "closingCta",
] as const;

export type VisualSectionId = (typeof VISUAL_SECTIONS)[number];

export const VISUAL_COMPONENTS: Record<VisualSectionId, readonly string[]> = {
  hero: ["heading", "body", "button"],
  features: ["heading", "card"],
  ingredients: ["heading", "card"],
  pricing: ["heading", "card", "button"],
  faq: ["heading", "question"],
  guarantee: ["heading", "body"],
  warnings: ["heading", "body"],
  manufacturer: ["heading", "body"],
  footer: ["body", "link"],
  closingCta: ["heading", "button"],
};

export const THEME_TOKENS = [
  "colors.primary",
  "colors.secondary",
  "colors.accent",
  "colors.background",
  "colors.surface",
  "typography.fontFamily",
  "typography.headingSize",
  "typography.bodySize",
  "radii.button",
  "radii.card",
  "spacing.containerWidth",
  "spacing.section",
  "spacing.card",
  "styles.button",
  "styles.cta",
  "styles.badge",
  "styles.border",
  "styles.shadow",
  "styles.divider",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export const FONT_FAMILIES = [
  "Georgia, serif",
  "Palatino, Palatino Linotype, serif",
  "Cambria, serif",
  "system-ui, sans-serif",
] as const;

export const STYLE_OPTIONS = {
  "styles.button": ["solid", "outline", "ghost"],
  "styles.cta": ["solid", "outline", "ghost"],
  "styles.badge": ["soft", "solid", "outline"],
  "styles.border": ["none", "subtle", "strong"],
  "styles.shadow": ["none", "soft", "strong"],
  "styles.divider": ["none", "line", "spaced"],
} as const;

export type VisualTheme = {
  colors: { primary: string; secondary: string; accent: string; background: string; surface: string };
  typography: { fontFamily: string; headingSize: string; bodySize: string };
  radii: { button: string; card: string };
  spacing: { containerWidth: string; section: string; card: string };
  styles: { button: string; cta: string; badge: string; border: string; shadow: string; divider: string };
};

export const GENERATED_VISUAL_THEME: VisualTheme = {
  colors: {
    primary: "#111827",
    secondary: "#374151",
    accent: "#1d4ed8",
    background: "#ffffff",
    surface: "#f8fafc",
  },
  typography: {
    fontFamily: "Georgia, serif",
    headingSize: "2.25rem",
    bodySize: "1.125rem",
  },
  radii: { button: "0.375rem", card: "0.5rem" },
  spacing: { containerWidth: "720px", section: "3rem", card: "1rem" },
  styles: {
    button: "solid",
    cta: "solid",
    badge: "soft",
    border: "subtle",
    shadow: "none",
    divider: "line",
  },
};

export type ThemeTokenOverride = {
  scope: "theme" | "section" | "component";
  targetId: string;
  token: ThemeToken;
  value: string;
};

export type SectionThemeOverride = {
  sectionId: VisualSectionId;
  tokens: Partial<Record<ThemeToken, string>>;
};

export type ComponentThemeOverride = {
  sectionId: VisualSectionId;
  componentId: string;
  tokens: Partial<Record<ThemeToken, string>>;
};

export type AccessibilityWarning = {
  code: "text-contrast" | "button-contrast" | "link-visibility" | "focus-indicator" | "minimum-font-size";
  message: string;
  scope: string;
  targetId: string;
};

const INK = "#18181b";
const BUTTON_INK = "#ffffff";

export function isThemeToken(value: string): value is ThemeToken {
  return (THEME_TOKENS as readonly string[]).includes(value);
}

export function isVisualSection(value: string): value is VisualSectionId {
  return (VISUAL_SECTIONS as readonly string[]).includes(value);
}

export function readThemeToken(theme: VisualTheme, token: ThemeToken): string {
  const [group, key] = token.split(".") as [keyof VisualTheme, string];
  const record = theme[group] as Record<string, string>;
  return record[key] ?? "";
}

export function writeThemeToken(theme: VisualTheme, token: ThemeToken, value: string): VisualTheme {
  const next = structuredClone(theme);
  const [group, key] = token.split(".") as [keyof VisualTheme, string];
  (next[group] as Record<string, string>)[key] = value;
  return next;
}

function normalizeColor(value: string): string | null {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  const short = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (!short) return null;
  return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
}

function lengthInRange(value: string, minPx: number, maxPx: number): string | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(px|rem)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const px = match[2] === "rem" ? amount * 16 : amount;
  if (px < minPx || px > maxPx) return null;
  return `${amount}${match[2]}`;
}

export function toPx(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(px|rem)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "rem" ? amount * 16 : amount;
}

export function validateThemeValue(token: ThemeToken, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value || /[{}<>;]/.test(value)) return { ok: false, error: "Invalid CSS value." };
  if (token.startsWith("colors.")) {
    const color = normalizeColor(value);
    if (!color) return { ok: false, error: "Invalid color." };
    return { ok: true, value: color };
  }
  if (token === "typography.fontFamily") {
    if (!(FONT_FAMILIES as readonly string[]).includes(value)) return { ok: false, error: "Invalid CSS value." };
    return { ok: true, value };
  }
  if (token === "typography.headingSize") {
    const size = lengthInRange(value, 20, 72);
    if (!size) return { ok: false, error: "Invalid font size." };
    return { ok: true, value: size };
  }
  if (token === "typography.bodySize") {
    const size = lengthInRange(value, 12, 32);
    if (!size) return { ok: false, error: "Invalid font size." };
    return { ok: true, value: size };
  }
  if (token === "radii.button" || token === "radii.card") {
    const size = lengthInRange(value, 0, 32);
    if (!size) return { ok: false, error: "Invalid CSS value." };
    return { ok: true, value: size };
  }
  if (token === "spacing.containerWidth") {
    const size = lengthInRange(value, 320, 1200);
    if (!size) return { ok: false, error: "Invalid CSS value." };
    return { ok: true, value: size };
  }
  if (token === "spacing.section") {
    const size = lengthInRange(value, 0, 128);
    if (!size) return { ok: false, error: "Invalid CSS value." };
    return { ok: true, value: size };
  }
  if (token === "spacing.card") {
    const size = lengthInRange(value, 0, 64);
    if (!size) return { ok: false, error: "Invalid CSS value." };
    return { ok: true, value: size };
  }
  const options = STYLE_OPTIONS[token as keyof typeof STYLE_OPTIONS];
  if (!options || !(options as readonly string[]).includes(value)) return { ok: false, error: "Invalid CSS value." };
  return { ok: true, value };
}

export function validateThemeTarget(input: { scope: ThemeTokenOverride["scope"]; targetId: string; token: string }): { ok: true; token: ThemeToken } | { ok: false; error: string } {
  if (!isThemeToken(input.token)) return { ok: false, error: "Broken theme reference." };
  if (input.scope === "theme") {
    if (input.targetId !== "theme") return { ok: false, error: "Broken theme reference." };
    return { ok: true, token: input.token };
  }
  if (!isVisualSection(input.targetId) && input.scope === "section") return { ok: false, error: "Broken theme reference." };
  if (input.scope === "section") return { ok: true, token: input.token };
  const [sectionId, componentId] = input.targetId.split("/");
  if (!sectionId || !componentId || !isVisualSection(sectionId)) return { ok: false, error: "Broken theme reference." };
  if (!VISUAL_COMPONENTS[sectionId].includes(componentId)) return { ok: false, error: "Broken theme reference." };
  return { ok: true, token: input.token };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number | null {
  const first = normalizeColor(foreground);
  const second = normalizeColor(background);
  if (!first || !second) return null;
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
  const [r1, g1, b1] = rgb(first);
  const [r2, g2, b2] = rgb(second);
  const l1 = 0.2126 * channel(r1) + 0.7152 * channel(g1) + 0.0722 * channel(b1);
  const l2 = 0.2126 * channel(r2) + 0.7152 * channel(g2) + 0.0722 * channel(b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibilityWarnings(theme: VisualTheme, scope: string, targetId: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const text = contrastRatio(INK, theme.colors.background);
  const surface = contrastRatio(INK, theme.colors.surface);
  if ((text !== null && text < 4.5) || (surface !== null && surface < 4.5)) {
    warnings.push({ code: "text-contrast", message: "Text contrast is below 4.5:1.", scope, targetId });
  }
  const button = contrastRatio(BUTTON_INK, theme.colors.primary);
  if (button !== null && button < 4.5) {
    warnings.push({ code: "button-contrast", message: "Button contrast is below 4.5:1.", scope, targetId });
  }
  const link = contrastRatio(theme.colors.accent, theme.colors.background);
  if (link !== null && link < 4.5) {
    warnings.push({ code: "link-visibility", message: "Link contrast is below 4.5:1.", scope, targetId });
  }
  const focus = contrastRatio(theme.colors.accent, theme.colors.background);
  if (focus !== null && focus < 3) {
    warnings.push({ code: "focus-indicator", message: "Focus indicator contrast is below 3:1.", scope, targetId });
  }
  const body = toPx(theme.typography.bodySize);
  const heading = toPx(theme.typography.headingSize);
  if ((body !== null && body < 16) || (heading !== null && heading < 16)) {
    warnings.push({ code: "minimum-font-size", message: "Font size is below 16px.", scope, targetId });
  }
  return warnings;
}

function applyTokens(base: VisualTheme, tokens: Partial<Record<ThemeToken, string>>): VisualTheme {
  let next = base;
  for (const [token, value] of Object.entries(tokens) as Array<[ThemeToken, string]>) next = writeThemeToken(next, token, value);
  return next;
}

export function flattenVisualTheme(theme: VisualTheme): LandingPageTheme {
  return {
    colors: { ...theme.colors },
    typography: {
      fontFamily: theme.typography.fontFamily,
      headingSize: theme.typography.headingSize,
      bodySize: theme.typography.bodySize,
      buttonStyle: theme.styles.button,
      ctaStyle: theme.styles.cta,
      badgeStyle: theme.styles.badge,
      borderStyle: theme.styles.border,
      shadowStyle: theme.styles.shadow,
      dividerStyle: theme.styles.divider,
    },
    spacing: {
      containerWidth: theme.spacing.containerWidth,
      section: theme.spacing.section,
      card: theme.spacing.card,
      buttonRadius: theme.radii.button,
      cardRadius: theme.radii.card,
    },
  };
}

function diffTheme(generated: LandingPageTheme, effective: LandingPageTheme): ThemeOverride | null {
  const colors: Record<string, string> = {};
  const typography: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  for (const [key, value] of Object.entries(effective.colors)) if (generated.colors[key] !== value) colors[key] = value;
  for (const [key, value] of Object.entries(effective.typography)) if (generated.typography[key] !== value) typography[key] = value;
  for (const [key, value] of Object.entries(effective.spacing)) if (generated.spacing[key] !== value) spacing[key] = value;
  if (Object.keys(colors).length + Object.keys(typography).length + Object.keys(spacing).length === 0) return null;
  return {
    ...createOverrideAudit({ actor: "admin", at: "1970-01-01T00:00:00.000Z", version: 1 }),
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(Object.keys(spacing).length > 0 ? { spacing } : {}),
  };
}

export type ResolvedVisualTheme = {
  theme: VisualTheme;
  sections: Record<VisualSectionId, VisualTheme>;
  components: Record<string, VisualTheme>;
  warnings: AccessibilityWarning[];
  document: LandingPageDocument;
};

export function generatedThemeDocument(content: LandingPageDocument | null = null): LandingPageDocument {
  const theme = flattenVisualTheme(GENERATED_VISUAL_THEME);
  if (content) return { ...structuredClone(content), theme };
  return {
    sections: [],
    theme,
    assets: [],
    layout: { width: theme.spacing.containerWidth ?? "", alignment: "start" },
  };
}

/**
 * Generated theme, then page overrides, then section overrides, then component overrides.
 * Invalid tokens are omitted by the caller. Accessibility warnings do not remove values.
 */
export function resolveVisualTheme(input: {
  content?: LandingPageDocument | null;
  tokens: readonly ThemeTokenOverride[];
}): ResolvedVisualTheme {
  const themeTokens: Partial<Record<ThemeToken, string>> = {};
  const sectionTokens = new Map<VisualSectionId, Partial<Record<ThemeToken, string>>>();
  const componentTokens = new Map<string, { sectionId: VisualSectionId; tokens: Partial<Record<ThemeToken, string>> }>();
  for (const row of input.tokens) {
    if (!isThemeToken(row.token)) continue;
    if (row.scope === "theme") themeTokens[row.token] = row.value;
    if (row.scope === "section" && isVisualSection(row.targetId)) {
      const current = sectionTokens.get(row.targetId) ?? {};
      current[row.token] = row.value;
      sectionTokens.set(row.targetId, current);
    }
    if (row.scope === "component") {
      const [sectionId, componentId] = row.targetId.split("/");
      if (!sectionId || !componentId || !isVisualSection(sectionId) || !VISUAL_COMPONENTS[sectionId].includes(componentId)) continue;
      const key = `${sectionId}/${componentId}`;
      const current = componentTokens.get(key) ?? { sectionId, tokens: {} };
      current.tokens[row.token] = row.value;
      componentTokens.set(key, current);
    }
  }
  const theme = applyTokens(GENERATED_VISUAL_THEME, themeTokens);
  const sections = {} as Record<VisualSectionId, VisualTheme>;
  for (const sectionId of VISUAL_SECTIONS) sections[sectionId] = applyTokens(theme, sectionTokens.get(sectionId) ?? {});
  const components: Record<string, VisualTheme> = {};
  for (const sectionId of VISUAL_SECTIONS) {
    for (const componentId of VISUAL_COMPONENTS[sectionId]) {
      const key = `${sectionId}/${componentId}`;
      components[key] = applyTokens(sections[sectionId], componentTokens.get(key)?.tokens ?? {});
    }
  }
  const warnings = [
    ...accessibilityWarnings(theme, "theme", "theme"),
    ...VISUAL_SECTIONS.filter((sectionId) => sectionTokens.has(sectionId)).flatMap((sectionId) => accessibilityWarnings(sections[sectionId], "section", sectionId)),
  ];
  const generatedDocument = input.content
    ? structuredClone(input.content)
    : generatedThemeDocument(null);
  const override = diffTheme(flattenVisualTheme(GENERATED_VISUAL_THEME), flattenVisualTheme(theme));
  const document = resolveLandingPage(generatedDocument, override ? { theme: override } : {});
  return { theme, sections, components, warnings, document };
}

export function previewThemeTokens(
  saved: readonly ThemeTokenOverride[],
  drafts: Readonly<Record<string, string>>,
): { tokens: ThemeTokenOverride[]; errors: Record<string, string> } {
  const tokens = new Map<string, ThemeTokenOverride>();
  for (const row of saved) tokens.set(`${row.scope}:${row.targetId}:${row.token}`, row);
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(drafts)) {
    const [scope, targetId, token] = key.split(":") as [ThemeTokenOverride["scope"], string, string];
    if (!scope || !targetId || !token) {
      errors[key] = "Broken theme reference.";
      continue;
    }
    if (!raw.trim()) {
      tokens.delete(key);
      continue;
    }
    const target = validateThemeTarget({ scope, targetId, token });
    if (!target.ok) {
      errors[key] = target.error;
      continue;
    }
    const validated = validateThemeValue(target.token, raw);
    if (!validated.ok) {
      errors[key] = validated.error;
      continue;
    }
    tokens.set(key, { scope, targetId, token: target.token, value: validated.value });
  }
  return { tokens: [...tokens.values()], errors };
}

export function themeStyleVars(resolved: ResolvedVisualTheme): Record<string, string> {
  const theme = resolved.theme;
  const vars: Record<string, string> = {
    "--lp-primary": theme.colors.primary,
    "--lp-secondary": theme.colors.secondary,
    "--lp-accent": theme.colors.accent,
    "--lp-background": theme.colors.background,
    "--lp-surface": theme.colors.surface,
    "--lp-font": theme.typography.fontFamily,
    "--lp-heading": theme.typography.headingSize,
    "--lp-body": theme.typography.bodySize,
    "--lp-button-radius": theme.radii.button,
    "--lp-card-radius": theme.radii.card,
    "--lp-container": theme.spacing.containerWidth,
    "--lp-section": theme.spacing.section,
    "--lp-card": theme.spacing.card,
  };
  for (const sectionId of VISUAL_SECTIONS) {
    const section = resolved.sections[sectionId];
    vars[`--lp-${sectionId}-surface`] = section.colors.surface;
    vars[`--lp-${sectionId}-section`] = section.spacing.section;
    vars[`--lp-${sectionId}-heading`] = section.typography.headingSize;
  }
  return vars;
}
