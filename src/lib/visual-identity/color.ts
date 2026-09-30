export type Rgb = { r: number; g: number; b: number };

export function parseColor(value: string): Rgb | null {
  const text = value.trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((part) => part + part).join("");
    if (h.length === 8) h = h.slice(0, 6);
    return { r: Number.parseInt(h.slice(0, 2), 16), g: Number.parseInt(h.slice(2, 4), 16), b: Number.parseInt(h.slice(4, 6), 16) };
  }
  const rgb = text.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

export function toHex(color: Rgb): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function saturation(color: Rgb): number {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

const BLACK: Rgb = { r: 12, g: 12, b: 14 };
const WHITE: Rgb = { r: 248, g: 250, b: 252 };

/** Prefer the candidate, then black or white, whichever first reaches the ratio. */
export function readableOn(background: Rgb, preferred: Rgb, minimum = 4.5): Rgb {
  if (contrastRatio(preferred, background) >= minimum) return preferred;
  const dark = contrastRatio(BLACK, background);
  const light = contrastRatio(WHITE, background);
  return dark >= light ? BLACK : WHITE;
}

/** Move a color toward black or white until it clears the background. */
export function withContrast(background: Rgb, preferred: Rgb, minimum = 4.5): Rgb {
  if (contrastRatio(preferred, background) >= minimum) return preferred;
  const toward = relativeLuminance(background) >= 0.45 ? BLACK : WHITE;
  for (let step = 1; step <= 20; step += 1) {
    const next = mix(preferred, toward, step / 20);
    if (contrastRatio(next, background) >= minimum) return next;
  }
  return readableOn(background, preferred, minimum);
}

/** One foreground that clears every background it will actually sit on. */
export function withContrastOnAll(backgrounds: Rgb[], preferred: Rgb, minimum = 4.5): Rgb {
  let color = preferred;
  for (let round = 0; round < backgrounds.length + 1; round += 1) {
    let adjusted = false;
    for (const background of backgrounds) {
      if (contrastRatio(color, background) >= minimum) continue;
      color = withContrast(background, color, minimum);
      adjusted = true;
    }
    if (!adjusted) return color;
  }
  return backgrounds.reduce((current, background) => readableOn(background, current, minimum), color);
}
