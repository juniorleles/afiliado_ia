import { looksLikeIconOrBadge, looksLikeLogo } from "@/lib/assets/classify";
import {
  colorDistance,
  contrastRatio,
  mix,
  parseColor,
  readableOn,
  relativeLuminance,
  saturation,
  toHex,
  withContrast,
  withContrastOnAll,
  type Rgb,
} from "@/lib/visual-identity/color";

export const VISUAL_IDENTITY_VERSION = 1;

export type VisualCharacter = "light" | "dark";

export type VisualSignal = {
  role: "primary" | "secondary" | "accent" | "background" | "product-image";
  color: string;
  source: string;
  support: number;
};

export type AppliedVisualIdentity = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  accentStrong: string;
  border: string;
  ctaLabel: string;
  ctaLabelStrong: string;
};

export type VisualIdentity = {
  version: typeof VISUAL_IDENTITY_VERSION;
  character: VisualCharacter;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  productImageSignal: string | null;
  provenance: VisualSignal[];
  applied: AppliedVisualIdentity;
  sourceUrl: string;
  stylesheetUrls: string[];
  extractedAt: string;
};

type Weight = { color: Rgb; weight: number; source: string };

const FRAMEWORK_STYLESHEET = /bootstrap|font-awesome|fontawesome|fonts\.googleapis|cdnjs|tailwind/i;

export function isFrameworkStylesheet(url: string): boolean {
  return FRAMEWORK_STYLESHEET.test(url);
}

/** Icons, logos, and tiny rasters must not decide the palette. */
export function shouldSampleAsset(input: { url?: string; width?: number; height?: number; className?: string }): boolean {
  const text = `${input.url || ""} ${input.className || ""}`;
  if (looksLikeIconOrBadge(text) || looksLikeLogo(text)) return false;
  if (/\.svg(?:$|\?)/i.test(input.url || "")) return false;
  const width = input.width ?? 0;
  const height = input.height ?? 0;
  if (width > 0 && height > 0 && (width < 48 || height < 48)) return false;
  return true;
}

/**
 * Most common chromatic color after white, near-white, and isolated bins
 * are removed. Photographs stay a signal; they do not outrank repeated CSS.
 */
export function sampleImageColors(rgba: Buffer, width: number, height: number): string | null {
  if (width < 1 || height < 1 || rgba.length < width * height * 4) return null;
  const bins = new Map<string, { color: Rgb; count: number }>();
  const step = Math.max(1, Math.floor((width * height) / 8000));
  let opaque = 0;
  for (let index = 0; index < width * height; index += step) {
    const offset = index * 4;
    if (rgba[offset + 3] < 200) continue;
    opaque += 1;
    const color = {
      r: rgba[offset] & 0xe0,
      g: rgba[offset + 1] & 0xe0,
      b: rgba[offset + 2] & 0xe0,
    };
    if (saturation(color) < 0.12 || relativeLuminance(color) > 0.9) continue;
    const key = toHex(color);
    const bin = bins.get(key) || { color, count: 0 };
    bin.count += 1;
    bins.set(key, bin);
  }
  if (opaque < 8) return null;
  const groups: Array<{ color: Rgb; count: number }> = [];
  for (const bin of [...bins.values()].sort((a, b) => b.count - a.count)) {
    const group = groups.find((candidate) => colorDistance(candidate.color, bin.color) < 48);
    if (!group) groups.push({ ...bin });
    else group.count += bin.count;
  }
  const winner = groups.find((group) => group.count / opaque >= 0.04);
  return winner ? toHex(winner.color) : null;
}

type Rule = { prelude: string; body: string };

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length - 1;
}

function topLevelRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let index = 0;
  while (index < clean.length) {
    while (/\s/.test(clean[index] || "")) index += 1;
    if (index >= clean.length) break;
    if (clean[index] === "@") {
      const open = clean.indexOf("{", index);
      const semi = clean.indexOf(";", index);
      if (open < 0 || (semi >= 0 && semi < open)) {
        index = semi < 0 ? clean.length : semi + 1;
        continue;
      }
      const close = matchingBrace(clean, open);
      const prelude = clean.slice(index, open).trim();
      if (/^@media\b/i.test(prelude)) rules.push(...topLevelRules(clean.slice(open + 1, close)));
      index = close + 1;
      continue;
    }
    const open = clean.indexOf("{", index);
    if (open < 0) break;
    const close = matchingBrace(clean, open);
    rules.push({ prelude: clean.slice(index, open).trim(), body: clean.slice(open + 1, close) });
    index = close + 1;
  }
  return rules;
}

function customProperties(rules: Rule[]): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rule of rules) {
    if (!/(^|,)\s*:root\b/.test(rule.prelude)) continue;
    for (const match of rule.body.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+)/g)) {
      vars.set(match[1], match[2].trim());
    }
  }
  return vars;
}

function resolveColor(value: string, vars: Map<string, string>, depth = 0): Rgb | null {
  const text = value.replace(/!important/gi, "").trim();
  if (/url\(/i.test(text)) return null;
  const variable = text.match(/^var\(\s*(--[A-Za-z0-9_-]+)/);
  if (variable) {
    if (depth > 3) return null;
    const next = vars.get(variable[1]);
    return next ? resolveColor(next, vars, depth + 1) : null;
  }
  const gradient = [...text.matchAll(/#(?:[0-9a-f]{3,8})\b|rgba?\([^)]+\)/gi)]
    .map((match) => parseColor(match[0]))
    .filter((color): color is Rgb => Boolean(color));
  if (gradient.length > 1) {
    return [...gradient].sort((a, b) => saturation(b) - saturation(a))[0] || null;
  }
  return parseColor(text) || gradient[0] || null;
}

function declaration(body: string, property: "background" | "background-color" | "color"): string | null {
  let found: string | null = null;
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "gi");
  for (const match of body.matchAll(pattern)) found = match[1].trim();
  return found;
}

function classCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/\bclass\s*=\s*"([^"]*)"/gi)) {
    for (const name of match[1].split(/\s+/)) {
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

function idPresent(html: string, id: string): boolean {
  return new RegExp(`\\bid\\s*=\\s*["']${id}["']`, "i").test(html);
}

function selectorWeight(selector: string, html: string, classes: Map<string, number>): number {
  if (/:(?:hover|focus|active|visited)\b|::/.test(selector)) return 0;
  const needed = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  const ids = [...selector.matchAll(/#([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  if (needed.some((name) => !classes.has(name))) return 0;
  if (ids.some((id) => !idPresent(html, id))) return 0;
  if (needed.length === 0 && ids.length === 0) {
    const element = selector.match(/^(body|header|footer|main|section)\b/i)?.[1]?.toLowerCase();
    if (!element) return 0;
    const count = html.match(new RegExp(`<${element}\\b`, "gi"))?.length || 0;
    return count || (element === "body" ? 1 : 0);
  }
  const classWeight = needed.length ? Math.min(...needed.map((name) => classes.get(name) || 0)) : 1;
  return classWeight;
}

function selectorKey(selector: string): string {
  const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  if (classes.length) return `.${classes[classes.length - 1]}`;
  const id = selector.match(/#([A-Za-z0-9_-]+)/)?.[1];
  if (id) return `#${id}`;
  return selector.match(/^(body|header|footer|main|section)\b/i)?.[1]?.toLowerCase() || selector;
}

type Role = "accent" | "background" | "brand";

function roleFor(key: string): Role | null {
  const name = key.replace(/^[.#]/, "");
  if (/(?:btn|cta|button|buy|pricing)/i.test(name) && !/secondary|toggle|silver|icon/i.test(name)) return "accent";
  if (/(?:header|nav|logo|brand)/i.test(name)) return "brand";
  if (/^(?:txt|text|title|heading|copy)(?:_|$|-)/i.test(name)) return "brand";
  if (/(?:body|banner|footer|main|section|hero|paper|sky|^bg[_-])/i.test(name)) return "background";
  return null;
}

function addWeight(list: Weight[], color: Rgb | null, weight: number, source: string) {
  if (!color || weight < 1) return;
  const lum = relativeLuminance(color);
  if (saturation(color) < 0.08 && lum > 0.18 && lum < 0.82) return;
  list.push({ color, weight, source });
}

function clustered(weights: Weight[]): Array<Weight & { total: number }> {
  const groups: Array<Weight & { total: number }> = [];
  for (const item of [...weights].sort((a, b) => b.weight - a.weight)) {
    const group = groups.find((candidate) => {
      if (colorDistance(candidate.color, item.color) >= 32) return false;
      const candidateChromatic = saturation(candidate.color) >= 0.08;
      const itemChromatic = saturation(item.color) >= 0.08;
      return candidateChromatic === itemChromatic;
    });
    if (!group) {
      groups.push({ ...item, total: item.weight });
      continue;
    }
    group.total += item.weight;
    if (item.weight > group.weight) {
      group.color = item.color;
      group.weight = item.weight;
      group.source = item.source;
    }
  }
  return groups.sort((a, b) => b.total - a.total);
}

function differentFrom(color: Rgb, chosen: Rgb[]): boolean {
  return chosen.every((item) => colorDistance(color, item) >= 32);
}

type FunctionalPaint = AppliedVisualIdentity & {
  surfaceStrong: string;
  label: string;
  onAccent: string;
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  ctaBackground: string;
};

function functionalPaint(input: {
  character: VisualCharacter;
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
  background: Rgb;
}): FunctionalPaint {
  const paper = input.character === "light" ? mix(input.background, { r: 255, g: 255, b: 255 }, 0.28) : mix(input.background, { r: 0, g: 0, b: 0 }, 0.18);
  const page = input.character === "light" ? input.background : paper;
  const surfaceAlt = mix(input.background, input.primary, input.character === "light" ? 0.07 : 0.14);
  let surfaceStrong = input.character === "light" ? mix(paper, input.primary, 0.1) : mix(paper, { r: 255, g: 255, b: 255 }, 0.1);
  let grounds = [page, paper, surfaceAlt, surfaceStrong];
  let text = withContrastOnAll(grounds, input.primary, 4.5);
  if (grounds.some((ground) => contrastRatio(text, ground) < 4.5)) {
    surfaceStrong = paper;
    grounds = [page, paper, surfaceAlt, surfaceStrong];
    text = withContrastOnAll(grounds, input.primary, 4.5);
  }
  const muted = withContrastOnAll(grounds, mix(text, paper, 0.38), 4.5);
  const ctaFill = input.accent;
  const ctaLabel = withContrast(ctaFill, text, 4.5);
  const strongFill = input.primary;
  const strongLabel = readableOn(strongFill, { r: 248, g: 250, b: 252 }, 4.5);
  const border = mix(text, paper, 0.72);
  return {
    background: toHex(page),
    surface: toHex(paper),
    surfaceAlt: toHex(surfaceAlt),
    surfaceStrong: toHex(surfaceStrong),
    text: toHex(text),
    muted: toHex(muted),
    label: toHex(text),
    accent: toHex(ctaFill),
    accentStrong: toHex(strongFill),
    border: toHex(border),
    ctaLabel: toHex(ctaLabel),
    ctaLabelStrong: toHex(strongLabel),
    onAccent: toHex(strongLabel),
    brandPrimary: toHex(input.primary),
    brandSecondary: toHex(input.secondary),
    brandAccent: toHex(input.accent),
    ctaBackground: toHex(ctaFill),
  };
}

function applyIdentity(input: {
  character: VisualCharacter;
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
  background: Rgb;
}): AppliedVisualIdentity {
  const paint = functionalPaint(input);
  return {
    background: paint.background,
    surface: paint.surface,
    surfaceAlt: paint.surfaceAlt,
    text: paint.text,
    muted: paint.muted,
    accent: paint.accent,
    accentStrong: paint.accentStrong,
    border: paint.border,
    ctaLabel: paint.ctaLabel,
    ctaLabelStrong: paint.ctaLabelStrong,
  };
}

export function extractVisualIdentity(input: {
  sourceUrl: string;
  html: string;
  stylesheets: ReadonlyArray<{ url: string; css: string }>;
  productImage?: { rgba: Buffer; width: number; height: number } | null;
  extractedAt?: string;
}): VisualIdentity | null {
  const stylesheets = input.stylesheets.filter((sheet) => !isFrameworkStylesheet(sheet.url));
  const rules = stylesheets.flatMap((sheet) => topLevelRules(sheet.css));
  const inline = [...input.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  rules.push(...inline.flatMap((css) => topLevelRules(css)));
  const vars = customProperties(rules);
  const classes = classCounts(input.html);
  const accent: Weight[] = [];
  const background: Weight[] = [];
  const brand: Weight[] = [];
  const paint = new Map<string, { background?: string; color?: string; weight: number }>();

  for (const rule of rules) {
    for (const selector of rule.prelude.split(",")) {
      const trimmed = selector.trim();
      if (!trimmed || trimmed.startsWith("@")) continue;
      const weight = selectorWeight(trimmed, input.html, classes);
      if (!weight) continue;
      const key = selectorKey(trimmed);
      const current = paint.get(key) || { weight: 0 };
      const backgroundValue = declaration(rule.body, "background") || declaration(rule.body, "background-color");
      const colorValue = declaration(rule.body, "color");
      if (backgroundValue && !/url\(/i.test(backgroundValue)) current.background = backgroundValue;
      if (colorValue) current.color = colorValue;
      current.weight = Math.max(current.weight, weight);
      paint.set(key, current);
    }
  }

  for (const [key, item] of paint) {
    const role = roleFor(key);
    if (!role) continue;
    const backgroundColor = item.background ? resolveColor(item.background, vars) : null;
    const textColor = item.color ? resolveColor(item.color, vars) : null;
    if (role === "accent") addWeight(accent, backgroundColor, item.weight, `css:${key} background`);
    if (role === "background") addWeight(background, backgroundColor, item.weight, `css:${key} background`);
    if (role === "brand") {
      addWeight(brand, backgroundColor, item.weight, `css:${key} background`);
      addWeight(brand, textColor, item.weight, `css:${key} color`);
    }
  }

  for (const match of input.html.matchAll(/<([a-z0-9]+)\b[^>]*\bstyle\s*=\s*"([^"]*)"[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const style = match[2];
    if (tag === "svg" || /stroke\s*=|fill\s*=/i.test(match[0])) continue;
    const backgroundValue = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
    const color = backgroundValue ? resolveColor(backgroundValue, vars) : null;
    const role = roleFor(tag) || "background";
    const bucket = role === "accent" ? accent : role === "brand" ? brand : background;
    addWeight(bucket, color, 1, `inline:${tag} background`);
  }

  const accentGroups = clustered(accent).filter((item) => saturation(item.color) >= 0.2);
  const lightBackgrounds = clustered(background).filter((item) => relativeLuminance(item.color) >= 0.72);
  const darkBackgrounds = clustered(background).filter((item) => relativeLuminance(item.color) <= 0.28);
  const lightWeight = lightBackgrounds.reduce((sum, item) => sum + item.total, 0);
  const darkWeight = darkBackgrounds.reduce((sum, item) => sum + item.total, 0);
  const backgroundPool = lightWeight >= darkWeight ? lightBackgrounds : darkBackgrounds;
  const chromaticGround = backgroundPool.find((item) => saturation(item.color) >= 0.08 && item.total >= 3);
  const backgroundWinner = chromaticGround || backgroundPool[0];
  const brandGroups = clustered(brand).filter((item) => saturation(item.color) >= 0.18);
  const accentWinner = accentGroups[0];
  const primaryWinner = brandGroups.find((item) => !accentWinner || colorDistance(item.color, accentWinner.color) >= 32) || brandGroups[0];
  if (!backgroundWinner || !accentWinner || !primaryWinner) return null;

  const chosen = [primaryWinner.color, accentWinner.color, backgroundWinner.color];
  const surfaceSignals = [...clustered(background), ...brandGroups.filter((item) => /background/i.test(item.source))];
  const secondaryWinner =
    surfaceSignals.find((item) => differentFrom(item.color, chosen) && item.total >= 2) ||
    brandGroups.find((item) => differentFrom(item.color, chosen) && item.total >= 2) ||
    null;
  const character: VisualCharacter = relativeLuminance(backgroundWinner.color) >= 0.62 ? "light" : "dark";
  const productImageSignal =
    input.productImage && shouldSampleAsset({ url: "packshot.png", width: input.productImage.width, height: input.productImage.height })
      ? sampleImageColors(input.productImage.rgba, input.productImage.width, input.productImage.height)
      : null;
  const secondary = secondaryWinner?.color || primaryWinner.color;
  const provenance: VisualSignal[] = [
    { role: "primary", color: toHex(primaryWinner.color), source: primaryWinner.source, support: primaryWinner.total },
    { role: "secondary", color: toHex(secondary), source: secondaryWinner?.source || "mix:primary-background", support: secondaryWinner?.total || 0 },
    { role: "accent", color: toHex(accentWinner.color), source: accentWinner.source, support: accentWinner.total },
    { role: "background", color: toHex(backgroundWinner.color), source: backgroundWinner.source, support: backgroundWinner.total },
  ];
  if (productImageSignal) {
    provenance.push({ role: "product-image", color: productImageSignal, source: "raster:packshot", support: 1 });
  }
  return {
    version: VISUAL_IDENTITY_VERSION,
    character,
    primary: toHex(primaryWinner.color),
    secondary: toHex(secondary),
    accent: toHex(accentWinner.color),
    background: toHex(backgroundWinner.color),
    productImageSignal,
    provenance,
    applied: applyIdentity({
      character,
      primary: primaryWinner.color,
      secondary,
      accent: accentWinner.color,
      background: backgroundWinner.color,
    }),
    sourceUrl: input.sourceUrl,
    stylesheetUrls: stylesheets.map((sheet) => sheet.url),
    extractedAt: input.extractedAt || new Date().toISOString(),
  };
}

export function presentationStyle(identity: VisualIdentity): Record<string, string> {
  const primary = parseColor(identity.primary);
  const secondary = parseColor(identity.secondary);
  const accent = parseColor(identity.accent);
  const background = parseColor(identity.background);
  const paint =
    primary && secondary && accent && background
      ? functionalPaint({ character: identity.character, primary, secondary, accent, background })
      : null;
  const applied = paint ?? identity.applied;
  return {
    "--ps-bg": applied.background,
    "--ps-surface": applied.surface,
    "--ps-surface-alt": applied.surfaceAlt,
    "--ps-surface-strong": paint?.surfaceStrong ?? applied.surface,
    "--ps-text": applied.text,
    "--ps-text-muted": applied.muted,
    "--ps-label": paint?.label ?? applied.text,
    "--ps-accent": applied.accent,
    "--ps-accent-strong": applied.accentStrong,
    "--ps-border": applied.border,
    "--ps-success": applied.accentStrong,
    "--ps-cta-bg": paint?.ctaBackground ?? applied.accent,
    "--ps-cta-label": applied.ctaLabel,
    "--ps-cta-label-strong": applied.ctaLabelStrong,
    "--ps-on-accent": paint?.onAccent ?? applied.ctaLabelStrong,
    "--ps-brand-primary": paint?.brandPrimary ?? identity.primary,
    "--ps-brand-secondary": paint?.brandSecondary ?? identity.secondary,
    "--ps-brand-accent": paint?.brandAccent ?? identity.accent,
  };
}
