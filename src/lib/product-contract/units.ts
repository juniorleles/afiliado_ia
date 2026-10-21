/**
 * Commercial units.
 *
 * A small closed vocabulary of nouns that name a unit of sale ("3 bottles", "1 pair", "2 sets").
 * It describes how things are sold, never what they are, so it carries no product category.
 * Shared by the universal contract and by the adaptive plan's price reading.
 */

export type CommercialUnitKind =
  | "unit"
  | "piece"
  | "pair"
  | "set"
  | "kit"
  | "pack"
  | "box"
  | "bottle"
  | "pouch"
  | "jar"
  | "bag"
  | "tube"
  | "sachet"
  | "serving"
  | "bundle"
  | "roll"
  | "item"
  | "can"
  | "case";

/** Singular noun -> kind. Plurals are built by the pattern below. */
const SINGULARS: Record<string, CommercialUnitKind> = {
  unit: "unit",
  piece: "piece",
  pc: "piece",
  pair: "pair",
  set: "set",
  kit: "kit",
  pack: "pack",
  package: "pack",
  box: "box",
  carton: "box",
  bottle: "bottle",
  pouch: "pouch",
  jar: "jar",
  bag: "bag",
  tube: "tube",
  sachet: "sachet",
  serving: "serving",
  bundle: "bundle",
  roll: "roll",
  item: "item",
  can: "can",
  case: "case",
};

const NOUNS = Object.keys(SINGULARS);

/** Regex source matching a unit noun in singular or plural form, without capturing. */
export const UNIT_NOUN_SOURCE = `(?:${NOUNS.map((noun) => (/(?:x|ch|sh|s)$/.test(noun) ? `${noun}(?:es)?` : `${noun}s?`)).join("|")})`;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

export type CommercialQuantity = {
  /** The words the source used, verbatim. */
  text: string;
  count: number;
  unit: CommercialUnitKind;
};

const QUANTITY = new RegExp(`\\b(\\d{1,4}|${Object.keys(NUMBER_WORDS).join("|")})\\s*(?:x\\s*)?(${UNIT_NOUN_SOURCE})\\b`, "i");

export function unitKindOf(noun: string): CommercialUnitKind | null {
  const word = noun.toLowerCase().trim();
  if (SINGULARS[word]) return SINGULARS[word];
  const stripped = word.replace(/es$/, "").replace(/s$/, "");
  if (SINGULARS[stripped]) return SINGULARS[stripped];
  if (SINGULARS[word.replace(/s$/, "")]) return SINGULARS[word.replace(/s$/, "")];
  return null;
}

/** "3 bottles", "1 pair", "two sets" -> a quantity. Null when no count and unit stand together. */
export function parseCommercialQuantity(text: string): CommercialQuantity | null {
  const match = text.match(QUANTITY);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const count = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? NaN);
  const unit = unitKindOf(match[2]);
  if (!Number.isInteger(count) || count < 1 || !unit) return null;
  return { text: match[0].replace(/\s+/g, " ").trim(), count, unit };
}

/**
 * Bare words that already say what a price is for. Ambiguous nouns (can, case, set, item, roll) are
 * left out on purpose: they count only in the "number + noun" form handled by parseCommercialQuantity.
 */
const BARE_PRICE_CONTEXT =
  /\b(?:bottles?|pouch(?:es)?|jars?|packs?|packages?|box(?:es)?|servings?|scoops?|months?|supply|kits?|units?|bundles?|offer|total|each|per|count|capsules?|softgels?|tablets?|pairs?|pieces?|bags?|tubes?|sachets?)\b/i;

/** True when the text says what a price is for: a unit of sale, a total, or a per-unit price. */
export function namesPriceContext(text: string): boolean {
  return BARE_PRICE_CONTEXT.test(text) || parseCommercialQuantity(text) !== null;
}
