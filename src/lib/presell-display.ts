/**
 * Display-only chunking. Does not invent facts or change wording —
 * long blocks are split at sentence / "Label:" boundaries for cards.
 */

export type DisplayChunk = { title?: string; body: string };

const LONG_PARAGRAPH = 220;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function labeledSplit(text: string): { title: string; body: string } | null {
  const match = text.trim().match(/^([^:]{2,56}):\s+(\S[\s\S]+)$/);
  if (!match) return null;
  const title = match[1].trim();
  if (/^https?$/i.test(title)) return null;
  return { title, body: match[2].trim() };
}

export function chunkParagraphs(paragraphs: string[]): DisplayChunk[] {
  const chunks: DisplayChunk[] = [];
  for (const raw of paragraphs) {
    const text = raw.trim();
    if (!text) continue;
    const labeled = labeledSplit(text);
    if (labeled) {
      chunks.push(labeled);
      continue;
    }
    if (text.length <= LONG_PARAGRAPH) {
      chunks.push({ body: text });
      continue;
    }
    const sentences = splitSentences(text);
    let buffer = "";
    for (const sentence of sentences) {
      const next = buffer ? `${buffer} ${sentence}` : sentence;
      if (buffer && next.length > LONG_PARAGRAPH) {
        chunks.push({ body: buffer });
        buffer = sentence;
      } else {
        buffer = next;
      }
    }
    if (buffer) chunks.push({ body: buffer });
  }
  return chunks;
}

export function chunkBullets(bullets: string[]): DisplayChunk[] {
  return bullets
    .map((bullet) => bullet.trim())
    .filter(Boolean)
    .map((bullet) => labeledSplit(bullet) ?? { body: bullet });
}

/**
 * Consumer-visible truncation must not cut inside a word.
 * "improving join" is invalid; "improving…" is valid.
 */
export function clipAtWordBoundary(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (compact.length <= max) return compact;
  const ellipsis = "…";
  const budget = Math.max(1, max - ellipsis.length);
  let sliced = compact.slice(0, budget);
  const nextChar = compact[sliced.length];
  const endedMidWord =
    Boolean(nextChar && !/\s/.test(nextChar)) && Boolean(sliced.at(-1) && !/\s/.test(sliced.at(-1)!));
  if (endedMidWord) {
    const lastSpace = sliced.lastIndexOf(" ");
    sliced = lastSpace > 0 ? sliced.slice(0, lastSpace) : "";
  }
  sliced = sliced.replace(/[\s,;:–—-]+$/g, "").trim();
  if (!sliced) return ellipsis;
  return `${sliced}${ellipsis}`;
}

/** Banners and skyscraper ads are not product packshots. Unknown size is not evidence. */
export function isUnusableProductAspect(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return ratio > 2.15 || ratio < 0.45;
}
