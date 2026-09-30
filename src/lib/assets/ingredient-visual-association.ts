/**
 * Decides whether a same-card ingredient image may be shown.
 * Structural placement is required. Visible text that names a different
 * identity, or only part of a multi-part identity, blocks the image.
 * Filename and world knowledge are not used.
 */

export type EmbeddedTextStatus = "none" | "matches" | "conflicts" | "uninspected";
export type IngredientAssetAuthority = "SOURCE" | "NONE";

export type IngredientVisualJudgment = {
  associationConfidence: "high" | "conflict";
  embeddedTextStatus: EmbeddedTextStatus;
  assetAuthority: IngredientAssetAuthority;
};

const FILLER = new Set(["extract", "from", "the", "and", "with", "of"]);

export function ingredientFactKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function components(value: string): string[] {
  const withoutParen = value.replace(/\([^)]*\)/g, " ");
  const parts = withoutParen
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [value.trim()];
}

function coreWords(component: string): string[] {
  return component
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => /[a-z]/i.test(word) && !FILLER.has(word) && (word.length >= 3 || word.length === 1));
}

function coversWord(text: string, word: string): boolean {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => {
    if (token === word) return true;
    if (token.length >= 3 && word.includes(token)) return true;
    if (word.length >= 3 && token.length >= 2 && token.length <= 3 && word.startsWith(token)) return true;
    if (token.length >= 2 && token.length <= 3 && word.length >= 4 && word[0] === token[0]) {
      let index = 1;
      for (const char of word.slice(1)) {
        if (char === token[index]) index += 1;
        if (index >= token.length) return true;
      }
    }
    return false;
  });
}

function componentCovered(component: string, text: string): boolean {
  const words = coreWords(component);
  if (words.length === 0) return false;
  return words.some((word) => coversWord(text, word));
}

/** Keeps labels of this card, and longer labels that name a different card. Short noise is dropped. */
export function meaningfulEmbeddedText(raw: string, factValue: string, factValues: readonly string[]): string {
  const tokens = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const kept = tokens.filter((token) => {
    if (components(factValue).some((part) => componentCovered(part, token))) return true;
    if (token.length < 4) return false;
    return factValues.some(
      (other) =>
        ingredientFactKey(other) !== ingredientFactKey(factValue) &&
        components(other).some((part) => componentCovered(part, token)),
    );
  });
  return kept.join(" ");
}

function coverage(factValue: string, text: string): "empty" | "full" | "partial" | "none" {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  const parts = components(factValue);
  const hits = parts.filter((part) => componentCovered(part, trimmed)).length;
  if (hits === parts.length) return "full";
  if (hits > 0) return "partial";
  return "none";
}

export function judgeIngredientVisual(input: {
  associatedFactValue: string;
  embeddedText: string | null;
  factValuesSharingAsset: readonly string[];
  allFactValues: readonly string[];
}): IngredientVisualJudgment {
  if (input.embeddedText == null) {
    return { associationConfidence: "conflict", embeddedTextStatus: "uninspected", assetAuthority: "NONE" };
  }
  const text = meaningfulEmbeddedText(input.embeddedText, input.associatedFactValue, input.allFactValues);
  const own = coverage(input.associatedFactValue, text);
  const others = input.factValuesSharingAsset.filter((value) => ingredientFactKey(value) !== ingredientFactKey(input.associatedFactValue));
  const shared = others.length > 0;
  if (own === "empty") {
    if (shared) return { associationConfidence: "conflict", embeddedTextStatus: "conflicts", assetAuthority: "NONE" };
    return { associationConfidence: "high", embeddedTextStatus: "none", assetAuthority: "SOURCE" };
  }
  if (own === "full") {
    const betterOther = others.some((value) => coverage(value, text) === "full");
    if (betterOther) return { associationConfidence: "conflict", embeddedTextStatus: "conflicts", assetAuthority: "NONE" };
    return { associationConfidence: "high", embeddedTextStatus: "matches", assetAuthority: "SOURCE" };
  }
  return { associationConfidence: "conflict", embeddedTextStatus: "conflicts", assetAuthority: "NONE" };
}
