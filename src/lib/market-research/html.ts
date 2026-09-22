const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeOnce(text: string): string {
  return text
    .replace(/&([a-z]+);/gi, (full, name: string) => NAMED[name.toLowerCase()] ?? full)
    .replace(/&#(\d+);/g, (_, n: string) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => codePoint(parseInt(n, 16)));
}

function codePoint(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/** Decode named and numeric HTML entities. Generic — not a single-entity replace. */
export function decodeMarketHtml(text: string): string {
  if (!text) return text;
  let out = text;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}
